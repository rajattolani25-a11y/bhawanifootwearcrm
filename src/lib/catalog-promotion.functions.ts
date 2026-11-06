import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  promoConfigSchema,
  promoPathSchema,
  PROMO_BUCKET,
  promotionPhase,
  type PromotionPublication,
} from "./catalog-promotion";
import { publicClient } from "./catalog.functions";
import type { CatalogOffer } from "./catalog.functions";
import type { PromoConfig, PromoCampaign } from "./catalog-promotion";

export type PromotionSnapshot = {
  enabled: boolean;
  title: string;
  subtitle: string;
  coupon: string;
  card: boolean;
  config: PromoConfig | null;
};
export type PublicPromotion = {
  legacy?: boolean;
  campaigns: { campaign: PromoCampaign; offer: CatalogOffer }[];
  now: string;
  images?: Record<string, string>;
  imagesExpireAt?: number;
} | null;
const tokenSchema = z.string().min(20).max(8000);
async function ownerClient(token: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error } = await sb.auth.getUser(token);
  if (error || !auth.user) throw Error("Sign in again to edit promotions.");
  const role = await sb.rpc("has_role", { _user_id: auth.user.id, _role: "owner" });
  if (role.error || role.data !== true) throw Error("Owner access required.");
  return sb;
}
export type PromotionStorage = {
  version: number;
  photo_bytes: number;
  photos: number;
  pending: string[];
};
function nativePaths(config: PromoConfig | null) {
  return [
    ...new Set(
      (config?.campaigns ?? [])
        .flatMap((c) => [c.advance.image, c.live.image])
        .flatMap((i) => (i && "path" in i ? [i.path] : [])),
    ),
  ];
}
async function photoUrls(sb: Awaited<ReturnType<typeof publicClient>>, paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  try {
    const r = await sb.storage.from(PROMO_BUCKET).createSignedUrls(paths, 3600);
    return Object.fromEntries(
      (r.data ?? []).flatMap((i) => (i.path && i.signedUrl ? [[i.path, i.signedUrl]] : [])),
    );
  } catch {
    // Keep saved campaign metadata/editing available during a photo-service outage.
    // The storefront reuses a valid previous URL or falls back to the preset.
    return {} as Record<string, string>;
  }
}
export const getCatalogPromotion = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await publicClient();
  const { data, error } = await sb.rpc("public_catalog_promotion");
  if (error)
    return {
      available: false,
      value: null as PublicPromotion,
      retry: !["PGRST202", "42883", "42703"].includes(error.code),
    };
  if (data === null) return { available: true, value: null as PublicPromotion };
  const v = data as PublicPromotion;
  if (
    !v ||
    !Number.isFinite(Date.parse(v.now)) ||
    !Array.isArray(v.campaigns) ||
    v.campaigns.some(
      (c) => !promoConfigSchema.safeParse({ version: 1, campaigns: [c.campaign] }).success,
    )
  )
    return { available: false, value: null as PublicPromotion };
  const paths = v.campaigns.flatMap(({ campaign }) => {
    const phase = promotionPhase(campaign, Date.parse(v.now));
    if (phase === "hidden") return [];
    const image = campaign[phase].image;
    return image && "path" in image ? [image.path] : [];
  });
  const images = await photoUrls(sb, [...new Set(paths)]);
  return {
    available: true,
    value: { ...v, images, imagesExpireAt: Date.parse(v.now) + 55 * 60 * 1000 },
  };
});
export const getOwnerPromotion = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ token: tokenSchema }).parse(v))
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const [{ data: snapshot, error }, usage, published] = await Promise.all([
      sb.rpc("owner_catalog_promotion"),
      sb.rpc("owner_catalog_promotion_storage"),
      sb.rpc("public_catalog_promotion"),
    ]);
    if (error)
      throw Error(
        "Promotion settings update is not installed yet. Existing catalog offers still work.",
      );
    const current = snapshot as PromotionSnapshot;
    return {
      snapshot: current,
      uploadReady: !usage.error && usage.data?.version === 1,
      images: await photoUrls(sb, nativePaths(current.config)),
      storage: usage.error ? null : (usage.data as PromotionStorage),
      publication: {
        checked: !published.error,
        // NULL means the master/catalog gate is off. Still use a server clock.
        now: published.data?.now ?? (!published.error ? new Date().toISOString() : null),
        audiences: (published.data?.campaigns ?? []).map(
          ({ campaign }: { campaign: PromoCampaign }) => campaign.audience,
        ),
        legacy: published.data?.legacy === true,
      } satisfies PromotionPublication,
    };
  });
export const saveOwnerPromotion = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        token: tokenSchema,
        expected: z.unknown(),
        settings: z
          .object({
            enabled: z.boolean(),
            title: z.string().trim().max(60),
            subtitle: z.string().trim().max(120),
            coupon: z.string().trim().max(30),
            card: z.boolean(),
            config: promoConfigSchema,
          })
          .strict(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const result = await sb.rpc("save_catalog_promotion", {
      _settings: data.settings,
      _expected: data.expected,
    });
    if (result.error) throw Error(result.error.message);
    return result.data as PromotionSnapshot;
  });
export const preparePromotionUpload = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        token: tokenSchema,
        slot: z.enum(["advance", "live"]),
        audience: z.enum(["all", "men", "women"]),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const r = await sb.rpc("prepare_catalog_promotion_photo", {
      _audience: data.audience,
      _slot: data.slot,
    });
    if (r.error) throw Error("Apply the promotion photo storage SQL update, then reload.");
    return { bucket: PROMO_BUCKET, path: promoPathSchema.parse(r.data) };
  });
/** Files are removed only via the Storage API, after metadata save. RLS preserves saved images. */
export const cleanupPromotionUploads = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ token: tokenSchema }).parse(v))
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const usage = await sb.rpc("owner_catalog_promotion_storage");
    if (usage.error) throw Error("Promotion photo cleanup is unavailable. Reload and retry.");
    const paths = z.array(promoPathSchema).max(50).parse(usage.data.pending);
    if (paths.length) {
      const removed = await sb.storage.from(PROMO_BUCKET).remove(paths);
      if (removed.error) throw Error("Unused photo cleanup is pending. Retry cleanup.");
      const ack = await sb.rpc("ack_store_file_cleanup", { _bucket: PROMO_BUCKET, _paths: paths });
      if (ack.error) throw Error("Photo cleanup confirmation is pending. Retry cleanup.");
    }
    const next = await sb.rpc("owner_catalog_promotion_storage");
    if (next.error) throw Error("Could not refresh promotion photo storage.");
    if ((next.data.pending as string[]).some((p) => paths.includes(p)))
      throw Error("Some unused photos could not be removed. Retry cleanup.");
    return next.data as PromotionStorage;
  });
