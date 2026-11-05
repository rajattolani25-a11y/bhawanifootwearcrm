import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { promoConfigSchema, promoImageSchema } from "./catalog-promotion";
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
function hosting() {
  const cloud = process.env["CLOUDINARY_CLOUD_NAME"],
    key = process.env["CLOUDINARY_API_KEY"],
    secret = process.env["CLOUDINARY_API_SECRET"];
  if (!cloud || !/^[a-z0-9_-]+$/.test(cloud) || !key || !secret) return null;
  const project = new URL(process.env["SUPABASE_URL"]!).hostname.split(".")[0]!;
  return { cloud, key, secret, prefix: `solestack-promotions/${project}/` };
}
async function sign(params: Record<string, string>, secret: string) {
  const payload =
    Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&") + secret;
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
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
  return { available: true, value: v };
});
export const getOwnerPromotion = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ token: tokenSchema }).parse(v))
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const { data: snapshot, error } = await sb.rpc("owner_catalog_promotion");
    if (error)
      throw Error(
        "Promotion settings update is not installed yet. Existing catalog offers still work.",
      );
    return { snapshot: snapshot as PromotionSnapshot, uploadReady: !!hosting() };
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
export const signPromotionUpload = createServerFn({ method: "POST" })
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
    await ownerClient(data.token);
    const h = hosting();
    if (!h)
      throw Error("External photo hosting is not connected. Built-in presets do not need it.");
    const params = {
      timestamp: String(Math.floor(Date.now() / 1000)),
      public_id: `${h.prefix}${data.audience}/${data.slot}/${crypto.randomUUID()}`,
      overwrite: "false",
      transformation: "c_limit,w_1600,h_1600,q_90,f_webp",
    };
    return {
      endpoint: `https://api.cloudinary.com/v1_1/${h.cloud}/image/upload`,
      apiKey: h.key,
      params,
      signature: await sign(params, h.secret),
    };
  });
/** Only superseded assets in this shop's promotion folder can be removed. */
export const cleanupPromotionPhoto = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ token: tokenSchema, image: promoImageSchema }).parse(v),
  )
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token),
      h = hosting();
    if (!h || !data.image.publicId.startsWith(h.prefix))
      throw Error("This is not a promotion photo owned by this shop.");
    const current = await sb.rpc("owner_catalog_promotion");
    if (current.error) throw Error("Could not check the currently saved posters.");
    const cfg = (current.data as PromotionSnapshot).config;
    if (
      cfg?.campaigns.some((c) =>
        [c.advance.image?.publicId, c.live.image?.publicId].includes(data.image.publicId),
      )
    )
      throw Error("The saved poster is still in use.");
    const params = {
      public_id: data.image.publicId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      invalidate: "true",
    };
    const body = new URLSearchParams({
      ...params,
      api_key: h.key,
      signature: await sign(params, h.secret),
    });
    const result = await fetch(`https://api.cloudinary.com/v1_1/${h.cloud}/image/destroy`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await result.json()) as { result?: string };
    if (!result.ok || !["ok", "not found"].includes(json.result ?? ""))
      throw Error("Old external poster cleanup failed. Remove it in Cloudinary Media Library.");
    return true;
  });
