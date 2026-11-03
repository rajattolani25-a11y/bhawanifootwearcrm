import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { StorageMeter } from "/src/components/StorageMeter.tsx";

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={new QueryClient()}>
    <LanguageProvider>
      <main style={{ maxWidth: 960, margin: "auto", padding: 16 }}>
        <StorageMeter />
      </main>
    </LanguageProvider>
  </QueryClientProvider>,
);
