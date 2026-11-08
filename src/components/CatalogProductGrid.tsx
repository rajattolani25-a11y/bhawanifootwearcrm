import { memo } from "react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { inr } from "@/lib/modules";
import styles from "@/routes/catalog.module.css";

export const CatalogProductGrid = memo(function CatalogProductGrid({
  products,
  onOpen,
}: {
  products: CatalogProduct[];
  onOpen: (product: CatalogProduct) => void;
}) {
  return (
    <div className={styles["productGrid"]}>
      {products.map((p, index) => {
        const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
        const available = p.sizes.filter((size) => size.available);
        return (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className={styles["productCard"]}
            aria-label={`${p.brand} ${p.article}`}
          >
            <div className={styles["productImage"]}>
              {p.image ? (
                <img
                  src={p.image}
                  alt={`${p.brand} ${p.article}`}
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                  width="500"
                  height="500"
                />
              ) : (
                <div className={styles["imageFallback"]}>
                  <ShoppingBag aria-hidden="true" />
                  <span data-no-translate>{p.brand}</span>
                </div>
              )}
              {off > 0 && (
                <span className={styles["discount"]}>
                  {off}% <span>OFF</span>
                </span>
              )}
              {p.few_left && <span className={styles["limited"]}>Few sizes left</span>}
            </div>
            <div className={styles["productInfo"]}>
              <p className={styles["brand"]} data-no-translate>
                {p.brand}
              </p>
              <h3 data-no-translate>{p.article}</h3>
              {p.color && <p className="mt-1 text-xs text-muted-foreground" data-no-translate>{p.color}</p>}
              <p className={styles["price"]}>
                <strong>{inr(p.price)}</strong>
                {off > 0 && <del>{inr(p.mrp)}</del>}
              </p>
              <div className={styles["sizeSummary"]}>
                <span>Sizes</span>
                <span className={styles["sizeChips"]} data-no-translate>
                  {available.length
                    ? available.map((size) => <span key={size.id}>{size.size}</span>)
                    : "—"}
                </span>
              </div>
              <span className={styles["cardAction"]}>
                <span>{available.length ? "Choose size" : "Out of stock"}</span>
                <ArrowRight aria-hidden="true" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
});
