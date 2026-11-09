import { readPublicCatalog } from "./catalog-read";
import type { CatalogPresentation } from "./catalog-presentation";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PublicHero } from "./catalog-hero";

export type Fulfillment = "pickup" | "local" | "outside";
export type CatalogSize = { id: string; size: string; available: boolean };
export type CatalogProduct = { id: string; brand: string; article: string; category: string; gender: string | null; color: string | null; description?: string | null; spotlight_label?: string | null; bargain_enabled?: boolean; mrp: number; price: number; image: string | null; image_key?: string | null; few_left?: boolean; sizes: CatalogSize[] };
export type CatalogShop = { name: string; phone: string | null; address: string | null; booking: boolean; local: boolean; outside: boolean; local_charge: number; outside_charge: number; free_delivery_above: number | null; delivery_note: string | null; advance_percent: number; hold_hours: number; cart_ready?: boolean; cart_coupon_ready?: boolean };
export type CatalogOffer = { title: string; subtitle: string | null; card: boolean; code: string | null; kind: string | null; value: number | null; max_discount: number | null; min_bill: number | null } | null;
export type CatalogData = { enabled: boolean; shop?: CatalogShop; products?: CatalogProduct[]; offer?: CatalogOffer; hero?: PublicHero | null; heroUnavailable?: boolean; presentation?: CatalogPresentation };
export type BookingResult = { booking_no: string; advance: number; price: number; delivery_charge: number; fulfillment: Fulfillment; upi_id: string; shop: string; phone: string | null; product: string; size: string; hold_hours: number; coupon_code?: string | null; coupon_discount?: number };
export type TrackResult = { booking_no: string; product: string; size: string; status: string; fulfillment: Fulfillment; price: number; advance: number; delivery_charge: number; created_at: string; expires_at: string; history: { status: string; at: string }[] } | null;

export async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

// Public: only safe fields (no cost, no stock counts) come from the public_catalog DB function.
export const getCatalog = createServerFn({ method: "GET" }).handler(async (): Promise<CatalogData> => {
  const { publicCatalogPhotoCache } = await import("./public-catalog-photo-cache");
  return readPublicCatalog(await publicClient(), publicCatalogPhotoCache(`${process.env["SUPABASE_URL"]}:${process.env["SUPABASE_PUBLISHABLE_KEY"]}`));
});

/** Public metadata only; existing signed photo URLs are reused when paths are unchanged. */
export const getCatalogSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<CatalogData> => {
  const sb = await publicClient();
  const { data, error } = await sb.rpc("public_catalog");
  if (error) throw new Error("Catalog refresh is unavailable");
  const d = data as unknown as CatalogData;
  const [flags,cartReady] = await Promise.all([sb.rpc("catalog_bargain_enabled").then(({data}) => new Set(Array.isArray(data) ? data as string[] : []), () => new Set<string>()),sb.rpc("catalog_cart_version").then(({data,error})=>!error && (data === 1 || data === 2) ? data : 0,()=>0)]);
  if (!d.enabled || !d.shop) return { enabled: false };
  return { enabled: true, shop: {...d.shop,cart_ready:cartReady>=1,cart_coupon_ready:cartReady>=2}, products: (d.products ?? []).map(p => ({ ...p, bargain_enabled: flags.has(p.id), image_key: p.image, image: null })) };
});

const mobileRx = /^(\+?91)?[6-9]\d{9}$/;

