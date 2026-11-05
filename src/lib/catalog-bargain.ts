/** Public deal data only. Owner limits never belong in catalog responses or storage. */
export const DEAL_SECONDS = 180;
export const BID_LIMIT = 4;
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
  invalidated?: boolean;
  duplicate?: boolean;
  duplicate_offer?: number;
  local_expires_at?: number;
  retry_at?: string | null;
  local_retry_at?: number;
  order_placed?: boolean;
  cooldown_supported?: boolean;
  bid_limit?: number;
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
/** Older RPCs serialize an absent composite row as an object of null fields. */
export function readBargainPolicy(raw: unknown): BargainPolicy {
  if (raw === null || raw === undefined) return { ...DEFAULT_BARGAIN_POLICY };
  if (typeof raw !== "object" || Array.isArray(raw))
    throw Error("Bargaining settings could not be read. Reload before editing.");
  const r = raw as Record<string, unknown>;
  if (
    ["enabled", "kind", "min_discount", "max_discount", "rounding", "revision"].every(
      (key) => r[key] === null || r[key] === undefined,
    )
  )
    return { ...DEFAULT_BARGAIN_POLICY };
  const lo = Number(r["min_discount"]),
    hi = Number(r["max_discount"]),
    step = Number(r["rounding"]);
  if (
    typeof r["enabled"] !== "boolean" ||
    !["amount", "percent"].includes(String(r["kind"])) ||
    r["min_discount"] === null ||
    r["max_discount"] === null ||
    !Number.isFinite(lo) ||
    !Number.isFinite(hi) ||
    ![5, 10].includes(step) ||
    !(r["revision"] === null || typeof r["revision"] === "string")
  )
    throw Error("Bargaining settings could not be read. Reload before editing.");
  return {
    enabled: r["enabled"],
    kind: r["kind"] as "amount" | "percent",
    min_discount: lo,
    max_discount: hi,
    rounding: step as 5 | 10,
    revision: r["revision"] as string | null,
  };
}
export function dealSeconds(deal: CatalogDeal, now: number, offset = 0): number {
  if (deal.invalidated) return 0;
  return Math.max(
    0,
    Math.min(
      DEAL_SECONDS,
      Math.ceil(((deal.local_expires_at ?? Date.parse(deal.expires_at) - offset) - now) / 1000),
    ),
  );
}
export function bargainRetrySeconds(deal: CatalogDeal | null, now: number): number {
  if (!deal?.cooldown_supported || !deal.retry_at || deal.order_placed) return 0;
  const deadline = deal.local_retry_at ?? Date.parse(deal.retry_at);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}
export function firstOfferMinimum(listedPrice: number): number {
  return Math.ceil(listedPrice * 0.75);
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
  if (!["amount", "percent"].includes(p.kind)) return "Enter a valid minimum and maximum discount.";
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
  "The first bid in each new negotiation must be at least 75% of the current listed price, rounded up to a whole rupee. Owner discount limits still decide the counter.",
  "Customers get four different valid bids. The fourth response is final unless a price is agreed earlier. Repeated or invalid amounts do not use a chance.",
  "Counters depend on the bid and previous negotiation. The final counter does not automatically use the maximum discount.",
  "Lowering a bid does not unlock a better counter. A counter already offered never increases in the same negotiation.",
  "Each new valid response lasts exactly three minutes. Accepting, adding to cart or refreshing never extends it.",
  "Place the order before the timer ends. Cart and bargaining do not reserve stock.",
  "A saved order keeps its agreed price. Payment remains pending under the existing order payment deadline.",
  "Additional coupons, festival discounts and reward redemptions cannot be combined with a bargain price.",
  "Quotes are checked again for the exact product, colour, size, current price, owner rules and available stock.",
  "Changing your limits invalidates unplaced deals. Existing saved orders and bills keep their prices.",
  "After the final or accepted quote expires, a new round opens after a 30-minute cooldown. There is no daily round limit. Unused bids remain available.",
  "Bids cannot be restarted by refreshing. Anonymous device switching cannot be fully prevented without verified customer identity.",
  "Headings match the actual negotiation. No fake buyers, fake owner replies or artificial waiting.",
] as const;

export function receivedDeal(deal: CatalogDeal, requestStarted = Date.now()): CatalogDeal {
  const duration = Math.max(
    0,
    Math.min(DEAL_SECONDS * 1000, Date.parse(deal.expires_at) - Date.parse(deal.server_now)),
  );
  return {
    ...deal,
    ...(deal.retry_at && Number.isFinite(Date.parse(deal.retry_at))
      ? {
          local_retry_at:
            Date.now() +
            Math.max(
              0,
              Date.parse(deal.retry_at) -
                Date.parse(deal.server_now) -
                (Date.now() - requestStarted),
            ),
        }
      : {}),
    local_expires_at: Date.now() + Math.max(0, duration - (Date.now() - requestStarted)),
  };
}
