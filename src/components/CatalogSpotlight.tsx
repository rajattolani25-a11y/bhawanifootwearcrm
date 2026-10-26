import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import styles from "./catalog-spotlight.module.css";

/** Only three real product photographs are mounted. No auto-advance or 3D assets. */
export function CatalogSpotlight({
  products,
  onOpen,
  motionEnabled = true,
}: {
  products: CatalogProduct[];
  onOpen: (product: CatalogProduct) => void;
  motionEnabled?: boolean;
}) {
  const [active, setActive] = useState(0),
    [direction, setDirection] = useState(1);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);
  const reduce = useReducedMotion(),
    { t } = useLang();
  const index = products.length ? Math.min(active, products.length - 1) : 0;
  const current = products[index];
  if (!current) return null;
  const move = (step: number) => {
    if (products.length < 2) return;
    setDirection(step);
    setActive((index + step + products.length) % products.length);
  };
  const photo = (product: CatalogProduct) =>
    product.image && !failedImages[product.image] ? (
      <img
        src={product.image}
        alt={`${product.brand} ${product.article}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedImages((failed) => ({ ...failed, [product.image!]: true }))}
      />
    ) : (
      <div className={styles["placeholder"]}>
        <ShoppingBag aria-hidden="true" />
        <span>{t("Photo coming soon")}</span>
      </div>
    );
  return (
    <section className={styles["spotlight"]} aria-label={t("Product spotlight")}>
      <div className={styles["header"]}>
        <div>
          <p>{t("Discover your next pair")}</p>
          <h2>{t("In the spotlight")}</h2>
        </div>
        <span className={styles["position"]} data-no-translate>
          {index + 1} / {products.length}
        </span>
      </div>
      <div
        className={styles["stage"]}
        onTouchStart={(e) => {
          const p = e.touches[0];
          if (p) touch.current = { x: p.clientX, y: p.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current,
            end = e.changedTouches[0];
          touch.current = null;
          if (
            start &&
            end &&
            Math.abs(end.clientX - start.x) > 55 &&
            Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y) * 1.5
          ) {
            e.preventDefault();
            move(end.clientX < start.x ? 1 : -1);
          }
        }}
      >
        {products.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(-1)}
            aria-label={t("Previous product")}
          >
            {products.length > 2 &&
              photo(products[(index - 1 + products.length) % products.length]!)}
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <m.div
          key={current.id}
          className={styles["featured"]}
          initial={motionEnabled && !reduce ? { x: direction * 32, opacity: 0.6, scale: 0.97 } : false}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: !motionEnabled || reduce ? 0 : 0.36, ease: "easeOut" }}
        >
          <button
            type="button"
            onClick={() => onOpen(current)}
            className={styles["mainPhoto"]}
            aria-label={`${t("View pair")}: ${current.brand} ${current.article}`}
          >
            {photo(current)}
          </button>
        </m.div>
        {products.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(1)}
            aria-label={t("Next product")}
          >
            {photo(products[(index + 1) % products.length]!)}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles["details"]} aria-live="polite">
        <div>
          <p data-no-translate>{current.brand}</p>
          <h3 data-no-translate>{current.article}</h3>
          <strong>{inr(current.price)}</strong>
        </div>
        <button type="button" className={styles["open"]} onClick={() => onOpen(current)}>
          {t("View pair")} <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
