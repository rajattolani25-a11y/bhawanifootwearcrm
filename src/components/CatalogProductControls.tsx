import { useCallback, useDeferredValue, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { addSignedImages } from "@/lib/product-images";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { ProductPhotos } from "./ProductPhotos";
import { CatalogDescriptionEditor } from "./CatalogDescriptionEditor";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

/** Catalog content controls. Stock, sizes and prices are read-only here. */
export function CatalogProductControls() {
  const { isOwner, loading } = useAuth(),
    { t } = useLang(),
    qc = useQueryClient();
  const [q, setQ] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [panel, setPanel] = useState("list"),
    [saving, setSaving] = useState(false),
    [limit, setLimit] = useState(60);
  const search = useDeferredValue(q.trim().toLowerCase());
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState({ dirty: false, saving: false });
  const descriptionEditing = useCallback((dirty: boolean, saving: boolean) => {
    setEditing((current) =>
      current.dirty === dirty && current.saving === saving ? current : { dirty, saving },
    );
  }, []);
  const previewDescription = useCallback((id: string, value: string) => {
    setDescriptions((current) => (current[id] === value ? current : { ...current, [id]: value }));
  }, []);
  const query = useQuery({
    queryKey: ["catalog-studio-products"],
    enabled: !loading && isOwner,
    queryFn: async () =>
      addSignedImages(
        await fetchAll((a, b) =>
          supabase
            .from("products")
            .select("id,article,brand,category,color,image_url,catalog_visible,mrp,selling_price")
            .order("id")
            .range(a, b),
        ),
      ),
  });
  const products = query.data ?? [],
    product = products.find((p) => p.id === selected) ?? products[0];
  const matches = products.filter((p) =>
    [p.article, p.brand, p.category, p.color].some((value) =>
      value?.toLowerCase().includes(search),
    ),
  );
  const refresh = async () => {
    await Promise.all(
      [
        "catalog-studio-products",
        "products",
        "pos-products",
        "hero-product-choices",
        "stock-all",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  };
  async function visibility(visible: boolean) {
    if (!product || saving || !isOwner) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ catalog_visible: visible })
        .eq("id", product.id)
        .select("id,catalog_visible")
        .single();
      if (error) throw error;
      if (data.catalog_visible !== visible)
        throw Error("Product visibility save could not be confirmed.");
      await refresh();
      toast.success(t("Product visibility saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (loading || !isOwner) return null;
  return (
    <section className="my-4 space-y-3" aria-label={t("Catalog product editor")}>
      <h3 className="font-semibold">{t("Catalog product editor")}</h3>
      {query.isPending && <p role="status">{t("Loading products…")}</p>}
      {query.error && (
        <div role="alert">
          <p>{t("Could not load products.")}</p>
          <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
        </div>
      )}
      <Tabs value={panel} onValueChange={setPanel}>
        <TabsList
          className="grid h-auto w-full grid-cols-3 lg:hidden"
          aria-label={t("Product editor views")}
        >
          <TabsTrigger value="list">{t("Products")}</TabsTrigger>
          <TabsTrigger value="preview">{t("Preview")}</TabsTrigger>
          <TabsTrigger value="edit">{t("Edit product")}</TabsTrigger>
        </TabsList>
        <div className="grid gap-4 lg:grid-cols-3">
          <TabsContent
            value="list"
            forceMount
            className="min-w-0 data-[state=inactive]:hidden lg:!block"
          >
            <Input
              aria-label={t("Search catalog products")}
              placeholder={t("Search catalog products")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(60);
              }}
            />
            <div
              className="mt-2 max-h-96 space-y-1 overflow-y-auto"
              aria-label={t("Catalog products")}
            >
              {matches.slice(0, limit).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  aria-pressed={p.id === product?.id}
                  onClick={() => {
                    if (editing.saving) return;
                    if (
                      p.id !== product?.id &&
                      editing.dirty &&
                      !window.confirm(t("Discard unsaved description changes?"))
                    )
                      return;
                    setSelected(p.id);
                    setPanel("preview");
                  }}
                  className="block w-full rounded-lg border p-3 text-left text-sm aria-pressed:border-primary aria-pressed:bg-primary/10"
                >
                  <b data-no-translate>
                    {p.brand} {p.article}
                  </b>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(p.catalog_visible ? "Visible in catalog" : "Hidden from catalog")}
                  </span>
                </button>
              ))}
              {matches.length > limit && (
                <Button variant="outline" onClick={() => setLimit((n) => n + 60)}>
                  {t("Show more products")}
                </Button>
              )}
              {!query.isPending && !query.error && !matches.length && (
                <p>{t("No products found.")}</p>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="preview"
            forceMount
            className="min-w-0 data-[state=inactive]:hidden lg:!block"
          >
            {product && (
              <article className="overflow-hidden rounded-xl border bg-card">
                <div className="flex aspect-square items-center justify-center bg-muted">
                  {product.image_src ? (
                    <img
                      src={product.image_src}
                      alt={`${product.brand} ${product.article}`}
                      className="h-full w-full object-contain p-4"
                    />
                  ) : (
                    <span>{t("Photo coming soon")}</span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <p className="text-xs text-muted-foreground" data-no-translate>
                    {product.brand}
                  </p>
                  <h4 className="font-semibold" data-no-translate>
                    {product.article}
                  </h4>
                  <p>{inr(product.selling_price)}</p>
                  <p className="text-xs" data-no-translate>
                    {product.color}
                  </p>
                  {descriptions[product.id]?.trim() && (
                    <section className="border-t pt-3">
                      <p className="mb-1 text-sm font-semibold">{t("Product description")}</p>
                      <p
                        className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
                        data-no-translate
                      >
                        {descriptions[product.id]?.trim()}
                      </p>
                    </section>
                  )}
                </div>
              </article>
            )}
          </TabsContent>
          <TabsContent
            value="edit"
            forceMount
            className="min-w-0 space-y-4 data-[state=inactive]:hidden lg:!block"
          >
            {product && (
              <fieldset disabled={saving} className="space-y-4 rounded-xl border p-4">
                <p className="font-semibold" data-no-translate>
                  {product.brand} {product.article}
                </p>
                <label className="flex items-center justify-between gap-3 text-sm">
                  {t("Visible in catalog")}
                  <Switch
                    checked={product.catalog_visible}
                    onCheckedChange={(value) => void visibility(value)}
                  />
                </label>
                <CatalogDescriptionEditor
                  key={`description-${product.id}`}
                  productId={product.id}
                  onPreview={previewDescription}
                  onEditing={descriptionEditing}
                />
                <ProductPhotos key={product.id} productId={product.id} />
                {saving && <p role="status">{t("Saving…")}</p>}
              </fieldset>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
