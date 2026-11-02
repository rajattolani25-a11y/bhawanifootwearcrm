import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  addProductPhoto,
  deleteProductPhoto,
  listProductPhotos,
  MAX_PRODUCT_PHOTOS,
  productUrls,
  readProductCover,
  replaceProductPhoto,
  setProductCover,
} from "@/lib/product-images";
import { Button } from "./ui/button";

/** Load extra angles only while this editor is mounted, never for every POS card. */
export function ProductPhotos({ productId }: { productId: string }) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState("");
  const query = useQuery({
    queryKey: ["product-photos", productId],
    queryFn: async () => {
      const cover = await readProductCover(productId);
      const paths = await listProductPhotos(productId, cover);
      return { cover, paths, urls: await productUrls(paths) };
    },
  });
  async function run(label: string, action: () => Promise<unknown>) {
    if (!isOwner || lock.current) return;
    lock.current = true;
    setBusy(label);
    try {
      await action();
      toast.success("Product photos saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      await Promise.all(
        ["product-photos", "stock-all", "catalog-studio-products", "hero-product-choices"].map(
          (key) => qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <section className="space-y-3" aria-label="Product photos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Product photos {query.data ? `(${query.data.paths.length}/${MAX_PRODUCT_PHOTOS})` : ""}
        </h3>
        {isOwner && (
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={!!busy || !query.data || query.data.paths.length >= MAX_PRODUCT_PHOTOS}
          >
            <label className="cursor-pointer">
              <ImagePlus className="h-4 w-4" /> Add photos
              <input
                aria-label="Add product photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                disabled={!!busy || !query.data || query.data.paths.length >= MAX_PRODUCT_PHOTOS}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!files.length) return;
                  void run("Uploading photos…", async () => {
                    if (files.length + (query.data?.paths.length ?? 0) > MAX_PRODUCT_PHOTOS)
                      throw new Error(
                        `Choose up to ${MAX_PRODUCT_PHOTOS - (query.data?.paths.length ?? 0)} more photos`,
                      );
                    for (let i = 0; i < files.length; i++) {
                      setBusy(`Uploading photo ${i + 1}/${files.length}…`);
                      await addProductPhoto(productId, files[i]!);
                    }
                  });
                }}
              />
            </label>
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG or WebP · up to 5 MB each · compressed automatically. Cover is used in POS and the
        public catalog. Customers can view extra angles by opening the product in the catalog.
      </p>
      {query.isPending && <p role="status">Loading photos…</p>}
      {query.isError && (
        <div role="alert">
          <p>Could not load photos.</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          {busy}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {query.data?.paths.map((path, i) => (
          <div key={path} className="min-w-0 rounded-lg border p-2">
            {query.data.urls.get(path) ? (
              <img
                src={query.data.urls.get(path)}
                alt={`Product angle ${i + 1}`}
                className="aspect-square w-full rounded bg-muted object-contain"
              />
            ) : (
              <p className="aspect-square text-xs">Photo preview unavailable</p>
            )}
            {path === query.data.cover && (
              <p className="my-2 flex items-center gap-1 text-xs font-semibold">
                <Star className="h-3 w-3" /> Cover photo
              </p>
            )}
            {isOwner && (
              <div className="mt-2 flex flex-wrap gap-1">
                {path !== query.data.cover && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={!!busy}
                    onClick={() =>
                      void run("Saving cover…", async () =>
                        setProductCover(productId, path, query.data!.cover),
                      )
                    }
                  >
                    Set cover
                  </Button>
                )}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={!!busy}
                >
                  <label className="cursor-pointer">
                    <RefreshCw className="h-3 w-3" /> Replace
                    <input
                      aria-label={`Replace photo ${i + 1}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      disabled={!!busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file)
                          void run("Replacing photo…", () =>
                            replaceProductPhoto(productId, path, file),
                          );
                      }}
                    />
                  </label>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs text-destructive"
                  disabled={!!busy}
                  aria-label={`Delete photo ${i + 1}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this photo? If it is the cover, another photo will become the cover. The product and its stock stay unchanged.",
                      )
                    )
                      void run("Deleting photo…", () => deleteProductPhoto(productId, path));
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {query.data?.paths.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No photos yet. Add a side, front, back or sole view.
        </p>
      )}
    </section>
  );
}
