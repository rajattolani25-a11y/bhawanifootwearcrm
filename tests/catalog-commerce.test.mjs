import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_SECONDS,
  dealSeconds,
  validOffer,
  policyFloor,
  policyError,
  receivedDeal,
} from "../src/lib/catalog-bargain.ts";
import {
  readCart,
  addToCart,
  removeFromCart,
  cartSelection,
  CART_KEY,
} from "../src/lib/catalog-cart.ts";
const policy = {
  enabled: true,
  kind: "amount",
  min_discount: 0,
  max_discount: 200,
  rounding: 5,
  revision: null,
};
test("owner discount has no universal12percent ceiling and rounding cannot cross the floor", () => {
  assert.equal(policyError(2200, { ...policy, max_discount: 1000 }), null);
  assert.equal(policyFloor(2200, { ...policy, max_discount: 264, rounding: 10 }), 1940);
  assert.equal(
    policyError(2200, { ...policy, max_discount: 2200 }),
    "The maximum discount must leave a price above zero.",
  );
  assert(policyError(2200, { ...policy, min_discount: 201, max_discount: 200 }));
  assert(policyError(2200, { ...policy, min_discount: 1, max_discount: 2, rounding: 10 }));
});
test("three-minute response expiry never resets when a saved quote is re-read", () => {
  const now = Date.now(),
    deal = {
      expires_at: new Date(now + 180000).toISOString(),
      server_now: new Date(now).toISOString(),
    };
  assert.equal(DEAL_SECONDS, 180);
  assert.equal(dealSeconds(deal, now), 180);
  assert.equal(dealSeconds(deal, now + 60000), 120);
  assert.equal(dealSeconds(deal, now + 181000), 0);
  const received = receivedDeal(deal, now - 5000);
  assert(dealSeconds(received, Date.now()) <= 175);
  assert.equal(
    dealSeconds({ ...deal, expires_at: new Date(now + 600000).toISOString() }, now),
    180,
  );
});
test("offer parsing preserves meaningful money values and rejects invalid or non-discount offers", () => {
  assert.equal(validOffer("1,900", 2200), 1900);
  assert.equal(validOffer("1900.00", 2200), 1900);
  for (const bad of ["", "0", "-1", "NaN", "Infinity", "2200", "2300", "1.234"])
    assert.equal(validOffer(bad, 2200), null);
});
test("cart keeps exact size identities, deduplicates pairs and retains an expired quote for explicit review", () => {
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
  };
  globalThis.window = new EventTarget();
  const p = "10000000-0000-4000-8000-000000000001",
    v = "20000000-0000-4000-8000-000000000001";
  addToCart({ productId: p, variantId: v });
  addToCart({ productId: p, variantId: v });
  assert.equal(readCart().length, 1);
  assert.equal(
    cartSelection(readCart()[0], [{ id: p, sizes: [{ id: v, size: "7", available: false }] }])
      .available,
    false,
  );
  removeFromCart(v);
  assert.equal(readCart().length, 0);
  entries.set(CART_KEY, '{"invalid":true}');
  assert.throws(() => readCart());
});
test("owner bargaining rules have explicit Hindi and Hinglish copy", async () => {
  const { OWNER_BARGAIN_RULES } = await import("../src/lib/catalog-bargain.ts");
  const { COMMERCE } = await import("../src/lib/i18n-commerce.ts");
  for (const rule of OWNER_BARGAIN_RULES) {
    assert(COMMERCE[rule]?.hindi, rule);
    assert(COMMERCE[rule]?.hinglish, rule);
  }
});

test("missing owner policy from PostgreSQL null composite gets complete usable defaults", async () => {
  const { readBargainPolicy, DEFAULT_BARGAIN_POLICY } =
    await import("../src/lib/catalog-bargain.ts");
  const empty = {
    enabled: null,
    kind: null,
    min_discount: null,
    max_discount: null,
    rounding: null,
    revision: null,
  };
  const policy = {
    ...readBargainPolicy(empty),
    enabled: true,
    min_discount: 10,
    max_discount: 250,
  };
  assert.deepEqual(readBargainPolicy(empty), DEFAULT_BARGAIN_POLICY);
  assert.equal(policy.kind, "amount");
  assert.equal(policy.rounding, 5);
  assert.equal(policyFloor(1600, policy), 1350);
  assert.equal(policyError(1600, policy), null);
  assert(policyError(1600, { ...policy, kind: null }));
  assert.throws(() => readBargainPolicy({ ...empty, revision: "saved-revision" }));
});
