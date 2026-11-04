import { isLowStock } from "@/lib/stock-policy";
import { ProductDetailsEditor } from "@/components/ProductDetailsEditor";
import { ProductSizesEditor } from "@/components/ProductSizesEditor";
import { categoryLabel } from "@/lib/product-categories";
import { ProductCategoryEditor } from "@/components/ProductCategoryEditor";
import { integrityError } from "@/lib/retail-integrity";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Images, Plus, Search, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { ProductPhotos } from "@/components/ProductPhotos";
import { ProductLifecycle } from "@/components/ProductLifecycle";
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
  const deferredSearch = useDeferredValue(q);
  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => setVisibleCount(60), [q]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: cost } = useQuery({ queryKey: ["product-profile-cost",selected], enabled: isOwner && !!selected, queryFn: async () => { const { data,error } = await supabase.from("product_costs").select("purchase_price").eq("product_id",selected ?? "").maybeSingle(); if(error) throw error; return data; } });
  const { data: history } = useQuery({ queryKey: ["product-profile-history",selected], enabled: !!selected, queryFn: async () => { const p = products.find((x)=>x.id===selected); const ids = p?.product_variants.map((v)=>v.id) ?? []; if (!ids.length) return { purchases: [], movements: [] }; const [a,b] = await Promise.all([isOwner ? supabase.from("purchases").select("id,purchase_date,supplier_name,invoice_no,quantity,purchase_price,total").in("variant_id",ids).order("purchase_date",{ascending:false}).limit(30) : Promise.resolve({data:[]}),supabase.from("stock_movements").select("id,moved_at,type,product_name,qty_in,qty_out,note").in("variant_id",ids).order("moved_at",{ascending:false}).limit(30)]); return {purchases:a.data ?? [],movements:b.data ?? []}; } });

  const { data: products = [] } = useStock({ order: "id" });

  const filtered = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();
    if (!s) return products;
    return products.filter((p) =>
      [p.brand, p.article, p.category, categoryLabel(p.category), p.color].some((f) => f?.toLowerCase().includes(s)) ||
      p.product_variants.some((v) => v.barcode?.toLowerCase() === s || v.label_code?.toLowerCase() === s),
    );
  }, [products, deferredSearch]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Size-wise stock for every article. Green = in stock, amber = low, red = out. Tap an article for its full profile."
        actions={<div className="flex flex-wrap gap-2">{isOwner && <CsvTools />}{isOwner && <>
          <Button variant="outline" className="h-11" onClick={async () => { const { error } = await supabase.from("products").update({ catalog_visible: true }).not("image_url", "is", null).eq("status", "Active"); if (error) toast.error(error.message); else { toast.success("All products with a photo are now in the catalog"); qc.invalidateQueries({ queryKey: ["stock-all"] }); } }}>Show all with photo</Button>
          <Button variant="outline" className="h-11" onClick={async () => { if (!window.confirm("Hide all products from the catalog?")) return; const { error } = await supabase.from("products").update({ catalog_visible: false }).eq("catalog_visible", true); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["stock-all"] }); }}>Hide all</Button>
        </>}<Button onClick={() => setAdding(true)} className="h-11"><Plus className="h-4 w-4" /> Quick add</Button></div>}
      />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search brand, article, colour or scan barcode" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, visibleCount).map((p) => {
          const total = p.product_variants.reduce((s, v) => s + v.stock, 0);
          const sizes = [...p.product_variants].sort((a, b) => sizeSort(a.size, b.size));
          return (
            <div key={p.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="relative h-32 bg-muted">
                {p.image_src ? <img src={p.image_src} loading="lazy" decoding="async" alt={`${p.brand} ${p.article}`} className="h-full w-full object-contain p-2" /> : <div className="flex h-full items-center justify-center font-display text-3xl text-muted-foreground/30">{p.brand.slice(0, 1)}{p.article.slice(0, 1)}</div>}
                <Button variant="outline" size="sm" className="absolute bottom-2 right-2 bg-card/95" onClick={() => setSelected(p.id)}><Images className="h-3.5 w-3.5" /> Photos</Button>
              </div>
              <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{p.brand}{p.status !== "Active" && <span className="ml-2 text-muted-foreground">Archived</span>}</p>
                   <Button variant="link" className="h-auto p-0 text-left font-display text-lg font-semibold" onClick={() => setSelected(p.id)}>{p.article}</Button>
                  <p className="text-sm text-muted-foreground">{[categoryLabel(p.category), p.color].filter(Boolean).join(" · ")}</p>
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
                      v.stock === 0 ? "bg-destructive/15 text-destructive" : isLowStock(v.stock, v.min_stock) ? "bg-warning/25 text-warning-foreground" : "bg-success/15 text-success"
                    }`}
                  >
                    {v.size} · {v.stock}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{total} pairs total</p>
                {isOwner && <label className="flex items-center gap-2 text-xs font-medium"><span>In catalog</span><Switch checked={!!p.catalog_visible} onCheckedChange={async (v) => { const { error } = await supabase.from("products").update({ catalog_visible: v }).eq("id", p.id); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["stock-all"] }); }} /></label>}
              </div>
              </div>
            </div>
          );
        })}
        {filtered.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount(n => n + 60)}>Show more products</Button>}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No products yet. Add one, or import your old data from Settings.</p>}
      </div>

      <QuickAddProduct open={adding} initialArticle={q} onClose={() => setAdding(false)} />
      <Dialog open={!!selected} onOpenChange={(o)=>!o&&setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{products.find((p)=>p.id===selected)?.brand} {products.find((p)=>p.id===selected)?.article}</DialogTitle></DialogHeader>{(() => { const p=products.find((x)=>x.id===selected); if(!p)return null; return <><div className="grid grid-cols-[100px_1fr] gap-3">{p.image_src ? <img src={p.image_src} alt={p.article} className="h-24 w-24 object-contain" /> : <div className="h-24 w-24 bg-muted" />}<div><p>{categoryLabel(p.category)} · {p.color}</p><p>Selling {inr(p.selling_price)} · MRP {inr(p.mrp)}</p>{isOwner && <p>Saved purchase cost: <b>{cost ? inr(cost.purchase_price) : "Not set"}</b></p>}</div></div><ProductDetailsEditor key={`${p.id}:${p.article}:${p.brand}:${p.color ?? ""}`} id={p.id} article={p.article} brand={p.brand} color={p.color} /><ProductCategoryEditor key={`${p.id}:${p.category}`} id={p.id} category={p.category} /><ProductPhotos key={p.id} productId={p.id} /><ProductLifecycle id={p.id} name={`${p.brand} ${p.article}`} archived={p.status !== "Active"} onDeleted={() => setSelected(null)} /><ProductSizesEditor id={p.id} variants={p.product_variants} /><h3 className="font-semibold">Sizes & stock</h3><div className="grid grid-cols-2 gap-2">{p.product_variants.map((v)=><div key={v.id} className="border-b py-2 text-sm">Size {v.size} · <b>{v.stock} pairs</b><br />Rack {v.rack || "—"} · Code {v.barcode || "Not assigned"}</div>)}</div>{isOwner && <><h3 className="font-semibold">Recent purchases</h3>{history?.purchases.map((x)=><div key={x.id} className="flex justify-between border-t py-1 text-sm"><span>{new Date(x.purchase_date).toLocaleDateString("en-IN")} · {x.supplier_name} · {x.quantity} pairs</span><b>{inr(x.purchase_price)} / pair</b></div>)}</>}<h3 className="font-semibold">Stock movement</h3>{history?.movements.map((x)=><div key={x.id} className="flex justify-between border-t py-1 text-sm"><span>{new Date(x.moved_at).toLocaleDateString("en-IN")} · {x.type}</span><b>+{x.qty_in} / −{x.qty_out}</b></div>)}</>; })()}</DialogContent></Dialog>
    </div>
  );
}

type ImportPlan = { rows: number; plan: { variant_id?: string | null; brand: string; article: string; size: string; before: number; after: number; delta: number }[] };
function CsvTools() {
  const qc = useQueryClient();
  const { data = [] } = useStock();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("add");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<ImportPlan | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const requestId = useRef("");
  const importStorageKey="solestack-pending-import-v1";
  useEffect(() => {
    try {
      const saved=JSON.parse(sessionStorage.getItem(importStorageKey) ?? "null");
      if (saved?.id && Array.isArray(saved.rows) && ["add","replace"].includes(saved.mode)) {
        requestId.current=saved.id;setRows(saved.rows);setMode(saved.mode);setPreview(saved.preview ?? null);setOpen(true);setUncertain(true);
      }
    } catch { toast.error("Import recovery could not be read. Check stock before repeating an earlier import."); }
  }, []);
  async function load(file: File) {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("CSV must be smaller than 2 MB.");
      const parsed = parseCsv(await file.text()).map((r) => Object.fromEntries(Object.entries(r).map(([k,v]) => [k,v.trim()])));
      if (!parsed.length || parsed.length > 2000) throw new Error("Choose 1 to 2000 size rows per import.");
      if (parsed.some((r) => !r["article"] || !r["size"] || !/^\d+$/.test(r["qty"] ?? ""))) throw new Error("Every CSV row needs article, size and a whole non-negative qty. No changes made.");
      setRows(parsed); setPreview(null); setMode("add"); setOpen(true); setUncertain(false); requestId.current = crypto.randomUUID();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function run(previewOnly: boolean) {
    if (busy) return;
    setBusy(true);
    let definitiveFailure=false;
    try {
      if (!previewOnly) sessionStorage.setItem(importStorageKey,JSON.stringify({id:requestId.current,rows,mode,preview}));
      const { data: result, error } = await supabase.rpc("import_stock_csv", { _rows: rows, _mode: mode, _preview: previewOnly, _operation_id: requestId.current, _expected: previewOnly ? null : preview?.plan ?? null });
      if (error) {
        definitiveFailure=/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST");
        if (definitiveFailure && !previewOnly) { sessionStorage.removeItem(importStorageKey); setPreview(null); }
        throw integrityError(error);
      }
      if (previewOnly) setPreview(result as unknown as ImportPlan);
      else { sessionStorage.removeItem(importStorageKey); toast.success(`Imported ${(result as unknown as ImportPlan).rows} size rows. Stock ledger updated.`); setOpen(false); setRows([]); setPreview(null); setUncertain(false); refreshOperationalData(qc); }
    } catch (e) { if (!previewOnly && !definitiveFailure) setUncertain(true); toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" className="h-11" onClick={() => downloadCsv("stock.csv", [["brand", "article", "category", "color", "mrp", "selling_price", "size", "qty", "damaged", "barcode", "sku", "rack"], ...data.flatMap((p) => [...p.product_variants].sort((a,b) => sizeSort(a.size,b.size)).map((v) => [p.brand,p.article,p.category,p.color ?? "",p.mrp,p.selling_price,v.size,v.stock,v.damaged_stock,v.barcode ?? "",v.sku ?? "",v.rack ?? ""]))])}><Download className="h-4 w-4" /> CSV</Button>
    <Button asChild variant="outline" className="h-11" disabled={busy || open}><label className="cursor-pointer"><Upload className="h-4 w-4" /> Bulk CSV<input type="file" accept=".csv" hidden onChange={(e) => { const f=e.target.files?.[0]; if(f) void load(f); e.target.value=""; }} /></label></Button>
    <Dialog open={open} onOpenChange={(v) => !busy && !uncertain && setOpen(v)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Preview stock import</DialogTitle></DialogHeader>
      <p className="text-sm">{rows.length} size rows. Blank barcode, SKU and rack preserve existing values. Damaged stock is unchanged. Existing prices are preserved; a supplied cost updates the latest saved purchase cost. This is a stock import, not a supplier invoice.</p>
      <label>Stock action<select disabled={busy || uncertain} className="ml-2 rounded-md border bg-background p-2" value={mode} onChange={(e) => { setMode(e.target.value); setPreview(null); requestId.current=crypto.randomUUID(); }}><option value="add">Add quantities to current stock</option><option value="replace">Replace quantities with CSV stock counts</option></select></label>
      {mode === "replace" && <p role="alert" className="text-sm text-destructive">Replace sets each listed size to its CSV qty. It does not add pairs. Other sizes remain unchanged.</p>}
      {!uncertain && <Button disabled={busy} variant="outline" onClick={() => void run(true)}>Validate & preview</Button>}
      {preview && <><div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Article / size</th><th>Current</th><th>After</th><th>Change</th></tr></thead><tbody>{preview.plan.map((r,i) => <tr key={i}><td>{r.brand} {r["article"]} / {r["size"]}</td><td>{r.before}</td><td>{r.after}</td><td>{r.delta > 0 ? "+" : ""}{r.delta}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">Preview is read-only. On confirmation, current stock is rechecked and all rows are saved together, or none are saved.</p></>}
      {uncertain && <p role="alert">Connection interrupted. Recover this same import before starting another one.</p>}
      <Button disabled={busy || (!preview && !uncertain)} onClick={() => void run(false)}>{busy ? "Working…" : uncertain ? "Retry / recover import" : "Confirm import"}</Button>
    </DialogContent></Dialog>
  </>;
}
