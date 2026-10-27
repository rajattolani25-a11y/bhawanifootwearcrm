import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogHero } from "/src/components/CatalogHero.tsx";
import { InterfaceMotion } from "/src/components/motion/provider.tsx";
import { HERO_DEFAULTS } from "/src/lib/catalog-hero.ts";
function Demo() {
  const [motion, setMotion] = React.useState(true),
    [opened, setOpened] = React.useState(false);
  return (
    <InterfaceMotion>
      <main style={{ padding: 24, maxWidth: 1120, margin: "auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Catalog hero · motion preview</h1>
        <p style={{ marginBottom: 18, fontSize: 12 }}>
          Sample footwear and offer · no live shop changes
        </p>
        <CatalogHero
          hero={{
            ...HERO_DEFAULTS,
            motion,
            image: "/hero-preview.png",
            heading: "Your everyday. Elevated.",
            subtitle: "Find your next favourite pair.",
            button_label: "Shop the collection",
          }}
          onAction={() => setOpened(true)}
        />
        <button
          onClick={() => setMotion((v) => !v)}
          style={{ marginTop: 18, padding: 8, border: "1px solid #bac6ba", borderRadius: 8 }}
        >
          Toggle motion
        </button>
        {opened && <span>Collection opened</span>}
        <div style={{ height: 1200 }} aria-hidden="true" />
      </main>
    </InterfaceMotion>
  );
}
createRoot(document.getElementById("root")).render(<Demo />);
