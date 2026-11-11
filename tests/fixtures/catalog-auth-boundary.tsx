import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as ApplicationRoot } from "/src/routes/__root.tsx";
import { attachAppAuth } from "/src/lib/attach-app-auth.ts";
import {
  getCatalog,
  getCatalogSnapshot,
  getCatalogPhotos,
  createBooking,
  checkCoupon,
  trackOrder,
} from "/src/lib/catalog.functions.ts";
import { getCatalogPromotion } from "/src/lib/catalog-promotion.functions.ts";
import { getBargain, makeBargain } from "/src/lib/catalog-bargain.functions.ts";
import { checkCartCoupon, createCartOrder } from "/src/lib/catalog-cart.functions.ts";
import { requireOwnerRoute } from "/src/lib/owner-route.ts";
import { Route as AuthenticatedRoute } from "/src/routes/_authenticated/route.tsx";
const queryClient = new QueryClient();
const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: ApplicationRoot.options.component,
});
const catalog = createRoute({
  getParentRoute: () => root,
  path: "/catalog",
  component: () => <p>Public catalog boundary</p>,
});
const dashboard = createRoute({
  getParentRoute: () => root,
  path: "/dashboard",
  component: () => <p>App auth boundary</p>,
});
const router = createRouter({
  routeTree: root.addChildren([catalog, dashboard]),
  context: { queryClient },
  history: createMemoryHistory({ initialEntries: ["/catalog"] }),
});
window.__authBoundary = {
  router,
  queryClient,
  requireOwnerRoute,
  beforeLoad: AuthenticatedRoute.options.beforeLoad,
  client: attachAppAuth.options.client,
  publicFns: [
    getCatalog,
    getCatalogSnapshot,
    getCatalogPhotos,
    getCatalogPromotion,
    getBargain,
    makeBargain,
    createBooking,
    checkCoupon,
    trackOrder,
    checkCartCoupon,
    createCartOrder,
  ],
};
const container = document.getElementById("root");
window.__boundaryRoot ??= createRoot(container);
window.__boundaryRoot.render(<RouterProvider router={router} />);
