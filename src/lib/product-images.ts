import { supabase } from "@/integrations/supabase/client";
import { productImageCache } from "./signed-image-cache";

const BUCKET = "product-images";
export const MAX_PHOTO_MB = 5;
const MAX_SIDE = 1080;
const QUALITY = 0.85; // never below 0.82 so shoes stay sharp

export async function signedProductImage(path?: string | null) {
  if (!path) return null;
  return (await productUrls([path])).get(path) ?? null;
}

export async function productUrls(paths: string[]) {
  return productImageCache().getMany(paths, async (batch) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(batch, 3600);
    return new Map(
      (data ?? [])
        .filter((row) => row.path && row.signedUrl)
        .map((row) => [row.path!, row.signedUrl!]),
    );
  });
}

export async function addSignedImages<T extends { image_url?: string | null }>(rows: T[]) {
  const paths = [
    ...new Set(rows.map((row) => row.image_url).filter((path): path is string => !!path)),
  ];
  const urls = await productUrls(paths);
  return rows.map((row) => ({
    ...row,
    image_src: row.image_url ? (urls.get(row.image_url) ?? null) : null,
  }));
}

/** Resize to max 1080px; preserve transparent cutouts for product/hero reuse. */
export async function compressImage(
  file: File,
): Promise<{ blob: Blob; ext: string; type: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap)
    return { blob: file, ext: file.name.split(".").pop()?.toLowerCase() || "jpg", type: file.type };
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale),
    h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let transparent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! < 255) {
      transparent = true;
      break;
    }
  }
  const encode = (type: string) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, type, QUALITY));
  let blob = await encode("image/webp");
  let type = "image/webp",
    ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    type = transparent ? "image/png" : "image/jpeg";
    ext = transparent ? "png" : "jpg";
    blob = await encode(type);
  }
  if (!blob || blob.size >= file.size)
    return { blob: file, ext: file.name.split(".").pop()?.toLowerCase() || "jpg", type: file.type };
  return { blob, ext, type };
}

export const MAX_PRODUCT_PHOTOS = 8;

export function validateProductPhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP photo");
  if (file.size > MAX_PHOTO_MB * 1024 * 1024)
    throw new Error(`Photo must be under ${MAX_PHOTO_MB} MB`);
}

export async function listProductPhotos(productId: string, cover: string | null) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(productId, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const row of data ?? []) if (row.id) paths.push(`${productId}/${row.name}`);
    if ((data?.length ?? 0) < 100) break;
  }
  return [...new Set([...(cover ? [cover] : []), ...paths])];
}

export async function readProductCover(productId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("image_url")
    .eq("id", productId)
    .single();
  if (error) throw error;
  return data.image_url;
}

export async function setProductCover(
  productId: string,
  path: string | null,
  previous: string | null,
) {
  let query = supabase.from("products").update({ image_url: path }).eq("id", productId);
  query = previous === null ? query.is("image_url", null) : query.eq("image_url", previous);
  const { error } = await query.select("id").single();
  if (error)
    throw new Error("Photo changed elsewhere or save was denied. Reload photos and try again.");
}

export async function removeProductFiles(paths: string[]) {
  if (!paths.length) return;
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
  if ((data?.length ?? 0) !== paths.length)
    throw new Error("Some photos could not be deleted. Reload and retry.");
}

/** Gallery additions never delete the previous cover. No new schema or public access. */
export async function addProductPhoto(productId: string, file: File) {
  validateProductPhoto(file);
  const cover = await readProductCover(productId);
  if ((await listProductPhotos(productId, cover)).length >= MAX_PRODUCT_PHOTOS)
    throw new Error(`Maximum ${MAX_PRODUCT_PHOTOS} photos per product`);
  const { path, size } = await uploadPhotoFile(productId, file);
  if (!cover) {
    try {
      await setProductCover(productId, path, null);
    } catch (error) {
      await removeProductFiles([path]).catch(() => undefined);
      throw error;
    }
  }
  return { path, size };
}

async function uploadPhotoFile(productId: string, file: File) {
  validateProductPhoto(file);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("This photo could not be read. Choose another JPG, PNG or WebP.");
  bitmap.close();
  const { blob, ext, type } = await compressImage(file);
  const path = `${productId}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/g, "") || "jpg"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  return { path, size: blob.size };
}

export async function replaceProductPhoto(productId: string, oldPath: string, file: File) {
  const cover = await readProductCover(productId);
  const uploaded = await uploadPhotoFile(productId, file);
  if (cover === oldPath) {
    try {
      await setProductCover(productId, uploaded.path, oldPath);
    } catch (error) {
      await removeProductFiles([uploaded.path]).catch(() => undefined);
      throw error;
    }
  }
  await removeProductFiles([oldPath]);
  return uploaded;
}

export async function deleteProductPhoto(productId: string, path: string) {
  const cover = await readProductCover(productId);
  if (cover === path) {
    const others = (await listProductPhotos(productId, cover)).filter((p) => p !== path);
    await setProductCover(productId, others[0] ?? null, cover);
  }
  await removeProductFiles([path]);
}

/** Compatibility for callers that intentionally replace just the cover. */
export async function uploadProductImage(productId: string, file: File) {
  const cover = await readProductCover(productId);
  return cover ? replaceProductPhoto(productId, cover, file) : addProductPhoto(productId, file);
}
