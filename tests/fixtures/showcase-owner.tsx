import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { CatalogShowcaseSettings } from "/src/components/CatalogShowcaseSettings.tsx";
import { StorageMeter } from "/src/components/StorageMeter.tsx";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.getQueryCache().subscribe(event => { if (event.type === "updated" && event.action.type === "invalidate") (window.__invalidations ??= []).push(event.query.queryKey[0]); });
createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><LanguageProvider><main style={{ maxWidth: 900, margin: "auto", padding: 16 }}><StorageMeter /><CatalogShowcaseSettings /></main></LanguageProvider></QueryClientProvider>);
