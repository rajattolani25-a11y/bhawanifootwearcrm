import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { cartSelection, removeFromCart, writeCart, type CatalogCartItem } from "@/lib/catalog-cart";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { DealTimer } from "./DealTimer";
import styles from "./commerce.module.css";
export function CatalogCart({
  items,
  products,
  onClose,
  onCheckout,
  motionEnabled = true,
}: {
  items: CatalogCartItem[];
  products: CatalogProduct[];
  onClose: () => void;
  onCheckout: (item: CatalogCartItem) => void;
  motionEnabled?: boolean;
}) {
  const { t } = useLang();
  const [error, setError] = useState("");
  function remove(id: string) {
    try {
      removeFromCart(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={styles["sheet"]}
        data-motion={motionEnabled}
        aria-describedby={undefined}
      >
        <div className={styles["body"]}>
          <DialogTitle className={styles["heading"]}>{t("Your cart")}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t("Order one pair at a time. Delivery and advance are shown before each order.")}
          </p>
          {!items.length && <p className="py-8 text-center text-sm">{t("Your cart is empty.")}</p>}
          {items.map((item) => {
            const { product, variant, available } = cartSelection(item, products);
            return (
              <article key={item.variantId} className={styles["cartItem"]}>
                {product?.image ? <img src={product.image} alt="" /> : <div />}
                <div>
                  <h3 data-no-translate>
                    {product ? `${product.brand} ${product.article}` : t("Unavailable product")}
                  </h3>
                  <p>
                    <span data-no-translate>{product?.color}</span> · {t("Size")}{" "}
                    <span data-no-translate>{variant?.size ?? "—"}</span>
                  </p>
                  {product && (
                    <>
                      <strong>
                        {inr(
                          item.deal?.listed_price === product.price
                            ? item.deal.price
                            : product.price,
                        )}
                      </strong>
                      {item.deal && (
                        <p>
                          {t(
                            item.deal.listed_price === product.price
                              ? "Bargain price · Review before ordering"
                              : "Price changed · Review before ordering",
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {!available && <p>{t("Out of stock")}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button disabled={!available} onClick={() => onCheckout(item)}>
                      {t("Review & order")}
                    </Button>
                    <button
                      className="px-2 text-xs underline"
                      onClick={() => remove(item.variantId)}
                    >
                      {t("Remove")}
                    </button>
                  </div>
                </div>
                {item.deal && <DealTimer deal={item.deal} />}
              </article>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          )}
        </div>
        <footer className={styles["footer"]}>
          <p className="text-xs text-muted-foreground">{t("Cart does not reserve stock")}</p>
          <Button variant="outline" onClick={onClose}>
            {t("Continue shopping")}
          </Button>
          {error && (
            <Button
              variant="ghost"
              onClick={() => {
                try {
                  writeCart([]);
                  setError("");
                } catch {
                  setError(t("Device storage is unavailable."));
                }
              }}
            >
              {t("Clear cart")}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
