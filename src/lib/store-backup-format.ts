// Portable, checksummed business backup. Auth passwords/sessions are never included.
export const BACKUP_FORMAT = "solestack-store-backup";
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const BUSINESS_TABLES = [
  "products",
  "product_costs",
  "product_variants",
  "customers",
  "suppliers",
  "coupons",
  "sales",
  "purchases",
  "sale_items",
  "sale_costs",
  "sale_item_costs",
  "sale_returns",
  "credit_payments",
  "loyalty_rewards",
  "loyalty_events",
  "supplier_payments",
  "stock_movements",
  "expenses",
  "coupon_redemptions",
  "catalog_bookings",
] as const;
export const BACKUP_TABLES = [
  ...BUSINESS_TABLES,
  "store_settings",
  "catalog_hero_settings",
  "catalog_presentation_settings",
];
export type ResetState = { installation_id: string; generation: string; reset_at: string | null };
export type BackupAsset = {
  bucket: "product-images" | "catalog-hero-images";
  path: string;
  updated_at?: string;
};
export type StoreSnapshot = {
  version: 2;
  state: ResetState;
  fingerprint: string;
  tables: Record<string, Record<string, unknown>[]>;
  assets: BackupAsset[];
  team: unknown;
  numbering: { next_bill: number };
};
export type BackupFile = BackupAsset & {
  mime: string;
  bytes: number;
  sha256: string;
  base64: string;
};
export type StoreBackup = {
  format: typeof BACKUP_FORMAT;
  version: 2;
  createdAt: string;
  snapshot: StoreSnapshot;
  files: BackupFile[];
  checksum: string;
};

export async function sha256(bytes: BufferSource) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function decodePhoto(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export async function sealBackup(body: Omit<StoreBackup, "checksum">): Promise<StoreBackup> {
  return { ...body, checksum: await sha256(new TextEncoder().encode(JSON.stringify(body))) };
}
export async function verifyBackup(raw: unknown): Promise<StoreBackup> {
  if (!raw || typeof raw !== "object") throw new Error("Not a SoleStack backup file.");
  const b = raw as StoreBackup;
  if (
    b.format !== BACKUP_FORMAT ||
    b.version !== 2 ||
    b.snapshot?.version !== 2 ||
    !Array.isArray(b.files)
  )
    throw new Error(
      "Use a verified version 2 business backup. Old exports cannot be restored here.",
    );
  if (
    !b.snapshot.state?.installation_id ||
    !b.snapshot.state.generation ||
    !b.snapshot.fingerprint ||
    !Number.isSafeInteger(b.snapshot.numbering?.next_bill) ||
    b.snapshot.numbering.next_bill < 1
  )
    throw new Error("Backup metadata is incomplete.");
  const tables = b.snapshot.tables;
  if (
    !tables ||
    Object.keys(tables).length !== BACKUP_TABLES.length ||
    BACKUP_TABLES.some((t) => !Array.isArray(tables[t]))
  )
    throw new Error("Backup table manifest is incomplete.");
  const { checksum, ...body } = b;
  if (checksum !== (await sha256(new TextEncoder().encode(JSON.stringify(body)))))
    throw new Error("Backup checksum failed. File is damaged or changed.");
  if (
    !Array.isArray(b.snapshot.assets) ||
    b.files.length !== b.snapshot.assets.length ||
    b.files.length > 10000
  )
    throw new Error("Backup photo manifest is incomplete.");
  const keys = new Set<string>();
  let total = 0;
  for (const asset of b.snapshot.assets) {
    const key = `${asset.bucket}/${asset.path}`;
    if (
      !["product-images", "catalog-hero-images"].includes(asset.bucket) ||
      !asset.path ||
      asset.path.length > 1024 ||
      keys.has(key)
    )
      throw new Error("Invalid or duplicate photo path.");
    keys.add(key);
  }
  for (const file of b.files) {
    if (
      !keys.delete(`${file.bucket}/${file.path}`) ||
      typeof file.base64 !== "string" ||
      file.base64.length > MAX_PHOTO_BYTES * 1.4
    )
      throw new Error("Invalid backup photo.");
    const bytes = decodePhoto(file.base64);
    total += bytes.byteLength;
    if (
      total > MAX_PHOTO_BYTES ||
      bytes.byteLength !== file.bytes ||
      (await sha256(bytes)) !== file.sha256
    )
      throw new Error("Photo verification failed or backup exceeds the 50 MB photo safety limit.");
  }
  return b;
}
export async function readBackupFile(file: File) {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error(
      "Backup exceeds the 100 MB browser safety limit. Use an administrator-managed backup.",
    );
  return verifyBackup(JSON.parse(await file.text()));
}

// Never clear auth/session storage. Language and device theme deliberately survive.
export function clearStoreDrafts(
  local: Pick<Storage, "removeItem">,
  session: Pick<Storage, "removeItem">,
) {
  local.removeItem("solestack-held-bills");
  local.removeItem("solestack-poster-campaigns-v1");
  session.removeItem("offer-seen");
}
