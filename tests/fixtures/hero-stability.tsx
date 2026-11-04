import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CatalogView } from "/src/routes/catalog.tsx";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { getCatalog } from "/src/lib/catalog.functions.ts";
const initial = await getCatalog();
function Harness() {
  const [data, setData] = useState(initial);
  Object.assign(window, {
    __replaceCatalog: (patch: object) => setData((current) => ({ ...current, ...patch })),
  });
  return (
    <InterfaceMotion>
      <LanguageProvider>
        <CatalogView data={data} />
      </LanguageProvider>
    </InterfaceMotion>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
