import { useEffect, useRef, useState, type ReactNode } from "react";
import { heroOfferText, type PublicHero } from "@/lib/catalog-hero";
import styles from "./catalog-hero.module.css";

/** One image and CSS transforms only; animation pauses off-screen and in background tabs. */
export function CatalogHero({
  hero,
  onAction,
  fallback,
}: {
  hero: PublicHero;
  onAction?: () => void;
  fallback?: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(true);
  const [activeTab, setActiveTab] = useState(true);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  useEffect(() => {
    // SSR image errors can happen before React attaches onError.
    if (imageRef.current?.complete && imageRef.current.naturalWidth === 0)
      setFailedImage(hero.image);
  }, [hero.image]);
  useEffect(() => {
    const sync = () => setActiveTab(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting))
        : null;
    if (root.current) observer?.observe(root.current);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [hero.image]);
  if (failedImage === hero.image) return <>{fallback}</>;
  return (
    <section
      ref={root}
      className={styles["hero"]}
      aria-label="Featured collection"
      data-motion={hero.motion}
      data-paused={!visible || !activeTab}
      data-no-translate
    >
      <div className={styles["inner"]}>
        <p className={styles["offer"]}>{heroOfferText(hero)}</p>
        <div className={styles["stage"]}>
          <img
            ref={imageRef}
            src={hero.image}
            width="1200"
            height="900"
            alt="Featured footwear"
            fetchPriority="high"
            decoding="async"
            style={{ width: `${hero.image_scale}%` }}
            onError={() => setFailedImage(hero.image)}
          />
        </div>
        <h1>{hero.heading}</h1>
        {hero.subtitle && <p className={styles["message"]}>{hero.subtitle}</p>}
        {onAction ? (
          <button type="button" onClick={onAction} className={styles["cta"]}>
            {hero.button_label} <span aria-hidden="true">→</span>
          </button>
        ) : (
          <span className={styles["cta"]}>{hero.button_label} →</span>
        )}
      </div>
    </section>
  );
}
