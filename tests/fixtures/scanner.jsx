import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CameraScanner } from "/src/components/CameraScanner.tsx";
import { LanguageProvider } from "/src/lib/i18n.tsx";
function Harness() {
  const [open, setOpen] = useState(true);
  const [tick, setTick] = useState(0);
  return (
    <LanguageProvider>
      <button onClick={() => setTick((x) => x + 1)}>Rerender {tick}</button>
      <button onClick={() => setOpen((x) => !x)}>{open ? "Close scanner" : "Open scanner"}</button>
      {open && (
        <CameraScanner
          onScan={(code) => {
            window.__scanCalls.push(code);
            setTick((x) => x + 1);
            return code === "KNOWN";
          }}
        />
      )}
    </LanguageProvider>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
