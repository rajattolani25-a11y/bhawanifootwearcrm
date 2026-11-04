import { categoryMatches, parseCategory } from "./product-categories";
export type CatalogStyleGroup = { department: string; styles: string[] };
export const catalogStyleValue = (department: string, style: string) =>
  JSON.stringify([department, style]);
export function catalogStyleMatches(category: string, value: string) {
  const parsed = parseCategory(category);
  return value === "All" || value === catalogStyleValue(parsed.department, parsed.subcategory);
}
/** Only styles actually saved for visible adult products; never guess from article names. */
export function catalogStyleGroups(
  products: { category: string }[],
  department: string,
): CatalogStyleGroup[] {
  return ["Men", "Women"]
    .map((group) => ({
      department: group,
      styles: [
        ...new Set(
          products
            .filter(
              (product) =>
                categoryMatches(product.category, department) &&
                parseCategory(product.category).department === group,
            )
            .map((product) => parseCategory(product.category).subcategory)
            .filter(Boolean),
        ),
      ],
    }))
    .filter((group) => group.styles.length);
}
