import { useEffect, useRef, useState } from "react";
import styles from "./catalog-offer-ticket.module.css";
/** Offline Remotion render. No Remotion player/runtime enters the catalog bundle. */
export function PromotionMotion({ enabled }: { enabled: boolean }) {
  const root = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const finished = useRef(false);
  const [play, setPlay] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (
      !enabled ||
      typeof IntersectionObserver === "undefined" ||
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
    )
      return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => setPlay(visible && !document.hidden && !mq.matches);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        sync();
      },
      { threshold: 0.15 },
    );
    if (root.current) observer.observe(root.current);
    mq.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled]);
  useEffect(() => {
    if (enabled && play && !finished.current) {
      setLoaded(true);
      void video.current?.play().catch(() => {});
    } else video.current?.pause();
  }, [enabled, play, loaded]);
  return (
    <div ref={root} className={styles["motion"]} aria-hidden="true">
      {loaded && enabled && (
        <video
          ref={video}
          muted
          playsInline
          preload="none"
          onEnded={() => {
            finished.current = true;
          }}
          src="/media/catalog-promotions/street-energy.mp4"
          onCanPlay={() => {
            if (play && enabled && !finished.current) void video.current?.play().catch(() => {});
          }}
        />
      )}
    </div>
  );
}
