import { useId } from "react";
import styles from "./catalog-hero.module.css";

/** Decorative artwork only. Its parent controls motion, visibility and reduced-motion. */
export function CatalogIvoryBackground() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={styles["liquidBackground"]} aria-hidden="true" data-liquid-ivory>
      <span className={styles["liquidLight"]} />
      <svg
        className={styles["liquidWaves"]}
        viewBox="0 0 1200 420"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="0.38" stopColor="#f0e3cc" />
            <stop offset="1" stopColor="#d6c19e" />
          </linearGradient>
          <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff9eb" />
            <stop offset="0.48" stopColor="#ebdcc1" />
            <stop offset="1" stopColor="#d9c6a5" />
          </linearGradient>
        </defs>
        <g className={styles["liquidRear"]}>
          <path
            d="M-120 285 C110 54 260 76 475 204 S795 294 1010 112 S1280 90 1380 155 L1380 520 H-120Z"
            fill={`url(#${id}-paper)`}
          />
          <path
            d="M-120 285 C110 54 260 76 475 204 S795 294 1010 112 S1280 90 1380 155"
            fill="none"
            stroke="#fffaf0"
            strokeOpacity="0.8"
            strokeWidth="2"
          />
        </g>
        <g className={styles["liquidFront"]}>
          <path
            d="M-120 410 C165 244 294 278 504 354 S881 325 1090 278 S1260 284 1380 312 L1380 520 H-120Z"
            fill={`url(#${id}-fold)`}
          />
        </g>
      </svg>
    </div>
  );
}
