import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CatalogPaymentProof } from "@/components/catalog-payment-proof";
import { OrderSuccessMark } from "@/components/motion/order-success-mark";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { cartProofMessage } from "@/lib/catalog-cart-messages";
import type { CartOrderResult } from "@/lib/catalog-cart-checkout";
import type { CatalogProduct } from "@/lib/catalog.functions";
import styles from "./commerce.module.css";
export function CartConfirmation({
  result,
  note,
  products,
  name,
  address,
  motionEnabled,
  onClose,
  onTrack,
}: {
  result: CartOrderResult;
  note?: string;
  products: CatalogProduct[];
  name: string;
  address: string;
  motionEnabled: boolean;
  onClose: () => void;
  onTrack: () => void;
}) {
  const { lang, t } = useLang();
  const canPay = result.orders.every(
    (item) =>
      item.status === "pending" &&
      !item.receipt_recorded &&
      Date.parse(item.expires_at) > Date.parse(result.server_now),
  );
  const verified = result.orders.every((item) => item.receipt_recorded);
  const phone = (result.phone ?? "").replace(/\D/g, "");
  const proof = phone
    ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(cartProofMessage(lang, result, name, address))}`
    : null;
  const upi = `upi://pay?pa=${encodeURIComponent(result.upi_id)}&pn=${encodeURIComponent(result.shop)}&am=${result.advance}&cu=INR&tn=${encodeURIComponent(result.cart_no)}`;
  return (
    <>
      <div className={styles["body"]}>
        <div className="text-center">
          <OrderSuccessMark motionEnabled={motionEnabled} />
        </div>
        <DialogTitle className={styles["heading"]}>
          {t(canPay ? "Your pairs are reserved." : "Your cart order")}
        </DialogTitle>
        <p className="text-xs font-semibold" data-no-translate>
          {result.cart_no}
        </p>
        <p role="status" className="rounded-lg border p-3 text-sm font-semibold">
          {t(
            verified
              ? "Payment verified"
              : canPay
                ? "PAYMENT PENDING"
                : "Check the status of each pair before paying.",
          )}
        </p>
        <div className="grid gap-3">
          {result.orders.map((item) => {
            const image = products.find((p) => p.id === item.product_id)?.image;
            return (
              <div key={item.booking_no} className={styles["product"]}>
                {image && (
                  <img src={image} alt="" loading="lazy" decoding="async" width="72" height="60" />
                )}
                <div>
                  <strong data-no-translate>{item.product}</strong>
                  <p>
                    <span data-no-translate>{item.color}</span> · {t("Size")} {item.size} ·{" "}
                    {inr(item.price)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
          <dt>{t("Product total")}</dt>
          <dd className="text-right">{inr(result.price)}</dd>
          <dt>{t("Delivery charge")}</dt>
          <dd className="text-right">{inr(result.delivery_charge)}</dd>
          <dt className="font-semibold">{t("Amount to pay")}</dt>
          <dd className="text-right font-semibold">{inr(result.advance)}</dd>
          {result.orders[0]?.fulfillment === "pickup" && (
            <>
              <dt>{t("Balance at store:")}</dt>
              <dd className="text-right">{inr(result.price - result.advance)}</dd>
            </>
          )}
        </dl>
        {canPay && (
          <p className="text-xs text-muted-foreground">
            {t("Pay before")}{" "}
            <time>
              {new Date(result.orders[0]!.expires_at).toLocaleTimeString(
                lang === "hindi" ? "hi-IN" : "en-IN",
                { hour: "2-digit", minute: "2-digit" },
              )}
            </time>
            . {t("Send your payment screenshot on WhatsApp for store verification.")}
          </p>
        )}
        {note && (
          <p role="alert" className="text-xs">
            {t(note)}
          </p>
        )}
        <Button variant="ghost" onClick={onTrack}>
          {t("Track order")}
        </Button>
      </div>
      <footer className={styles["footer"]}>
        {canPay && result.upi_id && (
          <Button asChild className="h-12">
            <a href={upi}>
              {t("Pay with UPI")} · {inr(result.advance)}
            </a>
          </Button>
        )}
        {proof && <CatalogPaymentProof language={lang} whatsappUrl={proof} compact />}
        <Button variant="ghost" onClick={onClose}>
          {t("Continue shopping")}
        </Button>
      </footer>
    </>
  );
}
