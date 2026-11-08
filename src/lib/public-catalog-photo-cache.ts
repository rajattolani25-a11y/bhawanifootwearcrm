import { SignedImageCache } from "./signed-image-cache.ts";

type Bucket = "product-images" | "catalog-hero-images";
type Signer = (paths: string[]) => Promise<Map<string, string>>;

/** URL strings only. Callers must first obtain allowed paths from fresh public RPCs. */
export class PublicCatalogPhotoCache {
  private buckets = new Map<Bucket, SignedImageCache>();
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  getMany(bucket: Bucket, paths: string[], sign: Signer) {
    let cache = this.buckets.get(bucket);
    if (!cache) {
      cache = new SignedImageCache(this.now, 2000);
      this.buckets.set(bucket, cache);
    }
    return cache.getMany(paths, sign);
  }
}

const scopes = new Map<string, PublicCatalogPhotoCache>();
/** Server handlers use their backend + publishable-key scope, never an owner session. */
export function publicCatalogPhotoCache(scope: string) {
  let cache = scopes.get(scope);
  if (!cache) {
    cache = new PublicCatalogPhotoCache();
    if (scopes.size >= 2) scopes.delete(scopes.keys().next().value!);
    scopes.set(scope, cache);
  }
  return cache;
}
