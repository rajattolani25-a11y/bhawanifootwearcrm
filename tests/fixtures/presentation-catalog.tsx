import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogView } from "/src/routes/catalog.tsx";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { getCatalog } from "/src/lib/catalog.functions.ts";
const data = await getCatalog();
createRoot(document.getElementById("root")).render(
  <InterfaceMotion>
    <LanguageProvider>
      <CatalogView data={data} />
    </LanguageProvider>
  </InterfaceMotion>,
);
