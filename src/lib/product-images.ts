import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";
export const MAX_PHOTO_MB = 5;
const MAX_SIDE = 1080;
const QUALITY = 0.85; // never below 0.82 so shoes stay sharp

export async function signedProductImage(path?: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function addSignedImages<T extends { image_url?: string | null }>(rows: T[]) {
  return Promise.all(rows.map(async (row) => ({ ...row, image_src: await signedProductImage(row.image_url) })));
}

/** Resize to max 1080px and re-encode as WebP (JPEG fallback) on the device before upload. */
export async function compressImage(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, ext: file.name.split(".").pop()?.toLowerCase() || "jpg", type: file.type };
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, QUALITY));
  let blob = await encode("image/webp");
  let type = "image/webp", ext = "webp";
  if (!blob || blob.type !== "image/webp") { blob = await encode("image/jpeg"); type = "image/jpeg"; ext = "jpg"; }
  if (!blob || blob.size >= file.size) return { blob: file, ext: file.name.split(".").pop()?.toLowerCase() || "jpg", type: file.type };
  return { blob, ext, type };
}

export async function uploadProductImage(productId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) throw new Error(`Photo must be under ${MAX_PHOTO_MB} MB`);
  const { blob, ext, type } = await compressImage(file);
  const path = `${productId}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/g, "") || "jpg"}`;
  const { data: old } = await supabase.from("products").select("image_url").eq("id", productId).maybeSingle();
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  const { error: updateError } = await supabase.from("products").update({ image_url: path }).eq("id", productId);
  if (updateError) throw updateError;
  if (old?.image_url && old.image_url !== path) await supabase.storage.from(BUCKET).remove([old.image_url]);
  return { path, size: blob.size };
}
