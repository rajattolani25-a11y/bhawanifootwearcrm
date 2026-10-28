import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route } from "/src/routes/_authenticated/community.tsx";
import { LanguageProvider, LanguageSelect } from "/src/lib/i18n.tsx";
import { Toaster } from "sonner";
import * as posters from "/src/lib/poster.ts";

const products = [
  {
    id: "demo-shoe",
    article: "Daily Comfort",
    brand: "Demo",
    category: "Casual",
    color: "Cream / Orange",
    gender: null,
    selling_price: 999,
    mrp: 1299,
    created_at: new Date().toISOString(),
    image_url: null,
    image_src: "/poster-shoe.png",
    product_variants: [
      { id: "v1", size: "7", stock: 2 },
      { id: "v2", size: "9", stock: 0 },
      { id: "v3", size: "6", stock: 3 },
      { id: "v4", size: "7", stock: 1 },
    ],
  },
];
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
});
client.setQueryData(["stock-all"], products);
client.setQueryData(["settings"], {
  business_name: "Bhawani Footwear",
  business_phone: "00000 00000",
});
client.setQueryData(["recent-purchase", 7], new Set());
Object.assign(window, { __posters: posters, __products: products });
const Community = Route.options.component as React.ComponentType;
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <LanguageProvider>
      <main style={{ padding: 16, maxWidth: 1280, margin: "auto" }}>
        <LanguageSelect />
        <Community />
      </main>
      <Toaster />
    </LanguageProvider>
  </QueryClientProvider>,
);
