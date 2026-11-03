export const CATALOG_DESCRIPTION_LIMIT = 1000;

/** Owner-entered plain text only; never interpret description content as markup. */
export function catalogDescription(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, CATALOG_DESCRIPTION_LIMIT) : "";
}
