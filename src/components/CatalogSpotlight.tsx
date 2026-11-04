import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { m } from "motion/react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import styles from "./catalog-spotlight.module.css";

const LAST_PAIR_KEY = "solestack-spotlight-last-pair";
const ADVANCE_MS = 3000;

function mixedIds(source: string[], previous: string | null) {
  const ids = [...source];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  if (ids.length > 1 && ids[0] === previous) {
    const next = 1 + Math.floor(Math.random() * (ids.length - 1));
    [ids[0], ids[next]] = [ids[next]!, ids[0]!];
  }
  return ids;
}

/** Shuffled, stable per visit; only three real photographs are mounted. */
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
  const section = useRef<HTMLElement>(null);
  const initialized = useRef("");
  const [order, setOrder] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const [reduce, setReduce] = useState(true);
  const identities = useMemo(
    () => JSON.stringify([...new Set(products.map((p) => p.id))].sort()),
    [products],
  );
  useEffect(() => {
    if (initialized.current === identities) return;
    initialized.current = identities;
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(LAST_PAIR_KEY);
    } catch {
      /* Device storage is optional. */
    }
    const ids = mixedIds(JSON.parse(identities) as string[], previous);
    try {
      if (ids[0]) sessionStorage.setItem(LAST_PAIR_KEY, ids[0]);
    } catch {
      /* Shuffle still works. */
    }
    setOrder(ids);
    setActive(0);
  }, [identities]);
  const pairs = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return order.length ? order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) : products;
  }, [order, products]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduce(preference.matches);
    updateMotion();
    preference.addEventListener("change", updateMotion);
    const node = section.current;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    if (node) observer.observe(node);
    return () => {
      document.removeEventListener("visibilitychange", update);
      preference.removeEventListener("change", updateMotion);
      observer.disconnect();
    };
  }, []);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);
  const { t } = useLang();
  const index = pairs.length ? Math.min(active, pairs.length - 1) : 0;
  const current = pairs[index];
  const canPlay = motionEnabled && !reduce && pairs.length > 1;
  const running =
    canPlay && order.length > 0 && !focused && !touching && !hovered && visible && inView;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setDirection(1);
      if (index === pairs.length - 1) {
        setOrder(
          mixedIds(
            pairs.map((p) => p.id),
            pairs[index]!.id,
          ),
        );
        setActive(0);
      } else setActive(index + 1);
    }, ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, pairs]);
  if (!current) return null;
  const move = (step: number) => {
    if (pairs.length < 2) return;
    setDirection(step);
    setActive((index + step + pairs.length) % pairs.length);
  };
  const photo = (product: CatalogProduct, preload = false) =>
    product.image && !failedImages[product.image] ? (
      <img
        src={product.image}
        alt={`${product.brand} ${product.article}`}
        loading={preload ? "eager" : "lazy"}
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
    <section
      ref={section}
      className={styles["spotlight"]}
      aria-label={t("Product spotlight")}
      data-spotlight-product={current.id}
      data-autoplay={running}
      style={{ visibility: order.length ? undefined : "hidden" }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(e) => setFocused((e.target as HTMLElement).matches(":focus-visible"))}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className={styles["header"]}>
        <div>
          <p>{t("Discover your next pair")}</p>
          <h2>{t("In the spotlight")}</h2>
        </div>
        <span className={styles["position"]} data-no-translate>
          {index + 1} / {pairs.length}
        </span>
      </div>
      <div
        className={styles["stage"]}
        onTouchStart={(e) => {
          setTouching(true);
          const p = e.touches[0];
          if (p) touch.current = { x: p.clientX, y: p.clientY };
        }}
        onTouchCancel={() => setTouching(false)}
        onTouchEnd={(e) => {
          setTouching(false);
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
        {pairs.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(-1)}
            aria-label={t("Previous product")}
          >
            {pairs.length > 2 && photo(pairs[(index - 1 + pairs.length) % pairs.length]!)}
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <m.div
          key={current.id}
          className={styles["featured"]}
          initial={
            motionEnabled && !reduce ? { x: direction * 32, opacity: 0.6, scale: 0.97 } : false
          }
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: !motionEnabled || reduce ? 0 : 0.36, ease: "easeOut" }}
        >
          <button
            type="button"
            onClick={() => onOpen(current)}
            className={styles["mainPhoto"]}
            aria-label={`${t("View pair")}: ${current.brand} ${current.article}`}
          >
            {photo(current, true)}
          </button>
        </m.div>
        {pairs.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(1)}
            aria-label={t("Next product")}
          >
            {photo(pairs[(index + 1) % pairs.length]!, true)}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles["details"]} aria-live={running ? "off" : "polite"}>
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
