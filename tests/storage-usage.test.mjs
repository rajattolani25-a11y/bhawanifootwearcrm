import test from "node:test";
import assert from "node:assert/strict";
import {
  measuredPhotos,
  parsePhotoUsage,
  parseStoreUsage,
  storageBytes,
} from "../src/lib/storage-usage.ts";

test("reports decimal units and preserves small and zero file sizes", () => {
  assert.equal(storageBytes(0), "0 B");
  assert.equal(storageBytes(17), "17 B");
  assert.equal(storageBytes(1000), "1.00 KB");
  assert.equal(storageBytes(1_000_000), "1.00 MB");
  assert.equal(storageBytes(1_048_576), "1.05 MB");
  assert.equal(storageBytes(1_000_000_000), "1.00 GB");
  assert.equal(storageBytes(999_999), "1.00 MB");
  for (const value of [-1, NaN, Infinity, 2.3]) assert.throws(() => storageBytes(value));
});

test("zero bills never zeroes real allocated database space; counts are not inferred from bytes", () => {
  const data = parseStoreUsage({
    db_bytes: "1362944",
    photo_bytes: 420000,
    photos: 3,
    products: 1,
    variants: 5,
    bills: 0,
    customers: 0,
    suppliers: 0,
    stock_entries: 5,
  });
  assert.equal(data.db_bytes, 1362944);
  assert.equal(data.bills, 0);
  assert.equal(storageBytes(data.db_bytes), "1.36 MB");
  for (const invalid of [
    null,
    [],
    {},
    { ...data, bills: -1 },
    { ...data, photo_bytes: null },
    { ...data, db_bytes: "1MB" },
    { ...data, photos: 0.5 },
    { ...data, db_bytes: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() => parseStoreUsage(invalid));
});

test("photo totals include hero once, preserve shared cache fields and report missing readings as partial", () => {
  const product = { photo_bytes: 420000, photos: 3 };
  const hero = parsePhotoUsage({ photo_bytes: "100000", photos: "1", current_bytes: 80000 });
  assert.equal(hero.current_bytes, 80000);
  assert.deepEqual(measuredPhotos(product, hero), { bytes: 520000, count: 4, complete: true });
  assert.deepEqual(measuredPhotos(product, null), { bytes: 420000, count: 3, complete: false });
  assert.deepEqual(measuredPhotos(product, { photo_bytes: 0, photos: 0 }), {
    bytes: 420000,
    count: 3,
    complete: true,
  });
  for (const invalid of [null, [], {}, { photo_bytes: 0, photos: null }])
    assert.throws(() => parsePhotoUsage(invalid));
});
