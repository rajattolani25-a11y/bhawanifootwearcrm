import { CatalogTermsAgreement } from "@/components/CatalogTerms";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import {
  cartSelection,
  removeFromCart,
  readCart,
  writeCart,
  bargainClient,
  type CatalogCartItem,
} from "@/lib/catalog-cart";
import {
  cartAmounts,
  cartCouponShares,
  cartMoney,
  readCartCheckout,
  saveCartCheckout,
  clearCartCheckout,
  type CartCheckoutRequest,
  type CartOrderResult,
} from "@/lib/catalog-cart-checkout";
import { readCatalogOrder } from "@/lib/catalog-order-recovery";
import { createCartOrder, checkCartCoupon } from "@/lib/catalog-cart.functions";
import { type CatalogProduct, type CatalogShop, type Fulfillment } from "@/lib/catalog.functions";
import { dealSeconds } from "@/lib/catalog-bargain";
import { useDealSeconds } from "@/lib/use-deal-seconds";
import { DealTimer } from "./DealTimer";
import { CartConfirmation } from "./CartConfirmation";
import styles from "./commerce.module.css";
export function CatalogCart({
  items,
  products,
  shop,
  onClose,
  onTrack,
  motionEnabled = true,
}: {
  items: CatalogCartItem[];
  products: CatalogProduct[];
  shop: CatalogShop;
  onClose: () => void;
  onTrack: (ref: string) => void;
  motionEnabled?: boolean;
}) {
  const { t } = useLang();
  const [stage, setStage] = useState<"cart" | "method" | "form" | "done">("cart");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<Fulfillment>(
    shop.booking ? "pickup" : shop.local ? "local" : "outside",
  );
  const [name, setName] = useState(""),
    [mobile, setMobile] = useState(""),
    [address, setAddress] = useState(""),
    [area, setArea] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<CartOrderResult | null>(null),
    [pending, setPending] = useState<CartCheckoutRequest | null>(null),
    [blocked, setBlocked] = useState(false);
  const [code, setCode] = useState(""),
    [disc, setDisc] = useState<{ code: string; amount: number; context: string } | null>(null),
    [couponBusy, setCouponBusy] = useState(false);
  const couponRequest = useRef(0),
    sending = useRef(false);
  const selected = items.filter((item) => selection[item.variantId] !== false);
  const earliest =
    selected
      .flatMap((item) => (item.deal ? [item.deal] : []))
      .sort(
        (a, b) =>
          (a.local_expires_at ?? Date.parse(a.expires_at)) -
          (b.local_expires_at ?? Date.parse(b.expires_at)),
      )[0] ?? null;
  useDealSeconds(earliest);
  const rows = selected.map((item) => ({ item, ...cartSelection(item, products) }));
  const needsReview = rows.some(
    ({ item, product, available }) =>
      !product ||
      !Number.isFinite(product.price) ||
      product.price <= 0 ||
      product.price !== cartMoney(product.price) ||
      !available ||
      (item.deal &&
        (item.deal.invalidated ||
          item.deal.listed_price !== product.price ||
          product.bargain_enabled === false ||
          dealSeconds(item.deal, Date.now()) === 0)),
  );
  const eligible = rows.filter(
    (row) =>
      !row.item.deal &&
      row.available &&
      row.product &&
      Number.isFinite(row.product.price) &&
      row.product.price > 0 &&
      row.product.price === cartMoney(row.product.price),
  );
  const signature = rows
    .map(
      ({ item, product, available }) =>
        `${item.variantId}:${product?.price}:${item.deal?.id ?? ""}:${available}`,
    )
    .join("|");
  const couponContext = signature + ":" + mobile;
  const activeDisc = disc?.context === couponContext ? disc : null;
  const eligibleSubtotal = cartMoney(eligible.reduce((sum, row) => sum + row.product!.price, 0));
  const couponShares = cartCouponShares(
    eligible.map((row) => ({ variantId: row.item.variantId, price: row.product!.price })),
    activeDisc?.amount ?? 0,
  );
  const subtotal = cartMoney(
    rows.reduce((sum, { item, product }) => sum + (item.deal?.price ?? product?.price ?? 0), 0) -
      (activeDisc?.amount ?? 0),
  );
  const quote = cartAmounts(subtotal, method, shop);
  useEffect(() => {
    couponRequest.current++;
    setDisc(null);
    setCouponBusy(false);
  }, [signature, mobile]);
  useEffect(() => {
    try {
      const saved = readCartCheckout();
      setPending(saved);
    } catch (e) {
      setBlocked(true);
      setError((e as Error).message);
    }
  }, []);
  function remove(id: string) {
    try {
      removeFromCart(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function listed(id: string) {
    try {
      writeCart(
        readCart().map((item) =>
          item.variantId === id ? { productId: item.productId, variantId: item.variantId } : item,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function apply() {
    const seq = ++couponRequest.current;
    setCouponBusy(true);
    setError("");
    setDisc(null);
    try {
      const value = await checkCartCoupon({
        data: {
          variantIds: eligible.map((row) => row.item.variantId),
          code: code.trim(),
          mobile: mobile.replace(/[\s-]/g, ""),
        },
      });
      if (seq === couponRequest.current) {
        if (value.amount >= eligibleSubtotal)
          throw Error(t("This coupon must leave a price above zero."));
        setDisc({ ...value, context: couponContext });
      }
    } catch (e) {
      if (seq === couponRequest.current) setError((e as Error).message);
    } finally {
      if (seq === couponRequest.current) setCouponBusy(false);
    }
  }
  const canOrder = shop.booking || shop.local || shop.outside;
  const methodAvailable =
    method === "pickup" ? shop.booking : method === "local" ? shop.local : shop.outside;
  const valid =
    name.trim().length >= 2 &&
    /^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, "")) &&
    (method === "pickup" || address.trim().length >= 10) &&
    subtotal > 0;
  async function order(recover = false) {
    if (sending.current) return;
    if (!recover && !termsAccepted) { setError("Please agree to the Terms & Conditions before placing your order."); return; }
    setError("");
    sending.current = true;
    setBusy(true);
    try {
      if (readCatalogOrder())
        throw Error(t("Recover the saved order before placing another order."));
      const saved = readCartCheckout();
      if (saved && !recover)
        throw Error(t("Recover the saved cart order before placing another order."));
      if (!saved && (needsReview || !selected.length || !shop.cart_ready || !canOrder))
        throw Error(t("Review the selected pairs before ordering."));
      const payload: CartCheckoutRequest =
        recover && saved
          ? saved
          : {
              requestId: crypto.randomUUID(),
              ...(shop.cart_coupon_ready ? { coupon: activeDisc?.code ?? "" } : {}),
              name: name.trim(),
              mobile: mobile.replace(/[\s-]/g, ""),
              fulfillment: method,
              address: method === "pickup" ? "" : address.trim(),
              area: method === "pickup" ? "" : area.trim(),
              quote,
              items: rows.map(({ item, product }) => ({
                variantId: item.variantId,
                price: product!.price,
                net: cartMoney(
                  (item.deal?.price ?? product!.price) - (couponShares[item.variantId] ?? 0),
                ),
                coupon: "",
                ...(item.deal ? { bargain: { id: item.deal.id, client: bargainClient() } } : {}),
              })),
            };
      if (!saved) {
        saveCartCheckout(payload);
        setPending(payload);
      }
      const response = await createCartOrder({ data: payload });
      setResult(response);
      setName(payload.name);
      setAddress(payload.address);
      setStage("done");
      try {
        clearCartCheckout();
        setPending(null);
      } catch {
        /* Keep the exact request available; retry is idempotent. */
      }
      try {
        const ids = new Set(payload.items.map((item) => item.variantId));
        writeCart(readCart().filter((item) => !ids.has(item.variantId)));
      } catch {
        setError(t("Order saved. Remove these pairs from your cart manually."));
      }
      window.dispatchEvent(new Event("solestack-catalog-deal-used"));
      window.dispatchEvent(new Event("solestack-catalog-refresh"));
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("ORDER_REJECTED:")) {
        try {
          clearCartCheckout();
          setPending(null);
        } catch {
          setBlocked(true);
        }
        window.dispatchEvent(new Event("solestack-catalog-refresh"));
      }
      if (message.includes("ORDER_REJECTED:")) setStage("cart");
      const failedDeal = /CART_BARGAIN_CHANGED:([0-9a-f-]{36})/i.exec(message)?.[1];
      if (failedDeal) {
        try {
          writeCart(
            readCart().map((item) =>
              item.variantId === failedDeal && item.deal
                ? { ...item, deal: { ...item.deal, invalidated: true } }
                : item,
            ),
          );
        } catch {
          /* Existing server checks continue to reject the invalid quote. */
        }
        setError(t("A bargain price expired or changed. Review the marked pair before ordering."));
      } else setError(message.replace(/^.*?(?:ORDER_REJECTED|ORDER_UNCONFIRMED):\s*/, ""));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className={styles["sheet"]}
        data-motion={motionEnabled}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        {stage === "done" && result ? (
          <CartConfirmation
            result={result}
            note={error}
            products={products}
            name={name}
            address={address}
            motionEnabled={motionEnabled}
            onClose={onClose}
            onTrack={() => onTrack(result.cart_no)}
          />
        ) : (
          <>
            <div className={styles["body"]}>
              <DialogTitle className={styles["heading"]}>
                {t(stage === "cart" ? "Your cart" : "Checkout")}
              </DialogTitle>
              {pending ? (
                <section className="grid gap-3">
                  <p>
                    {t(
                      "An earlier cart order response was not confirmed. Recover it before placing another order.",
                    )}
                  </p>
                  <Button disabled={busy} onClick={() => void order(true)}>
                    {t(busy ? "Please wait…" : "Recover saved cart order")}
                  </Button>
                </section>
              ) : (
                <>
                  {stage === "cart" && (
                    <>
                      {!items.length && (
                        <p className="py-6 text-center">{t("Your cart is empty.")}</p>
                      )}
                      {items.map((item) => {
                        const { product, variant, available } = cartSelection(item, products);
                        const invalid =
                          !!item.deal &&
                          (item.deal.invalidated ||
                            !product ||
                            item.deal.listed_price !== product.price ||
                            product.bargain_enabled === false ||
                            dealSeconds(item.deal, Date.now()) === 0);
                        return (
                          <article key={item.variantId} className={styles["cartItem"]}>
                            <div>
                              {product?.image && (
                                <img
                                  src={product.image}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  width="64"
                                  height="72"
                                />
                              )}
                            </div>
                            <div>
                              <label className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
                                  checked={selection[item.variantId] !== false}
                                  aria-label={`${t("Select")} ${product?.article ?? t("Unavailable product")} ${variant?.size ?? ""}`}
                                  onChange={(e) =>
                                    setSelection({
                                      ...selection,
                                      [item.variantId]: e.target.checked,
                                    })
                                  }
                                />
                                <span>
                                  <strong className="block text-sm" data-no-translate>
                                    {product
                                      ? `${product.brand} ${product.article}`
                                      : t("Unavailable product")}
                                  </strong>
                                  <span className="block text-xs text-muted-foreground">
                                    <span data-no-translate>{product?.color}</span> · {t("Size")}{" "}
                                    {variant?.size ?? "—"}
                                  </span>
                                </span>
                              </label>
                              <p className="mt-1 font-semibold">
                                {product && product.price > 0
                                  ? inr(item.deal?.price ?? product.price)
                                  : t("Price unavailable")}
                              </p>
                              {!available && <p>{t("Out of stock")}</p>}
                              {invalid && (
                                <>
                                  <p>{t("This price needs review before ordering.")}</p>
                                  <button
                                    className="min-h-11 text-xs underline"
                                    onClick={() => listed(item.variantId)}
                                  >
                                    {t("Use listed price")} · {inr(product?.price ?? 0)}
                                  </button>
                                </>
                              )}
                              <button
                                className="min-h-11 px-2 text-xs underline"
                                onClick={() => remove(item.variantId)}
                              >
                                {t("Remove")}
                              </button>
                            </div>
                            {item.deal && <DealTimer deal={item.deal} />}
                          </article>
                        );
                      })}
                    </>
                  )}
                  {stage === "method" && (
                    <>
                      <p className="text-sm font-semibold">{t("How do you want it?")}</p>
                      {(["pickup", "local", "outside"] as const)
                        .filter((f) =>
                          f === "pickup" ? shop.booking : f === "local" ? shop.local : shop.outside,
                        )
                        .map((f) => (
                          <button
                            key={f}
                            className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border p-3 text-sm ${method === f ? "border-primary bg-primary/5" : ""}`}
                            aria-pressed={method === f}
                            onClick={() => setMethod(f)}
                          >
                            <span>
                              {t(
                                f === "pickup"
                                  ? "Pickup from store"
                                  : f === "local"
                                    ? "Local delivery"
                                    : "Outside Jabalpur delivery",
                              )}
                            </span>
                            <strong>
                              {cartAmounts(subtotal, f, shop).charge
                                ? inr(cartAmounts(subtotal, f, shop).charge)
                                : t("Free")}
                            </strong>
                          </button>
                        ))}
                    </>
                  )}
                  {stage === "form" && (
                    <>
                      <p className="text-sm">
                        {selected.length} {t("pairs in one order")}
                      </p>
                      <div
                        className="grid gap-3 rounded-xl border p-3"
                        aria-label={t("Order summary")}
                      >
                        {rows.map(({ item, product, variant }) => {
                          const original = item.deal?.price ?? product?.price ?? 0;
                          const saving = couponShares[item.variantId] ?? 0;
                          return (
                            <div
                              key={item.variantId}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <strong className="block break-words" data-no-translate>
                                  {product?.brand} {product?.article ?? t("Unavailable product")}
                                </strong>
                                <span data-no-translate>{product?.color}</span> · {t("Size")}{" "}
                                {variant?.size}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                                {saving > 0 && (
                                  <del className="text-muted-foreground">{inr(original)}</del>
                                )}
                                <strong>{inr(cartMoney(original - saving))}</strong>
                              </div>
                            </div>
                          );
                        })}
                        {activeDisc && (
                          <p className="border-t pt-2 text-xs">
                            {t("Coupon discount")}: <strong>−{inr(activeDisc.amount)}</strong>
                          </p>
                        )}
                      </div>
                      <Input
                        aria-label={t("Your name")}
                        placeholder={t("Your name")}
                        value={name}
                        maxLength={60}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <Input
                        aria-label={t("Mobile number")}
                        placeholder={t("Mobile number")}
                        value={mobile}
                        inputMode="tel"
                        maxLength={14}
                        onChange={(e) => setMobile(e.target.value)}
                      />
                      {method !== "pickup" && (
                        <>
                          <Textarea
                            aria-label={t("Full address (house, street, landmark)")}
                            placeholder={t("Full address (house, street, landmark)")}
                            value={address}
                            maxLength={300}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                          <Input
                            aria-label={t("City / Pincode")}
                            placeholder={t("City / Pincode")}
                            value={area}
                            maxLength={80}
                            onChange={(e) => setArea(e.target.value)}
                          />
                        </>
                      )}
                      {eligible.length > 0 && (
                        <section className="grid gap-2 rounded-xl border p-3">
                          <p className="text-xs text-muted-foreground">
                            {t("Eligible subtotal")}: {inr(eligibleSubtotal)}
                          </p>
                          <div className="flex gap-2">
                            <Input
                              className="min-w-0"
                              aria-label={t("Coupon code (optional)")}
                              placeholder={t("Coupon code (optional)")}
                              value={code}
                              maxLength={30}
                              onChange={(e) => {
                                couponRequest.current++;
                                setCouponBusy(false);
                                setCode(e.target.value.toUpperCase());
                                setDisc(null);
                              }}
                            />
                            <Button
                              className="min-w-20 shrink-0 whitespace-nowrap"
                              variant="outline"
                              disabled={
                                !shop.cart_coupon_ready ||
                                couponBusy ||
                                !code.trim() ||
                                !/^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, ""))
                              }
                              onClick={() => void apply()}
                            >
                              {t(couponBusy ? "Checking…" : "Apply")}
                            </Button>
                          </div>
                          {!shop.cart_coupon_ready && (
                            <p className="text-xs">
                              {t("Cart coupons are temporarily unavailable.")}
                            </p>
                          )}
                          {activeDisc && (
                            <p className="text-xs">
                              {activeDisc.code} · −{inr(activeDisc.amount)}
                            </p>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {t(error)}
                </p>
              )}
              {!pending && needsReview && (
                <p role="alert" className="text-xs">
                  {t(
                    "Some selected pairs need attention. Update or unselect them before ordering.",
                  )}
                </p>
              )}
              {(!shop.cart_ready || !canOrder) && items.length > 0 && !pending && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Ordering is temporarily unavailable. You can keep shopping or contact the store.",
                  )}
                </p>
              )}
            </div>
            <footer className={styles["footer"]}>
              {earliest && stage !== "cart" && !pending && <DealTimer deal={earliest} />}
              {!pending && (
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {t(
                      stage === "cart"
                        ? "Selected total"
                        : method === "pickup"
                          ? "Advance to pay now"
                          : "Total to pay",
                    )}
                  </span>
                  <strong>
                    {needsReview
                      ? t("Review required")
                      : inr(stage === "cart" ? subtotal : quote.advance)}
                  </strong>
                </div>
              )}
              {!pending && stage !== "cart" && (
                <p className="text-xs text-muted-foreground">
                  {t("Delivery charge")}: {inr(quote.charge)}
                  {method === "pickup" && (
                    <>
                      {" "}
                      · {t("Balance at store:")} {inr(subtotal - quote.advance)}
                    </>
                  )}
                </p>
              )}
              {stage === "cart" && !pending && (
                <Button
                  className="h-12"
                  disabled={
                    !selected.length || needsReview || blocked || !shop.cart_ready || !canOrder
                  }
                  onClick={() => {
                    setError("");
                    setTermsAccepted(false);
                    setStage("method");
                  }}
                >
                  {t("Order")} · {selected.length}
                </Button>
              )}
              {stage === "method" && !pending && (
                <Button
                  className="h-12"
                  disabled={needsReview || !methodAvailable}
                  onClick={() => setStage("form")}
                >
                  {t("Continue")}
                </Button>
              )}
              {stage === "form" && !pending && <CatalogTermsAgreement shop={shop} checked={termsAccepted} onChange={setTermsAccepted} disabled={busy}/>}
              {stage === "form" && !pending && (
                <Button
                  className="h-12"
                  disabled={
                    busy ||
                    !valid ||
                    !termsAccepted ||
                    needsReview ||
                    blocked ||
                    !shop.cart_ready ||
                    !methodAvailable ||
                    couponBusy
                  }
                  onClick={() => void order()}
                >
                  {t(busy ? "Please wait…" : "Place order")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  stage === "cart" || pending
                    ? onClose()
                    : setStage(stage === "form" ? "method" : "cart")
                }
              >
                {t(stage === "cart" || pending ? "Continue shopping" : "Back")}
              </Button>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
