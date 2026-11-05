import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";
import type { CatalogOffer } from "@/lib/catalog.functions";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
}: {
  offer: NonNullable<CatalogOffer>;
  motionEnabled: boolean;
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
  const code = offer.code?.trim() || "";
  const value = Number(offer.value),
    minimum = Number(offer.min_bill),
    cap = Number(offer.max_discount);
  const hasCap = offer.max_discount !== null && Number.isFinite(cap) && cap >= 0;
  const hasValue = !!code && Number.isFinite(value) && value > 0 && (!hasCap || cap > 0);
  const flatValue = hasCap ? Math.min(value, cap) : value;
  const amount = hasValue
    ? `${offer.kind === "percent" ? `${value}%` : inr(flatValue)} ${copy.off}`
    : offer.subtitle?.trim() || offer.title?.trim() || copy.message;
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
        data-motion={motionEnabled && seen}
        data-paused={hidden}
        data-no-translate
      >
        <svg
          className={styles["backdrop"]}
          viewBox="0 0 390 76"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M12 0H378Q390 0 390 12V31C380 31 380 45 390 45V64Q390 76 378 76H12Q0 76 0 64V45C10 45 10 31 0 31V12Q0 0 12 0Z" />
        </svg>
        <button
          type="button"
          className={styles["summary"]}
          aria-label={copy.details}
          onClick={() => setOpen(true)}
        >
          <span className={styles["eyebrow"]}>
            {hasValue ? offer.title || copy.label : copy.label}
          </span>
          <span className={styles["headline"]}>
            <strong>{amount}</strong>
            <ChevronRight aria-hidden="true" />
          </span>
          {terms && <span className={styles["terms"]}>{terms}</span>}
        </button>
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
