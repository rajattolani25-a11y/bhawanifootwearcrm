/** Category hierarchy lives in the existing free-text category field; no schema change. */
export const DEPARTMENTS = ["Men", "Women", "Boys", "Kids"] as const;
export const SUBCATEGORIES: Record<string, readonly string[]> = {
  Men: [
    "Sneakers & Streetwear",
    "Sports & Active",
    "Formals & Occasion",
    "Sandals & Floaters",
    "Slides & Slippers",
    "Other",
  ],
  Women: [
    "Sneakers & Casuals",
    "Sports & Active",
    "Heels & Occasion",
    "Sandals & Flats",
    "Slides & Slippers",
    "Other",
  ],
};
const aliases: Record<string, string> = {
  men: "Men",
  mens: "Men",
  "men's": "Men",
  gents: "Men",
  women: "Women",
  womens: "Women",
  "women's": "Women",
  ladies: "Women",
  girls: "Women",
  boys: "Boys",
  kids: "Kids",
};
export function parseCategory(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const [head = "", ...tail] = raw.split(/\s+\/\s+/);
  return { department: aliases[head.toLowerCase()] ?? head, subcategory: tail.join(" / ").trim() };
}
export function categoryLabel(value: string | null | undefined) {
  const c = parseCategory(value);
  return [c.department, c.subcategory].filter(Boolean).join(" · ");
}
export function categoryValue(department: string, subcategory = "") {
  const canonical = parseCategory(department).department;
  return subcategory.trim() ? `${canonical} / ${subcategory.trim()}` : canonical;
}
export function categoryMatches(value: string | null | undefined, department: string) {
  return (
    department === "All" || parseCategory(value).department === parseCategory(department).department
  );
}
/** Hero storage has an existing allowlist; modernize its label without changing its contract. */
export function heroCategoryValue(value: string) {
  const department = parseCategory(value).department;
  return department === "Men" ? "Gents" : department === "Women" ? "Ladies" : value;
}
