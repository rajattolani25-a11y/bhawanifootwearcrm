import assert from "node:assert/strict";
import test from "node:test";
import { isLowStock, isDeadStock } from "../src/lib/stock-policy.ts";
test("minimum stock is inclusive and out-of-stock remains a separate status", () => {
  assert(isLowStock(5, 10));
  assert(isLowStock(10, 10));
  assert(!isLowStock(11, 10));
  assert(!isLowStock(0, 10));
  assert(!isLowStock(1, 0));
});
test("dead stock uses the same60-day window and size creation age", () => {
  const now = Date.parse("2026-11-04T00:00:00Z");
  const days = (d) => new Date(now - d * 86400000).toISOString();
  assert(isDeadStock(days(60), false, now));
  assert(!isDeadStock(days(59), false, now));
  assert(!isDeadStock(days(80), true, now));
  assert(!isDeadStock(days(1), false, now));
  assert(!isDeadStock("invalid", false, now));
});
