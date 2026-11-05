import { useSyncExternalStore } from "react";
import { bargainRetrySeconds, dealSeconds, type CatalogDeal } from "./catalog-bargain";
const listeners = new Set<() => void>();
let clock = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
function tick() {
  clock = Date.now();
  for (const listener of listeners) listener();
}
function visibility() {
  clearInterval(timer);
  timer = undefined;
  tick();
  if (!document.hidden && listeners.size) timer = setInterval(tick, 1000);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", visibility);
    visibility();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
const noSubscribe = () => () => {};
const snapshot = () => clock;
const serverSnapshot = () => 0;
/** One shared one-second clock, with no grid renders and no hidden-tab polling. */
export function useDealSeconds(deal: CatalogDeal | null) {
  const now = useSyncExternalStore(deal ? subscribe : noSubscribe, snapshot, serverSnapshot);
  return deal ? dealSeconds(deal, now) : 0;
}

/** Uses the same shared clock; a cooldown is not clamped to the three-minute quote. */
export function useBargainRetrySeconds(deal: CatalogDeal | null) {
  const now = useSyncExternalStore(
    deal?.retry_at ? subscribe : noSubscribe,
    snapshot,
    serverSnapshot,
  );
  return bargainRetrySeconds(deal, now);
}
