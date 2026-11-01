import { useEffect, useRef, useState } from "react";
import {
  drawPoster,
  POSTER_THEMES,
  type PosterTheme,
  type PosterVisibility,
  type PosterTypography,
} from "@/lib/poster";
import type { Product } from "@/lib/stock";
import { useLang } from "@/lib/i18n";
import styles from "./poster-studio.module.css";

export function PosterThemePreviews({
  product,
  shop,
  phone,
  tag,
  offer,
  visible,
  typography,
  theme,
  busy,
  onSelect,
}: {
  product: Product | undefined;
  shop: string;
  phone: string;
  tag: string;
  offer: string;
  visible: PosterVisibility;
  typography: PosterTypography;
  theme: PosterTheme;
  busy: boolean;
  onSelect: (theme: PosterTheme) => void;
}) {
  const { t } = useLang();
  const root = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver((entries) =>
      setInView(entries[0]?.isIntersecting ?? false),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const [images, setImages] = useState<Partial<Record<PosterTheme, string>>>({});
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    const update = () => setAwake(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!product) {
      setImages({});
      return;
    }
    if (!awake || !inView) return;
    setImages({});
    const timer = setTimeout(async () => {
      for (const item of POSTER_THEMES) {
        if (cancelled || document.hidden) break;
        try {
          const { canvas } = await drawPoster(
            product,
            shop,
            phone,
            tag,
            item.id,
            offer,
            visible,
            typography,
            0.16,
          );
          if (!cancelled)
            setImages((old) => ({ ...old, [item.id]: canvas.toDataURL("image/jpeg", 0.82) }));
        } catch {
          /* Keep theme selection usable even when a signed photo fails. */
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [product, shop, phone, tag, offer, visible, typography, awake, inView]);
  return (
    <div ref={root} className={styles["themes"]} role="group" aria-label={t("Poster style")}>
      {POSTER_THEMES.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={busy}
          aria-pressed={theme === item.id}
          onClick={() => onSelect(item.id)}
        >
          <span
            className={styles["themeImage"]}
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          >
            {images[item.id] ? (
              <img src={images[item.id]} alt="" width="173" height="307" />
            ) : (
              <span className={styles["thumbSkeleton"]} style={{ backgroundColor: item.accent }} />
            )}
          </span>
          <span data-no-translate>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
