import { compressPromotionPhoto } from "./promotion-images";

/** One bounded poster plus a small entry preview. Never stores file data in the database. */
export async function compressShowcasePoster(file: File) {
  const full = await compressPromotionPhoto(file);
  const bitmap = await createImageBitmap(full.blob);
  try {
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Photo compression is unavailable in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.76, 0.68]) {
      const thumbnail = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (thumbnail?.type === "image/webp" && thumbnail.size <= 40960)
        return { ...full, thumbnail };
    }
    throw Error("Could not compress the poster preview. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}
