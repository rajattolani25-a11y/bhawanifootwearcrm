/** Public deal data only. Owner limits never belong in catalog responses or storage. */
export const DEAL_SECONDS = 180;
export const BID_LIMIT = 2;
export type BargainState = "counter" | "closer" | "held" | "accepted" | "final";
export type CatalogDeal = {
  id: string;
  product_id: string;
  variant_id: string;
  listed_price: number;
  price: number;
  offer: number;
  attempts: number;
  state: BargainState;
  heading: number;
  expires_at: string;
  server_now: string;
  duplicate?: boolean;
  duplicate_offer?: number;
  local_expires_at?: number;
};
export type BargainPolicy = {
  enabled: boolean;
  kind: "amount" | "percent";
  min_discount: number;
  max_discount: number;
  rounding: 5 | 10;
  revision: string | null;
};
export const DEFAULT_BARGAIN_POLICY: BargainPolicy = {
  enabled: false,
  kind: "amount",
  min_discount: 0,
  max_discount: 0,
  rounding: 5,
  revision: null,
};
export function dealSeconds(deal: CatalogDeal, now: number, offset = 0): number {
  return Math.max(
    0,
    Math.min(
      DEAL_SECONDS,
      Math.ceil(((deal.local_expires_at ?? Date.parse(deal.expires_at) - offset) - now) / 1000),
    ),
  );
}
export function validOffer(raw: string, price: number): number | null {
  const text = raw.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value < price ? value : null;
}
export function policyFloor(price: number, p: BargainPolicy): number {
  const max = p.kind === "percent" ? (price * p.max_discount) / 100 : p.max_discount;
  return Math.ceil((price - max) / p.rounding) * p.rounding;
}
export function policyError(price: number, p: BargainPolicy): string | null {
  if (!p.enabled) return null;
  if (
    ![price, p.min_discount, p.max_discount].every(Number.isFinite) ||
    price <= 0 ||
    p.min_discount < 0 ||
    p.max_discount <= 0 ||
    p.max_discount < p.min_discount ||
    ![5, 10].includes(p.rounding)
  )
    return "Enter a valid minimum and maximum discount.";
  if (p.kind === "percent" ? p.max_discount >= 100 : p.max_discount >= price)
    return "The maximum discount must leave a price above zero.";
  const min = p.kind === "percent" ? (price * p.min_discount) / 100 : p.min_discount;
  if (
    policyFloor(price, p) > Math.floor((price - min) / p.rounding) * p.rounding ||
    policyFloor(price, p) >= price
  )
    return "This range has no valid rounded bargain price. Widen the range or change rounding.";
  return null;
}
export const BARGAIN_HEADINGS: Record<BargainState, readonly string[]> = {
  counter: ["Here’s our counter.", "Let’s talk numbers.", "Here’s where we can start."],
  closer: ["We’ve moved a little too.", "A little closer.", "A better number for you."],
  held: ["Our counter still stands.", "Here’s where we stand.", "This is where we can meet."],
  accepted: ["Your offer works.", "We have a deal.", "Your offer. Accepted."],
  final: ["Our final counter.", "One last number.", "Here’s our closing offer."],
};
export const OWNER_BARGAIN_RULES = [
  "Bargaining is optional and applies only to this product colour.",
  "Choose your own discount range in rupees or percent. There is no universal 12% cap.",
  "Counters round to multiples of 5 or 10 without crossing your minimum allowed price.",
  "Customers get two different valid bids. Repeated or invalid amounts do not use a chance.",
  "Counters depend on the bid and previous negotiation. The final counter does not automatically use the maximum discount.",
  "Lowering a bid does not unlock a better counter. A counter already offered never increases in the same negotiation.",
  "Each new valid response lasts exactly three minutes. Accepting, adding to cart or refreshing never extends it.",
  "Place the order before the timer ends. Cart and bargaining do not reserve stock.",
  "A saved order keeps its agreed price. Payment remains pending under the existing order payment deadline.",
  "Additional coupons, festival discounts and reward redemptions cannot be combined with a bargain price.",
  "Quotes are checked again for the exact product, colour, size, current price, owner rules and available stock.",
  "Changing your limits invalidates unplaced deals. Existing saved orders and bills keep their prices.",
  "Two chances cannot be restarted by refreshing. Anonymous device switching cannot be fully prevented without verified customer identity.",
  "Headings match the actual negotiation. No fake buyers, fake owner replies or artificial waiting.",
] as const;

export function receivedDeal(deal: CatalogDeal, requestStarted = Date.now()): CatalogDeal {
  const duration = Math.max(
    0,
    Math.min(DEAL_SECONDS * 1000, Date.parse(deal.expires_at) - Date.parse(deal.server_now)),
  );
  return {
    ...deal,
    local_expires_at: Date.now() + Math.max(0, duration - (Date.now() - requestStarted)),
  };
}
