import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  HERO_BUCKET,
  HERO_DEFAULTS,
  prepareHeroImage,
  validateHero,
  type HeroSettings,
} from "@/lib/catalog-hero";
import { CatalogHero } from "./CatalogHero";
import type { CatalogThemeId } from "@/lib/catalog-themes";
import { useLang } from "@/lib/i18n";
import { HERO_IMAGE_COPY, heroImageError } from "@/lib/hero-image-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import styles from "./catalog-hero-preview.module.css";

const CATEGORIES = ["All", "Gents", "Ladies", "Boys", "Girls", "Kids"];
/** Mounted only inside owner Settings. Public visitors receive no editor code or settings query. */
export function CatalogHeroPreview({ previewTheme = "studio" }: { previewTheme?: CatalogThemeId }) {
  const qc = useQueryClient();
  const { lang } = useLang();
  const copy = HERO_IMAGE_COPY[lang];
  const query = useQuery({
    queryKey: ["catalog-hero-settings"],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_hero_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ["hero-product-choices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,article,image_url")
        .eq("catalog_visible", true)
        .neq("status", "inactive")
        .order("article")
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const [draft, setDraft] = useState<HeroSettings>({ ...HERO_DEFAULTS });
  const [image, setImage] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [existing, setExisting] = useState("");
  const [cleanup, setCleanup] = useState<string | null>(null);
  const usage = useQuery({
    queryKey: ["hero-storage-usage"],
    retry: false,
    queryFn: async () => {
      const { data, error: usageError } = await supabase.rpc("catalog_hero_storage_usage");
      if (usageError) throw usageError;
      return data as { photo_bytes: number; photos: number; current_bytes: number } | null;
    },
  });
  const kb = (bytes: number) =>
    `${(bytes / 1024).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KB`;
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const set = <K extends keyof HeroSettings>(key: K, value: HeroSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  useEffect(
    () => () => {
      if (image.startsWith("blob:")) URL.revokeObjectURL(image);
    },
    [image],
  );
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  function restore(row: NonNullable<typeof query.data>) {
    const { id: _id, updated_at: _at, ...settings } = row;
    setDraft(settings as HeroSettings);
    setBlob(null);
    setImage("");
    const id = ++request.current;
    if (settings.image_path)
      void supabase.storage
        .from(HERO_BUCKET)
        .createSignedUrl(settings.image_path, 3600)
        .then(({ data, error: signingError }) => {
          if (id !== request.current) return;
          if (signingError)
            setError(
              "Could not load the saved image. Retry or choose a replacement before enabling the hero.",
            );
          else setImage(data.signedUrl);
        });
  }
  useEffect(() => {
    if (query.data) restore(query.data);
  }, [query.data]);

  async function choose(file?: File | Blob) {
    const id = ++request.current;
    setError("");
    if (!file) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareHeroImage(
        file instanceof File ? file : new File([file], "product.webp", { type: file.type }),
      );
      if (id === request.current) {
        setBlob(prepared);
        setImage(URL.createObjectURL(prepared));
      }
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Could not read this image.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  async function chooseExisting() {
    const product = products.find((p) => p.id === existing);
    if (!product?.image_url) return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const { data, error: downloadError } = await supabase.storage
        .from("product-images")
        .download(product.image_url);
      if (downloadError) throw downloadError;
      if (id === request.current) await choose(data);
    } catch {
      if (id === request.current)
        setError("Could not read this product photo. Upload a transparent PNG/WebP instead.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  async function save(offOnly = false) {
    if (!query.data || busy || saving) return;
    setError("");
    if (!offOnly) {
      const issue = validateHero(draft);
      if (issue) {
        setError(issue);
        return;
      }
      if (draft.enabled && (!image || (!blob && !draft.image_path))) {
        setError("Choose a valid transparent product image before enabling the hero.");
        return;
      }
    }
    setSaving(true);
    let uploaded: string | null = null;
    let committed = false;
    try {
      let path = draft.image_path;
      if (!offOnly && blob) {
        uploaded = `hero/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "png"}`;
        const { error: uploadError } = await supabase.storage
          .from(HERO_BUCKET)
          .upload(uploaded, blob, { contentType: blob.type, upsert: false });
        if (uploadError) throw uploadError;
        path = uploaded;
      }
      const payload = offOnly
        ? { enabled: false }
        : {
            ...draft,
            image_path: path,
            heading: draft.heading.trim(),
            custom_text: draft.custom_text.trim(),
            button_label: draft.button_label.trim(),
            subtitle: draft.subtitle.trim(),
          };
      const { data, error: updateError } = await supabase
        .from("catalog_hero_settings")
        .update(payload)
        .eq("id", 1)
        .eq("updated_at", query.data.updated_at)
        .select("*")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data)
        throw new Error(
          "Hero settings changed in another session. Reload saved settings before saving again.",
        );
      committed = true;
      qc.setQueryData(["catalog-hero-settings"], data);
      const previous = query.data.image_path;
      if (uploaded && previous && previous !== data.image_path) {
        const { error: cleanupError } = await supabase.storage.from(HERO_BUCKET).remove([previous]);
        setCleanup(cleanupError ? previous : null);
        if (cleanupError)
          toast.error(
            "Hero saved; the previous hero copy could not be deleted. Use Retry cleanup.",
          );
      }
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      toast.success(
        offOnly
          ? "Hero switched off. The original catalog introduction is restored for new visits."
          : "Hero saved. Refresh the public catalog to see the update.",
      );
    } catch (e) {
      // Storage RLS refuses deletion if a lost response followed a committed save.
      if (uploaded && !committed) await supabase.storage.from(HERO_BUCKET).remove([uploaded]);
      setError(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Could not save the hero. Your saved catalog is unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function retryCleanup() {
    if (!cleanup) return;
    setSaving(true);
    try {
      const { error: cleanupError } = await supabase.storage.from(HERO_BUCKET).remove([cleanup]);
      if (cleanupError) throw cleanupError;
      setCleanup(null);
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      toast.success("Previous hero copy removed.");
    } catch {
      toast.error(
        "Cleanup could not complete. The current hero and original product photo are safe.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    request.current++;
    setBlob(null);
    setImage("");
    setError("");
    setBusy(false);
    setExisting("");
    if (input.current) input.current.value = "";
    const result = await query.refetch();
    if (result.data) restore(result.data);
  }

  return (
    <section className={styles["settings"]} aria-labelledby="hero-preview-title">
      <h3 id="hero-preview-title" className="font-semibold">
        Hero banner
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Owner controls only. Preview your changes, then save to update the customer catalog. Turn
        the hero off to restore the original introduction.
      </p>
      <fieldset disabled={saving} className="min-w-0">
        <div className={styles["toolbar"]}>
          <label>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />{" "}
            Show hero on catalog
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.motion}
              onChange={(e) => set("motion", e.target.checked)}
            />{" "}
            Motion
          </label>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={mobile}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? "Show desktop preview" : "Show mobile preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void reset()}>
            Reload saved settings
          </Button>
        </div>
        <div className={styles["previewFrame"]} data-mobile={mobile}>
          {draft.enabled && image ? (
            <CatalogHero
              theme={previewTheme}
              key={`${image}-${mobile}`}
              hero={{ ...draft, image }}
              fallback={
                <p className="p-5 text-sm">
                  Could not load this image. Reload saved settings or choose a transparent
                  replacement.
                </p>
              }
            />
          ) : (
            <div className={styles["fallback"]}>
              <h4>Find your everyday pair.</h4>
              <p>
                {draft.enabled
                  ? "Choose a transparent product image to preview the hero."
                  : "Hero hidden. The original catalog introduction stays in place."}
              </p>
            </div>
          )}
        </div>
      </fieldset>
      <div
        className="my-4 grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3"
        aria-label="Hero image storage"
      >
        <div>
          <p className="text-xs text-muted-foreground">Saved hero image</p>
          <b>
            {usage.data
              ? kb(Number(usage.data.current_bytes ?? 0))
              : usage.isPending
                ? "Checking…"
                : "Usage unavailable"}
          </b>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">All hero files</p>
          <b>
            {usage.data
              ? `${kb(Number(usage.data.photo_bytes))} · ${usage.data.photos} files`
              : usage.isPending
                ? "Checking…"
                : "Usage unavailable"}
          </b>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Selected image after compression</p>
          <b>{blob ? kb(blob.size) : "No new upload"}</b>
        </div>
        {blob && usage.data && (
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Estimated hero storage after replacement:{" "}
            {kb(
              Math.max(0, Number(usage.data.photo_bytes) - Number(usage.data.current_bytes ?? 0)) +
                blob.size,
            )}
            . Uses your shared photo storage allowance; there is no separate free hero quota.
          </p>
        )}
      </div>
      {query.isPending && (
        <p role="status" className="mt-3 text-sm">
          Loading hero settings…
        </p>
      )}
      {query.isError && (
        <div role="alert" className="mt-3 text-sm text-destructive">
          Hero settings are unavailable. Your catalog still works. The hero database update may need
          to be applied.
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <details className={styles["guidance"]} data-no-translate>
        <summary>{copy.title}</summary>
        <ol>
          {copy.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p>{copy.removal}</p>
      </details>
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className={styles["controls"]}>
          <div className="space-y-1">
            <Label htmlFor="hero-image" data-no-translate>
              {copy.upload}
            </Label>
            <Input
              ref={input}
              id="hero-image"
              type="file"
              accept="image/png,image/webp"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground" data-no-translate>
              {copy.requirements}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-existing" data-no-translate>
              {copy.existing}
            </Label>
            <select
              id="hero-existing"
              className={styles["select"]}
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
            >
              <option value="" data-no-translate>
                {copy.chooseProduct}
              </option>
              {products
                .filter((p) => p.image_url)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand} {p.article}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!existing || busy}
              onClick={() => void chooseExisting()}
              data-no-translate
            >
              {copy.checkPhoto}
            </Button>
            <p className="text-xs text-muted-foreground" data-no-translate>
              {copy.originalSafe}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-offer">Offer style</Label>
            <select
              id="hero-offer"
              className={styles["select"]}
              value={draft.offer_kind}
              onChange={(e) => set("offer_kind", e.target.value as HeroSettings["offer_kind"])}
            >
              <option value="up-to">Up to %</option>
              <option value="percent">Flat %</option>
              <option value="amount">Flat ₹</option>
              <option value="starting">Starting ₹</option>
              <option value="custom">Custom text</option>
            </select>
          </div>
          {draft.offer_kind === "custom" ? (
            <div className="space-y-1">
              <Label htmlFor="hero-custom">Custom offer</Label>
              <Input
                id="hero-custom"
                maxLength={40}
                value={draft.custom_text}
                onChange={(e) => set("custom_text", e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="hero-value">Offer value</Label>
              <Input
                id="hero-value"
                type="number"
                min="0.01"
                step="0.01"
                max={["up-to", "percent"].includes(draft.offer_kind) ? 100 : 1000000}
                value={Number.isFinite(draft.offer_value) ? draft.offer_value : ""}
                onChange={(e) =>
                  set("offer_value", e.target.value === "" ? NaN : Number(e.target.value))
                }
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="hero-heading">Heading</Label>
            <Input
              id="hero-heading"
              maxLength={60}
              value={draft.heading}
              onChange={(e) => set("heading", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-message">Conditions / short message</Label>
            <Input
              id="hero-message"
              maxLength={120}
              value={draft.subtitle}
              onChange={(e) => set("subtitle", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-button">Button label</Label>
            <Input
              id="hero-button"
              maxLength={30}
              value={draft.button_label}
              onChange={(e) => set("button_label", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-action">Button opens</Label>
            <select
              id="hero-action"
              className={styles["select"]}
              value={draft.action}
              onChange={(e) => set("action", e.target.value as HeroSettings["action"])}
            >
              <option value="collection">Full collection</option>
              <option value="category">Category</option>
              <option value="product">Product details</option>
              <option value="whatsapp">Shop WhatsApp enquiry</option>
            </select>
          </div>
          {draft.action === "category" && (
            <div className="space-y-1">
              <Label htmlFor="hero-category">Category</Label>
              <select
                id="hero-category"
                className={styles["select"]}
                value={draft.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {draft.action === "product" && (
            <div className="space-y-1">
              <Label htmlFor="hero-product">Catalog product</Label>
              <select
                id="hero-product"
                className={styles["select"]}
                value={draft.product_id ?? ""}
                onChange={(e) => set("product_id", e.target.value || null)}
              >
                <option value="">Choose a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand} {p.article}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="hero-scale">Product image size: {draft.image_scale}%</Label>
            <Input
              id="hero-scale"
              type="range"
              min="65"
              max="100"
              value={draft.image_scale}
              onChange={(e) => set("image_scale", Number(e.target.value))}
            />
          </div>
        </div>
        {busy && (
          <p role="status" className="text-sm" data-no-translate>
            {copy.checking}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive" data-no-translate>
            {heroImageError(error, lang)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Offer text advertises your offer; it does not apply a checkout discount. Set matching
          prices/coupons separately. Images are compressed to at most 1200px with transparency
          preserved. Replacing a saved hero deletes its previous hero copy; original product photos
          stay unchanged. Switching OFF keeps the current image for reuse.
        </p>
        {cleanup && (
          <Button variant="outline" onClick={() => void retryCleanup()}>
            Retry cleanup
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!query.data || busy} onClick={() => void save()}>
            {saving ? "Saving…" : "Save hero"}
          </Button>
          <Button disabled={!query.data || busy} variant="outline" onClick={() => void save(true)}>
            Turn off public hero
          </Button>
          <Button asChild variant="outline">
            <a href="/catalog" target="_blank" rel="noreferrer">
              Open public catalog
            </a>
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
