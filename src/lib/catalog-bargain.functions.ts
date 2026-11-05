import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { CatalogDeal } from "./catalog-bargain";
const selection = z.object({ variantId: z.string().uuid(), client: z.string().uuid() });
export const getBargain = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => selection.parse(input))
  .handler(async ({ data }): Promise<CatalogDeal | null> => {
    const { publicClient } = await import("./catalog.functions");
    const sb = await publicClient();
    const { data: result, error } = await sb.rpc("catalog_bargain_state", {
      _variant_id: data.variantId,
      _client: data.client,
    });
    if (error) throw Error("Bargaining is unavailable. You can still order at the listed price.");
    return result as CatalogDeal | null;
  });
export const makeBargain = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    selection.extend({ offer: z.number().finite().positive().max(100000000) }).parse(input),
  )
  .handler(async ({ data }): Promise<CatalogDeal> => {
    const { publicClient } = await import("./catalog.functions");
    const sb = await publicClient();
    const { data: result, error } = await sb.rpc("catalog_bargain_bid", {
      _variant_id: data.variantId,
      _client: data.client,
      _offer: data.offer,
    });
    if (error) throw Error(error.message);
    return result as CatalogDeal;
  });
