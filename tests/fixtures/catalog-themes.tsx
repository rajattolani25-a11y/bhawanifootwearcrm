import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogHero } from "/src/components/CatalogHero.tsx";
import { CatalogThemePicker } from "/src/components/CatalogThemePicker.tsx";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
import { CATALOG_THEMES } from "/src/lib/catalog-themes.ts";
import { HERO_DEFAULTS } from "/src/lib/catalog-hero.ts";
const hero = {
  ...HERO_DEFAULTS,
  image: "/catalog-preview-shoe.png",
  heading: "Your everyday. Elevated.",
  subtitle: "Find your next favourite pair.",
  button_label: "Shop the collection",
};
function Demo() {
  const [theme, setTheme] = React.useState("studio");
  return (
    <InterfaceMotion>
      <LanguageProvider>
        <main style={{ maxWidth: 1440, margin: "auto", padding: 20 }}>
          <h1 style={{ fontSize: 26 }}>Catalog themes · design preview</h1>
          <p>Sample footwear and offers · no live changes</p>
          <CatalogThemePicker value={theme} onChange={setTheme} />
          <div id="selected-theme">
            <CatalogHero hero={hero} theme={theme} />
          </div>
          <div
            id="theme-sheet"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
              gap: 16,
              marginTop: 28,
            }}
          >
            {CATALOG_THEMES.map((item) => (
              <article key={item.id} style={{ containerType: "inline-size", minWidth: 0 }}>
                <h2 style={{ fontSize: 17, padding: "8px 0" }}>{item.name}</h2>
                <CatalogHero hero={hero} theme={item.id} />
              </article>
            ))}
          </div>
        </main>
      </LanguageProvider>
    </InterfaceMotion>
  );
}
createRoot(document.getElementById("root")).render(<Demo />);
