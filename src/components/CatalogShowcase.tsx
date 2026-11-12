import { useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import { getCatalogShowcase } from "@/lib/catalog-showcase.functions";
import { SHOWCASE_REFRESH, type ShowcaseAudience, type ShowcaseItem } from "@/lib/catalog-showcase";
import styles from "./catalog-showcase.module.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

/** Mounted only for Men/Women. All/Kids load neither this module nor posters. */
export function CatalogShowcase({
  audience,
  products,
  onProduct,
  dark,
  motionEnabled,
}: {
  audience: ShowcaseAudience;
  products: CatalogProduct[];
  onProduct: (product: CatalogProduct) => void;
  dark: boolean;
  motionEnabled: boolean;
}) {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [Gallery, setGallery] = useState<
    (typeof import("./CatalogShowcaseGallery"))["CatalogShowcaseGallery"] | null
  >(null);
  const galleryRequest = useRef(0);
  const lifecycle = useRef({ active: true });
  const request = useRef(0);
  const entry = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let stopped = false;
    const state = lifecycle.current;
    state.active = true;
    async function refresh() {
      const id = ++request.current;
      try {
        const result = await getCatalogShowcase({ data: { audience } });
        if (!stopped && id === request.current) {
          setItems(result.items);
          if (!result.items.length) setOpen(false);
        }
      } catch {
        /* Optional artwork cannot block shopping; keep a working frame on a temporary error. */
      }
    }
    const storage = (event: StorageEvent) => {
      if (event.key === SHOWCASE_REFRESH) void refresh();
    };
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    void refresh();
    window.addEventListener(SHOWCASE_REFRESH, refresh);
    window.addEventListener("solestack-catalog-refresh", refresh);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      state.active = false;
      window.removeEventListener(SHOWCASE_REFRESH, refresh);
      window.removeEventListener("solestack-catalog-refresh", refresh);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [audience]);
  if (!items.length) return null;
  const title = audience === "men" ? "The Men’s Edit" : "The Women’s Edit";
  const close = () => {
    galleryRequest.current++;
    setOpen(false);
    requestAnimationFrame(() => entry.current?.focus({ preventScroll: true }));
  };
  async function openGallery() {
    setOpen(true);
    if (Gallery) return;
    setLoading(true);
    setLoadError(false);
    const id = ++galleryRequest.current;
    try {
      const module = await import("./CatalogShowcaseGallery");
      if (lifecycle.current.active && id === galleryRequest.current)
        setGallery(() => module.CatalogShowcaseGallery);
    } catch {
      if (lifecycle.current.active && id === galleryRequest.current) setLoadError(true);
    } finally {
      if (lifecycle.current.active && id === galleryRequest.current) setLoading(false);
    }
  }
  return (
    <section
      className={styles["entrySection"]}
      data-showcase-audience={audience}
      data-theme={dark ? "dark" : "light"}
      data-motion={motionEnabled}
    >
      <button
        ref={entry}
        type="button"
        className={styles["entry"]}
        onClick={() => void openGallery()}
        aria-label={`Explore ${title}`}
        aria-haspopup="dialog"
        data-no-translate
      >
        <span className={styles["stack"]} aria-hidden="true">
          {items.slice(0, 2).map((item) => (
            <span className={styles["paper"]} key={item.id}>
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt=""
                  width="120"
                  height="160"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              ) : (
                <span>{item.title}</span>
              )}
            </span>
          ))}
        </span>
        <span className={styles["entryCopy"]}>
          <span className={styles["spark"]} aria-hidden="true">
            ✦
          </span>
          <strong>{title}</strong>
          <span>Explore the showcase</span>
          <i aria-hidden="true" />
        </span>
        <span className={styles["arrow"]} aria-hidden="true">
          ↗
        </span>
      </button>
      {open && !Gallery && (
        <Dialog
          open
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <p role="status">
              {loading ? "Opening Showcase…" : "Showcase could not be opened. Please retry."}
            </p>
            {loadError && (
              <button type="button" onClick={() => void openGallery()}>
                Retry
              </button>
            )}
            <button onClick={close}>Cancel</button>
          </DialogContent>
        </Dialog>
      )}
      {open && Gallery && (
        <Gallery
          items={items}
          title={title}
          dark={dark}
          motionEnabled={motionEnabled}
          onClose={close}
          onPick={(item) => {
            const product = item.productId
              ? products.find((product) => product.id === item.productId)
              : null;
            close();
            if (product) onProduct(product);
            else document.getElementById("catalog-products")?.scrollIntoView({ block: "start" });
          }}
        />
      )}
    </section>
  );
}
