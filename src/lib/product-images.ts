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
  const paths = [...new Set(rows.map(row => row.image_url).filter((path): path is string => !!path))];
  const urls = new Map<string, string>();
  // Avoid one HTTP request per photograph when a large inventory loads.
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const image of data ?? []) if (image.path && image.signedUrl) urls.set(image.path, image.signedUrl);
  }
  return rows.map(row => ({ ...row, image_src: row.image_url ? urls.get(row.image_url) ?? null : null }));
}

/** Resize to max 1080px; preserve transparent cutouts for product/hero reuse. */
export async function compressImage(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, ext: file.name.split(".").pop()?.toLowerCase() || "jpg", type: file.type };
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! < 255) { transparent = true; break; }
  }
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, QUALITY));
  let blob = await encode("image/webp");
  let type = "image/webp", ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    type = transparent ? "image/png" : "image/jpeg"; ext = transparent ? "png" : "jpg";
    blob = await encode(type);
  }
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
