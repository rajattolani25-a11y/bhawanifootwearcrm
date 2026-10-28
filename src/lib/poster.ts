import type { Product } from "./stock";

export const POSTER_THEMES = [
  { id: "luxury", label: "Luxury Drop", color: "#191816", accent: "#dfc18b" },
  { id: "sale", label: "Bold Sale", color: "#b44823", accent: "#fff0d7" },
  { id: "editorial", label: "Clean Editorial", color: "#f4f0e7", accent: "#64735b" },
  { id: "collection", label: "Collection Grid", color: "#173c30", accent: "#dfc18b" },
  { id: "light", label: "Classic Light", color: "#f5f3ef", accent: "#d96838" },
  { id: "dark", label: "Classic Dark", color: "#171717", accent: "#d96838" },
] as const;
export type PosterTheme = (typeof POSTER_THEMES)[number]["id"];
export const POSTER_FIELDS = [
  { id: "store", label: "Store name" },
  { id: "tag", label: "Campaign label" },
  { id: "headline", label: "Design headline" },
  { id: "photo", label: "Product photo" },
  { id: "brand", label: "Brand" },
  { id: "article", label: "Article" },
  { id: "details", label: "Category & colour" },
  { id: "price", label: "Price" },
  { id: "sizes", label: "Available sizes" },
  { id: "phone", label: "Contact number" },
  { id: "visit", label: "Visit the store line" },
  { id: "offer", label: "Offer text" },
] as const;
export type PosterField = (typeof POSTER_FIELDS)[number]["id"];
export type PosterVisibility = Record<PosterField, boolean>;
export const DEFAULT_POSTER_VISIBILITY: PosterVisibility = {
  store: true,
  tag: true,
  headline: true,
  photo: true,
  brand: true,
  article: true,
  details: true,
  price: true,
  sizes: true,
  phone: true,
  visit: false,
  offer: true,
};
export type PosterPhoto = { transparent: boolean; width: number; height: number } | null;
export const posterSizes = (p: Product) =>
  [...new Set(p.product_variants.filter((v) => v.stock > 0).map((v) => v.size))].sort(
    (a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b),
  );

let fontsReady: Promise<unknown> | undefined;
function loadFonts() {
  // Reuse the existing self-hosted hero fonts. No remote font/image service.
  return (fontsReady ??= Promise.allSettled(
    [
      new FontFace("Poster Serif", 'url("/fonts/hero/bodoni-moda-latin-wght-normal.woff2")', {
        weight: "400 900",
      }),
      new FontFace("Poster Bold", 'url("/fonts/hero/barlow-condensed-latin-800-normal.woff2")', {
        weight: "800",
      }),
    ].map(async (font) => {
      document.fonts.add(await font.load());
    }),
  ));
}

async function loadPhoto(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = "";
      reject(new Error("Could not load product photo"));
    }, 15000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Could not load product photo"));
    };
    image.src = src;
  });
}

