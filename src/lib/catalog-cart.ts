import type { CatalogDeal } from "./catalog-bargain";
import type { CatalogProduct } from "./catalog.functions";
export const CART_KEY = "solestack-catalog-cart-v1";
export const CART_EVENT = "solestack-catalog-cart-change";
export const LAST_DEAL_KEY = "solestack-catalog-last-deal-v1";
export const CUSTOMER_KEY = "solestack-catalog-bargain-client-v1";
export type CatalogCartItem = {
  productId: string;
  variantId: string;
  deal?: CatalogDeal;
  reviewBargain?: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readCart(): CatalogCartItem[] {
  const raw: unknown = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
  if (!Array.isArray(raw) || raw.length > 30)
    throw Error("Your cart could not be read. Please clear it before continuing.");
  return raw.map((item: CatalogCartItem) => {
    if (!item || !uuid.test(item.productId) || !uuid.test(item.variantId))
      throw Error("Your cart could not be read. Please clear it before continuing.");
    const d = item.deal;
    return {
      productId: item.productId,
      variantId: item.variantId,
      ...(d &&
      uuid.test(d.id) &&
      d.product_id === item.productId &&
      d.variant_id === item.variantId &&
      Number.isFinite(d.price) &&
      d.price > 0 &&
      Number.isFinite(Date.parse(d.expires_at))
        ? { deal: d }
        : {}),
    };
  });
}
export function writeCart(items: CatalogCartItem[]) {
  if (items.length > 30) throw Error("Your cart can hold up to 30 pairs.");
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}
export function addToCart(item: CatalogCartItem) {
  const items = readCart();
  const index = items.findIndex((x) => x.variantId === item.variantId);
  if (index === -1) items.push(item);
  else items[index] = item;
  writeCart(items);
}
export function removeFromCart(variantId: string) {
  writeCart(readCart().filter((item) => item.variantId !== variantId));
}
export function bargainClient(): string {
  const old = localStorage.getItem(CUSTOMER_KEY);
  if (old && uuid.test(old)) return old;
  const id = crypto.randomUUID();
  localStorage.setItem(CUSTOMER_KEY, id);
  return id;
}
export function cartSelection(item: CatalogCartItem, products: CatalogProduct[]) {
  const product = products.find((p) => p.id === item.productId);
  const variant = product?.sizes.find((s) => s.id === item.variantId);
  return { product, variant, available: !!variant?.available };
}
