import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogView } from "/src/routes/catalog.tsx";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { getCatalog } from "/src/lib/catalog.functions.ts";
const target = window as typeof window & {
  __profileReact?: typeof React;
  __gridCommits?: number[];
  __renderRoot?: ReturnType<typeof createRoot>;
};
target.__profileReact = React;
target.__gridCommits = [];
const data = await getCatalog();
target.__renderRoot ??= createRoot(document.getElementById("root")!);
target.__renderRoot.render(
  <InterfaceMotion>
    <LanguageProvider>
      <CatalogView data={data} />
    </LanguageProvider>
  </InterfaceMotion>,
);
