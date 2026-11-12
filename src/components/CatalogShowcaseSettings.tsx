import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanupShowcaseUploads,
  getOwnerShowcase,
  saveOwnerShowcase,
} from "@/lib/catalog-showcase.functions";
import {
  defaultShowcase,
  SHOWCASE_BUCKET,
  SHOWCASE_LIMIT,
  SHOWCASE_REFRESH,
  showcaseConfig,
  showcasePaths,
  showcaseSeeds,
  showcaseThumbnail,
  type ShowcaseConfig,
  type ShowcasePoster,
} from "@/lib/catalog-showcase";
import { compressShowcasePoster } from "@/lib/showcase-images";
import { parseCategory } from "@/lib/product-categories";
import sqlUrl from "../../docs/sql/catalog-showcase.sql?url&no-inline";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import styles from "./catalog-showcase-settings.module.css";

type DraftPoster = Omit<ShowcasePoster, "image"> & { image: ShowcasePoster["image"] | null };
type Draft = Omit<ShowcaseConfig, "items"> & { items: DraftPoster[] };
type Prepared = Awaited<ReturnType<typeof compressShowcasePoster>> & {
  url: string;
  path?: string;
  fullUploaded?: boolean;
  thumbUploaded?: boolean;
};
async function ownerToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw Error("Sign in again to edit Showcase.");
  return data.session.access_token;
}
const kb = (bytes: number) =>
  `${(bytes / 1024).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KB`;

