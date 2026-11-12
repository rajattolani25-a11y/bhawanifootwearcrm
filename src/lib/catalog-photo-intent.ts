import { getCatalogPhotos } from "./catalog.functions";
import { decodeImage } from "./decode-image";

// Share only an in-flight fresh public read. Never retain a gallery response,
// product, price or availability after the request finishes.
const pending = new Map<string, ReturnType<typeof getCatalogPhotos>>();
export function readProductPhotos(productId: string) {
  const existing = pending.get(productId);
  if (existing) return existing;
  const request = getCatalogPhotos({ data: { productId } });
  pending.set(productId, request);
  const clear = () => {
    if (pending.get(productId) === request) pending.delete(productId);
  };
  void request.then(clear, clear);
  return request;
}

export function warmProductPhotos(productId: string, cover: string | null) {
  if (cover) void decodeImage(cover);
  // Avoid speculative request storms when moving across a large product grid.
  if (pending.size >= 2 && !pending.has(productId)) return;
  void readProductPhotos(productId)
    .then((result) => {
      const next = result.images[1];
      if (next) void decodeImage(next);
    })
    .catch(() => {
      /* Opening retains its own retry/fallback. */
    });
}
