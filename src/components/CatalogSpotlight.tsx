import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { decodeImage } from "@/lib/decode-image";
import { spotlightStyle } from "@/lib/catalog-spotlight-style";
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
  categoryAccents = true,
}: {
  products: CatalogProduct[];
  onOpen: (product: CatalogProduct) => void;
  motionEnabled?: boolean;
  categoryAccents?: boolean;
}) {
  const [active, setActive] = useState(0);
  const request = useRef(0);
  const [outgoing, setOutgoing] = useState<CatalogProduct | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readyImages = useRef(new Set<string>());
  const pendingImages = useRef(new Map<string, Promise<boolean>>());
  useEffect(
    () => () => {
      request.current++;
      clearTimeout(settle.current);
    },
    [],
  );
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
    request.current++;
    clearTimeout(settle.current);
    setOutgoing(null);
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
  const mayAdvance = useRef(running);
  mayAdvance.current = running;
  const present = useCallback(
    async (target: number, nextOrder?: string[], automatic = false) => {
      const selected = nextOrder ? products.find((p) => p.id === nextOrder[target]) : pairs[target];
      if (!selected) return;
      const latest = ++request.current;
      const url = selected.image;
      if (url && !readyImages.current.has(url) && !failedImages[url]) {
        let loading = pendingImages.current.get(url);
        if (!loading) {
          loading = decodeImage(url);
          pendingImages.current.set(url, loading);
        }
        const ready = await loading;
        pendingImages.current.delete(url);
        if (latest !== request.current) return;
        if (ready) readyImages.current.add(url);
        else setFailedImages((failed) => ({ ...failed, [url]: true }));
      }
      if (latest !== request.current || (automatic && !mayAdvance.current)) return;
      clearTimeout(settle.current);
      const nextPairs = nextOrder ?? pairs.map((p) => p.id);
      const nearby = [-1, 0, 1].map(
        (offset) => nextPairs[(target + offset + nextPairs.length) % nextPairs.length],
      );
      setOutgoing(!nearby.includes(pairs[index]!.id) ? pairs[index]! : null);
      if (nextOrder) setOrder(nextOrder);
      setActive(target);
      settle.current = setTimeout(() => setOutgoing(null), 800);
    },
    [pairs, products, failedImages, index],
  );
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      if (index === pairs.length - 1) {
        void present(
          0,
          mixedIds(
            pairs.map((p) => p.id),
            pairs[index]!.id,
          ),
          true,
        );
      } else void present(index + 1, undefined, true);
    }, ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, pairs, present]);
  if (!current) return null;
  const appearance = spotlightStyle(current.category);
  const move = (step: number) => {
    if (pairs.length > 1) void present((index + step + pairs.length) % pairs.length);
  };
  const photo = (product: CatalogProduct) =>
    product.image && !failedImages[product.image] ? (
      <img
        src={product.image}
        alt={`${product.brand} ${product.article}`}
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth > 0) readyImages.current.add(product.image!);
        }}
        onError={() => {
          readyImages.current.delete(product.image!);
          setFailedImages((failed) => ({ ...failed, [product.image!]: true }));
        }}
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
      data-transitions={motionEnabled && !reduce}
      data-tone={appearance.tone}
      data-accents={categoryAccents}
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
          <p>{t(appearance.label)}</p>
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
        <div
          className={styles["word"]}
          data-long={appearance.word.length > 6}
          aria-hidden="true"
          data-no-translate
        >
          {appearance.word}
        </div>
        <span className={styles["accentShape"]} aria-hidden="true" />
        {pairs.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(-1)}
            aria-label={t("Previous product")}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <div className={styles["featured"]}>
          {(pairs.length > 2 ? [-1, 0, 1] : pairs.length > 1 ? [0, 1] : [0]).map((offset) => {
            const product =
              offset === -1 && outgoing
                ? outgoing
                : pairs[(index + offset + pairs.length) % pairs.length]!;
            return (
              <div
                key={product.id}
                className={styles["slide"]}
                data-slot={offset === 0 ? "current" : offset < 0 ? "previous" : "next"}
                aria-hidden={offset !== 0}
              >
                {photo(product)}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onOpen(current)}
            className={styles["mainPhoto"]}
            aria-label={`${t("View pair")}: ${current.brand} ${current.article}`}
          />
        </div>
        {pairs.length > 1 && (
          <button
            type="button"
            className={styles["neighbour"]}
            onClick={() => move(1)}
            aria-label={t("Next product")}
          >
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
