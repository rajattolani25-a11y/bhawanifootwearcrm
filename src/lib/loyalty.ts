export const LOYALTY_MILESTONES = [5, 10, 15, 20] as const;
export type LoyaltyCard = "regular" | "premium";

/** Display schedule for future rewards after approved migration 0031. */
export function nextLoyaltyReward(card: LoyaltyCard, count: number) {
  const stamps = Math.max(0, Math.trunc(count)) % 20;
  return {
    milestone: LOYALTY_MILESTONES.find((value) => value > stamps) ?? 5,
    amount: card === "premium" ? 200 : 100,
  };
}
