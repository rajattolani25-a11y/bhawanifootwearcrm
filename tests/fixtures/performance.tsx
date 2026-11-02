import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useStock } from "/src/lib/stock.ts";
import { supabase } from "/src/integrations/supabase/client.ts";
// Vite can reevaluate this fixture during dependency warming; keep one root/client.
const existing = (window as any).__perf;
const client = existing?.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
const root = existing?.root ?? createRoot(document.getElementById("root")!);
Object.assign(window, { __perf: { client, root, supabase, focusManager } });
function Panel({ active }: { active: boolean }) {
  const { data, error } = useStock(active ? { activeOnly: true } : { order: "id" });
  return (
    <output data-panel={active ? "pos" : "all"}>
      {error ? error.message : data ? JSON.stringify(data) : "Loading"}
    </output>
  );
}
function Demo() {
  const [both, setBoth] = React.useState(true);
  return (
    <>
      <button onClick={() => setBoth(false)}>Unmount second consumer</button>
      <Panel active />
      {both && <Panel active={false} />}
    </>
  );
}
root.render(
  <QueryClientProvider client={client}>
    <Demo />
  </QueryClientProvider>,
);
