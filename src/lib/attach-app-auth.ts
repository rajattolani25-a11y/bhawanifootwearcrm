import { createMiddleware } from "@tanstack/react-start";
import {
  getCatalog,
  getCatalogSnapshot,
  getCatalogPhotos,
  createBooking,
  checkCoupon,
  trackOrder,
} from "./catalog.functions";
import { getCatalogPromotion } from "./catalog-promotion.functions";
import { getBargain, makeBargain } from "./catalog-bargain.functions";
import { checkCartCoupon, createCartOrder } from "./catalog-cart.functions";
import { matchesPublicFunction } from "./public-function-auth";
import { getCatalogShowcase } from "./catalog-showcase.functions";

/** These handlers already use an anonymous publicClient and their existing DB guards.
 * Every other server function retains the original bearer-token attachment.
 * Match the compiler's exact function identity, never a page path or user input.
 */
export const attachAppAuth = createMiddleware({ type: "function" }).client(
  async ({ next, serverFnMeta }) => {
    if (
      matchesPublicFunction(serverFnMeta.id, [
        getCatalog,
        getCatalogSnapshot,
        getCatalogPhotos,
        getCatalogPromotion,
        getCatalogShowcase,
        getBargain,
        makeBargain,
        createBooking,
        checkCoupon,
        trackOrder,
        checkCartCoupon,
        createCartOrder,
      ])
    )
      return next();
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
