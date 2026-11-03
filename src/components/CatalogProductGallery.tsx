import { useEffect, useState } from "react";
import { getCatalogPhotos } from "@/lib/catalog.functions";
import { Button } from "./ui/button";

export function CatalogProductGallery({
  productId,
  cover,
  label,
  imageClassName,
}: {
  productId: string;
  cover: string | null;
  label: string;
  imageClassName?: string;
}) {
  const [images, setImages] = useState<string[]>(cover ? [cover] : []);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setIndex(0);
    setImages(cover ? [cover] : []);
    getCatalogPhotos({ data: { productId } })
      .then((result) => {
        if (!active) return;
        if (result.images.length) setImages(result.images);
        setFailed(!result.available);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId, cover, attempt]);
  return (
    <div className="space-y-2" aria-label="Product photo gallery">
      <div
        className={`relative aspect-square overflow-hidden rounded-lg bg-muted ${imageClassName ?? ""}`}
      >
        {images[index] && (
          <img
            src={images[index]}
            alt={`${label} — view ${index + 1}`}
            className="h-full w-full object-contain p-3"
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
              onClick={() => setIndex(i)}
              className={`h-16 w-16 shrink-0 rounded-md border-2 p-1 ${index === i ? "border-primary" : "border-transparent bg-muted"}`}
            >
              <img
                src={image}
                alt={`Angle ${i + 1}`}
                className="h-full w-full object-contain"
                loading="lazy"
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
