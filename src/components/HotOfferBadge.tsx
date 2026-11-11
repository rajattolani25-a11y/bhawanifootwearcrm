import { useEffect, useRef, useState } from "react";
import styles from "./hot-offer-badge.module.css";

/** Original transparent SVG/CSS artwork; no video, canvas or animation player. */
export function HotOfferBadge({ motionEnabled }: { motionEnabled: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node || !motionEnabled) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setPlaying(visible && !document.hidden && !preference.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      update();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    preference.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      preference.removeEventListener("change", update);
    };
  }, [motionEnabled]);
  return (
    <span
      ref={root}
      className={styles["badge"]}
      data-playing={motionEnabled && playing}
      data-hot-offer
      data-no-translate
      aria-hidden="true"
    >
      <span className={styles["pill"]}>
        <span className={styles["shine"]} />
        <span className={styles["text"]}>HOT</span>
      </span>
      <svg className={styles["fire"]} viewBox="0 0 32 44" fill="none" aria-hidden="true">
        <g className={styles["embers"]} fill="#FFCE26">
          <circle className={styles["emberLeft"]} cx="7" cy="13" r="1.1" />
          <circle className={styles["emberRight"]} cx="26" cy="12" r="0.9" />
        </g>
        <path
          className={styles["tongueLeft"]}
          fill="#FFCE26"
          d="M6 32C1 25 8 20 7 13c9 7 7 14 4 19Z"
        />
        <path
          className={styles["tongueMain"]}
          fill="#FFCE26"
          d="M12 32C5 23 17 17 12 6c13 7 13 19 7 27Z"
        />
        <path
          className={styles["tongueRight"]}
          fill="#FFCE26"
          d="M20 33c-2-8 5-10 2-19 10 8 10 15 5 21Z"
        />
        <path
          fill="#FFCE26"
          d="M4 24C0 30 1 36 6 40c6 5 15 4 21-1 5-5 5-11 1-17-1 7-4 8-7 5-4-5-10-5-13 0-2 3-3 0-4-3Z"
        />
        <path
          className={styles["inner"]}
          fill="#FF951A"
          d="M15 12c1 8-7 13-7 19 0 6 3 10 9 10s10-4 10-10c0-4-2-8-5-11 0 5-2 7-4 7 2-7 1-11-3-15Z"
        />
        <path
          className={styles["core"]}
          fill="#FF7518"
          d="M17 24c-1 5-6 8-5 12 0 3 2 5 5 5 4 0 6-3 6-6 0-3-3-7-6-11Z"
        />
      </svg>
    </span>
  );
}
