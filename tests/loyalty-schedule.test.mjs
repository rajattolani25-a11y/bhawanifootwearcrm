import test from "node:test";
import assert from "node:assert/strict";
import { LOYALTY_MILESTONES, nextLoyaltyReward } from "../src/lib/loyalty.ts";
test("regular and premium keep the same reward at every milestone and after cycle reset", () => {
  assert.deepEqual(LOYALTY_MILESTONES, [5, 10, 15, 20]);
  for (const [count, milestone] of [
    [0, 5],
    [4, 5],
    [5, 10],
    [9, 10],
    [10, 15],
    [14, 15],
    [15, 20],
    [19, 20],
    [20, 5],
    [24, 5],
  ]) {
    assert.deepEqual(nextLoyaltyReward("regular", count), { milestone, amount: 100 });
    assert.deepEqual(nextLoyaltyReward("premium", count), { milestone, amount: 200 });
  }
});
