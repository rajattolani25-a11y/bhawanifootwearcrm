import { inr } from "./modules.ts";
const line = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 160);
export function catalogProductLink(origin: string, productId: string, size?: string) {
  const link = new URL("/catalog", origin);
  link.searchParams.set("product", productId);
  if (size) link.searchParams.set("size", size);
  return link.toString();
}
export function catalogShareText({
  shop,
  brand,
  article,
  price,
  url,
  size,
  language = "english",
}: {
  shop: string;
  brand: string;
  article: string;
  price: number;
  url: string;
  size?: string;
  language?: string;
}) {
  const priceLabel = language === "hindi" ? "कीमत" : "Price";
  const sizeLabel = language === "hindi" ? "साइज़" : "Size";
  const linkLabel =
    language === "hindi"
      ? "यह प्रोडक्ट देखें"
      : language === "hinglish"
        ? "Yeh product dekhein"
        : "View this product";
  return [
    line(shop),
    line(`${brand} ${article}`),
    `${priceLabel}: ${inr(price)}${size ? ` · ${sizeLabel}: ${line(size)}` : ""}`,
    "",
    `${linkLabel}: ${url}`,
  ].join("\n");
}
