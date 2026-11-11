import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CatalogProductGallery } from "/src/components/CatalogProductGallery.tsx";
function App() {
  const [id, setId] = useState("one");
  return (
    <main style={{ maxWidth: 390, margin: "auto", padding: 16 }}>
      <button onClick={() => setId("two")}>Switch product</button>
      <CatalogProductGallery
        key={id}
        productId={id}
        cover={"/smooth-" + id + "-cover.svg"}
        label={"Pair " + id}
        motionEnabled={!location.search.includes("motion=off")}
      />
    </main>
  );
}
const target = window as typeof window & { __galleryRoot?: ReturnType<typeof createRoot> };
target.__galleryRoot ??= createRoot(document.getElementById("root")!);
target.__galleryRoot.render(<App />);
