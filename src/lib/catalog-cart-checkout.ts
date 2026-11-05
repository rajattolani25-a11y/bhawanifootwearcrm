import type { Fulfillment, CatalogShop, BookingResult } from "./catalog.functions";
export const CART_PENDING_KEY = "solestack-catalog-checkout-pending-v1";
export const CART_PENDING_EVENT = "solestack-catalog-checkout-recovery";
export type CartOrderLine = {
  variantId: string;
  price: number;
  net: number;
  coupon: string;
  bargain?: { id: string; client: string };
};
export type CartCheckoutRequest = {
  requestId: string;
  items: CartOrderLine[];
  name: string;
  mobile: string;
  fulfillment: Fulfillment;
  address: string;
  area: string;
  quote: { net: number; charge: number; advance: number };
};
export type CartOrderItem = BookingResult & {
  variant_id: string;
  product_id: string;
  color: string | null;
  status: string;
  receipt_recorded: boolean;
  expires_at: string;
  history?: { status: string; at: string }[];
};
export type CartOrderResult = {
  cart_no: string;
  orders: CartOrderItem[];
  price: number;
  delivery_charge: number;
  advance: number;
  upi_id: string;
  shop: string;
  phone: string | null;
  hold_hours: number;
  server_now: string;
};
export function cartMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function cartAmounts(net: number, method: Fulfillment, shop: CatalogShop) {
  const charge =
    method === "pickup"
      ? 0
      : method === "local"
        ? shop.free_delivery_above != null && net >= shop.free_delivery_above
          ? 0
          : shop.local_charge
        : shop.outside_charge;
  return {
    net: cartMoney(net),
    charge: cartMoney(charge),
    advance:
      method === "pickup"
        ? Math.min(net, Math.ceil((net * Math.max(1, Math.min(100, shop.advance_percent))) / 100))
        : cartMoney(net + charge),
  };
}
export function readCartCheckout(): CartCheckoutRequest | null {
  const raw = localStorage.getItem(CART_PENDING_KEY);
  if (!raw) return null;
  const p = JSON.parse(raw) as CartCheckoutRequest;
  if (
    !p ||
    !/^[0-9a-f-]{36}$/i.test(p.requestId) ||
    !Array.isArray(p.items) ||
    p.items.length < 1 ||
    p.items.length > 30 ||
    typeof p.name !== "string" ||
    typeof p.mobile !== "string" ||
    !p.quote
  )
    throw Error(
      "The saved cart order could not be read. Contact the store before placing another order.",
    );
  return p;
}
export function saveCartCheckout(p: CartCheckoutRequest) {
  localStorage.setItem(CART_PENDING_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(CART_PENDING_EVENT));
}
export function clearCartCheckout() {
  try {
    localStorage.removeItem(CART_PENDING_KEY);
  } finally {
    window.dispatchEvent(new Event(CART_PENDING_EVENT));
  }
}
export function cartReference(bookingNo: string): string | null {
  return /^(CT-[0-9A-F]{16})-[0-9]{2}$/.exec(bookingNo)?.[1] ?? null;
}
