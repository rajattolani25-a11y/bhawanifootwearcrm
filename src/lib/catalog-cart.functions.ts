import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { CartOrderResult } from "./catalog-cart-checkout";
const request = z.object({
  requestId: z.string().uuid(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        price: z.number().finite().positive(),
        net: z.number().finite().positive(),
        coupon: z.string().trim().max(30),
        bargain: z.object({ id: z.string().uuid(), client: z.string().uuid() }).optional(),
      }),
    )
    .min(1)
    .max(30),
  name: z.string().trim().min(2).max(60),
  mobile: z
    .string()
    .trim()
    .regex(/^(\+?91)?[6-9]\d{9}$/),
  fulfillment: z.enum(["pickup", "local", "outside"]),
  address: z.string().max(300),
  area: z.string().max(80),
  quote: z.object({
    net: z.number().finite().positive(),
    charge: z.number().finite().nonnegative(),
    advance: z.number().finite().positive(),
  }),
});
export const createCartOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => request.parse(input))
  .handler(async ({ data }): Promise<CartOrderResult> => {
    const { publicClient } = await import("./catalog.functions");
    const sb = await publicClient();
    const { data: result, error } = await sb.rpc("create_catalog_cart_order", {
      _request_id: data.requestId,
      _items: data.items.map((item) => ({
        variant_id: item.variantId,
        price: item.price,
        net: item.net,
        coupon: item.coupon,
        ...(item.bargain ? { bargain_id: item.bargain.id, client: item.bargain.client } : {}),
      })),
      _name: data.name,
      _mobile: data.mobile,
      _fulfillment: data.fulfillment,
      _address: data.address,
      _area: data.area,
      _quote: data.quote,
    });
    if (error)
      throw Error(
        (/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST")
          ? "ORDER_REJECTED: "
          : "ORDER_UNCONFIRMED: ") + error.message,
      );
    if (!result || !Array.isArray(result.orders) || result.orders.length !== data.items.length)
      throw Error(
        "ORDER_UNCONFIRMED: The saved cart response was incomplete. Recover the original request.",
      );
    return result as CartOrderResult;
  });
