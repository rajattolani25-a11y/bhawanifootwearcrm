import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { useStock } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/purchase")({
  head: () => ({ meta: [{ title: "Purchase — SoleStack POS" }, { name: "description", content: "Receive new stock from suppliers." }] }),
  component: Purchase,
});

type Line = { variant_id: string; label: string; qty: number; price: number };

function Purchase() {
  const qc = useQueryClient();
  const { data: stock = [] } = useStock();
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [] });
  const { data: recent = [] } = useQuery({ queryKey: ["purchases"], queryFn: async () => (await supabase.from("purchases").select("id,purchase_date,supplier_name,invoice_no,quantity,purchase_price,total").order("purchase_date", { ascending: false }).limit(100)).data ?? [] });
  const [sup, setSup] = useState("");
  const [inv, setInv] = useState("");
  const [gst, setGst] = useState(5);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const s = q.toLowerCase();
  const matches = s ? stock.filter((p) => `${p.brand} ${p.article} ${p.color}`.toLowerCase().includes(s)).slice(0, 8) : [];

  async function save() {
    if (!lines.length) return;
    setBusy(true);
    const supplier = suppliers.find((x) => x.id === sup);
    const { data, error } = await supabase.rpc("receive_stock", { _supplier_id: sup || (null as unknown as string), _supplier_name: supplier?.name ?? "", _invoice: inv, _items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price: l.price, gst_rate: gst })) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} pairs added to stock`);
    setLines([]); setInv("");
    qc.invalidateQueries();
  }
  const total = lines.reduce((a, l) => a + l.qty * l.price * (1 + gst / 100), 0);

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
            <select value={gst} onChange={(e) => setGst(Number(e.target.value))} className="h-10 rounded-md border bg-background px-2 text-sm">
              {[0, 5, 12, 18].map((r) => <option key={r} value={r}>GST {r}%</option>)}
            </select>
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article to add sizes" />
          {matches.map((p) => (
            <div key={p.id} className="rounded-lg border p-2">
              <p className="text-sm font-semibold">{p.brand} {p.article} <span className="text-muted-foreground">{p.color}</span></p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.product_variants.map((v) => (
                  <button key={v.id} onClick={() => setLines((ls) => ls.some((l) => l.variant_id === v.id) ? ls.map((l) => l.variant_id === v.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { variant_id: v.id, label: `${p.brand} ${p.article} · ${v.size}`, qty: 1, price: 0 }])} className="rounded bg-muted px-2.5 py-1 text-sm font-semibold">
                    {v.size} <span className="text-[10px] text-muted-foreground">({v.stock})</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-semibold">Receiving</p>
          {lines.map((l, i) => (
            <div key={l.variant_id} className="flex items-center gap-1.5 text-sm">
              <span className="flex-1 truncate">{l.label}</span>
              <Input value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} className="h-8 w-14" />
              <Input value={l.price || ""} placeholder="Cost" onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, price: Number(e.target.value) || 0 } : x))} className="h-8 w-20" />
              <button onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></button>
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
