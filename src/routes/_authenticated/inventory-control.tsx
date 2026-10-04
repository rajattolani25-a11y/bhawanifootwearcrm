import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sizeSort, useStock, type Product, type Variant } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/inventory-control")({
  head: () => ({ meta: [{ title: "Inventory Control — SoleStack POS" }, { name: "description", content: "Low stock, damaged, dead stock and stock adjustments." }, { property: "og:title", content: "Inventory Control — SoleStack POS" }, { property: "og:description", content: "Monitor low, damaged and inactive footwear stock." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Control,
});

function Control() {
  const { data = [] } = useStock();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"low" | "damaged" | "dead" | "adjust">("low");
  const [q, setQ] = useState("");
  const { data: soldIds = new Set<string>() } = useQuery({
    queryKey: ["sold-60"],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      const { fetchAll } = await import("@/lib/fetch-all");
      const data = await fetchAll((a, b) => supabase.from("sale_items").select("variant_id,sales!inner(sale_date)").gte("sales.sale_date", since).range(a, b));
      return new Set(data.map((r) => r.variant_id as string));
    },
  });
  const flat = data.flatMap((p) => p.product_variants.map((v) => ({ p, v })));
  const low = flat.filter(({ v }) => v.stock <= v.min_stock);
  const damaged = flat.filter(({ v }) => v.damaged_stock > 0);
  const dead = flat.filter(({ p, v }) => v.stock > 0 && !soldIds.has(v.id) && Date.now() - new Date(p.created_at).getTime() > 60 * 864e5);
  const s = q.toLowerCase();
  const adj = flat.filter(({ p, v }) => !s || `${p.brand} ${p.article} ${v.size} ${v.barcode}`.toLowerCase().includes(s)).slice(0, 100);

  async function adjust(p: Product, v: Variant, patch: Partial<Variant>, note: string) {
    const { error } = await supabase.from("product_variants").update(patch).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    const diff = (patch.stock ?? v.stock) - v.stock;
    if (diff) await supabase.from("stock_movements").insert({ type: "ADJUST", variant_id: v.id, product_name: `${p.brand} ${p.article} (${v.size})`, qty_in: Math.max(diff, 0), qty_out: Math.max(-diff, 0), note });
    toast.success("Saved");
    qc.invalidateQueries();
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
        {!grouped.length && <p className="py-6 text-center text-muted-foreground">Nothing here</p>}
      </div>
    </div>
  );
}

function Row({ p, v, tab, adjust }: { p: Product; v: Variant; tab: string; adjust: (p: Product, v: Variant, patch: Partial<Variant>, note: string) => void }) {
  const [stock, setStock] = useState(String(v.stock));
  const [min, setMin] = useState(String(v.min_stock));
  const [rack, setRack] = useState(v.rack ?? "");
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-sm">
      <strong className="min-w-16">Size {v.size}</strong>
      <label className="flex items-center gap-2 text-muted-foreground">Stock {tab === "adjust" ? <Input type="number" min="0" aria-label={`Size ${v.size} stock`} value={stock} onChange={(e) => setStock(e.target.value)} className="h-8 w-20 text-foreground" /> : <b className="text-foreground">{v.stock}</b>}</label>
      <label className="flex items-center gap-2 text-muted-foreground">Min {tab === "adjust" ? <Input type="number" min="0" aria-label={`Size ${v.size} minimum stock`} value={min} onChange={(e) => setMin(e.target.value)} className="h-8 w-16 text-foreground" /> : <b className="text-foreground">{v.min_stock}</b>}</label>
      <span className="text-muted-foreground">Damaged <b className="text-foreground">{v.damaged_stock}</b></span>
      <label className="flex items-center gap-2 text-muted-foreground">Rack {tab === "adjust" ? <Input aria-label={`Size ${v.size} rack`} value={rack} onChange={(e) => setRack(e.target.value)} className="h-8 w-20 text-foreground" /> : <b className="text-foreground">{v.rack || "—"}</b>}</label>
      {tab === "adjust" && <Button size="sm" onClick={() => { const nextStock = Number(stock), nextMin = Number(min); if (!Number.isInteger(nextStock) || nextStock < 0 || !Number.isInteger(nextMin) || nextMin < 0) { toast.error("Enter valid non-negative stock and minimum"); return; } void adjust(p, v, { stock: nextStock, min_stock: nextMin, rack }, "Manual count"); }}>Save</Button>}
      {tab === "damaged" && <Button size="sm" variant="outline" onClick={() => adjust(p, v, { damaged_stock: 0 }, "Damaged returned to supplier / written off")}>Clear (sent back)</Button>}
    </div>
  );
}
