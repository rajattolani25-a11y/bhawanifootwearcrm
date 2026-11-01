import studio from "@/components/poster-studio.module.css";
import { PosterThemePreviews } from "@/components/PosterThemePreviews";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, MessageCircle, Share2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { useStock, type Product } from "@/lib/stock";
import { arrivalMessage } from "@/lib/messages";
import { printHtml } from "@/lib/print";
import { useLang } from "@/lib/i18n";
import {
  DEFAULT_POSTER_VISIBILITY,
  DEFAULT_POSTER_TYPOGRAPHY,
  POSTER_HEADLINES,
  type PosterTypography,
  POSTER_FIELDS,
  drawPoster,
  posterBlob,
  posterSizes,
  type PosterPhoto,
  type PosterTheme,
} from "@/lib/poster";

import {
  CAMPAIGN_KEY,
  CAMPAIGN_STARTERS,
  parseCampaigns,
  type PosterCampaign,
} from "@/lib/poster-campaigns";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "WhatsApp & Posters — SoleStack POS" },
      {
        name: "description",
        content: "New stock messages for WhatsApp community and status posters.",
      },
      { property: "og:title", content: "WhatsApp & Posters — SoleStack POS" },
      {
        property: "og:description",
        content: "Create professional new-stock campaigns and posters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Community,
});

const sizesOf = posterSizes;

