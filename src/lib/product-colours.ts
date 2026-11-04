import { categoryLabel } from "./product-categories";

type Identity = {
  id: string;
  brand: string;
  article: string;
  category: string;
  color: string | null;
};
const clean = (value: string) => value.trim().toLowerCase();
export const articleFamilyKey = (product: Identity) =>
  JSON.stringify([
    clean(product.brand),
    clean(product.article),
    clean(categoryLabel(product.category)),
  ]);
/** Never merge stock or IDs. A family only provides explicit navigation to an existing colour. */
export function articleColours<T extends Identity>(products: T[], current: Identity): T[] {
  return products.filter((product) => articleFamilyKey(product) === articleFamilyKey(current));
}
export function catalogColourOptions<T extends Identity>(products: T[], current: Identity): T[] {
  const siblings = articleColours(products, current);
  const labels = siblings.map((product) => clean(product.color ?? ""));
  // Old duplicate identities are ambiguous; never guess which stock row the customer wanted.
  return new Set(labels).size === labels.length ? siblings : [];
}
