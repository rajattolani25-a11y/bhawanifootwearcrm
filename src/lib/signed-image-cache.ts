type Signer = (paths: string[]) => Promise<Map<string, string>>;

/** Memory-only, bounded URL cache. Never stores files or persists credentials. */
export class SignedImageCache {
  private urls = new Map<string, { url: string; until: number }>();
  private pending = new Map<string, Promise<string | null>>();
  private epoch = 0;
  private now: () => number;
  private capacity: number;
  constructor(now = () => Date.now(), capacity = 5000) {
    this.now = now;
    this.capacity = capacity;
  }
  clear() {
    this.epoch++;
    this.urls.clear();
    this.pending.clear();
  }
  async getMany(paths: string[], sign: Signer) {
    const epoch = this.epoch,
      unique = [...new Set(paths)];
    const waiting = new Map<string, Promise<string | null>>();
    const missing: {
      path: string;
      resolve: (url: string | null) => void;
      promise: Promise<string | null>;
    }[] = [];
    for (const path of unique) {
      const cached = this.urls.get(path);
      if (cached && cached.until > this.now()) {
        waiting.set(path, Promise.resolve(cached.url));
        continue;
      }
      this.urls.delete(path);
      const pending = this.pending.get(path);
      if (pending) {
        waiting.set(path, pending);
        continue;
      }
      let resolve!: (url: string | null) => void;
      const promise = new Promise<string | null>((done) => {
        resolve = done;
      });
      this.pending.set(path, promise);
      waiting.set(path, promise);
      missing.push({ path, resolve, promise });
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const start = cursor;
        cursor += 100;
        const chunk = missing.slice(start, cursor),
          started = this.now();
        let signed = new Map<string, string>();
        if (epoch === this.epoch) {
          try {
            signed = await sign(chunk.map((row) => row.path));
          } catch {
            /* Failed URLs are retried next time. */
          }
        }
        for (const row of chunk) {
          const url = epoch === this.epoch ? (signed.get(row.path) ?? null) : null;
          if (url) {
            // URLs last one hour; renew at 55 minutes, including request latency.
            this.urls.set(row.path, { url, until: started + 55 * 60_000 });
            while (this.urls.size > this.capacity) this.urls.delete(this.urls.keys().next().value!);
          }
          if (this.pending.get(row.path) === row.promise) this.pending.delete(row.path);
          row.resolve(url);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, Math.ceil(missing.length / 100)) }, worker));
    const result = new Map<string, string>();
    for (const [path, pending] of waiting) {
      const url = await pending;
      if (url && epoch === this.epoch) result.set(path, url);
    }
    return result;
  }
}

const browserImages = new SignedImageCache();
export const clearSignedImageCache = () => browserImages.clear();
export const productImageCache = () =>
  typeof window === "undefined" ? new SignedImageCache() : browserImages;