/** This editor is lazy and owner-route-only. Uploaded files never enter localStorage or JSON. */
export function CatalogShowcaseSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["catalog-showcase-settings"],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => getOwnerShowcase({ data: { token: await ownerToken() } }),
  });
  const products = useQuery({
    queryKey: ["showcase-product-choices"],
    queryFn: async () => {
      const result = await supabase
        .from("products")
        .select("id,brand,article,category")
        .eq("catalog_visible", true)
        .neq("status", "inactive")
        .order("article")
        .limit(1000);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const [draft, setDraft] = useState<Draft>(defaultShowcase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [cleanupPending, setCleanupPending] = useState<string[]>([]);
  const [sql, setSql] = useState("");
  const files = useRef(new Map<string, Prepared>());
  const localUrls = useRef(new Set<string>());
  const mounted = useRef(true);
  const restored = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const urls = localUrls.current;
    return () => {
      mounted.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!query.data || restored.current) return;
    restored.current = true;
    setDraft(query.data.snapshot ?? defaultShowcase());
    files.current.clear();
  }, [query.data]);
  async function reload() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await query.refetch();
      if (!result.isSuccess || !result.data)
        throw Error("Saved settings could not be reloaded. Your draft is kept.");
      setDraft(result.data.snapshot ?? defaultShowcase());
      files.current.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reload saved settings.");
    } finally {
      setBusy(false);
    }
  }
  const change = (id: string, patch: Partial<DraftPoster>) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };
  async function choose(id: string, file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const prepared = await compressShowcasePoster(file);
      if (!mounted.current) return;
      const url = URL.createObjectURL(prepared.blob);
      localUrls.current.add(url);
      const old = files.current.get(id);
      if (old) {
        URL.revokeObjectURL(old.url);
        localUrls.current.delete(old.url);
      }
      if (old?.path)
        setCleanupPending((paths) => [...paths, old.path!, showcaseThumbnail(old.path!)]);
      files.current.set(id, { ...prepared, url });
      // A rerender keeps original saved metadata until Save uploads the replacement.
      setDraft((current) => ({ ...current }));
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Could not prepare the poster.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function cleanup(paths: string[], token: string) {
    try {
      await cleanupShowcaseUploads({ data: { token, paths: [...new Set(paths)].slice(0, 48) } });
      setCleanupPending([]);
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      void qc.invalidateQueries({ queryKey: ["store-usage"] });
      return true;
    } catch {
      setCleanupPending([...new Set(paths)].slice(0, 48));
      toast.error("Showcase saved; unused photo cleanup is pending. Retry cleanup.");
      return false;
    }
  }
  async function save() {
    if (!query.data?.ready || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (draft.items.some((item) => !item.title.trim()))
        throw Error("Enter a title for each poster.");
      if (draft.items.some((item) => !item.image && !files.current.has(item.id)))
        throw Error("Choose an image for each new poster, or remove the empty poster.");
      const token = await ownerToken();
      const items: ShowcasePoster[] = [];
      for (const item of draft.items) {
        const file = files.current.get(item.id);
        if (!file) {
          items.push(item as ShowcasePoster);
          continue;
        }
        file.path ??= `showcase/${crypto.randomUUID()}.webp`;
        for (const thumbnail of [false, true]) {
          const flag = thumbnail ? "thumbUploaded" : "fullUploaded";
          if (file[flag]) continue;
          const result = await supabase.storage
            .from(SHOWCASE_BUCKET)
            .upload(
              thumbnail ? showcaseThumbnail(file.path) : file.path,
              thumbnail ? file.thumbnail : file.blob,
              { contentType: "image/webp", upsert: false },
            );
          // An uncertain previous upload may already exist at this unique staged path.
          // The save RPC still verifies exact object MIME and bytes before linking it.
          if (
            result.error &&
            !["409", "Duplicate"].includes(
              String((result.error as { statusCode?: string }).statusCode),
            ) &&
            !/already exists/i.test(result.error.message)
          )
            throw result.error;
          file[flag] = true;
        }
        items.push({
          ...item,
          image: {
            kind: "upload",
            path: file.path,
            bytes: file.blob.size,
            thumbnailBytes: file.thumbnail.size,
            width: file.width,
            height: file.height,
          },
        });
      }
      const settings = showcaseConfig.parse({ ...draft, items });
      const result = await saveOwnerShowcase({
        data: { token, expected: query.data.snapshot, settings },
      });
      setDraft(result);
      setSaved(true);
      qc.setQueryData(["catalog-showcase-settings"], { ...query.data, snapshot: result });
      try {
        localStorage.setItem(SHOWCASE_REFRESH, crypto.randomUUID());
      } catch {
        /* Fresh visits still read saved server settings. */
      }
      window.dispatchEvent(new Event(SHOWCASE_REFRESH));
      toast.success("Showcase saved. Refresh the public catalog to see it.");
      const staged = [...files.current.values()].flatMap((file) =>
        file.path ? [file.path, showcaseThumbnail(file.path)] : [],
      );
      const previous = showcasePaths(query.data.snapshot);
      await cleanup([...previous, ...staged, ...cleanupPending].slice(0, 48), token);
      // Only a confirmed save refreshes the editor. Failed saves preserve staged files/drafts.
      const refreshed = await query.refetch();
      if (refreshed.isSuccess) files.current.clear();
    } catch (e) {
      setError(
        `Save was not confirmed. Your draft and staged photos are kept. Retry the same settings, or reload saved settings. ${e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Check your connection."}`,
      );
    } finally {
      // Include partial uploads after transport failures as well as saved/removed posters.
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      void qc.invalidateQueries({ queryKey: ["store-usage"] });
      setBusy(false);
    }
  }
  const ready = query.data?.ready === true;
  return (
    <section className={styles["editor"]} aria-label="Showcase settings">
      <h3 className="text-lg font-semibold">Bhawani Showcase</h3>
      <p className="text-sm text-muted-foreground">
        Poster Stack appears only in Men and Women, below Spotlight. All and Kids stay clear.
        Customers can open the full poster or its linked product.
      </p>
      {query.isPending && <p role="status">Loading Showcase settings…</p>}
      {query.isError && (
        <p role="alert">
          Could not load Showcase settings.{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {query.data && !ready && (
        <div className={styles["setup"]} role="status">
          The six included posters are ready. Install the Showcase SQL update to save owner changes
          and upload more posters, then reload saved settings.
          <a href={sqlUrl} download="catalog-showcase.sql">
            Download Showcase SQL
          </a>
          <details
            onToggle={(event) => {
              if (event.currentTarget.open && !sql)
                void fetch(sqlUrl)
                  .then((response) => {
                    if (!response.ok) throw Error();
                    return response.text();
                  })
                  .then(setSql)
                  .catch(() => setError("SQL could not be loaded. Download the SQL file instead."));
            }}
          >
            <summary>Show / copy SQL</summary>
            <textarea
              aria-label="Showcase setup SQL"
              readOnly
              rows={8}
              value={sql || "Loading SQL…"}
            />
            <Button
              variant="outline"
              disabled={!sql}
              onClick={() => {
                void (async () => {
                  if (!navigator.clipboard) throw Error();
                  await navigator.clipboard.writeText(sql);
                })()
                  .then(() => toast.success("Showcase SQL copied"))
                  .catch(() => setError("Select and copy the SQL text above."));
              }}
            >
              Copy SQL
            </Button>
          </details>
        </div>
      )}
      <fieldset disabled={!ready || busy} className={styles["fields"]}>
        <label className={styles["master"]}>
          <span>
            Showcase ON / OFF <small>Switching off keeps your posters for later.</small>
          </span>
          <Switch
            aria-label="Showcase enabled"
            checked={draft.enabled}
            onCheckedChange={(enabled) => {
              setSaved(false);
              setDraft((current) => ({ ...current, enabled }));
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Changes apply when you Save Showcase. Up to {SHOWCASE_LIMIT} posters. JPG/PNG/WebP under
          10 MB. Uploads compress to WebP, max 1600 px / 400 KB, plus a tiny preview. Artwork stays
          uncropped. Poster offers do not change checkout prices or coupons.
        </p>
        <div className={styles["items"]}>
          {draft.items.map((item, index) => {
            const file = files.current.get(item.id);
            const preview =
              file?.url ??
              (item.image?.kind === "seed"
                ? showcaseSeeds[item.image.key].thumbnail
                : query.data?.items.find((row) => row.id === item.id)?.thumbnail);
            const seed = item.image?.kind === "seed" && !file;
            return (
              <article
                className={styles["item"]}
                key={item.id}
                aria-label={`Poster: ${item.title || "New poster"}`}
              >
                <div className={styles["preview"]}>
                  {preview ? (
                    <img src={preview} alt={item.title || "Poster preview"} loading="lazy" />
                  ) : (
                    <span>Choose poster</span>
                  )}
                </div>
                <div className={styles["itemFields"]}>
                  <label>
                    Poster title
                    <Input
                      maxLength={60}
                      value={item.title}
                      onChange={(event) => change(item.id, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Collection
                    <select
                      aria-label="Collection"
                      value={item.audience}
                      disabled={seed}
                      onChange={(event) =>
                        change(item.id, {
                          audience: event.target.value as "men" | "women",
                          productId: null,
                        })
                      }
                    >
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                    </select>
                  </label>
                  <label>
                    Poster opens
                    <select
                      aria-label="Poster opens"
                      value={item.productId ?? ""}
                      onChange={(event) =>
                        change(item.id, { productId: event.target.value || null })
                      }
                    >
                      <option value="">This collection</option>
                      {item.productId &&
                        !products.data?.some((product) => product.id === item.productId) && (
                          <option value={item.productId}>Saved product (check availability)</option>
                        )}
                      {(products.data ?? [])
                        .filter(
                          (product) =>
                            parseCategory(product.category).department.toLowerCase() ===
                            item.audience,
                        )
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.brand} {product.article}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Add / replace image
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        void choose(item.id, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {file && (
                    <p className="text-xs" role="status">
                      {kb(file.blob.size)} poster + {kb(file.thumbnail.size)} preview · Ready to
                      upload on Save
                    </p>
                  )}
                  <div className={styles["itemActions"]}>
                    <label>
                      <Switch
                        aria-label={`Show ${item.title || "new poster"}`}
                        checked={item.enabled}
                        onCheckedChange={(enabled) => change(item.id, { enabled })}
                      />{" "}
                      ON / OFF
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Move ${item.title} up`}
                      disabled={index === 0}
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => {
                          const items = [...current.items];
                          [items[index - 1], items[index]] = [items[index]!, items[index - 1]!];
                          return { ...current, items };
                        });
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Move ${item.title} down`}
                      disabled={index === draft.items.length - 1}
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => {
                          const items = [...current.items];
                          [items[index], items[index + 1]] = [items[index + 1]!, items[index]!];
                          return { ...current, items };
                        });
                      }}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSaved(false);
                        setDraft((current) => ({
                          ...current,
                          items: current.items.filter((row) => row.id !== item.id),
                        }));
                      }}
                    >
                      Remove poster
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <Button
          variant="outline"
          disabled={draft.items.length >= SHOWCASE_LIMIT}
          onClick={() => {
            setSaved(false);
            setDraft((current) => ({
              ...current,
              items: [
                ...current.items,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  audience: "men",
                  enabled: true,
                  productId: null,
                  image: null,
                },
              ],
            }));
          }}
        >
          Add poster
        </Button>
        <Button onClick={() => void save()}>
          {busy ? "Preparing / saving…" : "Save Showcase"}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Showcase saved. Open Men or Women in the public catalog to check it.
        </p>
      )}
      <div className={styles["footer"]}>
        <Button variant="outline" disabled={busy} onClick={() => void reload()}>
          Reload saved settings
        </Button>
        {(cleanupPending.length > 0 || (query.data?.storage?.pending.length ?? 0) > 0) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void ownerToken()
                .then((token) => cleanup(cleanupPending, token))
                .then(() => query.refetch())
                .catch(() => setError("Cleanup is unavailable. Please retry."))
                .finally(() => setBusy(false));
            }}
          >
            Retry unused-photo cleanup
          </Button>
        )}
        <a href="/catalog" target="_blank" rel="noreferrer">
          Open catalog ↗
        </a>
      </div>
      {query.data?.storage && (
        <p className="text-xs text-muted-foreground">
          Custom Showcase photos: {kb(query.data.storage.photo_bytes)}. Included posters use app
          assets, not your photo bucket. Replaced uploads are removed only after a confirmed save.
          Unused interrupted uploads can be cleaned up after one hour.
        </p>
      )}
    </section>
  );
}
