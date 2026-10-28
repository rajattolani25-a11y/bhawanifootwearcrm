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
  POSTER_FIELDS,
  POSTER_THEMES,
  drawPoster,
  posterBlob,
  posterSizes,
  type PosterPhoto,
  type PosterTheme,
} from "@/lib/poster";

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
  const { data = [] } = useStock();
  const { t } = useLang();
  const previewRef = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState("NEW ARRIVAL");
  const [theme, setTheme] = useState<PosterTheme>("luxury");
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
    setPosterUrl("");
    setPhoto(null);
    setPosterError(false);
    if (!active) {
      setRendering(false);
      return;
    }
    setRendering(true);
    const timer = setTimeout(() => {
      drawPoster(active, shop, phone, tag, theme, offer, visible)
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
  }, [active, shop, phone, tag, theme, offer, visible, retry]);

  useEffect(() => {
    if (active) setMessage(arrivalMessage(shop, active, sizesOf(active), phone));
  }, [active, shop, phone]);

  function poster(p: Product) {
    setSelected(p.id);
    setRetry((v) => v + 1);
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function sharePoster(p: Product) {
    setSelected(p.id);
    setPreparing(true);
    try {
      const { canvas } = await drawPoster(p, shop, phone, tag, theme, offer, visible);
      const file = new File([await posterBlob(canvas)], `${p.article}-${theme}-poster.png`, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        // Share only the artwork: hidden price/size/contact fields must not leak into a caption.
        await navigator.share({ files: [file] });
      } else {
        previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <div>
      <PageHeader
        title="WhatsApp Community & Posters"
        subtitle="New stock message for your community group + 9:16 status posters. Free, no API."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 rounded-xl border bg-card p-4">
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
          <div className="grid gap-2 sm:grid-cols-2">
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
          <h3 className="mb-2 mt-5 font-semibold">Poster for any stock</h3>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search article"
            className="mb-2 h-9 w-full sm:max-w-64"
          />
          <div className="grid gap-2 sm:grid-cols-2">
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
        </div>
        <div ref={previewRef} className="min-w-0 h-fit scroll-mt-4 rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Poster studio</h2>
          <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label={t("Poster style")}>
            {POSTER_THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={preparing}
                aria-pressed={theme === item.id}
                onClick={() => setTheme(item.id)}
                className={`min-w-0 rounded-lg border p-2 text-left text-xs transition-colors ${theme === item.id ? "border-primary ring-1 ring-primary" : "border-border"}`}
              >
                <span
                  aria-hidden="true"
                  className="mb-2 block h-8 rounded"
                  style={{
                    background: `linear-gradient(135deg, ${item.color} 65%, ${item.accent} 65%)`,
                  }}
                />
                <span data-no-translate>{item.label}</span>
              </button>
            ))}
          </div>
          <label className="mb-3 block text-sm">
            <span>Poster headline</span>
            <select
              aria-label={t("Poster headline")}
              disabled={preparing || !visible.tag}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm"
            >
              <option>NEW ARRIVAL</option>
              <option>BACK IN STOCK</option>
              <option>IN STORE NOW</option>
            </select>
          </label>
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
          {posterUrl && (
            <div className="mb-5">
              <p className="mb-2 font-semibold">Poster preview</p>
              <img
                src={posterUrl}
                alt="Selected product poster"
                className="mx-auto max-h-96 w-auto max-w-full border object-contain"
              />
              <div className="mt-2 flex flex-wrap gap-2">
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
            </div>
          )}
          <p className="mb-2 font-semibold">Community message</p>
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
        </div>
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
    <div
      className={`rounded-lg border p-2.5 ${selected ? "border-primary bg-accent/40" : ""}`}
      onClick={onSelect}
    >
      <div className="mb-2 h-28 overflow-hidden rounded-md bg-muted">
        {p.image_src ? (
          <img
            src={p.image_src}
            alt={`${p.brand} ${p.article}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Add photo in Products
          </div>
        )}
      </div>
      <p className="text-[11px] font-bold uppercase text-primary">{p.brand}</p>
      <p className="break-words font-semibold leading-tight">
        {p.article} <span className="font-display">{inr(p.selling_price)}</span>
      </p>
      <p className="text-xs text-muted-foreground">Sizes {sizesOf(p).join(", ")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
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
