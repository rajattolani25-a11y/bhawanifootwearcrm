import type { AnimationItem } from "lottie-web";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { loadReceiptResources } from "./receipt-resources";
import styles from "./receipt-success.module.css";
/** Decoration mounted only after create_sale returns a saved bill. */
export function SuccessMark() {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let player: AnimationItem | undefined;
    const destroy = () => {
      player?.destroy();
      player = undefined;
      node.replaceChildren();
      if (!disposed) setReady(false);
    };
    const visibility = () => {
      if (document.hidden) player?.pause();
      else player?.play();
    };
    const sync = async () => {
      if (media.matches) {
        destroy();
        return;
      }
      const { lottie, animationData } = await loadReceiptResources();
      if (disposed || media.matches || player) return;
      try {
        player = lottie.loadAnimation({
          container: node,
          renderer: "svg",
          loop: false,
          autoplay: !document.hidden,
          animationData,
        });
        node.dataset["animation"] = "playing";
        player.addEventListener("complete", () => { node.dataset["animation"] = "complete"; });
        setReady(true);
      } catch {
        destroy();
      }
    };
    void sync().catch(() => {});
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", visibility);
      destroy();
    };
  }, []);
  return (
    <div className={styles["receipt"]} aria-hidden="true">
      {!ready && (
        <span className={styles["fallback"]}>
          <Check />
        </span>
      )}
      <div ref={root} className={styles["art"]} />
    </div>
  );
}
