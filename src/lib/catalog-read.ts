import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogPresentation, PRESENTATION_DEFAULTS } from "./catalog-presentation.ts";
import { HERO_BUCKET, type PublicHero } from "./catalog-hero.ts";
import type { CatalogData, CatalogOffer } from "./catalog.functions.ts";

/** Parallel, request-scoped public reads. No response cache or change to database RPCs. */
export async function readPublicCatalog(sb: SupabaseClient): Promise<CatalogData> {
  const { data, error } = await sb.rpc("public_catalog");
  if (error) throw new Error("Catalog is not available right now");
  const d = data as unknown as CatalogData;
  if (!d.enabled || !d.products) return { enabled: false };
  // Only public-safe boolean flags; missing storage preserves the working catalog.
  const presentationRequest = Promise.resolve(
    sb.from("catalog_presentation_settings").select("*").eq("id", 1).maybeSingle(),
  ).then(
    ({ data }) => catalogPresentation(data),
    () => ({ ...PRESENTATION_DEFAULTS }),
  );
  if (!d.shop) return { enabled: false };
  const offerRequest = Promise.resolve(sb.rpc("public_catalog_offer")).then(
    ({ data }) => (data as unknown as CatalogOffer) ?? null,
    () => null,
  );
  const bargainRequest = Promise.resolve(sb.rpc("catalog_bargain_enabled")).then(
    ({ data }) => new Set<string>(Array.isArray(data) ? data : []),
    () => new Set<string>(),
  );
  const cartRequest=Promise.resolve(sb.rpc("catalog_cart_version")).then(({data,error})=>!error&&data===1,()=>false);
  let heroUnavailable = false;
  const heroRequest = (async (): Promise<PublicHero | null> => {
    // Optional presentation: an unapplied migration, RPC or signing failure must not break shopping.
    let hero: PublicHero | null = null;
    try {
      const { data: raw, error } = await sb.rpc("public_catalog_hero");
      if (error) {
        heroUnavailable = true;
        return null;
      }
      const parsed = z
        .object({
          image_path: z.string().regex(/^hero\/[0-9a-f-]{36}\.(png|webp)$/),
          offer_kind: z.enum(["up-to", "percent", "amount", "starting", "custom"]),
          offer_value: z.coerce.number().positive().max(1000000),
          custom_text: z.string().min(1).max(40),
          heading: z.string().min(1).max(60),
          subtitle: z.string().max(120),
          button_label: z.string().min(1).max(30),
          action: z.enum(["collection", "product", "category", "whatsapp"]),
          product_id: z.string().uuid().nullable(),
          category: z.enum(["All", "Gents", "Ladies", "Boys", "Girls", "Kids"]),
          motion: z.boolean(),
          image_scale: z.number().int().min(65).max(100),
        })
        .safeParse(raw);
      if (parsed.success) {
        const { image_path, ...settings } = parsed.data;
        const { data: signed } = await sb.storage
          .from(HERO_BUCKET)
          .createSignedUrl(image_path, 3600);
        if (signed?.signedUrl) hero = { ...settings, image: signed.signedUrl };
        else heroUnavailable = true;
      } else if (raw !== null && raw !== undefined) heroUnavailable = true;
    } catch {
      heroUnavailable = true;
      /* Existing catalog remains available. */
    }

    return hero;
  })();
  const paths = [...new Set(d.products.map((p) => p.image).filter((x): x is string => !!x))];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await sb.storage
      .from("product-images")
      .createSignedUrls(paths, 6 * 3600);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  const [presentation, offer, hero, bargainEnabled, cartReady] = await Promise.all([
    presentationRequest,
    offerRequest,
    heroRequest,
    bargainRequest,
    cartRequest,
  ]);
  return {
    enabled: true,
    presentation,
    hero,
    ...(heroUnavailable ? { heroUnavailable: true } : {}),
    offer,
    shop: {...d.shop,cart_ready:cartReady},
    products: d.products.map((p) => ({
      ...p,
      bargain_enabled: bargainEnabled.has(p.id),
      image_key: p.image,
      image: p.image ? (urls.get(p.image) ?? null) : null,
    })),
  };
}
