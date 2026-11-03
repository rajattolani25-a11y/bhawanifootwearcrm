export type StoreUsage = {
  db_bytes: number;
  photo_bytes: number;
  photos: number;
  products: number;
  variants: number;
  bills: number;
  customers: number;
  suppliers: number;
  stock_entries: number;
};
export type PhotoUsage = { photo_bytes: number; photos: number };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Storage measurement is unavailable. Refresh to retry.");
  return value as Record<string, unknown>;
}
function measurement(row: Record<string, unknown>, key: string): number {
  const raw = row[key];
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Storage measurement is incomplete. Refresh to retry.");
  return value;
}
export function parsePhotoUsage(value: unknown): PhotoUsage {
  const row = record(value);
  // Retain current_bytes for other subscribers to the shared hero usage cache.
  return {
    ...row,
    photo_bytes: measurement(row, "photo_bytes"),
    photos: measurement(row, "photos"),
  };
}
export function parseStoreUsage(value: unknown): StoreUsage {
  const row = record(value);
  return Object.fromEntries(
    [
      "db_bytes",
      "photo_bytes",
      "photos",
      "products",
      "variants",
      "bills",
      "customers",
      "suppliers",
      "stock_entries",
    ].map((key) => [key, measurement(row, key)]),
  ) as StoreUsage;
}

/** SI units: MB means 1,000,000 bytes; never label MiB values as MB. */
export function storageBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid byte count");
  if (bytes < 1000) return `${bytes} B`;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let index = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  let value = bytes / 1000 ** index;
  if (Math.round(value * 100) / 100 >= 1000 && index < units.length - 1) {
    index++;
    value = bytes / 1000 ** index;
  }
  return `${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${units[index]}`;
}

/** Unknown hero usage stays unknown, rather than masquerading as zero files. */
export function measuredPhotos(product: PhotoUsage, hero: PhotoUsage | null) {
  if (!hero) return { bytes: product.photo_bytes, count: product.photos, complete: false };
  const bytes = product.photo_bytes + hero.photo_bytes,
    count = product.photos + hero.photos;
  if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(count))
    throw new Error("Storage totals exceed supported precision");
  return { bytes, count, complete: true };
}
