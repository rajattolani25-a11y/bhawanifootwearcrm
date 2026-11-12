import { z } from "zod";
import seeds from "./catalog-showcase-seeds.json";

export const SHOWCASE_BUCKET = "catalog-hero-images";
export const SHOWCASE_LIMIT = 12;
export const SHOWCASE_REFRESH = "catalog-showcase-refresh";
export const showcaseAudience = z.enum(["men", "women"]);
export const showcasePath = z.string().regex(/^showcase\/[0-9a-f-]{36}\.webp$/);
export const showcaseImage = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("seed"),
      key: z.enum(["tradition", "desi", "yorker", "boldfit", "hetro", "flyo"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("upload"),
      path: showcasePath,
      bytes: z.number().int().min(1).max(409600),
      thumbnailBytes: z.number().int().min(1).max(40960),
      width: z.number().int().min(1).max(1600),
      height: z.number().int().min(1).max(1600),
    })
    .strict(),
]);
export const showcasePoster = z
  .object({
    id: z.string().uuid(),
    audience: showcaseAudience,
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(60),
    productId: z.string().uuid().nullable(),
    image: showcaseImage,
  })
  .strict();
export const showcaseConfig = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    items: z.array(showcasePoster).max(SHOWCASE_LIMIT),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (new Set(config.items.map((item) => item.id)).size !== config.items.length)
      ctx.addIssue({ code: "custom", message: "Duplicate showcase poster." });
    for (const item of config.items)
      if (item.image.kind === "seed" && seeds[item.image.key].audience !== item.audience)
        ctx.addIssue({ code: "custom", message: "Keep this poster in its original collection." });
  });
export type ShowcaseConfig = z.infer<typeof showcaseConfig>;
export type ShowcasePoster = z.infer<typeof showcasePoster>;
export type ShowcaseAudience = z.infer<typeof showcaseAudience>;
export type ShowcaseItem = ShowcasePoster & {
  src: string | null;
  thumbnail: string | null;
  width: number;
  height: number;
};
export const showcaseSeeds = seeds;
export const defaultShowcase = (): ShowcaseConfig => ({
  version: 1,
  enabled: true,
  items: (["flyo", "yorker", "boldfit", "tradition", "desi", "hetro"] as const).map((key) => ({
    id: seeds[key].id,
    audience: seeds[key].audience as ShowcaseAudience,
    enabled: true,
    title: seeds[key].title,
    productId: seeds[key].productId,
    image: { kind: "seed", key },
  })),
});
export function showcaseThumbnail(path: string) {
  return path.replace(/\.webp$/, "-thumb.webp");
}
export function showcasePaths(config: ShowcaseConfig | null): string[] {
  return (config?.items ?? []).flatMap((item) =>
    item.image.kind === "upload" ? [item.image.path, showcaseThumbnail(item.image.path)] : [],
  );
}
export function showcaseItems(
  config: ShowcaseConfig,
  images: Record<string, string>,
): ShowcaseItem[] {
  return config.items.map((item) => {
    if (item.image.kind === "seed") return { ...item, ...pickSeed(item.image.key) };
    return {
      ...item,
      src: images[item.image.path] ?? null,
      thumbnail: images[showcaseThumbnail(item.image.path)] ?? null,
      width: item.image.width,
      height: item.image.height,
    };
  });
}
function pickSeed(key: keyof typeof seeds) {
  const { src, thumbnail, width, height } = seeds[key];
  return { src, thumbnail, width, height };
}
