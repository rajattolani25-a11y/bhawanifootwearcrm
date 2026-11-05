import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { OwnerCartPayment } from "/src/components/catalog-commerce/OwnerCartPayment.tsx";
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={new QueryClient()}>
    <LanguageProvider>
      <OwnerCartPayment
        reference="CT-ABCDEF1234567890"
        mobile="9999999999"
        refresh={() => {
          window.__refresh = (window.__refresh ?? 0) + 1;
        }}
        onUpdate={(url, reference) => {
          window.__update = { url, reference };
        }}
      />
    </LanguageProvider>
  </QueryClientProvider>,
);
