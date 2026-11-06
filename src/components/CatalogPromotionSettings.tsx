import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import promoStyles from "./catalog-offer-ticket.module.css";
import { CatalogOfferTicket } from "./CatalogOfferTicket";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  EMPTY_PROMOTION,
  emptyCampaign,
  promoConfigSchema,
  storedPromoImageSchema,
  savedPromotionStatus,
  type PromoCampaign,
  type PromoConfig,
  type PromoSlot,
} from "@/lib/catalog-promotion";
import { compressPromotionPhoto } from "@/lib/promotion-images";
import {
  cleanupPromotionUploads,
  getOwnerPromotion,
  saveOwnerPromotion,
  preparePromotionUpload,
  type PromotionSnapshot,
  type PromotionStorage,
} from "@/lib/catalog-promotion.functions";
import { storageBytes } from "@/lib/storage-usage";
import { productUrls } from "@/lib/product-images";
import { parseCategory } from "@/lib/product-categories";
import type { CatalogOffer, CatalogProduct } from "@/lib/catalog.functions";

async function token() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Error("Sign in again to edit promotions.");
  return data.session.access_token;
}
const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const keyOf = (audience: string, slot: PromoSlot) => `${audience}:${slot}`;

type PendingPhoto = {
  blob: Blob;
  width: number;
  height: number;
  preview: string;
  original: number;
};
export function CatalogPromotionSettings({ fallback }: { fallback: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["catalog-promotions-owner"],
    queryFn: async () => getOwnerPromotion({ data: { token: await token() } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [snapshot, setSnapshot] = useState<PromotionSnapshot | null>(null),
    [config, setConfig] = useState<PromoConfig>(EMPTY_PROMOTION);
  const [enabled, setEnabled] = useState(false),
    [audience, setAudience] = useState<PromoCampaign["audience"]>("all"),
    [previewSlot, setPreviewSlot] = useState<PromoSlot>("live");
  const [scheduleOn, setScheduleOn] = useState(false),
    [dates, setDates] = useState({ announceAt: "", startsAt: "", endsAt: "" });
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingPhoto>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [photoUsage, setPhotoUsage] = useState<PromotionStorage | null>(null);
  useEffect(() => {
    if (query.data) {
      setImageUrls((prev) => ({ ...prev, ...query.data.images }));
      setPhotoUsage(query.data.storage);
    }
  }, [query.data]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.preview));
    },
    [],
  );
  useEffect(() => {
    if (query.data && !snapshot) {
      const s = query.data.snapshot;
      setSnapshot(s);
      setEnabled(s.enabled);
      const parsed = promoConfigSchema.safeParse(s.config);
      setConfig(
        parsed.success
          ? parsed.data
          : {
              ...EMPTY_PROMOTION,
              campaigns: EMPTY_PROMOTION.campaigns.map((c) =>
                c.audience === "all"
                  ? {
                      ...c,
                      enabled: s.enabled,
                      title: s.title,
                      subtitle: s.subtitle,
                      coupon: s.coupon,
                    }
                  : c,
              ),
            },
      );
    }
  }, [query.data, snapshot]);
  const campaign = config.campaigns.find((c) => c.audience === audience) ?? emptyCampaign(audience);
  const campaignSchedule = useRef(campaign.schedule);
  campaignSchedule.current = campaign.schedule;
  useEffect(() => {
    const s = campaignSchedule.current;
    setScheduleOn(!!s);
    setDates(
      s
        ? {
            announceAt: localDate(s.announceAt),
            startsAt: localDate(s.startsAt),
            endsAt: localDate(s.endsAt),
          }
        : { announceAt: "", startsAt: "", endsAt: "" },
    );
  }, [audience, snapshot]); // Keep date inputs while editing this audience.
  const setCampaign = (patch: Partial<PromoCampaign>) => {
    setConfig((prev) => ({
      ...prev,
      campaigns: prev.campaigns.some((c) => c.audience === audience)
        ? prev.campaigns.map((c) => (c.audience === audience ? { ...c, ...patch } : c))
        : [...prev.campaigns, { ...emptyCampaign(audience), ...patch }],
    }));
    setDirty(true);
  };
  const coupons = useQuery({
    queryKey: ["catalog-promotion-coupons"],
    queryFn: async () => {
      const r = await supabase
        .from("coupons")
        .select("code,title,kind,value,max_discount,min_bill,starts_at,expires_at,usage_limit,used_count")
        .eq("active", true)
        .is("customer_id", null)
        .order("created_at", { ascending: false });
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const productsQuery = useQuery({
    queryKey: ["catalog-promotion-products"],
    queryFn: async () => {
      // This list has no costs/stock counts. Only selected cover paths are signed below.
      const { fetchAll } = await import("@/lib/fetch-all");
      return fetchAll((from, to) =>
        supabase
          .from("products")
          .select("id,brand,article,category,color,image_url,mrp,selling_price")
          .eq("catalog_visible", true)
          .eq("status", "Active")
          .order("id")
          .range(from, to),
      );
    },
  });
  const available = (productsQuery.data ?? []).filter(
    (p) =>
      audience === "all" ||
      parseCategory(p.category).department === (audience === "men" ? "Men" : "Women"),
  );
  const chosen = campaign.productIds.flatMap((id) => {
    const p = available.find((p) => p.id === id);
    return p ? [p] : [];
  });
  const photoQuery = useQuery({
    queryKey: ["catalog-promotion-preview-photos", ...chosen.map((p) => p.image_url)],
    queryFn: () => productUrls(chosen.flatMap((p) => (p.image_url ? [p.image_url] : []))),
  });
  const previewProducts: CatalogProduct[] = chosen.map((p) => ({
    id: p.id,
    brand: p.brand,
    article: p.article,
    category: p.category,
    color: p.color,
    gender: null,
    mrp: p.mrp,
    price: p.selling_price,
    image: p.image_url ? (photoQuery.data?.get(p.image_url) ?? null) : null,
    sizes: [],
  }));
  const coupon = coupons.data?.find((c) => c.code === campaign.coupon);
  const offer: NonNullable<CatalogOffer> = {
    title: campaign.title || "Store offer",
    subtitle: campaign.subtitle || null,
    card: true,
    code: coupon?.code ?? null,
    kind: coupon?.kind ?? null,
    value: coupon?.value ?? null,
    max_discount: coupon?.max_discount ?? null,
    min_bill: coupon?.min_bill ?? null,
  };
  const previewPending = pending[keyOf(audience, previewSlot)];
  const previewCampaign = {
    ...campaign,
    enabled: true,
    [previewSlot]: {
      ...campaign[previewSlot],
      image: previewPending
        ? {
            url: previewPending.preview,
            publicId: "",
            bytes: previewPending.blob.size,
            width: previewPending.width,
            height: previewPending.height,
          }
        : campaign[previewSlot].image,
    },
  };
  function rememberDates(next: typeof dates, on = scheduleOn) {
    setDates(next);
    setScheduleOn(on);
    setDirty(true);
    if (!on) {
      setCampaign({ schedule: null });
      return;
    }
    if (
      Object.values(next).every(Boolean) &&
      Object.values(next).every((v) => Number.isFinite(Date.parse(v)))
    )
      setCampaign({
        schedule: {
          announceAt: new Date(next.announceAt).toISOString(),
          startsAt: new Date(next.startsAt).toISOString(),
          endsAt: new Date(next.endsAt).toISOString(),
        },
      });
  }
  async function choosePhoto(slot: PromoSlot, file: File) {
    if (!query.data?.uploadReady) {
      toast.error("Apply the promotion photo storage SQL update first, then reload.");
      return;
    }
    setBusy(true);
    setStatus("Compressing poster on this device…");
    try {
      const photo = await compressPromotionPhoto(file);
      const key = keyOf(audience, slot);
      const preview = URL.createObjectURL(photo.blob);
      setPending((prev) => {
        if (prev[key]) URL.revokeObjectURL(prev[key]!.preview);
        return { ...prev, [key]: { ...photo, preview, original: file.size } };
      });
      setDirty(true);
      setPreviewSlot(slot);
      setStatus(
        `Compressed ${Math.round(file.size / 1024)} KB → ${Math.round(photo.blob.size / 1024)} KB. Not uploaded yet.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Photo compression failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  function removePhoto(slot: PromoSlot) {
    const key = keyOf(audience, slot);
    setPending((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]!.preview);
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCampaign({ [slot]: { ...campaign[slot], image: null } });
  }
  async function save() {
    if (!snapshot) return;
    if (scheduleOn && Object.values(dates).some((v) => !v)) {
      toast.error("Choose all three promotion times.");
      return;
    }
    const parsed = promoConfigSchema.safeParse(config);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check promotion settings");
      return;
    }
    if (enabled && !parsed.data.campaigns.some((c) => c.enabled)) {
      toast.error("Enable at least one audience promotion.");
      return;
    }
    setBusy(true);
    setStatus("Saving promotion settings…");
    try {
      const auth = await token();
      let next = parsed.data;
      for (const c of next.campaigns)
        for (const slot of ["advance", "live"] as const) {
          const photo = pending[keyOf(c.audience, slot)];
          if (!photo) continue;
          setStatus(`Uploading compressed ${c.audience} ${slot} poster…`);
          const prepared = await preparePromotionUpload({
            data: { token: auth, audience: c.audience, slot },
          });
          const uploaded = await supabase.storage
            .from(prepared.bucket)
            .upload(prepared.path, photo.blob, {
              contentType: "image/webp",
              upsert: false,
              cacheControl: "3600",
            });
          if (uploaded.error)
            throw Error(
              "Photo upload was not confirmed. Retry Save; your saved poster is unchanged.",
            );
          const image = storedPromoImageSchema.parse({
            storage: "shop",
            path: prepared.path,
            bytes: photo.blob.size,
            width: photo.width,
            height: photo.height,
          });
          const signed = await supabase.storage
            .from(prepared.bucket)
            .createSignedUrl(prepared.path, 3600);
          if (signed.data?.signedUrl)
            setImageUrls((prev) => ({ ...prev, [prepared.path]: signed.data.signedUrl }));
          next = {
            ...next,
            campaigns: next.campaigns.map((x) =>
              x.audience === c.audience ? { ...x, [slot]: { ...x[slot], image } } : x,
            ),
          };
          // Retain staged URLs if saving fails; Retry reuses the uploaded image.
          setConfig(next);
          const key = keyOf(c.audience, slot);
          setPending((prev) => {
            if (prev[key]) URL.revokeObjectURL(prev[key]!.preview);
            const n = { ...prev };
            delete n[key];
            return n;
          });
        }
      const all = next.campaigns.find((c) => c.audience === "all");
      const settings = {
        enabled,
        title: all?.title ?? snapshot.title,
        subtitle: all?.subtitle ?? snapshot.subtitle,
        coupon: all?.coupon ?? snapshot.coupon,
        card: snapshot.card,
        config: next,
      };
      const saved = await saveOwnerPromotion({
        data: { token: auth, expected: snapshot, settings },
      });
      setSnapshot(saved);
      setConfig(next);
      setDirty(false);
      setStatus("Promotions saved. Checking public visibility…");
      void qc.invalidateQueries({ queryKey: ["catalog-offer"] });
      toast.success("Promotions saved");
      window.dispatchEvent(new Event("solestack-catalog-refresh"));
      try {
        localStorage.setItem("catalog-promotion-refresh", String(Date.now()));
      } catch { /* Other tabs still refresh on visibility or their normal interval. */ }
      // Saving the design does not prove that the public coupon/time gates expose it.
      const verification = await query.refetch();
      const savedCampaign = next.campaigns.find((c) => c.audience === audience);
      const publicStatus = savedPromotionStatus(enabled, savedCampaign, verification.isError ? undefined : verification.data?.publication);
      setStatus(`Promotions saved. ${publicStatus}`);
      if (!publicStatus.startsWith("Visible now:") && enabled && savedCampaign?.enabled)
        toast.warning(publicStatus);
      // The save transaction records old files in the durable cleanup manifest.
      if (query.data?.uploadReady)
        try {
          setPhotoUsage(await cleanupPromotionUploads({ data: { token: auth } }));
        } catch {
          toast.warning("Promotion saved. Unused photo cleanup is pending; use Retry cleanup.");
          void query.refetch();
        }
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      void qc.invalidateQueries({ queryKey: ["store-usage"] });
    } catch (e) {
      void query.refetch();
      void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
      toast.error(e instanceof Error ? e.message : "Could not save promotions");
      setStatus(
        "Save was not confirmed. Your draft is kept; retry the same save or reload to check saved settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <p role="status" className="py-6 text-sm">
        Loading promotion settings…
      </p>
    );
  if (query.error)
    return (
      <div>
        <p className="mt-4 rounded-lg border p-3 text-sm">
          Sale promotions need the small promotion settings SQL update. Existing offers still work
          below.
        </p>
        {fallback}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry promotion settings
        </Button>
      </div>
    );
  return (
    <section className="mt-5 space-y-5" aria-label="Sale promotions">
      <div>
        <h3 className="font-semibold">Sale promotions</h3>
        <p className="text-sm text-muted-foreground">
          Advance notice and live offers below Spotlight. Separate designs for everyone, Men and
          Women.
        </p>
      </div>
      <fieldset disabled={busy} className="space-y-5 min-w-0">
        <label className="flex items-center justify-between gap-4">
          <span>Show promotions on catalog</span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </label>
        <div className="grid grid-cols-3 gap-2" aria-label="Promotion audience">
          {(["all", "men", "women"] as const).map((v) => (
            <Button
              key={v}
              variant={audience === v ? "default" : "outline"}
              onClick={() => {
                if (scheduleOn && Object.values(dates).some((x) => !x)) {
                  toast.error("Complete the dates or switch scheduling off first.");
                  return;
                }
                setAudience(v);
              }}
            >
              {v === "all" ? "Everyone" : v === "men" ? "Men" : "Women"}
            </Button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-4">
          <span>Enable this audience promotion</span>
          <Switch checked={campaign.enabled} onCheckedChange={(v) => setCampaign({ enabled: v })} />
        </label>
        <div className="rounded-lg border p-3 text-sm space-y-2" aria-label="Saved catalog visibility">
          <p role="status">
            {savedPromotionStatus(
              snapshot?.enabled ?? false,
              snapshot?.config?.campaigns.find((c) => c.audience === audience),
              query.data?.publication,
            )}
          </p>
          {dirty && <p className="text-xs text-muted-foreground">This status is for saved settings. Save your changes to update the catalog.</p>}
          <Button variant="outline" size="sm" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>
            Refresh catalog status
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            Promotion title
            <Input
              value={campaign.title}
              maxLength={60}
              placeholder="Your sale name"
              onChange={(e) => setCampaign({ title: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            Coupon
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={campaign.coupon}
              onChange={(e) => setCampaign({ coupon: e.target.value })}
            >
              <option value="">No coupon — announcement only</option>
              {campaign.coupon && coupons.data && !coupons.data.some((c) => c.code === campaign.coupon) && (
                <option value={campaign.coupon} disabled>{campaign.coupon} — unavailable</option>
              )}
              {(coupons.data ?? []).map((c) => {
                const expired = !!c.expires_at && Date.parse(c.expires_at) <= Date.now();
                const exhausted = c.usage_limit != null && c.used_count >= c.usage_limit;
                return <option key={c.code} value={c.code} disabled={expired || exhausted}>
                  {c.code}
                  {c.title ? ` — ${c.title}` : ""}
                  {expired ? " — expired" : exhausted ? " — usage limit reached" : ""}
                </option>;
              })}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            Short message
            <Input
              value={campaign.subtitle}
              maxLength={120}
              onChange={(e) => setCampaign({ subtitle: e.target.value })}
            />
          </label>
        </div>
        {coupons.error && (
          <p role="alert" className="text-sm text-destructive">
            Coupons could not be loaded. Retry before changing the coupon.
          </p>
        )}
        <div className="rounded-xl border p-4 space-y-3">
          <h4 className="font-medium">Featured products (optional, up to 2)</h4>
          <p className="text-xs text-muted-foreground">
            One pair uses the spotlight layout; two pairs use a balanced split. Existing photos are
            reused without another upload. Prices shown are current listed prices; the coupon is
            validated at checkout.
          </p>
          {[0, 1].map((i) => (
            <label key={i} className="block text-sm">
              Product {i + 1}
              <select
                className="mt-1 h-11 w-full rounded-md border bg-background px-2"
                value={campaign.productIds[i] ?? ""}
                onChange={(e) => {
                  const ids = [...campaign.productIds];
                  ids[i] = e.target.value;
                  setCampaign({ productIds: ids.filter(Boolean) });
                }}
              >
                <option value="">None</option>
                {available
                  .filter(
                    (p) => !campaign.productIds.includes(p.id) || campaign.productIds[i] === p.id,
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.brand} {p.article}
                      {p.color ? ` · ${p.color}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          {productsQuery.error && (
            <p role="alert" className="text-sm text-destructive">
              Products could not be loaded.
            </p>
          )}
        </div>
        <div className="rounded-xl border p-4 space-y-3">
          <label className="flex items-center justify-between gap-4">
            <span>Schedule advance & live phases</span>
            <Switch checked={scheduleOn} onCheckedChange={(v) => rememberDates(dates, v)} />
          </label>
          {scheduleOn && (
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["announceAt", "Show advance notice"],
                  ["startsAt", "Sale starts"],
                  ["endsAt", "Sale ends"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-sm min-w-0">
                  {label}
                  <Input
                    type="datetime-local"
                    value={dates[key]}
                    onChange={(e) => rememberDates({ ...dates, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {!scheduleOn && "Scheduling is off: only the Live sale design appears on the catalog. Advance artwork needs a schedule. "}
            Choose times in your device’s timezone. Customers see IST. The card switches
            automatically and hides at the end. Coupon validity must cover the live sale; these
            display settings do not change checkout prices.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["advance", "live"] as const).map((slot) => {
            const photo = pending[keyOf(audience, slot)],
              image = campaign[slot].image;
            return (
              <div key={slot} className="rounded-xl border p-4 min-w-0 space-y-3">
                <h4 className="font-semibold">
                  {slot === "advance" ? "Advance promotion" : "Live sale"}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(["classic", "split"] as const).map((layout) => (
                    <button
                      key={layout}
                      type="button"
                      aria-pressed={campaign[slot].layout === layout}
                      aria-label={layout === "classic" ? "Street Drop" : "Sticker Edit"}
                      className={`rounded-lg border p-3 text-left ${campaign[slot].layout === layout ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setCampaign({ [slot]: { ...campaign[slot], layout } })}
                    >
                      <span
                        className={promoStyles["swatch"]}
                        data-layout={layout}
                        aria-hidden="true"
                      >
                        <span>{layout === "classic" ? "NEXT" : "THE"}</span>
                        <span>{layout === "classic" ? "BIG DROP" : "EDIT"}</span>
                      </span>
                      <span className="text-xs">
                        {layout === "classic" ? "Street Drop" : "Sticker Edit"}
                      </span>
                    </button>
                  ))}
                </div>
                <label className="block text-sm">
                  {photo || image ? "Replace custom poster" : "Upload custom poster (optional)"}
                  <Input
                    type="file"
                    className="mt-1"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!query.data?.uploadReady}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void choosePhoto(slot, f);
                    }}
                  />
                </label>
                {(photo || image) && (
                  <Button variant="outline" size="sm" onClick={() => removePhoto(slot)}>
                    Remove photo · use preset
                  </Button>
                )}
                {photo && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round(photo.original / 1024)} KB → {Math.round(photo.blob.size / 1024)} KB
                    · ready to upload on Save
                  </p>
                )}
                {image && !photo && (
                  <p className="text-xs text-muted-foreground">
                    Stored photo: {Math.round(image.bytes / 1024)} KB
                  </p>
                )}
                <Button variant="outline" size="sm" onClick={() => setPreviewSlot(slot)}>
                  Preview {slot === "advance" ? "advance" : "live"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Custom artwork shows completely, without cropping or text overlays. JPG, PNG or WebP up to
          10 MB; compressed on this device to at most 1600 px and 400 KB before upload. Transparent
          cutouts look best in the built-in presets. Existing opaque photos remain usable. Custom
          posters replace product-photo artwork in that phase.
        </p>
        {!query.data?.uploadReady && (
          <p role="status" className="rounded-lg border p-3 text-sm">
            Apply the promotion photo storage SQL update, then reload. No external account is
            required.
          </p>
        )}
        <div className="rounded-xl border p-3 text-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Promotion photo storage</span>
            <strong data-no-translate>
              {photoUsage ? storageBytes(photoUsage.photo_bytes) : "—"}
            </strong>
          </div>
          <p className="text-xs text-muted-foreground">
            {photoUsage ? `${photoUsage.photos} files · ` : "Measurement unavailable · "}Includes
            saved photos and uploads awaiting cleanup. Only image paths are stored in shop records.
            Existing product photos are reused without another upload.
          </p>
          {!!photoUsage?.pending.length && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setPhotoUsage(await cleanupPromotionUploads({ data: { token: await token() } }));
                  void qc.invalidateQueries({ queryKey: ["hero-storage-usage"] });
                  toast.success("Unused photo cleanup checked");
                } catch {
                  toast.error("Unused photo cleanup is pending. Retry when online.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Retry unused-photo cleanup
            </Button>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Preview only · {previewSlot === "advance" ? "Advance promotion" : "Live sale"}
          </p>
          <div className="max-w-xl">
            <CatalogOfferTicket
              offer={offer}
              campaign={previewCampaign}
              phase={previewSlot}
              products={previewProducts}
              motionEnabled={false}
              imageUrls={imageUrls}
              onShop={() => {}}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save promotions"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "Saved settings"}
          </span>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm("Discard unsaved promotion changes and reload?")) return;
              void query.refetch().then((r) => {
                if (r.data) {
                  Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.preview));
                  setPending({});
                  setSnapshot(null);
                  setDirty(false);
                }
              });
            }}
          >
            Reload saved
          </Button>
        </div>
      </fieldset>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </section>
  );
}
