import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CatalogProductGallery } from "/src/components/CatalogProductGallery.tsx";
function App() {
  const [id, setId] = useState("one");
  const [renewed, setRenewed] = useState(false);
  return (
    <main style={{ maxWidth: 390, margin: "auto", padding: 16 }}>
      <button
        onClick={() => {
          setId("two");
          setRenewed(false);
        }}
      >
        Switch product
      </button>
      <button onClick={() => setRenewed(true)}>Renew cover token</button>
      <CatalogProductGallery
        key={id}
        productId={id}
        cover={
          "/smooth-" +
          id +
          "-cover.svg" +
          (location.search.includes("cover=expired")
            ? "?token=expired"
            : renewed
              ? "?token=renewed"
              : "")
        }
        label={"Pair " + id}
        motionEnabled={!location.search.includes("motion=off")}
      />
    </main>
  );
}
const target = window as typeof window & { __galleryRoot?: ReturnType<typeof createRoot> };
target.__galleryRoot ??= createRoot(document.getElementById("root")!);
target.__galleryRoot.render(<App />);
