import { PROMO_MAX_BYTES } from "./catalog-promotion";

/** Local-only compression. No Supabase bucket, base64 DB value or localStorage binary. */
export async function compressPromotionPhoto(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Choose a JPG, PNG or WebP poster under 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap)
    throw Error("This image could not be read. Export it as JPG, PNG or WebP and try again.");
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw Error("Image is too large. Export it at up to 1600 px on the longest side.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)),
      height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Photo compression is unavailable in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (file.type === "image/webp" && scale === 1 && file.size <= PROMO_MAX_BYTES)
      return { blob: file, width, height };
    let supportsWebP = false;
    // Do not reduce resolution again or silently wreck small poster lettering.
    for (const quality of [0.9, 0.86, 0.82]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob?.type === "image/webp") supportsWebP = true;
      if (blob?.type === "image/webp" && blob.size <= PROMO_MAX_BYTES)
        return { blob, width, height };
    }
    if (!supportsWebP)
      throw Error("This browser cannot compress the poster to WebP. Try Chrome or Edge.");
    throw Error(
      "Poster is still over 700 KB after compression. Simplify the artwork or export a smaller image.",
    );
  } finally {
    bitmap.close();
  }
}
