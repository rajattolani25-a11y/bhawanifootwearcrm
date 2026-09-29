import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PackagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { useStock } from "@/lib/stock";
import { QuickAddProduct } from "@/components/QuickAddProduct";

export const Route = createFileRoute("/_authenticated/purchase")({
  head: () => ({ meta: [{ title: "Purchase — SoleStack POS" }, { name: "description", content: "Receive new stock from suppliers." }, { property: "og:title", content: "Purchase — SoleStack POS" }, { property: "og:description", content: "Receive and record supplier footwear stock." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Purchase,
});

type Line = { variant_id: string; label: string; qty: number; price: number; gst_rate: number; free_sample: boolean };

function Purchase() {
  const qc = useQueryClient();
  const { data: stock = [] } = useStock();
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [] });
  const { data: recent = [] } = useQuery({ queryKey: ["purchases"], queryFn: async () => (await supabase.from("purchases").select("id,purchase_date,supplier_name,invoice_no,quantity,purchase_price,total").order("purchase_date", { ascending: false }).limit(100)).data ?? [] });
  const { data: costs = [] } = useQuery({ queryKey: ["purchase-costs"], queryFn: async () => { const { data, error } = await supabase.from("product_costs").select("product_id,purchase_price"); if (error) throw error; return data; } });
  const [sup, setSup] = useState("");
  const [inv, setInv] = useState("");
  const [gst, setGst] = useState(5);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(false);
  const s = q.toLowerCase();
  const matches = s ? stock.filter((p) => `${p.brand} ${p.article} ${p.color}`.toLowerCase().includes(s)).slice(0, 8) : [];

  async function save() {
    if (!lines.length) return;
    if (lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0 || !Number.isFinite(l.price) || l.price < 0 || (l.price === 0 && !l.free_sample))) { toast.error("Enter quantity and cost for every size, or mark free/sample stock"); return; }
    setBusy(true);
    const supplier = suppliers.find((x) => x.id === sup);
    const { data, error } = await supabase.rpc("receive_stock", { _supplier_id: sup || (null as unknown as string), _supplier_name: supplier?.name ?? "", _invoice: inv, _items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price: l.price, gst_rate: l.gst_rate, free_sample: l.free_sample })) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${data} pairs added to stock`);
    setLines([]); setInv("");
    qc.invalidateQueries();
  }
  const total = lines.reduce((a, l) => a + l.qty * l.price * (1 + l.gst_rate / 100), 0);

  return (
    <div>
      <PageHeader title="Purchase" subtitle="Receive stock — adds pairs, updates cost price, logs ledger. New sizes: add in Products first." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={sup} onChange={(e) => setSup(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
              <option value="">Select supplier</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <Input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="Invoice no" />
            <select value={gst} onChange={(e) => setGst(Number(e.target.value))} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="Default GST for newly added sizes">
              {[0, 5, 12, 18].map((r) => <option key={r} value={r}>GST {r}%</option>)}
            </select>
          </div>
          <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article to add sizes" /><Button variant="outline" onClick={() => setQuick(true)}><PackagePlus className="h-4 w-4" /> New article</Button></div>
          {s && !matches.length && <p className="text-sm text-muted-foreground">Article nahi mila — "New article" se turant banao.</p>}
          <QuickAddProduct open={quick} mode="purchase" initialArticle={q} onClose={() => setQuick(false)} onAdded={(r) => { setQ(""); const label = r.variants.length ? "New article" : ""; setLines((ls) => [...ls, ...r.variants.filter((v) => !ls.some((l) => l.variant_id === v.id)).map((v) => ({ variant_id: v.id, label: `${label} · ${v.size}`, qty: 1, price: r.cost, gst_rate: gst, free_sample: false }))]); toast.success("Sizes receiving list mein add ho gaye — pairs aur cost check karo"); }} />
          {matches.map((p) => (
            <div key={p.id} className="rounded-lg border p-2">
              <p className="text-sm font-semibold">{p.brand} {p.article} <span className="text-muted-foreground">{p.color}</span></p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.product_variants.map((v) => (
                  <Button key={v.id} variant="secondary" size="sm" onClick={() => setLines((ls) => ls.some((l) => l.variant_id === v.id) ? ls.map((l) => l.variant_id === v.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { variant_id: v.id, label: `${p.brand} ${p.article} · ${v.size}`, qty: 1, price: Number(costs.find((c) => c.product_id === p.id)?.purchase_price ?? 0), gst_rate: gst, free_sample: false }])}>
                    {v.size} <span className="text-[10px] text-muted-foreground">({v.stock})</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-semibold">Receiving</p>
          {lines.map((l, i) => (
            <div key={l.variant_id} className="border-b py-2 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold">{l.label}</span><Button size="icon" variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
              <div className="grid grid-cols-3 gap-2"><label className="text-xs">Pairs<Input type="number" min="1" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} className="h-8" /></label><label className="text-xs">Cost / pair ₹<Input type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, price: Number(e.target.value), free_sample: false } : x))} className="h-8" /></label><label className="text-xs">GST %<select value={l.gst_rate} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, gst_rate: Number(e.target.value) } : x))} className="h-8 w-full rounded border bg-background">{[0,5,12,18].map((r) => <option key={r} value={r}>{r}%</option>)}</select></label></div>
              <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={l.free_sample} onChange={(e) => setLines(lines.map((x,j) => j===i ? { ...x, free_sample:e.target.checked, price:e.target.checked ? 0 : x.price } : x))} />Free / sample stock (₹0)</label>
            </div>
          ))}
          <p className="pt-2 text-right font-display text-2xl font-bold">{inr(total)}</p>
          <Button className="w-full" disabled={!lines.length || busy} onClick={save}>{busy ? "Saving…" : "Receive stock"}</Button>
        </div>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Recent purchases</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Date</th><th className="p-2">Supplier</th><th className="p-2">Invoice</th><th className="p-2">Qty</th><th className="p-2">Cost</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody>{recent.map((r) => <tr key={r.id} className="border-t"><td className="p-2">{new Date(r.purchase_date).toLocaleDateString("en-IN")}</td><td className="p-2">{r.supplier_name}</td><td className="p-2">{r.invoice_no}</td><td className="p-2">{r.quantity}</td><td className="p-2">{inr(r.purchase_price)}</td><td className="p-2 text-right">{inr(r.total)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
