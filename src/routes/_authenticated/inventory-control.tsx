import { isDeadStock, isLowStock } from "@/lib/stock-policy";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { requireOwnerRoute } from "@/lib/owner-route";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sizeSort, useStock, type Product, type Variant } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/inventory-control")({
  beforeLoad: requireOwnerRoute,
  head: () => ({ meta: [{ title: "Inventory Control — SoleStack POS" }, { name: "description", content: "Low stock, damaged, dead stock and stock adjustments." }, { property: "og:title", content: "Inventory Control — SoleStack POS" }, { property: "og:description", content: "Monitor low, damaged and inactive footwear stock." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Control,
});

function Control() {
  const { data = [], error: stockError, isPending: stockPending } = useStock();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"low" | "damaged" | "dead" | "adjust">("low");
  const [q, setQ] = useState("");
  const { data: soldIds = new Set<string>(), error: soldError, isPending: soldPending } = useQuery({
    queryKey: ["sold-60"],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { fetchAll } = await import("@/lib/fetch-all");
      const data = await fetchAll((a, b) => supabase.from("sale_items").select("variant_id,sales!inner(sale_date)").gte("sales.sale_date", since).range(a, b));
      return new Set(data.map((r) => r.variant_id as string));
    },
  });
  const flat = data.flatMap((p) => p.product_variants.map((v) => ({ p, v })));
  const low = flat.filter(({ v }) => isLowStock(v.stock, v.min_stock));
  const damaged = flat.filter(({ v }) => v.damaged_stock > 0);
  const dead = soldError || soldPending ? [] : flat.filter(({ p, v }) => v.stock > 0 && isDeadStock(v.created_at ?? p.created_at, soldIds.has(v.id)));
  const s = q.toLowerCase();
  const adj = flat.filter(({ p, v }) => !s || `${p.brand} ${p.article} ${v.size} ${v.barcode}`.toLowerCase().includes(s)).slice(0, 100);

  async function adjust(p: Product, v: Variant, patch: Partial<Variant>, note: string, disposition: string | null = null) {
    const { error } = await supabase.rpc("adjust_inventory", {
      _variant_id: v.id, _expected_stock: v.stock, _expected_damaged: v.damaged_stock,
      _stock: patch.stock ?? null, _min: patch.min_stock ?? null, _rack: patch.rack ?? null,
      _disposition: disposition, _reason: note,
    });
    if (error) { toast.error(error.code === "PGRST202" ? "Apply database update 0035 before adjusting stock." : error.message); return false; }
    toast.success("Saved");
    await refreshOperationalData(qc);
    return true;
  }

  const tabs = [["low", `Low stock (${low.length})`], ["damaged", `Damaged (${damaged.length})`], ["dead", `Dead 60d (${dead.length})`], ["adjust", "Adjust stock"]] as const;
  const list = tab === "low" ? low : tab === "damaged" ? damaged : tab === "dead" ? dead : adj;
  const grouped = data.map((p) => ({
    product: p,
    variants: list.filter((entry) => entry.p.id === p.id).map((entry) => entry.v).sort((a, b) => sizeSort(a.size, b.size)),
  })).filter((group) => group.variants.length);
  return (
    <div>
      <PageHeader title="Inventory Control" subtitle="Reorder, damaged bucket, dead stock and manual correction." />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>)}
        {tab === "adjust" && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search / scan" className="h-9 w-56" />}
      </div>
      {tab === "dead" && soldPending && <p role="status">Checking recent sales…</p>}
      {tab === "dead" && soldError && <p role="alert">Recent sales could not be loaded. Dead stock cannot be verified. <Button variant="outline" onClick={() => qc.invalidateQueries({queryKey:["sold-60"]})}>Retry</Button></p>}
      {stockPending && <p role="status">Loading inventory…</p>}
      {stockError && <p role="alert">Inventory could not be loaded. <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["stock-all"] })}>Retry</Button></p>}
      <div className="divide-y border-y">
        {grouped.map(({ product, variants }) => <section key={product.id} className="py-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold"><span className="text-xs uppercase text-primary">{product.brand}</span> <span className="text-base">{product.article}</span></h2>
            <span className="text-xs text-muted-foreground">{variants.length} sizes · {variants.reduce((total, variant) => total + variant.stock, 0)} pairs</span>
          </div>
          <div className="divide-y border-l-2 border-primary/40 pl-3">
            {variants.map((v) => <Row key={v.id} p={product} v={v} tab={tab} adjust={adjust} />)}
          </div>
        </section>)}
        {!stockPending && !stockError && !grouped.length && <p className="py-6 text-center text-muted-foreground">Nothing here</p>}
      </div>
    </div>
  );
}

function Row({ p, v, tab, adjust }: { p: Product; v: Variant; tab: string; adjust: (p: Product, v: Variant, patch: Partial<Variant>, note: string, disposition?: string | null) => Promise<boolean> }) {
  const [snapshot, setSnapshot] = useState(v);
  const [dirty, setDirty] = useState(false);
  const [stock, setStock] = useState(String(v.stock));
  const [min, setMin] = useState(String(v.min_stock));
  const [rack, setRack] = useState(v.rack ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setSnapshot(v); setStock(String(v.stock)); setMin(String(v.min_stock)); setRack(v.rack ?? "");
  }, [v, dirty]);
  async function save(disposition: string | null = null) {
    if (busy) return;
    const next = Number(stock), minimum = Number(min);
    if (!Number.isInteger(next) || next < 0 || !Number.isInteger(minimum) || minimum < 0) { toast.error("Enter valid non-negative stock and minimum"); return; }
    const reason = next !== snapshot.stock || disposition ? window.prompt(disposition ? "Reason for damaged stock disposition (no supplier credit is created)" : "Stock adjustment reason") : "Rack / minimum updated";
    if (!reason) return;
    setBusy(true);
    try {
      if (await adjust(p, snapshot, disposition ? {} : { ...(next !== snapshot.stock ? { stock: next } : {}), min_stock: minimum, rack }, reason, disposition)) setDirty(false);
    } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-sm">
    <strong className="min-w-16">Size {v.size}</strong>
    <label className="flex items-center gap-2">Stock {tab === "adjust" ? <Input type="number" min="0" aria-label={`Size ${v.size} stock`} value={stock} onChange={e => { setDirty(true); setStock(e.target.value); }} className="h-8 w-20" /> : <b>{v.stock}</b>}</label>
    <label className="flex items-center gap-2">Min {tab === "adjust" ? <Input type="number" min="0" aria-label={`Size ${v.size} minimum stock`} value={min} onChange={e => { setDirty(true); setMin(e.target.value); }} className="h-8 w-16" /> : <b>{v.min_stock}</b>}</label>
    <span>Damaged <b>{v.damaged_stock}</b></span>
    <label className="flex items-center gap-2">Rack {tab === "adjust" ? <Input aria-label={`Size ${v.size} rack`} value={rack} onChange={e => { setDirty(true); setRack(e.target.value); }} className="h-8 w-20" /> : <b>{v.rack || "—"}</b>}</label>
    {dirty && (snapshot.stock !== v.stock || snapshot.damaged_stock !== v.damaged_stock) && <p role="alert" className="text-destructive">Stock changed. Reload inventory before saving. <Button size="sm" variant="outline" onClick={() => setDirty(false)}>Discard changes</Button></p>}
    {tab === "adjust" && <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>Save</Button>}
    {tab === "damaged" && <><Button size="sm" variant="outline" disabled={busy} onClick={() => void save("supplier")}>Return to supplier</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void save("writeoff")}>Write off damaged</Button></>}
  </div>;
}
