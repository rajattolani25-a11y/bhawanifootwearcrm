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
  const shopName = line(shop);
  const productName = line(`${brand} ${article}`);
  const selectedSize = size ? line(size) : "";
  const introduction =
    language === "hindi"
      ? `*${shopName}* का यह फुटवियर देखें।`
      : language === "hinglish"
        ? `*${shopName}* ka yeh pair dekhiye.`
        : `Take a look at this pair from *${shopName}*.`;
  const priceLabel = language === "hindi" ? "कीमत" : "Price";
  const sizeLabel = language === "hindi" ? "साइज़" : "Size";
  const linkLabel =
    language === "hindi"
      ? "फोटो, उपलब्ध साइज़ और प्रोडक्ट की जानकारी देखें:"
      : language === "hinglish"
        ? "Photos, available sizes aur product details dekhein:"
        : "View photos, available sizes and product details:";
  return [
    introduction,
    "",
    `*${productName}*`,
    `${priceLabel}: ${inr(price)}`,
    ...(selectedSize ? [`${sizeLabel}: ${selectedSize}`] : []),
    "",
    linkLabel,
    url,
  ].join("\n");
}
