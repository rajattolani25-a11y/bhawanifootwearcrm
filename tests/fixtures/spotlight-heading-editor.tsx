import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { SpotlightHeadingEditor } from "/src/components/SpotlightHeadingEditor.tsx";
import { Toaster } from "/src/components/ui/sonner.tsx";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const target = window as typeof window & { __headingRoot?: ReturnType<typeof createRoot> };
target.__headingRoot ??= createRoot(document.getElementById("root")!);
target.__headingRoot.render(
  <QueryClientProvider client={client}>
    <LanguageProvider>
      <main className="mx-auto max-w-xl space-y-5 p-6">
        <button>Existing product controls</button>
        <SpotlightHeadingEditor productId="10000000-0000-4000-8000-000000000001" />
      </main>
      <Toaster />
    </LanguageProvider>
  </QueryClientProvider>,
);
