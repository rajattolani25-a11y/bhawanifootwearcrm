import test from "node:test";
import assert from "node:assert/strict";
import {
  originalBillReceipt,
  money,
  netSales,
  returnSummary,
  refundsBySale,
  hasRecordedCosts,
  hasReturnCost,
} from "../src/lib/sales-returns.ts";
const row = (refund = 2200, kind = "return") => ({
  sale_id: "bill1",
  kind,
  refund,
  gst_reversal: 0,
  cost_reversal: 1400,
  qty: 1,
});
test("2200 fully returned sale has zero net revenue; original bill is not mutated", () => {
  const bill = { total: 2200 };
  assert.equal(netSales(bill.total, [row()]), 0);
  assert.equal(bill.total, 2200);
  assert.deepEqual(returnSummary([row()]), { refunded: 2200, gst: 0, cost: 1400, pairs: 1 });
});
test("partial and damaged returns reduce revenue; exchanges never invent refunds", () => {
  assert.equal(netSales(2200, [row(1100)]), 1100);
  assert.equal(netSales(2200, [row(2200, "defect")]), 0);
  assert.equal(netSales(2200, [row(0, "exchange")]), 2200);
  assert.equal(refundsBySale([row(1100), row(1100), row(2200, "exchange")]).get("bill1"), 2200);
});
test("return-only period is negative rather than clamped or moved back to sale date", () => {
  assert.equal(netSales(0, [row()]), -2200);
});
test("GST-inclusive return reverses tax and captured cost without inventing profit", () => {
  const r = { ...row(2200), gst_reversal: 104.76, cost_reversal: 1400 };
  const originalProfit = 2200 - 104.76 - 1400;
  assert.equal(money(originalProfit - r.refund + r.gst_reversal + r.cost_reversal), 0);
  assert.equal(returnSummary([r]).gst, 104.76);
});
test("missing, zero, or partially known line costs cannot be passed off as full profit", () => {
  const known = { sale_item_costs: { unit_cost: 1400 } };
  assert.equal(hasRecordedCosts([known]), true);
  assert.equal(hasRecordedCosts([{ sale_item_costs: [{ unit_cost: 1400 }] }]), true);
  assert.equal(hasRecordedCosts([]), false);
  for (const unknown of [{}, { sale_item_costs: null }, { sale_item_costs: { unit_cost: 0 } }]) {
    assert.equal(hasRecordedCosts([unknown]), false);
    assert.equal(hasRecordedCosts([known, unknown]), false);
  }
  assert.equal(hasReturnCost({ refund: 2200, sale_items: {} }), false);
  assert.equal(hasReturnCost({ refund: 2200, sale_items: known }), true);
});
test("money uses paise rounding and all returned rows beyond 1000 contribute", () => {
  assert.equal(netSales(0.3, [row(0.1), row(0.2)]), 0);
  assert.equal(refundsBySale(Array.from({ length: 2501 }, () => row(1))).get("bill1"), 2501);
});

test("returned credit is not mislabelled as a payment in khata", () => {
  for (const [paid, refundPaid] of [
    [0, 0],
    [1000, 1000],
    [2200, 2200],
  ]) {
    const r = { ...row(), cash_refund: refundPaid };
    const originalPaid = originalBillReceipt(2200, 0, 0, [r]);
    assert.equal(originalPaid, paid);
    const balance = 2200 - originalPaid - r.refund + refundPaid;
    assert.equal(balance, 0);
  }
  assert.equal(originalBillReceipt(2200, 0, 500, [{ ...row(), cash_refund: 1000 }]), 500);
});
