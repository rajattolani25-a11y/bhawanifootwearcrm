import test from "node:test";
import assert from "node:assert/strict";
import { mergeCatalogSnapshot } from "../src/lib/catalog-snapshot.ts";
const source = () => ({
  enabled: true,
  shop: { name: "Bhawani", phone: "9999999999", cart_ready: true },
  presentation: { gallery_enabled: true, motion_enabled: true },
  products: Array.from({ length: 120 }, (_, i) => ({
    id: "p" + i,
    brand: "Brand",
    article: "Pair " + i,
    category: "Men / Sports & Active",
    color: "Olive",
    price: 1599,
    mrp: 2099,
    image_key: "photo" + i,
    image: "signed" + i,
    spotlight_label: null,
    sizes: [{ id: "v" + i, size: "7", available: true }],
  })),
});
const snapshot = (data) => ({
  enabled: data.enabled,
  shop: structuredClone(data.shop),
  products: structuredClone(data.products).map((p) => ({ ...p, image: null })),
});
test("identical newly fetched snapshots keep data, array and card references without skipping reads", () => {
  const old = source();
  for (let i = 0; i < 10; i++) assert.strictEqual(mergeCatalogSnapshot(old, snapshot(old)), old);
  assert.equal(old.products[0].image, "signed0");
});
test("every changed public field, size, order and unknown future field updates; unchanged cards survive", () => {
  for (const change of [
    (p) => (p.price = 1499),
    (p) => (p.mrp = 1999),
    (p) => (p.color = "Black"),
    (p) => (p.article = "New name"),
    (p) => (p.spotlight_label = "DAILY"),
    (p) => (p.bargain_enabled = true),
    (p) => (p.sizes[0].available = false),
    (p) => p.sizes.push({ id: "v-new", size: "8", available: true }),
    (p) => (p.new_public_field = "new"),
  ]) {
    const old = source(),
      fresh = snapshot(old);
    change(fresh.products[0]);
    const next = mergeCatalogSnapshot(old, fresh);
    assert.notStrictEqual(next, old);
    assert.notStrictEqual(next.products[0], old.products[0]);
    assert.strictEqual(next.products[1], old.products[1]);
    assert.strictEqual(next.shop, old.shop);
  }
  const old = source(),
    fresh = snapshot(old);
  fresh.products.reverse();
  const next = mergeCatalogSnapshot(old, fresh);
  assert.equal(next.products[0].id, "p119");
  assert.strictEqual(next.products[0], old.products[119]);
});
test("removed/changed covers never borrow unrelated URLs; hidden products and OFF clear", () => {
  const old = source(),
    fresh = snapshot(old);
  fresh.products[0].image_key = "new-photo";
  const next = mergeCatalogSnapshot(old, fresh);
  assert.equal(next.products[0].image, null);
  assert.equal(old.products[0].image, "signed0");
  fresh.products[0].image_key = null;
  assert.equal(mergeCatalogSnapshot(old, fresh).products[0].image, null);
  fresh.products = fresh.products.slice(1);
  assert.equal(mergeCatalogSnapshot(old, fresh).products.length, 119);
  const off = mergeCatalogSnapshot(old, { enabled: false });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.products, []);
});
test("fresh shop/payment settings and missing/added flags are not hidden by structural sharing", () => {
  const old = source(),
    fresh = snapshot(old);
  fresh.shop.cart_ready = false;
  fresh.shop.upi_id = "changed";
  const next = mergeCatalogSnapshot(old, fresh);
  assert.equal(next.shop.cart_ready, false);
  assert.equal(next.shop.upi_id, "changed");
  assert.strictEqual(next.products, old.products);
  assert.strictEqual(next.presentation, old.presentation);
});
