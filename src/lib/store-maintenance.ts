import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { clearSignedImageCache } from "./signed-image-cache";
import {
  BACKUP_FORMAT,
  MAX_BACKUP_BYTES,
  MAX_PHOTO_BYTES,
  clearStoreDrafts,
  decodePhoto,
  sealBackup,
  sha256,
  type BackupFile,
  type ResetState,
  type StoreBackup,
  type StoreSnapshot,
} from "./store-backup-format";

export let maintenanceBusy = false;
export function setMaintenanceBusy(value: boolean) {
  maintenanceBusy = value;
}
export function maintenanceError(error: { message: string; code?: string }) {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? ""))
    return new Error(
      "Safe maintenance is unavailable. Apply migration 0025_safe_store_reset in Lovable, then reload. Reset is blocked until then.",
    );
  return new Error(error.message);
}
export async function readResetState(): Promise<ResetState> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const { data, error } = await supabase
      .from("store_reset_state")
      .select("installation_id,generation,reset_at")
      .eq("id", 1)
      .abortSignal(controller.signal)
      .single();
    if (error) throw maintenanceError(error);
    if (
      !data ||
      typeof data.installation_id !== "string" ||
      typeof data.generation !== "string" ||
      !(data.reset_at === null || typeof data.reset_at === "string")
    ) {
      throw new Error(
        "Invalid maintenance state. Reset is blocked until the backend support check succeeds.",
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export async function getStoreSnapshot(): Promise<StoreSnapshot> {
  const { data, error } = await supabase.rpc("store_backup_snapshot_v2");
  if (error) throw maintenanceError(error);
  if (!data || typeof data !== "object" || Array.isArray(data) || data["version"] !== 2)
    throw new Error("Invalid backup response.");
  return data as unknown as StoreSnapshot;
}
export async function createStoreBackup(progress: (message: string) => void): Promise<StoreBackup> {
  progress("Reading a consistent database snapshot…");
  const snapshot = await getStoreSnapshot();
  const files: BackupFile[] = [];
  let photoBytes = 0;
  if (new Blob([JSON.stringify(snapshot)]).size > MAX_BACKUP_BYTES / 3)
    throw new Error(
      "Store is too large for this browser backup. Use an administrator-managed database/storage backup.",
    );
  for (const asset of snapshot.assets) {
    progress(`Backing up photos: ${files.length + 1} / ${snapshot.assets.length}`);
    const { data, error } = await supabase.storage.from(asset.bucket).download(asset.path);
    if (error || !data)
      throw new Error(`Photo backup failed: ${asset.path}. ${error?.message ?? "Missing file"}`);
    photoBytes += data.size;
    if (photoBytes > MAX_PHOTO_BYTES)
      throw new Error(
        "Photos exceed the 50 MB browser backup limit. Reset is blocked; use an administrator-managed backup.",
      );
    const bytes = new Uint8Array(await data.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    files.push({
      ...asset,
      bytes: data.size,
      mime: data.type || "application/octet-stream",
      sha256: await sha256(bytes),
      base64: btoa(binary),
    });
  }
  if ((await getStoreSnapshot()).fingerprint !== snapshot.fingerprint)
    throw new Error("Store changed while backing up. Retry when billing and editing are paused.");
  progress("Verifying backup…");
  const backup = await sealBackup({
    format: BACKUP_FORMAT,
    version: 2,
    createdAt: new Date().toISOString(),
    snapshot,
    files,
  });
  if (new Blob([JSON.stringify(backup)]).size > MAX_BACKUP_BYTES)
    throw new Error("Backup exceeds the 100 MB browser safety limit. Reset remains blocked.");
  return backup;
}
export async function pendingCleanupCount() {
  const { count, error } = await supabase
    .from("store_file_cleanup")
    .select("path", { count: "exact", head: true });
  if (error) throw maintenanceError(error);
  if (count === null)
    throw new Error("Could not verify pending photo count. Retry the support check.");
  return count;
}
export async function cleanupStoreFiles(progress: (message: string) => void) {
  // Durable manifest is server-owned; never accept arbitrary paths from device storage.
  let removed = 0;
  for (let batch = 0; batch < 200; batch++) {
    const { data, error } = await supabase
      .from("store_file_cleanup")
      .select("bucket,path")
      .order("bucket")
      .order("path")
      .limit(50);
    if (error) throw maintenanceError(error);
    if (!data?.length) return;
    for (const bucket of ["product-images", "catalog-hero-images"]) {
      const paths = data.filter((r) => r.bucket === bucket).map((r) => r.path);
      if (!paths.length) continue;
      progress(`Removing old photos… ${removed} completed`);
      const result = await supabase.storage.from(bucket).remove(paths);
      if (result.error)
        throw new Error(
          `Photo cleanup pending: ${result.error.message}. Retry cleanup; business rows have already been reset.`,
        );
      const ack = await supabase.rpc("ack_store_file_cleanup", { _bucket: bucket, _paths: paths });
      if (ack.error) throw maintenanceError(ack.error);
      const { count, error: checkError } = await supabase
        .from("store_file_cleanup")
        .select("path", { count: "exact", head: true })
        .eq("bucket", bucket)
        .in("path", paths);
      if (checkError) throw maintenanceError(checkError);
      if (count === null)
        throw new Error("Could not verify photo cleanup. Retry before continuing.");
      if (count)
        throw new Error(
          "Some photos are still present. Cleanup is pending; retry from Data & backup.",
        );
      removed += paths.length;
    }
  }
  throw new Error("More photos remain. Continue cleanup to finish.");
}
export function rememberReset(state: ResetState) {
  clearSignedImageCache();
  let deviceCleared = true;
  try {
    clearStoreDrafts(localStorage, sessionStorage);
  } catch {
    deviceCleared = false;
  }
  try {
    localStorage.setItem(`solestack-reset-generation:${state.installation_id}`, state.generation);
  } catch {
    deviceCleared = false;
  }
  window.dispatchEvent(new Event("solestack-store-reset"));
  return deviceCleared;
}
export async function restoreStoreBackup(backup: StoreBackup, progress: (message: string) => void) {
  const state = await readResetState();
  if (state.installation_id !== backup.snapshot.state.installation_id)
    throw new Error("This backup belongs to another backend. Cross-shop restore is blocked.");
  const snapshot = await getStoreSnapshot();
  if (
    Object.entries(snapshot.tables).some(
      ([t, rows]) =>
        !["store_settings", "catalog_hero_settings", "catalog_presentation_settings"].includes(t) &&
        rows.length,
    )
  )
    throw new Error(
      "Restore requires an empty store. Existing data will never be merged or overwritten.",
    );
  if (await pendingCleanupCount())
    throw new Error("Finish pending photo cleanup before starting a restore.");
  const stage = await supabase.rpc("stage_store_restore_files", {
    _assets: backup.snapshot.assets as unknown as Json,
  });
  if (stage.error) throw maintenanceError(stage.error);
  for (let i = 0; i < backup.files.length; i++) {
    const file = backup.files[i]!;
    progress(`Restoring photos: ${i + 1} / ${backup.files.length}`);
    const bytes = decodePhoto(file.base64);
    const existing = await supabase.storage.from(file.bucket).download(file.path);
    if (existing.data) {
      if ((await sha256(await existing.data.arrayBuffer())) !== file.sha256)
        throw new Error(
          "An existing photo differs from this backup. Restore stopped; no photo was overwritten.",
        );
      continue;
    }
    const { error } = await supabase.storage
      .from(file.bucket)
      .upload(file.path, new Blob([bytes], { type: file.mime }), {
        upsert: false,
        contentType: file.mime,
      });
    if (error)
      throw new Error(
        `Restore upload failed: ${error.message}. Retry photo cleanup before trying restore again.`,
      );
  }
  progress("Restoring database rows in one transaction…");
  const { error } = await supabase.rpc("restore_store_backup_v2", {
    _confirmation: "RESTORE",
    _snapshot: backup.snapshot as unknown as Json,
  });
  if (error) throw maintenanceError(error);
  return rememberReset(await readResetState());
}
