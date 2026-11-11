import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteError } from "@/components/RouteError";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1e1f2b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { title: "SoleStack POS" },
      { name: "description", content: "Footwear retail POS for billing, stock and customers." },
      { property: "og:title", content: "SoleStack POS" },
      { property: "og:description", content: "Footwear retail POS for billing, stock and customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preload", href: "/fonts/ibm-plex-sans-latin-cabaa97b26.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/libre-baskerville-latin-39d80e8d32.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RouteError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const AppAuthObserver = lazy(() => import("@/components/AppAuthObserver"));

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: state => state.location.pathname });
  // Public-only visitors need no auth SDK. Once opened in this document, keep
  // the observer mounted even on the catalog so owner sign-out still clears caches.
  const publicCatalog = pathname.replace(/\/+$/, "") === "/catalog";
  const [observeAuth, setObserveAuth] = useState(!publicCatalog);
  useEffect(() => { if (!publicCatalog) setObserveAuth(true); }, [publicCatalog]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {observeAuth && <Suspense fallback={null}><AppAuthObserver queryClient={queryClient} router={router}/></Suspense>}
        <Outlet />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
