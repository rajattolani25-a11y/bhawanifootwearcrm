import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/csv.ts";
import { inr } from "../src/lib/modules.ts";
import { inPeriod, refundPayouts } from "../src/lib/sales-returns.ts";

test("CSV round trips quoted commas, escaped quotes, multiline fields, CRLF and BOM", () => {
  const source = '\uFEFFbrand,article,size,qty\r\n"ACME ""Pro""","Line one,\r\nLine two",7,2\r\n';
  assert.deepEqual(parseCsv(source), [
    { brand: 'ACME "Pro"', article: "Line one,\r\nLine two", size: "7", qty: "2" },
  ]);
});
test("malformed imports are rejected before any mutation", () => {
  for (const source of [
    "brand,brand\nA,B",
    "brand,article\nA",
    "brand,article\nA,B,C",
    'brand,article\nA,"unclosed',
    'brand,article\nA,"closed"junk',
  ])
    assert.throws(() => parseCsv(source));
  assert.deepEqual(parseCsv("brand,article\r\n\r\n"), []);
  assert.deepEqual(parseCsv("article,size,qty\nShoes,7,0"), [
    { article: "Shoes", size: "7", qty: "0" },
  ]);
});
test("money preserves paise without cluttering whole rupees", () => {
  assert.equal(inr(1048.95), "₹1,048.95");
  assert.equal(inr(2200), "₹2,200");
  assert.equal(inr(-47.62), "₹-47.62");
});
test("month start is inclusive and month end exclusive across equivalent timestamp formats", () => {
  const s = "2026-11-01T00:00:00+05:30",
    e = "2026-12-01T00:00:00+05:30";
  for (const d of ["2026-10-31T18:30:00+00:00", "2026-10-31T18:30:00.000Z", s])
    assert.equal(inPeriod(d, s, e), true);
  for (const d of ["2026-11-30T18:30:00+00:00", "2026-11-30T18:30:00.000Z", e, "bad date"])
    assert.equal(inPeriod(d, s, e), false);
});
test("cash closing subtracts actual cash refunds, keeps historical unknowns unverified", () => {
  const returns = [
    { kind: "return", refund: 100, cash_refund: 100, refund_mode: "Cash" },
    { kind: "defect", refund: 200, cash_refund: 200, refund_mode: "UPI" },
    { kind: "return", refund: 300, cash_refund: 300, refund_mode: "Card" },
    { kind: "return", refund: 150, cash_refund: 50, refund_mode: null },
    { kind: "exchange", refund: 0, cash_refund: 0 },
  ];
  assert.deepEqual(refundPayouts(returns), { cash: 100, unknown: 50 });
  assert.deepEqual(refundPayouts([]), { cash: 0, unknown: 0 });
});
