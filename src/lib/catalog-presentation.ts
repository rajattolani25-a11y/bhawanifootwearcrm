export type CatalogPresentation = {
  gallery_enabled: boolean;
  category_accents: boolean;
  motion_enabled: boolean;
};
export const PRESENTATION_DEFAULTS: CatalogPresentation = {
  gallery_enabled: true,
  category_accents: true,
  motion_enabled: true,
};
/** Missing/unapplied storage must preserve the working catalog. Preserve explicit false. */
export function catalogPresentation(value: unknown): CatalogPresentation {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    gallery_enabled: typeof row["gallery_enabled"] === "boolean" ? row["gallery_enabled"] : true,
    category_accents: typeof row["category_accents"] === "boolean" ? row["category_accents"] : true,
    motion_enabled: typeof row["motion_enabled"] === "boolean" ? row["motion_enabled"] : true,
  };
}
