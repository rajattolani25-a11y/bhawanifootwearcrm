import { decodeImage } from "@/lib/decode-image";
import { BlurReveal } from "@/components/motion/blur-reveal";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { heroOfferText, type PublicHero } from "@/lib/catalog-hero";
import { catalogTheme, type CatalogThemeId } from "@/lib/catalog-themes";
import styles from "./catalog-hero.module.css";
import { CatalogIvoryBackground } from "./CatalogIvoryBackground";

/** One image and CSS transforms only; animation pauses off-screen and in background tabs. */
export function CatalogHero({
  hero,
  onAction,
  fallback,
  theme = "studio",
  priority = true,
}: {
  hero: PublicHero;
  onAction?: () => void;
  fallback?: ReactNode;
  theme?: CatalogThemeId;
  priority?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(true);
  const [activeTab, setActiveTab] = useState(true);
  const [image, setImage] = useState(hero.image);
  const workingImage = useRef<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const failed = failedImage !== null && (!workingImage.current || failedImage === hero.image);
  useEffect(() => {
    if (image === hero.image) {
      // Recover errors that happened before hydration attached onError.
      if (imageRef.current?.complete) {
        if (imageRef.current.naturalWidth > 0) workingImage.current = image;
        else setFailedImage(hero.image);
      }
      return;
    }
    let active = true;
    void decodeImage(hero.image).then((ready) => {
      if (!active) return;
      if (ready) {
        setFailedImage(null);
        setImage(hero.image);
      } else {
        const path = (url: string) => url.split("?")[0];
        // A token-renewal failure cannot erase a working copy of the same image.
        if (!workingImage.current || path(image) !== path(hero.image)) setFailedImage(hero.image);
      }
    });
    return () => {
      active = false;
    };
  }, [hero.image, image]);
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
  }, [failed]);
  if (failed) return <>{fallback}</>;
  const ivory = theme === "ivory";
  return (
    <section
      ref={root}
      className={styles["hero"]}
      aria-label="Featured collection"
      data-motion={hero.motion}
      data-paused={!visible || !activeTab}
      data-no-translate
      data-palette={catalogTheme(theme).id}
      style={catalogTheme(theme).style}
    >
      {ivory && <CatalogIvoryBackground />}
      <div className={styles["inner"]}>
        {!ivory && <span className={styles["spotlight"]} aria-hidden="true" />}
        <p className={styles["offer"]}>{heroOfferText(hero)}</p>
        <div className={styles["stage"]}>
          <img
            ref={imageRef}
            src={image}
            width="1200"
            height="900"
            alt="Featured footwear"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            decoding="async"
            style={{ width: `${hero.image_scale}%` }}
            onLoad={() => {
              workingImage.current = image;
            }}
            onError={() => setFailedImage(hero.image)}
          />
        </div>
        <div className={styles["heading"]}>
          <BlurReveal enabled={hero.motion && !ivory}>
            <h1>{hero.heading}</h1>
          </BlurReveal>
        </div>
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
