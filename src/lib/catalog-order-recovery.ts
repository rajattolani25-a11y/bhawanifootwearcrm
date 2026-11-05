import type { CatalogProduct, Fulfillment } from "./catalog.functions";
export const CATALOG_ORDER_KEY = "solestack-catalog-order-pending-v1";
export const CATALOG_ORDER_EVENT = "solestack-catalog-order-recovery";
export type OrderRequest = {
  variantId: string;
  bargain?: { id: string; client: string };
  name: string;
  mobile: string;
  fulfillment: Fulfillment;
  address: string;
  area: string;
  coupon: string;
  requestId: string;
  quote: { price: number; net: number; charge: number; advance: number };
};
export type PendingCatalogOrder = { product: CatalogProduct; data: OrderRequest };
export function readCatalogOrder(): PendingCatalogOrder | null {
  const raw = sessionStorage.getItem(CATALOG_ORDER_KEY);
  if (!raw) return null;
  const p = JSON.parse(raw) as PendingCatalogOrder;
  if (
    !p ||
    !p.product ||
    typeof p.product.id !== "string" ||
    !Array.isArray(p.product.sizes) ||
    !p.data ||
    !/^[0-9a-f-]{36}$/i.test(p.data.requestId) ||
    typeof p.data.variantId !== "string" ||
    typeof p.data.name !== "string" ||
    typeof p.data.mobile !== "string" ||
    !p.data.quote
  )
    throw new Error(
      "The saved order could not be read. Contact the store before placing another order.",
    );
  return p;
}
export function saveCatalogOrder(p: PendingCatalogOrder) {
  sessionStorage.setItem(CATALOG_ORDER_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(CATALOG_ORDER_EVENT));
}
export function clearCatalogOrder() {
  try {
    sessionStorage.removeItem(CATALOG_ORDER_KEY);
  } finally {
    window.dispatchEvent(new Event(CATALOG_ORDER_EVENT));
  }
}