function photoInfo(image: HTMLImageElement | null): PosterPhoto {
  if (!image) return null;
  const probe = document.createElement("canvas");
  probe.width = 128;
  probe.height = 128;
  const context = probe.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, 128, 128);
  const pixels = context.getImageData(0, 0, 128, 128).data;
  let clear = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! < 240) clear++;
  return {
    transparent: clear > 128 * 128 * 0.01,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

/** Browser-only, read-only rendering: existing photo + current price/available sizes. */
export async function drawPoster(
  p: Product,
  shop: string,
  phone: string,
  tag: string,
  theme: PosterTheme,
  offer = "",
  visible: PosterVisibility = DEFAULT_POSTER_VISIBILITY,
) {
  const [image] = await Promise.all([loadPhoto(visible.photo ? p.image_src : null), loadFonts()]);
  const photo = photoInfo(image);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.textBaseline = "alphabetic";
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(p.selling_price);
  const sizes = posterSizes(p);
  const serif = '"Poster Serif", Georgia, serif',
    bold = '"Poster Bold", sans-serif',
    sans = "sans-serif";

  function box(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string | CanvasGradient,
    radius = 0,
  ) {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, radius);
    g.fill();
  }
  function text(
    value: string,
    x: number,
    y: number,
    max: number,
    size: number,
    color: string,
    family = sans,
    weight = 600,
    align: CanvasTextAlign = "left",
  ) {
    g.fillStyle = color;
    g.textAlign = align;
    g.font = `${weight} ${size}px ${family}`;
    while (g.measureText(value).width > max && size > 26) {
      size--;
      g.font = `${weight} ${size}px ${family}`;
    }
    // Canvas maxWidth is a final guard for unusually long, unbroken article names.
    g.fillText(value, x, y, max);
  }
  function line(x: number, y: number, w: number, color: string) {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.stroke();
  }
  function pill(value: string, y: number, color: string, wide = false) {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(wide ? 72 : 290, y, wide ? 936 : 500, 64, 32);
    g.stroke();
    text(value, 540, y + 44, wide ? 876 : 450, wide ? 40 : 29, color, sans, 600, "center");
  }
  function shoe(x: number, y: number, w: number, h: number, panel = false) {
    if (!visible.photo) return;
    if (panel || !photo?.transparent) box(x, y, w, h, "#f4f0e7", 28);
    if (!image) {
      text("ADD PRODUCT PHOTO", x + w / 2, y + h / 2, w - 60, 38, "#6c655a", sans, 600, "center");
      return;
    }
    const inset = panel || !photo?.transparent ? 20 : 0;
    const scale = Math.min(
      (w - inset * 2) / image.naturalWidth,
      (h - inset * 2) / image.naturalHeight,
    );
    const iw = image.naturalWidth * scale,
      ih = image.naturalHeight * scale;
    g.save();
    if (photo?.transparent) {
      g.shadowColor = "#00000035";
      g.shadowBlur = 25;
      g.shadowOffsetY = 24;
    }
    g.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    g.restore();
  }
  function detail(x: number, y: number, w: number, h: number, right: boolean) {
    if (!visible.photo) return;
    box(x, y, w, h, "#f4f0e7", 24);
    if (!image || !visible.photo) return;
    // Detail crops of this same photo, never invented products or camera angles.
    const sw = image.naturalWidth * 0.43,
      sh = image.naturalHeight * 0.65;
    const scale = Math.max((w - 24) / sw, (h - 24) / sh);
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, h, 24);
    g.clip();
    g.drawImage(
      image,
      image.naturalWidth * (right ? 0.43 : 0.02),
      image.naturalHeight * 0.25,
      sw,
      sh,
      x + (w - sw * scale) / 2,
      y + (h - sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    g.restore();
  }
  function identity(y: number, color: string, accent: string, centered = true) {
    const x = centered ? 540 : 72,
      align = centered ? "center" : "left";
    if (visible.brand) text(p.brand.toUpperCase(), x, y, 936, 30, accent, sans, 600, align);
    if (visible.article) text(p.article, x, y + 75, 936, 65, color, bold, 800, align);
    if (visible.details)
      text(
        [p.category, p.color].filter(Boolean).join(" / "),
        x,
        y + 122,
        936,
        29,
        color,
        sans,
        400,
        align,
      );
  }
  function footer(priceY: number, color: string, accent: string) {
    if (visible.price)
      text(money, 540, priceY, 936, theme === "collection" ? 90 : 112, color, serif, 600, "center");
    line(180, priceY + 40, 720, accent);
    if (visible.sizes)
      text(
        sizes.length ? `AVAILABLE SIZES  ${sizes.join("  /  ")}` : "CURRENTLY OUT OF STOCK",
        540,
        priceY + 103,
        936,
        34,
        color,
        sans,
        500,
        "center",
      );
    // Deliberately no “Message to check sizes” CTA or simulated clickable button.
    if (visible.visit)
      text("VISIT THE STORE", 540, priceY + 150, 936, 31, accent, sans, 600, "center");
    if (visible.phone && phone.trim())
      text(
        `WhatsApp / Call  ${phone.trim()}`,
        540,
        priceY + (visible.visit ? 200 : 180),
        936,
        34,
        color,
        sans,
        500,
        "center",
      );
  }
  const cream = "#f6eddb",
    gold = "#dfc18b",
    ink = "#1a261d";
  if (theme === "luxury") {
    box(0, 0, 1080, 1920, "#171715");
    const glow = g.createRadialGradient(540, 945, 10, 540, 945, 650);
    glow.addColorStop(0, "#b18d4c65");
    glow.addColorStop(1, "#17171500");
    box(0, 420, 1080, 920, glow);
    if (visible.store) text(shop.toUpperCase(), 540, 168, 936, 35, gold, sans, 600, "center");
    if (visible.tag) pill(tag, 220, gold);
    if (visible.headline) text("THE NEW", 540, 430, 936, 155, cream, serif, 600, "center");
    if (visible.headline) text("EVERYDAY.", 540, 588, 936, 155, gold, serif, 600, "center");
    g.strokeStyle = "#b8955c";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(540, 1135, 440, 58, 0, 0, Math.PI * 2);
    g.stroke();
    if (visible.offer && offer.trim())
      text(offer.trim(), 540, 642, 936, 34, gold, sans, 600, "center");
    shoe(60, 670, 960, 470);
    identity(1220, cream, gold);
    footer(1480, cream, gold);
  } else if (theme === "sale") {
    box(0, 0, 1080, 1920, "#b44823");
    if (visible.store) text(shop.toUpperCase(), 540, 168, 936, 35, cream, sans, 600, "center");
    if (visible.headline) text("FRESH", 72, 377, 936, 230, cream, bold, 800);
    if (visible.headline) text("PICKS.", 72, 580, 936, 230, "#351c13", bold, 800);
    g.fillStyle = cream;
    g.beginPath();
    g.moveTo(0, 1070);
    g.lineTo(1080, 640);
    g.lineTo(1080, 930);
    g.lineTo(0, 1360);
    g.closePath();
    g.fill();
    if (visible.tag) text(tag, 540, 635, 936, 30, cream, sans, 500, "center");
    if (visible.offer && offer.trim()) {
      box(72, 690, 936, 64, "#351c13", 32);
      pill(offer.trim(), 690, cream, true);
    }
    shoe(54, 790, 972, 475);
    identity(1330, cream, cream);
    footer(1580, cream, cream);
  } else if (theme === "editorial") {
    box(0, 0, 1080, 1920, "#f4f0e7");
    g.fillStyle = "#d8ddcb";
    g.beginPath();
    g.ellipse(980, 840, 420, 510, -0.3, 0, Math.PI * 2);
    g.fill();
    if (visible.store) text(shop.toUpperCase(), 540, 168, 936, 35, ink, sans, 600, "center");
    if (visible.tag) text(tag, 72, 275, 936, 30, "#56674e");
    if (visible.headline) text("Good shoes.", 72, 430, 936, 150, ink, serif, 600);
    if (visible.headline) text("Great days.", 72, 585, 936, 150, ink, serif, 600);
    if (visible.offer && offer.trim())
      text(offer.trim(), 540, 670, 936, 40, "#56674e", sans, 600, "center");
    shoe(60, 700, 960, 535);
    line(72, 1270, 936, "#738066");
    identity(1330, ink, "#56674e", false);
    footer(1580, ink, "#56674e");
  } else if (theme === "collection") {
    box(0, 0, 1080, 1920, "#173c30");
    if (visible.store) text(shop.toUpperCase(), 540, 168, 936, 35, gold, sans, 600, "center");
    if (visible.tag) text(tag, 540, 255, 936, 30, cream, sans, 500, "center");
    if (visible.offer && offer.trim())
      text(offer.trim(), 540, 305, 936, 30, gold, sans, 600, "center");
    if (visible.headline) text("FIND YOUR", 540, 430, 936, 132, cream, serif, 600, "center");
    if (visible.headline) text("NEXT PAIR.", 540, 565, 936, 132, gold, serif, 600, "center");
    box(72, 580, 936, 600, "#f4f0e7", 30);
    shoe(88, 595, 904, 390, true);
    if (visible.brand) text(p.brand.toUpperCase(), 540, 1033, 868, 27, ink, sans, 600, "center");
    if (visible.article) text(p.article, 540, 1104, 868, 58, ink, bold, 800, "center");
    if (visible.details)
      text(
        [p.category, p.color].filter(Boolean).join(" / "),
        540,
        1150,
        868,
        27,
        ink,
        sans,
        400,
        "center",
      );
    detail(72, 1210, 452, 228, false);
    detail(556, 1210, 452, 228, true);
    if (visible.photo) text("PRODUCT DETAIL", 298, 1482, 420, 25, cream, sans, 500, "center");
    if (visible.photo) text("PRODUCT DETAIL", 782, 1482, 420, 25, cream, sans, 500, "center");
    footer(1600, cream, gold);
  } else {
    const dark = theme === "dark",
      fg = dark ? cream : "#171717",
      accent = "#d96838";
    box(0, 0, 1080, 1920, dark ? "#171717" : "#f5f3ef");
    box(0, 0, 1080, 340, "#242424");
    if (visible.store) text(shop.toUpperCase(), 540, 168, 936, 46, "#ffffff", sans, 600, "center");
    if (visible.tag) text(tag, 540, 275, 936, 62, accent, bold, 800, "center");
    shoe(60, 385, 960, 690);
    if (visible.offer && offer.trim())
      text(offer.trim(), 540, 1140, 936, 34, accent, sans, 600, "center");
    identity(1190, fg, accent);
    footer(1470, fg, accent);
  }
  return { canvas, photo };
}

export function posterBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not export poster"))),
      "image/png",
    ),
  );
}
