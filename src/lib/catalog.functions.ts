import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CatalogSize = { id: string; size: string; available: boolean };
export type CatalogProduct = { id: string; brand: string; article: string; category: string; gender: string | null; color: string | null; mrp: number; price: number; image: string | null; sizes: CatalogSize[] };
export type CatalogShop = { name: string; phone: string | null; address: string | null; booking: boolean; advance_percent: number; hold_hours: number };
export type CatalogData = { enabled: boolean; shop?: CatalogShop; products?: CatalogProduct[] };
export type BookingResult = { booking_no: string; advance: number; price: number; upi_id: string; shop: string; phone: string | null; product: string; size: string; hold_hours: number };

async function publicClient() {
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
  const sb = await publicClient();
  const { data, error } = await sb.rpc("public_catalog");
  if (error) throw new Error("Catalog is not available right now");
  const d = data as unknown as CatalogData;
  if (!d.enabled || !d.products) return { enabled: false };
  const paths = d.products.map((p) => p.image).filter((x): x is string => !!x);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await sb.storage.from("product-images").createSignedUrls(paths, 6 * 3600);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  return { enabled: true, shop: d.shop, products: d.products.map((p) => ({ ...p, image: p.image ? urls.get(p.image) ?? null : null })) };
});

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      variantId: z.string().uuid(),
      name: z.string().trim().min(2).max(60),
      mobile: z.string().trim().regex(/^(\+?91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<BookingResult> => {
    const sb = await publicClient();
    const { data: r, error } = await sb.rpc("create_catalog_booking", { _variant_id: data.variantId, _name: data.name, _mobile: data.mobile });
    if (error) throw new Error(error.message);
    return r as unknown as BookingResult;
  });