function Community() {
  const { data = [], isLoading } = useStock();
  const { t } = useLang();
  const [mobilePanel, setMobilePanel] = useState("products");
  const previewRef = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState("NEW ARRIVAL");
  const [theme, setTheme] = useState<PosterTheme>("luxury");
  const [typography, setTypography] = useState<PosterTypography>({ ...DEFAULT_POSTER_TYPOGRAPHY });
  const [campaigns, setCampaigns] = useState<PosterCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("new");
  const [campaignName, setCampaignName] = useState("");
  useEffect(() => {
    try {
      setCampaigns(parseCampaigns(localStorage.getItem(CAMPAIGN_KEY)));
    } catch {
      toast.info(t("Preset storage is unavailable on this device."));
    }
    // Load device presets once; the current poster is never overwritten on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function storeCampaigns(next: PosterCampaign[]) {
    try {
      localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(next));
      setCampaigns(next);
      return true;
    } catch {
      toast.error(t("Could not save presets. Device storage may be full or blocked."));
      return false;
    }
  }
  function applyCampaign() {
    const value = [...CAMPAIGN_STARTERS, ...campaigns].find((item) => item.id === campaignId);
    if (!value) return;
    setTheme(value.theme);
    setTag(value.tag);
    setOffer(value.offer);
    setVisible({ ...value.visible });
    setTypography({ ...value.typography });
    setCampaignName(value.id.startsWith("local-") ? value.name : "");
  }
  function saveCampaign() {
    const name = campaignName.trim();
    if (!name) return;
    const existing = campaigns.find(
      (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!existing && campaigns.length >= 20) {
      toast.error(t("You can save up to 20 presets. Delete one to add another."));
      return;
    }
    const value: PosterCampaign = {
      id: existing?.id ?? `local-${crypto.randomUUID()}`,
      name,
      theme,
      tag,
      offer,
      visible: { ...visible },
      typography: { ...typography },
    };
    const next = existing
      ? campaigns.map((item) => (item.id === existing.id ? value : item))
      : [...campaigns, value];
    if (storeCampaigns(next)) {
      setCampaignId(value.id);
      toast.success(t("Campaign preset saved on this device."));
    }
  }
  const [offer, setOffer] = useState("");
  const [visible, setVisible] = useState({ ...DEFAULT_POSTER_VISIBILITY });
  const [photo, setPhoto] = useState<PosterPhoto>(null);
  const [rendering, setRendering] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterName, setPosterName] = useState("");
  const { data: st } = useQuery({
    queryKey: ["settings"],
    queryFn: async () =>
      (await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle()).data,
  });
  const { data: recentIds = new Set<string>() } = useQuery({
    queryKey: ["recent-purchase", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("variant_id")
        .eq("type", "PURCHASE")
        .gte("moved_at", new Date(Date.now() - days * 864e5).toISOString());
      return new Set((data ?? []).map((r) => r.variant_id as string));
    },
  });
  const since = Date.now() - days * 864e5;
  const fresh = data.filter(
    (p) =>
      sizesOf(p).length &&
      (new Date(p.created_at).getTime() > since ||
        p.product_variants.some((v) => recentIds.has(v.id))),
  );
  const s = q.toLowerCase();
  const all = data
    .filter((p) => sizesOf(p).length && (!s || `${p.brand} ${p.article}`.toLowerCase().includes(s)))
    .slice(0, 30);
  const shop = st?.business_name ?? "Our Store";
  const phone = st?.business_phone ?? "";
  const active = data.find((p) => p.id === selected) ?? fresh[0] ?? all[0];

  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    setPosterError(false);
    if (!active) {
      setPosterUrl("");
      setRendering(false);
      return;
    }
    setRendering(true);
    const timer = setTimeout(() => {
      drawPoster(active, shop, phone, tag, theme, offer, visible, typography)
        .then(({ canvas, photo: info }) => {
          if (cancelled) return;
          setPosterUrl(canvas.toDataURL("image/png"));
          setPhoto(info);
          setPosterName(`${active.article}-${theme}-poster.png`);
        })
        .catch(() => {
          if (!cancelled) setPosterError(true);
        })
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, shop, phone, tag, theme, offer, visible, typography, retry]);

  useEffect(() => {
    if (active) setMessage(arrivalMessage(shop, active, sizesOf(active), phone));
  }, [active, shop, phone]);

  function showPreview() {
    setMobilePanel("preview");
    requestAnimationFrame(() =>
      previewRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      }),
    );
  }
  function poster(p: Product) {
    showPreview();
    setSelected(p.id);
    setRetry((v) => v + 1);
  }
  async function sharePoster(p: Product) {
    setSelected(p.id);
    setPreparing(true);
    try {
      const { canvas } = await drawPoster(p, shop, phone, tag, theme, offer, visible, typography);
      const file = new File([await posterBlob(canvas)], `${p.article}-${theme}-poster.png`, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        // Share only the artwork: hidden price/size/contact fields must not leak into a caption.
        await navigator.share({ files: [file] });
      } else {
        showPreview();
        toast.info(t("Poster preview is ready — download it and attach in WhatsApp status"));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error(t("Could not share this poster. Download it and attach it in WhatsApp."));
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className={studio["studio"]}>
      <PageHeader
        title="WhatsApp Community & Posters"
        subtitle="New stock message for your community group + 9:16 status posters. Free, no API."
      />
      <nav className={studio["tabs"]} aria-label={t("Poster workspace")}>
        {(
          [
            ["products", "Product"],
            ["design", "Design"],
            ["preview", "Preview"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mobilePanel === id}
            onClick={() => setMobilePanel(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      <div className={studio["grid"]}>
        <section
          className={studio["panel"]}
          data-active={mobilePanel === "products"}
          aria-label={t("Poster products")}
          aria-busy={isLoading}
        >
          <h2>Select a product</h2>
          {isLoading && (
            <div role="status" aria-label={t("Loading products")} className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-muted" />
              ))}
            </div>
          )}
          <details className="mb-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">Recent arrivals</summary>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm">New stock of last</span>
              {[3, 7, 15, 30].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={days === d ? "default" : "secondary"}
                  onClick={() => setDays(d)}
                >
                  {d} days
                </Button>
              ))}
            </div>
            <p className="mb-2 text-sm text-muted-foreground">{fresh.length} new articles found</p>
            <div className={studio["products"]}>
              {fresh.map((p) => (
                <PCard
                  key={p.id}
                  p={p}
                  selected={active?.id === p.id}
                  busy={preparing}
                  onSelect={() => setSelected(p.id)}
                  onPoster={() => poster(p)}
                  onShare={() => sharePoster(p)}
                />
              ))}
            </div>
          </details>
          <h3 className="mb-2 font-semibold">Poster for any stock</h3>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search article"
            className="mb-2 h-9 w-full sm:max-w-64"
          />
          <div className={studio["products"]}>
            {all.map((p) => (
              <PCard
                key={p.id}
                p={p}
                selected={active?.id === p.id}
                busy={preparing}
                onSelect={() => setSelected(p.id)}
                onPoster={() => poster(p)}
                onShare={() => sharePoster(p)}
              />
            ))}
          </div>
        </section>
        <section
          className={`${studio["panel"]} ${studio["preview"]}`}
          data-active={mobilePanel === "preview"}
          ref={previewRef}
          aria-label={t("Poster preview")}
        >
          <h2>Poster preview</h2>
          {rendering && (
            <p role="status" className="my-4 text-sm text-muted-foreground">
              Preparing poster…
            </p>
          )}
          {posterError && (
            <div role="alert" className="my-4 text-sm">
              <p>Could not render photo. Try uploading this product photo again.</p>
              <Button variant="outline" size="sm" onClick={() => setRetry((v) => v + 1)}>
                Retry
              </Button>
            </div>
          )}
          {!active && (
            <p className="my-4 text-sm text-muted-foreground">
              Select an in-stock product to preview a poster.
            </p>
          )}
          {posterUrl && visible.photo && (
            <p className="mb-3 text-xs text-muted-foreground">
              {!photo
                ? t("Add photo in Products")
                : !photo.transparent
                  ? t(
                      "This photo has a background. A light panel keeps it readable; use a transparent PNG or WebP for the cutout look.",
                    )
                  : Math.max(photo.width, photo.height) < 800
                    ? t("This photo is small. Use a sharper image to avoid a blurry poster.")
                    : t("Transparent product photo detected.")}
            </p>
          )}
          <div className={studio["canvas"]} aria-busy={rendering}>
            {rendering && !posterUrl && <div className={studio["skeleton"]} aria-hidden="true" />}
            {posterUrl && (
              <div className="mb-5">
                <img src={posterUrl} alt="Selected product poster" key={posterUrl} />
                {!rendering && (
                  <div className={studio["actions"]}>
                    <Button variant="outline" asChild>
                      <a href={posterUrl} download={posterName}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      disabled={preparing}
                      onClick={() => active && sharePoster(active)}
                    >
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        printHtml(
                          "Poster",
                          `<img src="${posterUrl}" alt="Poster" style="width:100%;max-width:190mm;height:auto;display:block;margin:auto">`,
                          "@page{size:A4;margin:5mm}",
                        )
                      }
                    >
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          <details className={studio["message"]}>
            <summary className="cursor-pointer font-semibold">Community message</summary>
            <p className="mb-2 text-xs text-muted-foreground">
              These switches change only the poster. The community message can be edited separately.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="h-72 w-full rounded-lg border bg-muted/50 p-3 text-sm"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(message);
                  toast.success("Message copied");
                }}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button asChild>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => navigator.share?.({ title: tag, text: message }).catch(() => {})}
              >
                <Share2 className="h-4 w-4" /> Share to another app
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              WhatsApp will open. Choose your community or group, then send.
            </p>
          </details>
        </section>
        <section
          className={studio["panel"]}
          data-active={mobilePanel === "design"}
          aria-label={t("Poster design")}
        >
          <h2>Poster studio</h2>
          <details className="mb-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Campaign presets</summary>
            <p className="my-2 text-xs text-muted-foreground">
              Saved on this browser only. Presets remember theme colours, headlines, offers and
              visible details, not product data. Saving the same name updates that preset.
            </p>
            <label className="block text-sm">
              <span>Choose campaign</span>
              <select
                aria-label={t("Choose campaign")}
                disabled={preparing}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="mt-1 h-9 w-full rounded border bg-background px-2"
              >
                {[...CAMPAIGN_STARTERS, ...campaigns].map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="my-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={preparing} onClick={applyCampaign}>
                Apply preset
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={preparing || !campaignId.startsWith("local-")}
                onClick={() => {
                  if (storeCampaigns(campaigns.filter((item) => item.id !== campaignId))) {
                    setCampaignId("new");
                    setCampaignName("");
                  }
                }}
              >
                Delete preset
              </Button>
            </div>
            <label className="block text-sm">
              <span>Preset name</span>
              <Input
                aria-label={t("Preset name")}
                disabled={preparing}
                maxLength={40}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </label>
            <Button
              className="mt-2"
              size="sm"
              disabled={preparing || !campaignName.trim()}
              onClick={saveCampaign}
            >
              Save preset
            </Button>
          </details>
          <PosterThemePreviews
            product={active}
            shop={shop}
            phone={phone}
            tag={tag}
            offer={offer}
            visible={visible}
            typography={typography}
            theme={theme}
            busy={preparing}
            onSelect={setTheme}
          />
          <label className="mb-3 block text-sm">
            <span>Campaign label</span>
            <Input
              aria-label={t("Poster headline")}
              disabled={preparing || !visible.tag}
              value={tag}
              maxLength={60}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
          <details className="mb-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Edit design headline</summary>
            <div className="mt-3 space-y-3">
              {(["line1", "line2"] as const).map((key, i) => (
                <label key={key} className="block text-sm">
                  <span>{t(i === 0 ? "Headline line 1" : "Headline line 2")}</span>
                  <Input
                    aria-label={t(i === 0 ? "Headline line 1" : "Headline line 2")}
                    maxLength={80}
                    disabled={preparing || !visible.headline}
                    value={typography[key] ?? POSTER_HEADLINES[theme][i]}
                    onChange={(e) => setTypography((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="block text-sm">
                <span>
                  {t("Headline size (%)")} · {typography.size}
                </span>
                <input
                  aria-label={t("Headline size (%)")}
                  type="range"
                  min="60"
                  max="100"
                  step="5"
                  className="mt-2 w-full"
                  disabled={preparing || !visible.headline}
                  value={typography.size}
                  onChange={(e) => setTypography((v) => ({ ...v, size: Number(e.target.value) }))}
                />
              </label>
              <label className="block text-sm">
                <span>Headline alignment</span>
                <select
                  aria-label={t("Headline alignment")}
                  disabled={preparing || !visible.headline}
                  value={typography.align}
                  onChange={(e) =>
                    setTypography((v) => ({
                      ...v,
                      align: e.target.value as PosterTypography["align"],
                    }))
                  }
                  className="mt-1 h-9 w-full rounded border bg-background px-2"
                >
                  <option value="theme">{t("Theme default")}</option>
                  <option value="left">{t("Left")}</option>
                  <option value="center">{t("Centre")}</option>
                  <option value="right">{t("Right")}</option>
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Long headlines auto-fit. Clear either line to hide it. Maximum size preserves the
                layout.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={preparing}
                onClick={() => setTypography({ ...DEFAULT_POSTER_TYPOGRAPHY })}
              >
                Reset headline
              </Button>
            </div>
          </details>
          <label className="mb-1 block text-sm">
            <span>Offer text (optional)</span>
            <Input
              aria-label={t("Offer text (optional)")}
              value={offer}
              disabled={preparing || !visible.offer}
              maxLength={60}
              onChange={(e) => setOffer(e.target.value)}
              placeholder={t("e.g. Up to 30% off / Flat ₹200 off")}
              className="mt-1"
            />
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Leave blank for no offer. Poster text does not change billing prices or discounts.
          </p>
          <details className="mb-3 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Show or hide poster details
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {POSTER_FIELDS.map((field) => (
                <label key={field.id} className="flex min-w-0 items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={visible[field.id]}
                    disabled={preparing}
                    onChange={(e) => setVisible((v) => ({ ...v, [field.id]: e.target.checked }))}
                  />
                  <span>{t(field.label)}</span>
                </label>
              ))}
            </div>
          </details>
          <details className="mb-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Product photo guide</summary>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs text-muted-foreground">
              <li>
                Best result: use a transparent PNG or WebP cutout. Renaming a JPG to PNG does not
                remove its background.
              </li>
              <li>
                Keep the entire shoe visible, use a clear side or three-quarter view, and leave a
                little space around it. Avoid collages, text and watermarks.
              </li>
              <li>
                Around 1000 px on the longest side is ideal. Product uploads must be under 5 MB and
                are already compressed automatically.
              </li>
              <li>
                Normal photos also work inside a light panel. This poster tool does not
                automatically remove backgrounds or upload photos to another service.
              </li>
              <li>
                Collection Grid uses one product photo and two detail crops. No 3D model or extra
                photos are needed.
              </li>
              <li>
                Change the product photo in Products. That shared photo also changes in POS and the
                catalog. Poster downloads create no extra database copy.
              </li>
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}

function PCard({
  p,
  selected,
  busy,
  onSelect,
  onPoster,
  onShare,
}: {
  p: Product;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onPoster: () => void;
  onShare: () => void;
}) {
  return (
    <div className={studio["product"]} data-selected={selected}>
      <div className={studio["productPhoto"]}>
        {p.image_src ? <img src={p.image_src} alt="" loading="lazy" decoding="async" /> : null}
      </div>
      <button
        type="button"
        className={studio["selectProduct"]}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <small data-no-translate>{p.brand}</small>
        <strong data-no-translate>{p.article}</strong>
        <span className={studio["productPrice"]}>{inr(p.selling_price)}</span>
        <span className="block text-xs text-muted-foreground">Sizes {sizesOf(p).join(", ")}</span>
      </button>
      <div className={studio["productActions"]}>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onPoster();
          }}
        >
          <Download className="h-3.5 w-3.5" /> Poster
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
        >
          <MessageCircle className="h-3.5 w-3.5" /> Status
        </Button>
      </div>
    </div>
  );
}
