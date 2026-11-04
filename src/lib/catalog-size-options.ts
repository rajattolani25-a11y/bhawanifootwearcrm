import { categoryMatches, parseCategory } from "./product-categories";

/** Preserve the existing adult Girls → Women taxonomy while labelling its sizes separately. */
export function catalogSizeDepartment(category: string) {
  const head = category.trim().split(/\s+\/\s+/)[0] ?? "";
  return /^girls$/i.test(head) ? "Girls" : parseCategory(category).department || "Other";
}
export type CatalogSizeGroup = { department: string; sizes: string[] };
export const catalogSizeValue = (department: string, size: string) =>
  JSON.stringify([department, size]);
export function catalogSizeMatches(category: string, size: string, value: string) {
  return value === "All" || value === catalogSizeValue(catalogSizeDepartment(category), size);
}
export function catalogSizeGroups(
  products: { category: string; sizes: { size: string; available: boolean }[] }[],
  department: string,
): CatalogSizeGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const product of products) {
    if (!categoryMatches(product.category, department)) continue;
    for (const size of product.sizes) {
      if (!size.available || !size.size.trim()) continue;
      const group = catalogSizeDepartment(product.category);
      if (!groups.has(group)) groups.set(group, new Set());
      groups.get(group)!.add(size.size);
    }
  }
  const order = ["Men", "Women", "Kids", "Girls", "Boys"];
  return [...groups]
    .sort(([a], [b]) => {
      const rank = (value: string) => (order.includes(value) ? order.indexOf(value) : order.length);
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .map(([department, sizes]) => ({
      department,
      sizes: [...sizes].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    }));
}
