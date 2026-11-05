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
test("cart quote computes one delivery charge from the combined net and bounds small advances", async () => {
  const { cartAmounts } = await import("../src/lib/catalog-cart-checkout.ts");
  const shop = {
    local_charge: 90,
    outside_charge: 150,
    free_delivery_above: 5000,
    advance_percent: 20,
  };
  assert.deepEqual(cartAmounts(2900, "local", shop), { net: 2900, charge: 90, advance: 2990 });
  assert.deepEqual(cartAmounts(5000, "local", shop), { net: 5000, charge: 0, advance: 5000 });
  assert.deepEqual(cartAmounts(2900, "pickup", shop), { net: 2900, charge: 0, advance: 580 });
  assert.deepEqual(cartAmounts(0.05, "pickup", shop), { net: 0.05, charge: 0, advance: 0.05 });
});
test("cart group references do not misgroup ordinary bookings", async () => {
  const { cartReference } = await import("../src/lib/catalog-cart-checkout.ts");
  assert.equal(cartReference("CT-ABCDEF1234567890-02"), "CT-ABCDEF1234567890");
  assert.equal(cartReference("BK-1105-ABCDEF1234"), null);
  assert.equal(cartReference("CT-bad-01"), null);
});

test("whole-cart coupon allocations sum exactly, stay proportionate and preserve positive pair prices", async () => {
  const { cartCouponShares } = await import("../src/lib/catalog-cart-checkout.ts");
  assert.deepEqual(
    cartCouponShares(
      [
        { variantId: "a", price: 2200 },
        { variantId: "b", price: 800 },
      ],
      300,
    ),
    { a: 220, b: 80 },
  );
  assert.deepEqual(
    cartCouponShares(
      [
        { variantId: "a", price: 800 },
        { variantId: "b", price: 333 },
      ],
      150,
    ),
    { a: 105.91, b: 44.09 },
  );
  assert.deepEqual(
    cartCouponShares(
      [
        { variantId: "a", price: 2 },
        { variantId: "b", price: 0.01 },
      ],
      1.01,
    ),
    { a: 1.01, b: 0 },
  );
  for (let n = 1; n <= 30; n++) {
    const lines = Array.from({ length: n }, (_, i) => ({
      variantId: String(i),
      price: (1 + ((i * 997) % 100003)) / 100,
    }));
    const total = lines.reduce((sum, line) => sum + Math.round(line.price * 100), 0);
    for (const cents of [0, Math.floor((total - n) / 2), total - n]) {
      const shares = cartCouponShares(lines, cents / 100);
      assert.equal(
        Object.values(shares).reduce((sum, x) => sum + Math.round(x * 100), 0),
        cents,
      );
      assert(
        lines.every(
          (line) =>
            shares[line.variantId] >= 0 &&
            Math.round((line.price - shares[line.variantId]) * 100) >= 1,
        ),
      );
    }
  }
});

test("cooldown is 30 minutes after quote expiry and is not clamped to the offer timer", async () => {
  const { bargainRetrySeconds, receivedDeal } = await import("../src/lib/catalog-bargain.ts");
  const now = Date.now();
  const raw = {
    cooldown_supported: true,
    expires_at: new Date(now + 180000).toISOString(),
    retry_at: new Date(now + 1980000).toISOString(),
    server_now: new Date(now).toISOString(),
  };
  const deal = receivedDeal(raw, now);
  assert(bargainRetrySeconds(deal, now) >= 1979);
  assert.equal(bargainRetrySeconds(deal, now + 1981000), 0);
  assert.equal(bargainRetrySeconds({ ...deal, order_placed: true }, now), 0);
  assert.equal(bargainRetrySeconds({ ...deal, cooldown_supported: false }, now), 0);
});

test("first bid minimum is 75percent of listed price rounded upward to a whole rupee", async () => {
  const { firstOfferMinimum } = await import("../src/lib/catalog-bargain.ts");
  assert.equal(firstOfferMinimum(2200), 1650);
  assert.equal(firstOfferMinimum(1599), 1200);
  assert.equal(firstOfferMinimum(1299), 975);
  assert.equal(firstOfferMinimum(2000), 1500);
});
