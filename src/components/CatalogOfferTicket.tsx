import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import type { CatalogProduct, CatalogOffer } from "@/lib/catalog.functions";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { promotionCalendar, type PromoCampaign } from "@/lib/catalog-promotion";
import { PromotionCountdown } from "./PromotionCountdown";
import { PromotionMotion } from "./PromotionMotion";
import styles from "./catalog-offer-ticket.module.css";

const COPY = {
  english: {
    label: "Store offer",
    details: "Offer details",
    copy: "Copy",
    copied: "Copied",
    code: "Coupon code",
    off: "OFF",
    orders: "Orders",
    max: "Max",
    cap: "Maximum discount",
    minimum: "Minimum order",
    use: "Enter this code at checkout. Eligibility and the discount are confirmed before you place the order.",
    failed: "Could not copy. Select the code below and copy it manually.",
    message: "View offer details",
  },
  hindi: {
    label: "दुकान का ऑफ़र",
    details: "ऑफ़र की जानकारी",
    copy: "कॉपी",
    copied: "कॉपी हो गया",
    code: "कूपन कोड",
    off: "छूट",
    orders: "ऑर्डर",
    max: "अधिकतम",
    cap: "अधिकतम छूट",
    minimum: "न्यूनतम ऑर्डर",
    use: "चेकआउट पर यह कोड भरें। ऑर्डर देने से पहले पात्रता और छूट की पुष्टि होगी।",
    failed: "कॉपी नहीं हुआ। नीचे कोड चुनकर खुद कॉपी करें।",
    message: "ऑफ़र की जानकारी देखें",
  },
  hinglish: {
    label: "Store offer",
    details: "Offer ki details",
    copy: "Copy",
    copied: "Copied",
    code: "Coupon code",
    off: "OFF",
    orders: "Order",
    max: "Max",
    cap: "Maximum discount",
    minimum: "Minimum order",
    use: "Checkout par yeh code bharein. Order place karne se pehle eligibility aur discount confirm hoga.",
    failed: "Copy nahi hua. Neeche code select karke manually copy karein.",
    message: "Offer ki details dekhein",
  },
};
export function CatalogOfferTicket({
  offer,
  motionEnabled,
  campaign,
  phase = "live",
  now = Date.now(),
  products = [],
  onProduct,
  onShop,
  clock,
}: {
  offer: NonNullable<CatalogOffer>;
  motionEnabled: boolean;
  campaign?: PromoCampaign;
  phase?: "advance" | "live";
  now?: number;
  clock?: { server: number; monotonic: number };
  products?: CatalogProduct[];
  onProduct?: (p: CatalogProduct) => void;
  onShop?: () => void;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const root = useRef<HTMLElement>(null),
    field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(false);
  const [seen, setSeen] = useState(false),
    [hidden, setHidden] = useState(false);
  const labels = {
    english: {
      upcoming: "Upcoming",
      live: "Live now",
      starts: "Starts in",
      ends: "Ends in",
      calendar: "Add calendar reminder",
      shop: "Shop the offer",
      men: "Men’s edit",
      women: "Women’s edit",
      all: "Store edit",
      calendarNote: "Download and import into your calendar.",
    },
    hindi: {
      upcoming: "जल्द आ रहा है",
      live: "अभी चालू है",
      starts: "शुरू होने में",
      ends: "समाप्त होने में",
      calendar: "कैलेंडर में जोड़ें",
      shop: "ऑफ़र देखें",
      men: "पुरुषों का कलेक्शन",
      women: "महिलाओं का कलेक्शन",
      all: "दुकान का कलेक्शन",
      calendarNote: "फ़ाइल डाउनलोड करके अपने कैलेंडर में जोड़ें।",
    },
    hinglish: {
      upcoming: "Jald aa raha hai",
      live: "Abhi live",
      starts: "Shuru hone mein",
      ends: "Khatam hone mein",
      calendar: "Calendar reminder jodein",
      shop: "Offer dekhein",
      men: "Men’s edit",
      women: "Women’s edit",
      all: "Store edit",
      calendarNote: "Download karke apne calendar mein import karein.",
    },
  }[lang];
  const image = campaign?.[phase].image;
  const [failedImage, setFailedImage] = useState("");
  const custom = image && failedImage !== image.url;
  const schedule = campaign?.schedule;
  const target = schedule ? (phase === "advance" ? schedule.startsAt : schedule.endsAt) : null;
  const audience = campaign?.audience ?? "all";
  const artworkProducts = products.filter((p) => campaign?.productIds.includes(p.id)).slice(0, 2);
  const code = phase === "live" ? offer.code?.trim() || "" : "";
  const priceCode = offer.code?.trim() || "";
  const value = Number(offer.value),
    minimum = Number(offer.min_bill),
    cap = Number(offer.max_discount);
  const hasCap = offer.max_discount !== null && Number.isFinite(cap) && cap >= 0;
  const hasValue = !!priceCode && Number.isFinite(value) && value > 0 && (!hasCap || cap > 0);
  const flatValue = hasCap ? Math.min(value, cap) : value;
  const amount = hasValue
    ? `${offer.kind === "percent" ? `${value}%` : inr(flatValue)} ${copy.off}`
    : offer.subtitle?.trim() || copy.message;
  const terms = [
    minimum > 0 ? `${copy.orders} ${inr(minimum)}+` : "",
    hasCap ? `${copy.max} ${inr(cap)} ${copy.off}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  useEffect(() => {
    setCopied(false);
    setManual(false);
    setOpen(false);
  }, [code, offer.title, offer.value, offer.min_bill, offer.max_discount]);
  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    if (!motionEnabled || hidden || seen || !root.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [motionEnabled, hidden, seen]);
  async function copyCode() {
    if (!code || busy) return;
    setBusy(true);
    setCopied(false);
    setManual(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setManual(true);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section
        ref={root}
        className={styles["ticket"]}
        aria-label={copy.label}
        data-catalog-offer-ticket
        data-custom={!!custom}
        data-products={artworkProducts.length}
        data-layout={campaign?.[phase].layout ?? "split"}
        data-phase={phase}
        data-motion={motionEnabled && seen}
        data-paused={hidden}
        data-no-translate
      >
        {!custom && <PromotionMotion enabled={motionEnabled} />}
        <div className={styles["topline"]}>
          <span className={styles["badge"]}>
            {phase === "advance"
              ? labels.upcoming
              : hasValue || campaign
                ? labels.live
                : copy.label}
          </span>
          {campaign && <span>{labels[audience]}</span>}
        </div>
        <div className={styles["offerbody"]}>
          <button
            type="button"
            className={styles["summary"]}
            aria-label={copy.details}
            onClick={() => setOpen(true)}
          >
            <span className={styles["eyebrow"]} title={offer.title}>
              {(() => {
                const words = (offer.title || copy.label).trim().split(/\s+/);
                const lines = words.reduce<string[][]>((out, word) => {
                  const last = out[out.length - 1];
                  if (last && last.join(" ").length + word.length < 13) last.push(word);
                  else out.push([word]);
                  return out;
                }, []);
                if (lines.length === 1 && words.length > 1) {
                  const mid = Math.ceil(words.length / 2);
                  return [words.slice(0, mid), words.slice(mid)].map((line, i) => (
                    <span key={i}>{line.join(" ")}</span>
                  ));
                }
                return lines.map((line, i) => <span key={i}>{line.join(" ")}</span>);
              })()}
            </span>
            <span className={styles["headline"]}>
              <strong>{amount}</strong>
              <ChevronRight aria-hidden="true" />
            </span>
            {terms && <span className={styles["terms"]}>{terms}</span>}
          </button>
        </div>
        {custom ? (
          <img
            className={styles["custom"]}
            src={image.url}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
            alt={offer.title}
            onError={() => setFailedImage(image.url)}
          />
        ) : (
          <>
            {artworkProducts.length > 0 && (
              <div className={styles["products"]} data-count={artworkProducts.length}>
                {artworkProducts.map((p) => (
                  <button
                    key={p.id}
                    aria-label={`${p.brand} ${p.article} — ${inr(p.price)}`}
                    type="button"
                    onClick={() => onProduct?.(p)}
                    disabled={!onProduct}
                  >
                    {p.image && (
                      <img src={p.image} alt={p.article} loading="lazy" decoding="async" />
                    )}
                    <span>
                      {p.brand} {p.article}
                    </span>
                    <strong>{inr(p.price)}</strong>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {offer.subtitle && hasValue && <p className={styles["message"]}>{offer.subtitle}</p>}
        {schedule && (
          <div className={styles["when"]}>
            <span>
              {new Date(schedule.startsAt).toLocaleString(lang === "hindi" ? "hi-IN" : "en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              IST
            </span>
            <span>
              {phase === "advance" ? labels.starts : labels.ends}{" "}
              {target && (
                <PromotionCountdown target={target} now={now} {...(clock ? { clock } : {})} />
              )}
            </span>
          </div>
        )}
        {code && (
          <div className={styles["coupon"]}>
            <button
              type="button"
              onClick={() => void copyCode()}
              disabled={busy}
              aria-label={`${copy.copy} ${copy.code}`}
              className={styles["copy"]}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? copy.copied : copy.copy}
            </button>
            <span className={styles["code"]}>{code}</span>
            <span role="status" className="sr-only">
              {copied ? copy.copied : ""}
            </span>
          </div>
        )}
        {phase === "advance" && schedule ? (
          <>
            <button
              className={styles["action"]}
              type="button"
              onClick={() => {
                const blob = new Blob(
                  [
                    promotionCalendar(
                      offer.title,
                      schedule.startsAt,
                      schedule.endsAt,
                      window.location.origin + "/catalog",
                    ),
                  ],
                  { type: "text/calendar;charset=utf-8" },
                );
                const url = URL.createObjectURL(blob),
                  a = document.createElement("a");
                a.href = url;
                a.download = "bhawani-sale.ics";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {labels.calendar}
            </button>
            <p className={styles["calendarNote"]}>{labels.calendarNote}</p>
          </>
        ) : (
          phase === "live" &&
          onShop && (
            <button className={styles["action"]} type="button" onClick={onShop}>
              {labels.shop} <ChevronRight aria-hidden="true" />
            </button>
          )
        )}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={styles["dialog"]}
          data-no-translate
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (manual) {
              event.preventDefault();
              field.current?.focus();
              field.current?.select();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{copy.details}</DialogTitle>
          </DialogHeader>
          <h3 className="break-words font-semibold">{offer.title || copy.label}</h3>
          {phase === "advance" && <p>{labels.upcoming}</p>}
          {hasValue && <p className="text-2xl font-bold">{amount}</p>}
          {offer.subtitle && <p className="break-words text-sm">{offer.subtitle}</p>}
          {minimum > 0 && (
            <p className="text-sm">
              {copy.minimum}: {inr(minimum)}
            </p>
          )}
          {hasCap && (
            <p className="text-sm">
              {copy.cap}: {inr(cap)}
            </p>
          )}
          {code && (
            <>
              <label className="space-y-1 text-sm">
                {copy.code}
                <Input
                  ref={field}
                  aria-label={copy.code}
                  value={code}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
              </label>
              {manual && (
                <p role="status" className="text-sm text-muted-foreground">
                  {copy.failed}
                </p>
              )}
              <Button onClick={() => void copyCode()} disabled={busy}>
                {copied ? copy.copied : copy.copy}
              </Button>
              <p className="text-xs text-muted-foreground">{copy.use}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
