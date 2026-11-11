import type { CatalogData, CatalogProduct } from "./catalog.functions.ts";

function sameRecord(a: object, b: object, omit?: string): boolean {
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => key !== omit);
  return (
    keys.length === Object.keys(right).filter((key) => key !== omit).length &&
    keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
  );
}
function sameProduct(a: CatalogProduct, b: CatalogProduct): boolean {
  return (
    sameRecord(a, b, "sizes") &&
    a.sizes.length === b.sizes.length &&
    a.sizes.every((size, i) => sameRecord(size, b.sizes[i]!))
  );
}

/** Reconcile a newly fetched snapshot, never cache or skip the fresh server read. */
export function mergeCatalogSnapshot(previous: CatalogData, fresh: CatalogData): CatalogData {
  const byId = new Map((previous.products ?? []).map((product) => [product.id, product]));
  let products = (fresh.products ?? []).map((product) => {
    const old = byId.get(product.id);
    const next = {
      ...product,
      image:
        product.image_key && product.image_key === old?.image_key ? (old?.image ?? null) : null,
    };
    return old && sameProduct(old, next) ? old : next;
  });
  if (
    previous.products?.length === products.length &&
    products.every((product, index) => product === previous.products![index])
  )
    products = previous.products;
  const next = { ...previous, ...fresh, products };
  if (previous.shop && next.shop && sameRecord(previous.shop, next.shop)) next.shop = previous.shop;
  return sameRecord(previous, next) ? previous : next;
}
