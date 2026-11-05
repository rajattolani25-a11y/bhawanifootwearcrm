import { useEffect, useState } from "react";
import { promotionCountdown } from "@/lib/catalog-promotion";

/** Only these few digits rerender each second, never the product photos or catalog grid. */
export function PromotionCountdown({
  target,
  now,
  clock,
}: {
  target: string;
  now: number;
  clock?: { server: number; monotonic: number };
}) {
  const [time, setTime] = useState(now);
  useEffect(() => {
    const base = clock ?? { server: now, monotonic: performance.now() };
    const tick = () => {
      if (!document.hidden) setTime(base.server + performance.now() - base.monotonic);
    };
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [target, now, clock]);
  return <strong>{promotionCountdown(target, time)}</strong>;
}
