import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Plus, Search, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { addSignedImages, uploadProductImage } from "@/lib/product-images";
import { downloadCsv, parseCsv, sizeSort, useStock } from "@/lib/stock";
import { QuickAddProduct } from "@/components/QuickAddProduct";

export const Route = createFileRoute("/_authenticated/products")({
  validateSearch: (search: Record<string, unknown>) => ({ article: typeof search["article"] === "string" ? search["article"] : "" }),
  head: () => ({ meta: [{ title: "Products — SoleStack POS" }, { name: "description", content: "Articles, photos and size-wise stock." }, { property: "og:title", content: "Products — SoleStack POS" }, { property: "og:description", content: "Footwear articles, photos, prices and size stock." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Products,
});


function Products() {
  const { article } = Route.useSearch();
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const [q, setQ] = useState(article);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: cost } = useQuery({ queryKey: ["product-profile-cost",selected], enabled: isOwner && !!selected, queryFn: async () => { const { data,error } = await supabase.from("product_costs").select("purchase_price").eq("product_id",selected ?? "").maybeSingle(); if(error) throw error; return data; } });
  const { data: history } = useQuery({ queryKey: ["product-profile-history",selected], enabled: !!selected, queryFn: async () => { const p = products.find((x)=>x.id===selected); const ids = p?.product_variants.map((v)=>v.id) ?? []; if (!ids.length) return { purchases: [], movements: [] }; const [a,b] = await Promise.all([isOwner ? supabase.from("purchases").select("id,purchase_date,supplier_name,invoice_no,quantity,purchase_price,total").in("variant_id",ids).order("purchase_date",{ascending:false}).limit(30) : Promise.resolve({data:[]}),supabase.from("stock_movements").select("id,moved_at,type,product_name,qty_in,qty_out,note").in("variant_id",ids).order("moved_at",{ascending:false}).limit(30)]); return {purchases:a.data ?? [],movements:b.data ?? []}; } });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,article,category,color,mrp,selling_price,image_url,product_variants(id,size,stock,rack,barcode)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return addSignedImages(data);
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("products-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, () => qc.invalidateQueries({ queryKey: ["products"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => qc.invalidateQueries({ queryKey: ["products"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return products;
    return products.filter((p) =>
      [p.brand, p.article, p.category, p.color].some((f) => f?.toLowerCase().includes(s)) ||
      p.product_variants.some((v) => v.barcode === s),
    );
  }, [products, q]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Size-wise stock for every article. Green = in stock, amber = low, red = out. Tap an article for its full profile."
        actions={<div className="flex flex-wrap gap-2">{isOwner && <CsvTools />}<Button onClick={() => setAdding(true)} className="h-11"><Plus className="h-4 w-4" /> Quick add</Button></div>}
      />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search brand, article, colour or scan barcode" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const total = p.product_variants.reduce((s, v) => s + v.stock, 0);
          const sizes = [...p.product_variants].sort((a, b) => sizeSort(a.size, b.size));
          return (
            <div key={p.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="relative h-32 bg-muted">
                {p.image_src ? <img src={p.image_src} alt={`${p.brand} ${p.article}`} className="h-full w-full object-contain p-2" /> : <div className="flex h-full items-center justify-center font-display text-3xl text-muted-foreground/30">{p.brand.slice(0, 1)}{p.article.slice(0, 1)}</div>}
                {isOwner && <label className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-card/95 px-2 py-1 text-xs font-semibold shadow-sm"><ImagePlus className="h-3.5 w-3.5" /> Photo<input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { await uploadProductImage(p.id, file); toast.success("Product photo saved"); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["stock-all"] }); qc.invalidateQueries({ queryKey: ["pos-products"] }); } catch (err) { toast.error((err as Error).message); } e.target.value = ""; }} /></label>}
              </div>
              <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{p.brand}</p>
                   <Button variant="link" className="h-auto p-0 text-left font-display text-lg font-semibold" onClick={() => setSelected(p.id)}>{p.article}</Button>
                  <p className="text-sm text-muted-foreground">{[p.category, p.color].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="font-display font-semibold">{inr(p.selling_price)}</p>
                  <p className="text-xs text-muted-foreground line-through">{inr(p.mrp)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sizes.map((v) => (
                  <span
                    key={v.id}
                    title={v.rack ? `Rack ${v.rack}` : undefined}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      v.stock === 0 ? "bg-destructive/15 text-destructive" : v.stock < 3 ? "bg-warning/25 text-warning-foreground" : "bg-success/15 text-success"
                    }`}
                  >
                    {v.size} · {v.stock}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{total} pairs total</p>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No products yet. Add one, or import your old data from Settings.</p>}
      </div>

      <QuickAddProduct open={adding} initialArticle={q} onClose={() => setAdding(false)} />
      <Dialog open={!!selected} onOpenChange={(o)=>!o&&setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{products.find((p)=>p.id===selected)?.brand} {products.find((p)=>p.id===selected)?.article}</DialogTitle></DialogHeader>{(() => { const p=products.find((x)=>x.id===selected); if(!p)return null; return <><div className="grid grid-cols-[100px_1fr] gap-3">{p.image_src ? <img src={p.image_src} alt={p.article} className="h-24 w-24 object-contain" /> : <div className="h-24 w-24 bg-muted" />}<div><p>{p.category} · {p.color}</p><p>Selling {inr(p.selling_price)} · MRP {inr(p.mrp)}</p>{isOwner && <p>Saved purchase cost: <b>{cost ? inr(cost.purchase_price) : "Not set"}</b></p>}</div></div><h3 className="font-semibold">Sizes & stock</h3><div className="grid grid-cols-2 gap-2">{p.product_variants.map((v)=><div key={v.id} className="border-b py-2 text-sm">Size {v.size} · <b>{v.stock} pairs</b><br />Rack {v.rack || "—"} · Code {v.barcode || "Not assigned"}</div>)}</div>{isOwner && <><h3 className="font-semibold">Recent purchases</h3>{history?.purchases.map((x)=><div key={x.id} className="flex justify-between border-t py-1 text-sm"><span>{new Date(x.purchase_date).toLocaleDateString("en-IN")} · {x.supplier_name} · {x.quantity} pairs</span><b>{inr(x.purchase_price)} / pair</b></div>)}</>}<h3 className="font-semibold">Stock movement</h3>{history?.movements.map((x)=><div key={x.id} className="flex justify-between border-t py-1 text-sm"><span>{new Date(x.moved_at).toLocaleDateString("en-IN")} · {x.type}</span><b>+{x.qty_in} / −{x.qty_out}</b></div>)}</>; })()}</DialogContent></Dialog>
    </div>
  );
}

function CsvTools() {
  const qc = useQueryClient();
  const { data = [] } = useStock();
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    try {
      type R = Record<string, string>;
      const recs = parseCsv(await file.text()).filter((r) => r["article"] && r["size"]);
      if (!recs.length) throw new Error("CSV needs columns: brand, article, category, color, mrp, selling_price, size, qty, barcode, rack, cost");
      const key = (b: string, a: string) => `${b.toLowerCase()}|${a.toLowerCase()}`;
      const map = new Map(data.map((p) => [key(p.brand, p.article), p.id]));
      const fresh = new Map<string, R>();
      for (const r of recs) if (!map.has(key(r["brand"] ?? "", r["article"]!))) fresh.set(key(r["brand"] ?? "", r["article"]!), r);
      const np = [...fresh.values()];
      for (let i = 0; i < np.length; i += 500) {
        const { data: ins, error } = await supabase.from("products").insert(np.slice(i, i + 500).map((r) => ({ brand: (r["brand"] ?? "").toUpperCase(), article: r["article"]!, category: r["category"] ?? "", color: r["color"] ?? "", mrp: Number(r["mrp"]) || 0, selling_price: Number(r["selling_price"] || r["price"]) || Number(r["mrp"]) || 0 }))).select("id,brand,article");
        if (error) throw error;
        ins.forEach((p) => map.set(key(p.brand, p.article), p.id));
      }
      const costs = new Map<string, number>();
      const variants = recs.map((r) => { const pid = map.get(key(r["brand"] ?? "", r["article"]!))!; if (Number(r["cost"])) costs.set(pid, Number(r["cost"])); return { product_id: pid, size: r["size"]!, stock: Math.max(0, Number(r["qty"]) || 0), barcode: r["barcode"] || null, sku: r["sku"] || null, rack: r["rack"] ?? "" }; });
      for (let i = 0; i < variants.length; i += 500) { const { error } = await supabase.from("product_variants").upsert(variants.slice(i, i + 500), { onConflict: "product_id,size" }); if (error) throw error; }
      if (costs.size) { const { error } = await supabase.from("product_costs").upsert([...costs].map(([product_id, purchase_price]) => ({ product_id, purchase_price }))); if (error) throw error; }
      toast.success(`Uploaded ${variants.length} size rows (${np.length} new articles)`);
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (<>
    <Button variant="outline" className="h-11" onClick={() => downloadCsv("stock.csv", [["brand", "article", "category", "color", "mrp", "selling_price", "size", "qty", "damaged", "barcode", "rack"], ...data.flatMap((p) => [...p.product_variants].sort((a, b) => sizeSort(a.size, b.size)).map((v) => [p.brand, p.article, p.category, p.color ?? "", p.mrp, p.selling_price, v.size, v.stock, v.damaged_stock, v.barcode ?? "", v.rack ?? ""]))])}><Download className="h-4 w-4" /> CSV</Button>
    <Button asChild variant="outline" className="h-11" disabled={busy}><label className="cursor-pointer"><Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Bulk CSV"}<input type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} /></label></Button>
  </>);
}
