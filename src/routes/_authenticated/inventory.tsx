import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { downloadCsv, parseCsv, sizeSort, useStock } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory Matrix — SoleStack POS" }, { name: "description", content: "Article × size stock grid, size finder and CSV bulk upload." }, { property: "og:title", content: "Inventory Matrix — SoleStack POS" }, { property: "og:description", content: "Article and size-wise footwear inventory." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Inventory,
});

function Inventory() {
  const navigate = useNavigate();
  const { data = [] } = useStock();
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);

  const sizes = useMemo(() => [...new Set(data.flatMap((p) => p.product_variants.map((v) => v.size)))].sort(sizeSort), [data]);
  const rows = data.filter((p) => {
    const s = q.toLowerCase();
    if (s && ![p.brand, p.article, p.category, p.color].some((f) => f?.toLowerCase().includes(s))) return false;
    if (size && !p.product_variants.some((v) => v.size === size)) return false;
    return true;
  });
  const totalPairs = rows.reduce((a, p) => a + p.product_variants.reduce((b, v) => b + v.stock, 0), 0);

  async function upload(file: File) {
    setBusy(true);
    try {
      type R = { brand: string; article: string; category: string; color: string; gender: string; mrp: string; selling_price: string; price: string; size: string; qty: string; barcode: string; sku: string; rack: string; cost: string };
      const recs = parseCsv(await file.text()).map((r) => r as unknown as R).filter((r) => r.article && r.size);
      if (!recs.length) throw new Error("CSV needs columns: brand, article, category, color, mrp, selling_price, size, qty, barcode, rack, cost");
      const key = (b: string, a: string) => `${b.toLowerCase()}|${a.toLowerCase()}`;
      const map = new Map(data.map((p) => [key(p.brand, p.article), p.id]));
      const newProducts = new Map<string, R>();
      for (const r of recs) if (!map.has(key(r.brand ?? "", r.article))) newProducts.set(key(r.brand ?? "", r.article), r);
      const np = [...newProducts.values()];
      for (let i = 0; i < np.length; i += 500) {
        const { data: ins, error } = await supabase.from("products").insert(np.slice(i, i + 500).map((r) => ({
          brand: r.brand ?? "", article: r.article, category: r.category ?? "", color: r.color ?? "", gender: r.gender ?? "",
          mrp: Number(r.mrp) || 0, selling_price: Number(r.selling_price || r.price) || Number(r.mrp) || 0,
        }))).select("id,brand,article");
        if (error) throw error;
        ins.forEach((p) => map.set(key(p.brand, p.article), p.id));
      }
      const costs = new Map<string, number>();
      const variants = recs.map((r) => {
        const pid = map.get(key(r.brand ?? "", r.article))!;
        if (Number(r.cost)) costs.set(pid, Number(r.cost));
        return { product_id: pid, size: r.size, stock: Number(r.qty) || 0, barcode: r.barcode || null, sku: r.sku || null, rack: r.rack ?? "" };
      });
      for (let i = 0; i < variants.length; i += 500) {
        const { error } = await supabase.from("product_variants").upsert(variants.slice(i, i + 500), { onConflict: "product_id,size" });
        if (error) throw error;
      }
      if (costs.size) await supabase.from("product_costs").upsert([...costs].map(([product_id, purchase_price]) => ({ product_id, purchase_price })));
      toast.success(`Uploaded ${variants.length} size rows (${np.length} new articles)`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventory Matrix"
        subtitle={`${rows.length} articles · ${totalPairs} pairs in view`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadCsv("stock.csv", [["brand", "article", "category", "color", "mrp", "selling_price", "size", "qty", "barcode", "rack", "cost"], ...data.flatMap((p) => p.product_variants.map((v) => [p.brand, p.article, p.category, p.color ?? "", p.mrp, p.selling_price, v.size, v.stock, v.barcode ?? "", v.rack ?? "", ""]))])}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            {isOwner && (
              <Button asChild disabled={busy}>
                <label className="cursor-pointer"><Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Bulk upload CSV"}<input type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand / article / colour" className="h-10 w-64" />
        <span className="text-sm text-muted-foreground">Size finder:</span>
        <button onClick={() => setSize("")} className={`rounded-full px-3 py-1 text-sm ${!size ? "bg-primary text-primary-foreground" : "bg-muted"}`}>All</button>
        {sizes.map((s) => (
          <button key={s} onClick={() => setSize(s)} className={`rounded-full px-3 py-1 text-sm font-semibold ${size === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr><th className="p-2 text-left">Article</th>{sizes.map((s) => <th key={s} className="p-2 text-center">{s}</th>)}<th className="p-2 text-right">Total</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2"><span className="text-[11px] font-bold uppercase text-primary">{p.brand}</span><br /><Button variant="link" className="h-auto p-0 text-left" onClick={() => navigate({ to: "/products", search: { article: p.article } })}>{p.article}</Button> <span className="text-xs text-muted-foreground">{p.color}</span></td>
                {sizes.map((s) => {
                  const v = p.product_variants.find((x) => x.size === s);
                  if (!v) return <td key={s} className="p-2 text-center text-muted-foreground">·</td>;
                  const cls = v.stock <= 0 ? "bg-destructive/15 text-destructive" : v.stock <= v.min_stock ? "bg-warning/20" : "bg-success/15 text-success";
                  return <td key={s} className="p-1 text-center"><span className={`inline-block min-w-9 rounded px-1.5 py-1 font-bold ${cls} ${size === s ? "ring-2 ring-primary" : ""}`} title={v.rack ? `Rack ${v.rack}` : ""}>{v.stock}</span></td>;
                })}
                <td className="p-2 text-right font-semibold">{p.product_variants.reduce((a, v) => a + v.stock, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
