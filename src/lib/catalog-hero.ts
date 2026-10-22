export const HERO_BUCKET = "catalog-hero-images";
export const HERO_DEFAULTS = {
  enabled: false,
  image_path: null as string | null,
  offer_kind: "up-to" as "up-to" | "percent" | "amount" | "starting" | "custom",
  offer_value: 40,
  custom_text: "New collection",
  heading: "Fresh pairs. Better prices.",
  subtitle: "On selected footwear · Terms apply",
  button_label: "Shop offers",
  action: "collection" as "collection" | "product" | "category" | "whatsapp",
  product_id: null as string | null,
  category: "All",
  motion: true,
  image_scale: 90,
};
export type HeroSettings = typeof HERO_DEFAULTS;
export type PublicHero = Omit<HeroSettings, "enabled" | "image_path"> & { image: string };

export function heroOfferText(
  hero: Pick<HeroSettings, "offer_kind" | "offer_value" | "custom_text">,
) {
  const amount =
    Number.isFinite(hero.offer_value) && hero.offer_value > 0
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(hero.offer_value)
      : "—";
  switch (hero.offer_kind) {
    case "up-to":
      return `UP TO ${amount}% OFF`;
    case "percent":
      return `FLAT ${amount}% OFF`;
    case "amount":
      return `FLAT ₹${amount} OFF`;
    case "starting":
      return `FROM ₹${amount}`;
    case "custom":
      return hero.custom_text;
  }
}

export function validateHero(hero: HeroSettings) {
  if (!hero.heading.trim()) return "Enter a heading.";
  if (!hero.button_label.trim()) return "Enter a button label.";
  if (!hero.custom_text.trim()) return "Enter custom offer text.";
  if (!Number.isFinite(hero.offer_value) || hero.offer_value <= 0 || hero.offer_value > 1000000)
    return "Enter an offer value between 0.01 and 10,00,000.";
  if (["up-to", "percent"].includes(hero.offer_kind) && hero.offer_value > 100)
    return "Percentage cannot exceed 100.";
  if (hero.action === "product" && !hero.product_id)
    return "Choose a catalog product for the button.";
  return null;
}

/** Decode and verify actual alpha; MIME/extension alone do not prove transparency. */
export async function prepareHeroImage(file: File): Promise<Blob> {
  if (!["image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a transparent PNG or WebP. JPG does not support transparency.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Could not read this image.");
  });
  try {
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("Resize the image to around 1200 × 1200 pixels first.");
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Image preview is unavailable in this browser.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0,
      visible = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i]! < 16) transparent++;
      if (pixels[i]! > 240) visible++;
    }
    if (transparent / (pixels.length / 4) < 0.05)
      throw new Error(
        "Background is not sufficiently transparent. Remove it and export a transparent PNG/WebP first.",
      );
    if (visible / (pixels.length / 4) < 0.01)
      throw new Error("The product is barely visible. Choose a clear product cutout.");
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    const blob = (await encode("image/webp")) ?? (await encode("image/png"));
    if (!blob || blob.size > 5 * 1024 * 1024)
      throw new Error("Could not prepare an image under 5 MB. Resize it and try again.");
    // Do not enlarge an already small transparent PNG/WebP just to change format.
    return scale === 1 && file.size < blob.size ? file : blob;
  } finally {
    bitmap.close();
  }
}
