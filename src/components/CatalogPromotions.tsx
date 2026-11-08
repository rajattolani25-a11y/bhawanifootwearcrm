import { useEffect, useState, useMemo, useRef } from "react";
import styles from "./catalog-offer-ticket.module.css";
import { CatalogOfferTicket } from "./CatalogOfferTicket";
import type { PublicPromotion } from "@/lib/catalog-promotion.functions";
import { promotionPhase } from "@/lib/catalog-promotion";
import type { CatalogOffer, CatalogProduct } from "@/lib/catalog.functions";
import { parseCategory } from "@/lib/product-categories";

/** Optional read starts after the initial catalog paint; failure never blocks shopping. */
export function CatalogPromotions({
  offer,
  products,
  department,
  motionEnabled,
  onProduct,
  onShop,
}: {
  offer: CatalogOffer;
  products: CatalogProduct[];
  department: string;
  motionEnabled: boolean;
  onProduct: (p: CatalogProduct) => void;
  onShop: (audience: "all" | "men" | "women") => void;
}) {
  const [snapshot, setSnapshot] = useState<
    { data: PublicPromotion; clock: { server: number; monotonic: number } } | undefined
  >(undefined);
  const [, renderPhase] = useState(0);
  const phaseSignature = useRef("");
  const data = snapshot?.data;
  const clock = snapshot?.clock ?? { server: 0, monotonic: 0 };
  const now = snapshot ? clock.server + performance.now() - clock.monotonic : 0;
  useEffect(() => {
    let disposed = false,
      request = 0;
    let supported = true;
    const read = async () => {
      if (document.hidden || !supported) return;
      const id = ++request;
      try {
        const { getCatalogPromotion } = await import("@/lib/catalog-promotion.functions");
        if (disposed || request !== id) return;
        const response = await getCatalogPromotion();
        if (disposed || request !== id) return;
        if (!response.available) {
          if ("retry" in response && response.retry === false) supported = false;
          setSnapshot(
            (current) =>
              current ?? {
                data: { legacy: true, campaigns: [], now: new Date().toISOString() },
                clock: { server: Date.now(), monotonic: performance.now() },
              },
          );
          return;
        }
        setSnapshot((current) => ({
          data:
            response.value &&
            current?.data?.imagesExpireAt &&
            current.data.imagesExpireAt > Date.parse(response.value.now) + 60000
              ? {
                  ...response.value,
                  images: Object.fromEntries(
                    response.value.campaigns
                      .flatMap(({ campaign }) => [campaign.advance.image, campaign.live.image])
                      .flatMap((image) => {
                        if (!image || !("path" in image)) return [];
                        const url =
                          current.data?.images?.[image.path] ??
                          response.value?.images?.[image.path];
                        return url ? [[image.path, url]] : [];
                      }),
                  ),
                  imagesExpireAt: Math.min(
                    current.data.imagesExpireAt,
                    response.value.imagesExpireAt ?? current.data.imagesExpireAt,
                  ),
                }
              : response.value,
          clock: {
            server: response.value ? Date.parse(response.value.now) : 0,
            monotonic: performance.now(),
          },
        }));
      } catch {
        if (!disposed && request === id)
          setSnapshot(
            (current) =>
              current ?? {
                data: { legacy: true, campaigns: [], now: new Date().toISOString() },
                clock: { server: Date.now(), monotonic: performance.now() },
              },
          );
      }
    };
    const first = setTimeout(() => void read(), 300);
    const interval = setInterval(() => void read(), 60000);
    const refresh = () => void read();
    const savedInAnotherTab = (event: StorageEvent) => {
      if (event.key === "catalog-promotion-refresh") void read();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("solestack-catalog-refresh", refresh);
    window.addEventListener("solestack-promotion-phase", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", savedInAnotherTab);
    return () => {
      disposed = true;
      request++;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("solestack-catalog-refresh", refresh);
      window.removeEventListener("solestack-promotion-phase", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", savedInAnotherTab);
    };
  }, []);
  useEffect(() => {
    if (!snapshot?.data || !snapshot.data.campaigns.some((c) => c.campaign.schedule)) return;
    const sig = () =>
      snapshot
        .data!.campaigns.map((c) =>
          promotionPhase(
            c.campaign,
            snapshot.clock.server + performance.now() - snapshot.clock.monotonic,
          ),
        )
        .join("|");
    phaseSignature.current = sig();
    const tick = () => {
      if (document.hidden) return;
      const next = sig();
      if (next !== phaseSignature.current) {
        phaseSignature.current = next;
        renderPhase((v) => v + 1);
        window.dispatchEvent(new Event("solestack-promotion-phase"));
      }
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [snapshot]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  if (snapshot === undefined) return null;
  if (data?.legacy)
    return offer ? <CatalogOfferTicket offer={offer} motionEnabled={motionEnabled} /> : null;
  if (!data) return null;
  return (
    <div className={styles["promotionList"]}>
      {data.campaigns.map(({ campaign, offer: promoOffer }) => {
        const phase = promotionPhase(campaign, now);
        const expected = campaign.audience === "men" ? "Men" : "Women";
        if (
          phase === "hidden" ||
          !promoOffer ||
          (campaign.audience !== "all" && department !== "All" && department !== expected)
        )
          return null;
        const eligible = campaign.productIds.flatMap((id) => {
          const p = productMap.get(id);
          return p &&
            (campaign.audience === "all" || parseCategory(p.category).department === expected)
            ? [p]
            : [];
        });
        return (
          <CatalogOfferTicket
            key={campaign.audience}
            offer={promoOffer}
            campaign={campaign}
            phase={phase}
            now={now}
            clock={clock}
            imageUrls={data.images ?? {}}
            products={eligible}
            motionEnabled={motionEnabled}
            onProduct={onProduct}
            onShop={() => onShop(campaign.audience)}
          />
        );
      })}
    </div>
  );
}
