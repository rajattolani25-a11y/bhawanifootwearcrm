import { useRef, useState } from "react";
import type { ShowcaseItem } from "@/lib/catalog-showcase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import styles from "./catalog-showcase.module.css";

export function CatalogShowcaseGallery({
  items,
  title,
  dark,
  motionEnabled,
  onClose,
  onPick,
}: {
  items: ShowcaseItem[];
  title: string;
  dark: boolean;
  motionEnabled: boolean;
  onClose: () => void;
  onPick: (item: ShowcaseItem) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const zoom = items.find((item) => item.id === zoomId);
  const artButtons = useRef(new Map<string, HTMLButtonElement>());
  function back() {
    const id = zoomId;
    setZoomId(null);
    requestAnimationFrame(() => {
      if (scroll.current) scroll.current.scrollTop = savedScroll.current;
      if (id) artButtons.current.get(id)?.focus({ preventScroll: true });
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) {
          if (zoom) back();
          else onClose();
        }
      }}
    >
      <DialogContent
        ref={root}
        className={styles["gallery"]}
        data-theme={dark ? "dark" : "light"}
        data-zoom={!!zoom}
        data-motion={motionEnabled}
        onEscapeKeyDown={(event) => {
          if (zoom) {
            event.preventDefault();
            back();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          root.current?.focus({ preventScroll: true });
        }}
        tabIndex={-1}
      >
        <DialogHeader className={styles["galleryHeader"]} data-no-translate>
          {zoom && (
            <button type="button" className={styles["zoomBack"]} onClick={back}>
              ← Back to Showcase
            </button>
          )}
          <DialogTitle>{zoom ? zoom.title : title}</DialogTitle>
          <DialogDescription>
            {zoom ? "Full-screen poster" : "Bhawani Showcase · Discover your next favourite pair."}
          </DialogDescription>
        </DialogHeader>
        {zoom?.src && (
          <>
            <div className={styles["fullPoster"]} data-no-translate>
              <img
                src={zoom.src}
                alt={zoom.title}
                width={zoom.width}
                height={zoom.height}
                decoding="async"
              />
            </div>
            <div className={styles["zoomActions"]} data-no-translate>
              <button type="button" onClick={() => onPick(zoom)}>
                {zoom.productId ? "View pair" : "Shop collection"} →
              </button>
            </div>
          </>
        )}
        <div ref={scroll} className={styles["posters"]} data-no-translate hidden={!!zoom}>
          {items.map((item, index) => (
            <article className={styles["poster"]} key={item.id}>
              {item.src ? (
                <button
                  ref={(node) => {
                    if (node) artButtons.current.set(item.id, node);
                    else artButtons.current.delete(item.id);
                  }}
                  type="button"
                  className={styles["artwork"]}
                  onClick={() => {
                    savedScroll.current = scroll.current?.scrollTop ?? 0;
                    setZoomId(item.id);
                    requestAnimationFrame(() => root.current?.focus({ preventScroll: true }));
                  }}
                  aria-label={`Open poster: ${item.title}`}
                  style={{ aspectRatio: `${item.width} / ${item.height}` }}
                >
                  <img
                    src={item.src}
                    alt={item.title}
                    width={item.width}
                    height={item.height}
                    decoding="async"
                    loading={index < 2 ? "eager" : "lazy"}
                    fetchPriority="low"
                    onLoad={(event) => {
                      event.currentTarget.style.visibility = "visible";
                    }}
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                </button>
              ) : (
                <p>Poster temporarily unavailable.</p>
              )}
              <h3>{item.title}</h3>
              <div className={styles["posterActions"]}>
                <button type="button" onClick={() => onPick(item)}>
                  {item.productId ? "View pair" : "Shop collection"} →
                </button>
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
