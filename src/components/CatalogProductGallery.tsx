import { useEffect, useRef, useState } from "react";
import { getCatalogPhotos } from "@/lib/catalog.functions";
import { Button } from "./ui/button";
import styles from "./catalog-product-gallery.module.css";

export function CatalogProductGallery({
  productId,
  cover,
  label,
  imageClassName,
  motionEnabled = true,
}: {
  productId: string;
  cover: string | null;
  label: string;
  imageClassName?: string;
  motionEnabled?: boolean;
}) {
  const [images, setImages] = useState<string[]>(cover ? [cover] : []);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const selection = useRef(0);
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const decoded = useRef(new Set<string>());
  const pending = useRef(new Map<string, Promise<boolean>>());
  function prepare(url: string): Promise<boolean> {
    if (decoded.current.has(url)) return Promise.resolve(true);
    const existing = pending.current.get(url);
    if (existing) return existing;
    const task = new Promise<boolean>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      if (typeof image.decode === "function") {
        image.src = url;
        void image.decode().then(
          () => resolve(true),
          () => resolve(false),
        );
      } else {
        image.onload = () => resolve(image.naturalWidth > 0);
        image.onerror = () => resolve(false);
        image.src = url;
      }
    }).then((ready) => {
      pending.current.delete(url);
      if (ready) decoded.current.add(url);
      return ready;
    });
    pending.current.set(url, task);
    return task;
  }
  async function choose(nextIndex: number) {
    const url = images[nextIndex];
    if (!url) return;
    const request = ++selection.current;
    if (nextIndex === index) {
      setSwitching(false);
      return;
    }
    setSwitching(true);
    const ready = await prepare(url);
    if (request !== selection.current) return;
    setSwitching(false);
    if (!ready) {
      setFailed(true);
      return;
    }
    clearTimeout(settling.current);
    const animate = motionEnabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOutgoing(animate ? (images[index] ?? null) : null);
    setIndex(nextIndex);
    if (animate) settling.current = setTimeout(() => setOutgoing(null), 220);
  }
  useEffect(() => {
    let active = true;
    selection.current++;
    clearTimeout(settling.current);
    setOutgoing(null);
    setSwitching(false);
    setLoading(true);
    setFailed(false);
    setIndex(0);
    setImages(cover ? [cover] : []);
    getCatalogPhotos({ data: { productId } })
      .then(async (result) => {
        if (!active) return;
        let decodeFailed = false;
        const first = result.images[0];
        if (first && first !== cover) {
          // Keep the visible cover until its replacement is decoded. Never block opening.
          const next = new Image();
          next.decoding = "async";
          if (typeof next.decode === "function") {
            next.src = first;
            try {
              await next.decode();
            } catch {
              decodeFailed = true;
            }
          } else {
            decodeFailed = !(await new Promise<boolean>((resolve) => {
              next.onload = () => resolve(true);
              next.onerror = () => resolve(false);
              next.src = first;
            }));
          }
        }
        if (!active) return;
        if (result.images.length && !decodeFailed) {
          selection.current++;
          setSwitching(false);
          setImages(result.images);
        }
        setFailed(!result.available || decodeFailed);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the latest numeric request, not a DOM ref.
      selection.current++;
      clearTimeout(settling.current);
    };
  }, [productId, cover, attempt]);
  return (
    <div
      className="space-y-2"
      aria-label="Product photo gallery"
      data-gallery-motion={motionEnabled ? "on" : "off"}
    >
      <div
        className={`relative aspect-square overflow-hidden rounded-lg bg-muted ${imageClassName ?? ""}`}
        aria-busy={switching}
      >
        {outgoing && (
          <img
            src={outgoing}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-contain p-3 ${styles["outgoing"]}`}
          />
        )}
        {images[index] && (
          <img
            key={images[index]}
            src={images[index]}
            alt={`${label} — view ${index + 1}`}
            className={`relative h-full w-full object-contain p-3 ${outgoing ? styles["incoming"] : ""}`}
            decoding="async"
            fetchPriority="high"
            onLoad={() => {
              if (images[index]) decoded.current.add(images[index]);
            }}
            onError={() => {
              if (images[index] !== cover && cover) {
                setImages([cover]);
                setIndex(0);
              }
              setFailed(true);
            }}
          />
        )}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded bg-background/90 px-2 py-1 text-xs">
            {index + 1} / {images.length}
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose product angle">
          {images.map((image, i) => (
            <button
              key={image}
              type="button"
              aria-label={`View photo ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => void choose(i)}
              onPointerEnter={() => {
                void prepare(image);
              }}
              onFocus={() => {
                void prepare(image);
              }}
              className={`h-16 w-16 shrink-0 rounded-md border-2 p-1 ${index === i ? "border-primary" : "border-transparent bg-muted"}`}
            >
              <img
                src={image}
                alt={`Angle ${i + 1}`}
                className="h-full w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
      {loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading more photos…
        </p>
      )}
      {failed && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Showing available product photo.</span>
          <Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
            Retry photos
          </Button>
        </div>
      )}
    </div>
  );
}
