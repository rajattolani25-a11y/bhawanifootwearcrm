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
        <path
          fill="#FFCE26"
          d="M13 1c2 10-9 14-11 24C-1 35 6 43 16 43c10 0 17-8 15-18-1-7-5-12-9-16 1 7-1 10-3 11C21 12 19 6 13 1Z"
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
