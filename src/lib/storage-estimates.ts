export const ESTIMATE_LIMITS_KEY = "solestack-storage-estimate-limits-v1";
export const DEFAULT_ESTIMATE_LIMITS = { databaseMB: 500, photosMB: 1000 };
export type EstimateLimits = typeof DEFAULT_ESTIMATE_LIMITS;
export type CapacityEstimate = { lower: number; upper: number; sampled: boolean; average: number };

export function estimateLimits(value: unknown): EstimateLimits | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const valid = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 1_000_000;
  return valid(row["databaseMB"]) && valid(row["photosMB"])
    ? { databaseMB: row["databaseMB"], photosMB: row["photosMB"] }
    : null;
}
const validCount = (n: number) => Number.isSafeInteger(n) && n >= 0;
function remaining(used: number, capacityMB: number) {
  if (!validCount(used) || !Number.isFinite(capacityMB) || capacityMB < 1 || capacityMB > 1_000_000)
    throw Error("Invalid estimate inputs");
  // These are planning limits, not a provider quota reading. Reserve 10% of the remainder.
  return Math.max(0, Math.round(capacityMB * 1_000_000) - used) * 0.9;
}
function range(available: number, smaller: number, larger: number) {
  return { lower: Math.floor(available / larger), upper: Math.floor(available / smaller) };
}

/** Line counts inform bill complexity; physical bytes per bill remain a stated planning model. */
export function estimateBillCapacity(
  used: number,
  capacityMB: number,
  bills: number,
  lines: number | null,
): CapacityEstimate {
  if (!validCount(bills) || (lines !== null && !validCount(lines)))
    throw Error("Invalid bill counts");
  const sampled = bills > 0 && lines !== null && lines >= bills;
  const average = sampled ? lines! / bills : 3;
  // Allow for receipt, item, cost/index and stock-ledger growth; not measured row sizes.
  const smaller = 2000 + 800 * average,
    larger = 4000 + 2000 * average;
  return { ...range(remaining(used, capacityMB), smaller, larger), sampled, average };
}

/** Wider range around measured average; fallback explicitly uses 100–250 KB planning sizes. */
export function estimatePhotoCapacity(
  used: number,
  capacityMB: number,
  photos: number,
): CapacityEstimate {
  if (!validCount(photos)) throw Error("Invalid photo count");
  const sampled = photos > 0 && used > 0;
  const average = sampled ? used / photos : 175000;
  return {
    ...range(
      remaining(used, capacityMB),
      sampled ? average * 0.75 : 100000,
      sampled ? average * 1.5 : 250000,
    ),
    sampled,
    average,
  };
}
export function capacityRange(value: Pick<CapacityEstimate, "lower" | "upper">) {
  const format = (n: number) => n.toLocaleString("en-IN");
  return value.lower === value.upper
    ? format(value.lower)
    : `${format(value.lower)}–${format(value.upper)}`;
}
