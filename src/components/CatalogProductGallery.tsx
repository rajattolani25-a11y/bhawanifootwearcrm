import { useEffect, useRef, useState } from "react";
import { readProductPhotos } from "@/lib/catalog-photo-intent";
import { Button } from "./ui/button";
import styles from "./catalog-product-gallery.module.css";

const FADE_MS = 260;
function photoIdentity(url: string | null) {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://catalog.invalid");
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

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
  const [visible, setVisible] = useState(cover);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const selection = useRef(0);
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeUntil = useRef(0);
  const decoded = useRef(new Set<string>());
  const pending = useRef(new Map<string, Promise<boolean>>());
  const latestCover = useRef(cover);
  latestCover.current = cover;
  // Signed-token renewal is not a new photograph and must not reset the chosen angle.
  const coverIdentity = photoIdentity(cover);
  function prepare(url: string): Promise<boolean> {
    if (decoded.current.has(url)) return Promise.resolve(true);
    const existing = pending.current.get(url);
    if (existing) return existing;
    const task = new Promise<boolean>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      const finish = (ready: boolean) => {
        image.onload = null;
        image.onerror = null;
        resolve(ready);
      };
      image.onload = () => {
        if (typeof image.decode === "function")
          void image.decode().then(
            () => finish(image.naturalWidth > 0),
            () => finish(false),
          );
        else finish(image.naturalWidth > 0);
      };
      image.onerror = () => finish(false);
      image.src = url;
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
    if (url === visible) {
      setSwitching(false);
      return;
    }
    setSwitching(true);
    const ready = await prepare(url);
    if (request !== selection.current) return;
    if (!ready) {
      setSwitching(false);
      setFailed(true);
      return;
    }
    // Finish the current short fade before the latest tap takes over. Replacing
    // a half-transparent outgoing frame was causing a visible snap on fast taps.
    const remaining = fadeUntil.current - performance.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    if (request !== selection.current) return;
    setSwitching(false);
    setFailed(false);
    clearTimeout(settling.current);
    const animate = motionEnabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOutgoing(animate ? visible : null);
    setVisible(url);
    setIndex(nextIndex);
    fadeUntil.current = animate ? performance.now() + FADE_MS + 20 : 0;
    if (animate) settling.current = setTimeout(() => setOutgoing(null), FADE_MS + 20);
  }
  useEffect(() => {
    let active = true;
    selection.current++;
    const initialSelection = selection.current;
    clearTimeout(settling.current);
    fadeUntil.current = 0;
    setOutgoing(null);
    setSwitching(false);
    setLoading(true);
    setFailed(false);
    const firstCover = latestCover.current;
    setIndex(0);
    setImages(firstCover ? [firstCover] : []);
    // The existing cover renders immediately. More angles never gate that photo.
    if (firstCover)
      void prepare(firstCover).then((ready) => {
        if (active && ready && selection.current === initialSelection)
          setVisible((current) =>
            photoIdentity(current) === photoIdentity(firstCover) ? current : firstCover,
          );
      });
    readProductPhotos(productId)
      .then(async (result) => {
        if (!active) return;
        const photos = [...result.images];
        let renewCover = false;
        if (firstCover) {
          if (photoIdentity(photos[0] ?? null) === photoIdentity(firstCover)) {
            if (decoded.current.has(firstCover)) photos[0] = firstCover;
            else renewCover = true;
          } else photos.unshift(firstCover);
        }
        if (!active) return;
        setImages(photos);
        let decodeFailed = false;
        if ((!firstCover || renewCover) && photos[0]) {
          const ready = await prepare(photos[0]);
          if (!active || selection.current !== initialSelection) return;
          if (ready) setVisible(photos[0]);
          else decodeFailed = true;
        }
        if (active) setFailed(!result.available || decodeFailed);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Numeric request counter intentionally invalidates pending work on cleanup.
      selection.current++;
      clearTimeout(settling.current);
    };
    // prepare coalesces through stable refs. Same-photo token changes deliberately
    // keep the selected angle; a real cover-path change revalidates this gallery.
  }, [productId, coverIdentity, attempt]);
  useEffect(() => {
    // Decode only the next angle, after the visible photo, so touch users do not
    // pay a cold image/decode wait on their first thumbnail tap.
    let active = true;
    const next = images[index + 1] ?? (index > 0 ? images[0] : null);
    if (visible && next)
      void prepare(visible).then((ready) => {
        if (active && ready) void prepare(next);
      });
    return () => {
      active = false;
    };
  }, [visible, images, index]);
  const layers = [
    ...(outgoing ? [{ url: outgoing, current: false }] : []),
    ...(visible ? [{ url: visible, current: true }] : []),
  ];
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
        {layers.map(({ url, current }) => (
          <img
            key={url}
            src={url}
            alt={current ? `${label} — view ${index + 1}` : ""}
            aria-hidden={current ? undefined : true}
            className={`${current ? "relative" : "absolute inset-0"} h-full w-full object-contain p-3 ${current ? (outgoing ? styles["incoming"] : "") : styles["outgoing"]}`}
            decoding="async"
            fetchPriority={current ? "high" : "low"}
            onLoad={() => decoded.current.add(url)}
            onError={() => {
              decoded.current.delete(url);
              if (current) setFailed(true);
            }}
          />
        ))}
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
              onPointerDown={() => {
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
                fetchPriority="low"
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