/** Extra angles are fetched only when a customer opens a product. Cover fallback on older DBs. */
export const getCatalogPhotos = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input }): Promise<{ images: string[]; available: boolean }> => {
    const sb = await publicClient();
    const { data, error } = await sb.rpc("public_catalog_photos", { _product_id: input.productId });
    if (error) return { images: [], available: false };
    const paths = z.array(z.string()).max(8).safeParse(data);
    if (!paths.success || !paths.data.length) return { images: [], available: true };
    const { publicCatalogPhotoCache } = await import("./public-catalog-photo-cache");
    const cache = publicCatalogPhotoCache(`${process.env["SUPABASE_URL"]}:${process.env["SUPABASE_PUBLISHABLE_KEY"]}`);
    const signed = await cache.getMany("product-images", paths.data, async batch => {
      const { data, error } = await sb.storage.from("product-images").createSignedUrls(batch, 3600);
      if (error) throw error;
      return new Map((data ?? []).flatMap(row => row.path && row.signedUrl ? [[row.path, row.signedUrl]] : []));
    });
    const images = paths.data.flatMap(path => signed.get(path) ? [signed.get(path)!] : []);
    return { images, available: images.length === paths.data.length };
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      variantId: z.string().uuid(),
      requestId: z.string().uuid(),
      cartReady: z.boolean().optional(),
      bargain: z.object({ id: z.string().uuid(), client: z.string().uuid() }).optional(),
      quote: z.object({ price: z.number().finite().nonnegative(), net: z.number().finite().nonnegative(), charge: z.number().finite().nonnegative(), advance: z.number().finite().nonnegative() }),
      name: z.string().trim().min(2).max(60),
      mobile: z.string().trim().regex(mobileRx, "Enter a valid 10-digit mobile number"),
      fulfillment: z.enum(["pickup", "local", "outside"]),
      address: z.string().trim().max(300).optional().default(""),
      area: z.string().trim().max(80).optional().default(""),
      coupon: z.string().trim().max(30).optional().default(""),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<BookingResult> => {
    const sb = await publicClient();
    if(data.cartReady){
      const {data:r,error}=await sb.rpc("create_catalog_cart_order",{_request_id:data.requestId,_items:[{variant_id:data.variantId,price:data.quote.price,net:data.quote.net,coupon:data.coupon,...(data.bargain?{bargain_id:data.bargain.id,client:data.bargain.client}:{})}],_name:data.name,_mobile:data.mobile,_fulfillment:data.fulfillment,_address:data.address,_area:data.area,_quote:{net:data.quote.net,charge:data.quote.charge,advance:data.quote.advance}});
      if(error){const message=error.message.startsWith("CART_BARGAIN_CHANGED:")?"This bargain price has expired or changed. Review the listed price before ordering.":error.message;throw Error((/^[0-9A-Z]{5}$/.test(error.code??"")&&!error.code.startsWith("PGRST")?"ORDER_REJECTED: ":"ORDER_UNCONFIRMED: ")+message);}
      const cart=r as import("./catalog-cart-checkout").CartOrderResult;
      if(cart.orders?.length!==1)throw Error("ORDER_UNCONFIRMED: The saved order response was incomplete. Recover the original request.");
      return {...cart.orders[0]!,upi_id:cart.upi_id,phone:cart.phone,shop:cart.shop,hold_hours:cart.hold_hours};
    }
    const { data: r, error } = await sb.rpc(data.bargain ? "create_catalog_bargain_order" : "create_catalog_order", { ...(data.bargain ? { _deal_id: data.bargain.id, _client: data.bargain.client } : {}), _variant_id: data.variantId, _name: data.name, _mobile: data.mobile, _fulfillment: data.fulfillment, _address: data.address, _area: data.area, _coupon: data.coupon, _request_id: data.requestId, _quote: data.quote });
    if (error) throw new Error((/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST") ? "ORDER_REJECTED: " : "ORDER_UNCONFIRMED: ") + error.message);
    return r as unknown as BookingResult;
  });

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ bookingNo: z.string().trim().min(4).max(64), mobile: z.string().trim().regex(mobileRx, "Enter a valid 10-digit mobile number") }).parse(input),
  )
  .handler(async ({ data }): Promise<TrackResult | import("./catalog-cart-checkout").CartOrderResult> => {
    const sb = await publicClient();
    const { data: r, error } = await sb.rpc(/^CT-[0-9A-F]{16}$/i.test(data.bookingNo) ? "track_catalog_cart_order" : "track_catalog_order", { ...(/^CT-[0-9A-F]{16}$/i.test(data.bookingNo) ? {_cart_no:data.bookingNo} : {_booking_no:data.bookingNo}), _mobile: data.mobile });
    if (error) throw new Error("Could not check the order right now");
    return (r as unknown as TrackResult | import("./catalog-cart-checkout").CartOrderResult) ?? null;
  });

export const checkCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ variantId: z.string().uuid(), code: z.string().trim().min(2).max(30), mobile: z.string().trim().regex(mobileRx, "Enter a valid 10-digit mobile number first") }).parse(input),
  )
  .handler(async ({ data }): Promise<{ code: string; amount: number }> => {
    const sb = await publicClient();
    const { data: r, error } = await sb.rpc("check_catalog_coupon", { _variant_id: data.variantId, _code: data.code, _mobile: data.mobile });
    if (error) throw new Error(error.message);
    return r as unknown as { code: string; amount: number };
  });
