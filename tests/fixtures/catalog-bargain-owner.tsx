import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { BargainPolicyEditor } from "/src/components/catalog-commerce/BargainPolicyEditor.tsx";
function App() {
  const [owner, setOwner] = useState(true);
  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
      <button
        onClick={() => {
          window.__owner = !owner;
          setOwner(!owner);
        }}
      >
        Switch role
      </button>
      <BargainPolicyEditor
        key={String(owner)}
        productId="10000000-0000-4000-8000-000000000001"
        price={2200}
      />
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={new QueryClient()}>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </QueryClientProvider>,
);
