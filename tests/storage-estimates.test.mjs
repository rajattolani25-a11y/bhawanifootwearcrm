import test from "node:test";
import assert from "node:assert/strict";
import {
  capacityRange,
  estimateLimits,
  estimateBillCapacity,
  estimatePhotoCapacity,
} from "../src/lib/storage-estimates.ts";

test("capacity is a bounded planning range with headroom, not allocation divided by bills", () => {
  const empty = estimateBillCapacity(1_300_000, 500, 0, null);
  assert.equal(empty.sampled, false);
  assert.equal(empty.average, 3);
  assert.deepEqual([empty.lower, empty.upper], [44883, 102006]);
  const small = estimateBillCapacity(1_300_000, 500, 10, 10),
    large = estimateBillCapacity(1_300_000, 500, 10, 80);
  assert.equal(small.sampled, true);
  assert(large.upper < small.upper);
  assert(large.lower < small.lower);
  assert.equal(estimateBillCapacity(1_300_000, 500, 10, null).sampled, false);
  assert.equal(estimateBillCapacity(1_300_000, 500, 10, 2).sampled, false);
  assert.equal(estimateBillCapacity(600_000_000, 500, 10, 20).upper, 0);
  assert.equal(capacityRange({ lower: 0, upper: 0 }), "0");
});
test("photo ranges adapt to observed file size; empty storage uses explicit starter assumptions", () => {
  const starter = estimatePhotoCapacity(0, 1000, 0);
  assert.equal(starter.sampled, false);
  assert.deepEqual([starter.lower, starter.upper], [3600, 9000]);
  const measured = estimatePhotoCapacity(1_000_000, 1000, 10);
  assert.equal(measured.sampled, true);
  assert.equal(measured.average, 100000);
  assert.deepEqual([measured.lower, measured.upper], [5994, 11988]);
  assert.equal(estimatePhotoCapacity(1_100_000_000, 1000, 10).upper, 0);
});
test("editable assumed capacities reject corrupt, nonpositive and unsafe inputs", () => {
  assert.deepEqual(estimateLimits({ databaseMB: 500, photosMB: 1000 }), {
    databaseMB: 500,
    photosMB: 1000,
  });
  for (const value of [
    null,
    [],
    {},
    { databaseMB: 0, photosMB: 1000 },
    { databaseMB: "500", photosMB: 1000 },
    { databaseMB: Infinity, photosMB: 1000 },
    { databaseMB: 1e12, photosMB: 1000 },
  ])
    assert.equal(estimateLimits(value), null);
  assert.throws(() => estimateBillCapacity(-1, 500, 1, 2));
  assert.throws(() => estimatePhotoCapacity(0, 0, 1));
});
