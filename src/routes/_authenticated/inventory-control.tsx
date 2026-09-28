import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStock, type Product, type Variant } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/inventory-control")({
  head: () => ({ meta: [{ title: "Inventory Control — SoleStack POS" }, { name: "description", content: "Low stock, damaged, dead stock and stock adjustments." }] }),
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
      const { data } = await supabase.from("sale_items").select("variant_id,sales!inner(sale_date)").gte("sales.sale_date", since).limit(10000);
      return new Set((data ?? []).map((r) => r.variant_id as string));
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
  return (
    <div>
      <PageHeader title="Inventory Control" subtitle="Reorder, damaged bucket, dead stock and manual correction." />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{l}</button>)}
        {tab === "adjust" && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search / scan" className="h-9 w-56" />}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Article</th><th className="p-3">Size</th><th className="p-3">Stock</th><th className="p-3">Min</th><th className="p-3">Damaged</th><th className="p-3">Rack</th><th className="p-3" /></tr></thead>
          <tbody>
            {list.map(({ p, v }) => <Row key={v.id} p={p} v={v} tab={tab} adjust={adjust} />)}
            {!list.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nothing here 👍</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ p, v, tab, adjust }: { p: Product; v: Variant; tab: string; adjust: (p: Product, v: Variant, patch: Partial<Variant>, note: string) => void }) {
  const [stock, setStock] = useState(String(v.stock));
  const [min, setMin] = useState(String(v.min_stock));
  const [rack, setRack] = useState(v.rack ?? "");
  return (
    <tr className="border-t">
      <td className="p-3"><b className="text-xs uppercase text-primary">{p.brand}</b> {p.article}</td>
      <td className="p-3 font-bold">{v.size}</td>
      <td className="p-3">{tab === "adjust" ? <Input value={stock} onChange={(e) => setStock(e.target.value)} className="h-8 w-20" /> : v.stock}</td>
      <td className="p-3">{tab === "adjust" ? <Input value={min} onChange={(e) => setMin(e.target.value)} className="h-8 w-16" /> : v.min_stock}</td>
      <td className="p-3">{v.damaged_stock}</td>
      <td className="p-3">{tab === "adjust" ? <Input value={rack} onChange={(e) => setRack(e.target.value)} className="h-8 w-20" /> : v.rack}</td>
      <td className="p-3 text-right">
        {tab === "adjust" && <Button size="sm" onClick={() => adjust(p, v, { stock: Number(stock) || 0, min_stock: Number(min) || 0, rack }, "Manual count")}>Save</Button>}
        {tab === "damaged" && <Button size="sm" variant="outline" onClick={() => adjust(p, v, { damaged_stock: 0 }, "Damaged returned to supplier / written off")}>Clear (sent back)</Button>}
      </td>
    </tr>
  );
}
