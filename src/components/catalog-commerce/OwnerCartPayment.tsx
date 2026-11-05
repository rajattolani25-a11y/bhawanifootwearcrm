import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { ownerBargainRpc } from "@/lib/catalog-bargain-owner";
import type { CartOrderResult } from "@/lib/catalog-cart-checkout";
import { cartPaymentUpdate } from "@/lib/catalog-cart-messages";
import { toast } from "sonner";
export function OwnerCartPayment({
  reference,
  mobile,
  refresh,
  onUpdate,
}: {
  reference: string;
  mobile: string;
  refresh: () => void;
  onUpdate: (url: string, reference: string) => void;
}) {
  const { lang, t } = useLang();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["catalog-cart-payment", reference],
    retry: false,
    queryFn: async () => {
      const { data, error } = await ownerBargainRpc("catalog_cart_payment_summary", {
        _cart_no: reference,
      });
      if (error) throw Error(error.message);
      return data as CartOrderResult;
    },
  });
  const cart = query.data;
  const allVerified = !!cart && cart.orders.every((item) => item.receipt_recorded);
  async function confirm() {
    if (
      !cart ||
      busy ||
      !window.confirm(`${inr(cart.advance)} — ${t("UPI payment received?")} (${reference})`)
    )
      return;
    setBusy(true);
    try {
      const { error } = await ownerBargainRpc("confirm_catalog_cart_payment", {
        _cart_no: reference,
        _expected_advance: cart.advance,
        _settled: true,
      });
      if (error) throw Error(error.message);
      toast.success(t("Payment verified"));
      refresh();
      await query.refetch();
      const number = mobile.replace(/\D/g, "");
      const link = `${window.location.origin}/catalog?track=${reference}`;
      onUpdate(
        `https://wa.me/${number.length === 10 ? "91" + number : number}?text=${encodeURIComponent(cartPaymentUpdate(lang, reference, cart.shop, link))}`,
        reference,
      );
    } catch (e) {
      toast.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
      <p className="font-semibold">
        {t("Cart order")} <span data-no-translate>{reference}</span>
      </p>
      {query.isPending && <p>{t("Loading…")}</p>}
      {query.error && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("Retry")}
        </Button>
      )}
      {cart && (
        <>
          <p>
            {cart.orders.length} {t("pairs")} · {t("Combined advance")}:{" "}
            <strong>{inr(cart.advance)}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("One UPI payment covers these pairs. Verify the full receipt before confirming.")}
          </p>
          <Button
            disabled={
              busy ||
              allVerified ||
              cart.orders.some(
                (item) =>
                  !["pending", "expired", "confirmed", "packed", "shipped"].includes(item.status),
              )
            }
            onClick={() => void confirm()}
          >
            {t(allVerified ? "Payment verified" : busy ? "Please wait…" : "Confirm cart payment")}
          </Button>
        </>
      )}
    </section>
  );
}
