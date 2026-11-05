import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import {
  BARGAIN_HEADINGS,
  receivedDeal,
  validOffer,
  type CatalogDeal,
} from "@/lib/catalog-bargain";
import { bargainClient } from "@/lib/catalog-cart";
import { getBargain, makeBargain } from "@/lib/catalog-bargain.functions";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { DealTimer } from "./DealTimer";
import { useDealSeconds } from "@/lib/use-deal-seconds";
import styles from "./commerce.module.css";
export function BargainSheet({
  product,
  variantId,
  onClose,
  onAccept,
  onListedPrice,
  onQuote,
  motionEnabled = true,
}: {
  product: CatalogProduct;
  variantId: string;
  onClose: () => void;
  onListedPrice: () => void;
  onAccept: (deal: CatalogDeal) => void;
  onQuote: (deal: CatalogDeal) => void;
  motionEnabled?: boolean;
}) {
  const { t } = useLang();
  const [offer, setOffer] = useState("");
  const [deal, setDeal] = useState<CatalogDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const sent = useRef(false);
  const quoteHandler = useRef(onQuote);
  quoteHandler.current = onQuote;
  const seconds = useDealSeconds(deal);
  const matches = !deal || deal.variant_id === variantId;
  const size = product.sizes.find((s) => s.id === variantId);
  useEffect(() => {
    let live = true;
    const started = Date.now();
    Promise.resolve()
      .then(() => getBargain({ data: { variantId, client: bargainClient() } }))
      .then(
        (result) => {
          if (live && result) {
            const fresh = receivedDeal(result, started);
            setDeal(fresh);
            quoteHandler.current(fresh);
            if (fresh.listed_price !== product.price)
              window.dispatchEvent(new Event("solestack-catalog-refresh"));
          }
        },
        () => {
          if (live) setError("Bargaining is unavailable. You can still order at the listed price.");
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [variantId, product.price]);
  async function bid() {
    const amount = validOffer(offer, product.price);
    if (!amount || sent.current) return;
    sent.current = true;
    setBusy(true);
    setError("");
    const started = Date.now();
    try {
      const result = await makeBargain({
        data: { variantId, client: bargainClient(), offer: amount },
      });
      const fresh = receivedDeal(result, started);
      setDeal(fresh);
      quoteHandler.current(fresh);
      if (fresh.listed_price !== product.price)
        window.dispatchEvent(new Event("solestack-catalog-refresh"));
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      sent.current = false;
    }
  }
  const heading =
    deal && !loading && seconds === 0
      ? "This offer has expired."
      : !size?.available
        ? "This selection is unavailable."
        : !matches
          ? "A different selection."
          : deal
            ? deal.duplicate
              ? "You’ve already made this offer."
              : BARGAIN_HEADINGS[deal.state][deal.heading % 3]!
            : "Let’s find your price.";
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className={styles["sheet"]}
        data-motion={motionEnabled}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <div className={styles["body"]}>
          <DialogTitle className={styles["heading"]}>{t(heading)}</DialogTitle>
          <div className={styles["product"]}>
            {product.image && <img src={product.image} alt="" />}
            <div>
              <strong data-no-translate>
                {product.brand} {product.article}
              </strong>
              <p>
                <span data-no-translate>{product.color}</span> · {t("Size")}{" "}
                <span data-no-translate>{size?.size}</span>
              </p>
            </div>
          </div>
          <p className="flex justify-between border-y py-2 text-sm">
            <span>{t("Listed price")}</span>
            <strong>{inr(deal?.listed_price ?? product.price)}</strong>
          </p>
          {loading && <p role="status">{t("Loading…")}</p>}
          {deal && (
            <>
              <div className={styles["counter"]}>
                <small>
                  {t(
                    deal.state === "accepted"
                      ? "YOUR AGREED PRICE"
                      : deal.attempts === 2
                        ? "FINAL COUNTER-OFFER"
                        : "OUR COUNTER-OFFER",
                  )}
                </small>
                <strong>{inr(deal.price)}</strong>
                <p>
                  {t("You save")} {inr(deal.listed_price - deal.price)}
                </p>
              </div>
              <p className="text-sm">
                {t("Your offer")}: <strong>{inr(deal.duplicate_offer ?? deal.offer)}</strong>
              </p>
              {deal.duplicate && (
                <p role="status" className="text-sm">
                  {t(
                    deal.attempts < 2
                      ? "Enter a different amount or accept the current counter."
                      : "Both chances have been used. Accept the current counter before it expires.",
                  )}
                </p>
              )}
            </>
          )}
          {!loading && (!deal || editing) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void bid();
              }}
              className="grid gap-3"
            >
              <label className="grid gap-2 text-sm font-medium">
                {t("Your offer")}
                <Input
                  autoFocus
                  inputMode="decimal"
                  aria-label={t("Your offer")}
                  value={offer}
                  maxLength={12}
                  onChange={(e) => setOffer(e.target.value)}
                  placeholder="₹"
                  className="h-14 text-2xl"
                  disabled={busy}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {t(
                  deal
                    ? "Last chance. Enter a different amount."
                    : "Two chances to find your price.",
                )}
              </p>
              <Button
                disabled={
                  busy || !validOffer(offer, product.price) || (!!deal && deal.attempts >= 2)
                }
                className="h-12"
              >
                {t(busy ? "Checking…" : "Send my offer")}
              </Button>
            </form>
          )}
          {!matches && (
            <p className="text-xs">
              {t(
                "Your previous quote belongs to another size. Changing size does not reset the two chances.",
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {t("Additional offers cannot be combined.")}
          </p>
        </div>
        {deal && (
          <footer className={styles["footer"]}>
            <DealTimer deal={deal} />
            <Button
              className="h-12"
              disabled={
                seconds === 0 ||
                busy ||
                !matches ||
                !size?.available ||
                deal.listed_price !== product.price
              }
              onClick={() => onAccept(deal)}
            >
              {t("Accept price & continue")} · {inr(deal.price)}
            </Button>
            {deal.attempts < 2 && deal.state !== "accepted" && seconds > 0 && !editing && (
              <Button
                variant="ghost"
                onClick={() => {
                  setOffer("");
                  setEditing(true);
                }}
              >
                {t("Revise my offer")}
              </Button>
            )}
            <button
              type="button"
              className="min-h-11 text-xs underline underline-offset-4"
              onClick={onListedPrice}
            >
              {t("Keep listed price")}
            </button>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
