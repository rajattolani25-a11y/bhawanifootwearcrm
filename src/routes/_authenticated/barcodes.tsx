import { LabelSelectionDock } from "@/components/LabelSelectionDock";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { printHtml } from "@/lib/print";
import { sizeSort, useStock } from "@/lib/stock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/barcodes")({ head: () => ({ meta: [{ title: "Barcodes & QR — SoleStack POS" }, { name: "description", content: "Brand-style Code 128 and QR box labels." }, { property: "og:title", content: "Barcodes & QR — SoleStack POS" }, { property: "og:description", content: "Print scan-ready, brand-style footwear box labels with barcode and QR." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Barcodes });

type Layout = "sheet" | "roll";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const rs = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
function svgFor(code: string) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(el, code, { format: "CODE128", height: 30, width: 1.3, displayValue: true, fontSize: 9, font: "monospace", textMargin: 1, margin: 0 });
  return el.outerHTML;
}

const LABEL_CSS = `
*{box-sizing:border-box}body{font-family:"Helvetica Neue",Arial,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.grid{display:grid;grid-template-columns:repeat(3,64mm);gap:2mm;padding:3mm}
.label{width:64mm;height:38mm;border:0.3mm solid #111;border-radius:1mm;overflow:hidden;display:grid;grid-template-rows:1fr 13mm;page-break-inside:avoid;background:#fff}
.mid{display:grid;grid-template-columns:1fr 15mm;gap:1.5mm;padding:1.2mm 2mm 0}
.brand{font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#111;border-bottom:0.2mm solid #aaa;padding-bottom:.6mm;margin-bottom:.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art{font-size:13px;font-weight:800;line-height:1.05;margin:.3mm 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.2px}
.meta{font-size:6.5px;color:#555;text-transform:uppercase;letter-spacing:.8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.price{display:flex;align-items:baseline;gap:1.5mm;margin-top:.8mm}.price b{font-size:14px;font-weight:900}.price s{font-size:7px;color:#777}.price small{font-size:5.5px;color:#777;letter-spacing:.6px}
.size{border:0.5mm solid #111;border-radius:1mm;text-align:center;display:flex;flex-direction:column;justify-content:center;height:14mm}
.size span{font-size:5.5px;letter-spacing:1.4px;font-weight:700}.size b{font-size:17px;line-height:1;font-weight:900}
.codes{display:grid;grid-template-columns:1fr 12mm;gap:1.5mm;align-items:center;padding:0 2mm 1mm;border-top:0.2mm dashed #999}
.codes svg{width:100%;height:11mm}.codes img{width:12mm;height:12mm}
.roll .grid{grid-template-columns:50mm;gap:0;padding:0}.roll .label{width:50mm;height:38mm;border-radius:0;border:0;border-bottom:0.2mm dashed #bbb}
.roll .mid{grid-template-columns:1fr 12mm}.roll .art{font-size:11px}.roll .size b{font-size:14px}
@page{size:A4;margin:4mm}
@media(max-width:650px){.grid{grid-template-columns:repeat(2,64mm)}}
`;

function Barcodes() {
  const { data = [] } = useStock();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<Layout>("sheet");
  const [busy, setBusy] = useState(false);
  const s = q.toLowerCase();
  const list = data.filter((p) => !s || `${p.brand} ${p.article} ${p.color}`.toLowerCase().includes(s) || p.product_variants.some((v) => v.barcode?.toLowerCase() === s || v.sku?.toLowerCase() === s)).slice(0, 60);
  const normalize = (value:number) => Math.min(500, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
  const selected = data.flatMap(p => p.product_variants.filter(v => normalize(pick[v.id] ?? 0) > 0).map(v => ({ p, v, n:normalize(pick[v.id] ?? 0) })));
  const count = selected.reduce((total, row) => total + row.n, 0);
  const selectedArticles = new Set(selected.map(row => row.p.id)).size;

  async function print() {
    if (!selected.length) { toast.error("Pehle label count chuno"); return; }
    setBusy(true);
    try {
      const labels: string[] = [];
      for (const { p, v, n } of selected) {
        let code = v.barcode || v.sku;
        if (!code) { const r = await supabase.rpc("ensure_variant_code", { _variant_id: v.id }); if (r.error) throw r.error; code = r.data; }
        if (!code) throw new Error("Could not assign a unique scan code");
        const qr = await QRCode.toDataURL(code, { margin: 0, width: 120, errorCorrectionLevel: "M" });
        const meta = [p.category, p.color, v.rack ? `Rack ${v.rack}` : ""].filter(Boolean).map(esc).join(" · ");
        const mrp = Number(p.mrp) > Number(p.selling_price) ? `<s>MRP ${esc(rs(p.mrp))}</s>` : `<small>MRP INCL. OF ALL TAXES</small>`;
        const html = `<div class="label"><div class="mid"><div style="min-width:0"><div class="brand">${esc(p.brand || "—")}</div><div class="art">${esc(p.article)}</div><div class="meta">${meta || "&nbsp;"}</div><div class="price"><b>${esc(rs(p.selling_price))}</b>${mrp}</div></div><div class="size"><span>SIZE</span><b>${esc(v.size)}</b></div></div><div class="codes"><div>${svgFor(code)}</div><img src="${qr}" alt="QR"></div></div>`;
        for (let i = 0; i < n; i++) labels.push(html);
      }
      printHtml("Footwear box labels", `<div class="${layout}"><div class="grid">${labels.join("")}</div></div>`, LABEL_CSS + (layout === "roll" ? "@page{size:50mm 38mm;margin:0}" : ""));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className={count ? "pb-5" : undefined}>
      <PageHeader title="Barcodes & QR" subtitle="Brand-style box labels — har size ka apna permanent scan code. Barcode ya QR, dono se billing." actions={<Button onClick={print} disabled={busy}>{busy ? "Preparing…" : `Preview labels (${count})`}</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Article or scan code" className="h-10 max-w-sm" />
        <div className="inline-flex rounded-lg border bg-card p-1">
          {([["sheet", "A4 sheet · 3 across"], ["roll", "Label roll · 50×38mm"]] as const).map(([k, l]) => <Button key={k} size="sm" variant={layout === k ? "default" : "ghost"} onClick={() => setLayout(k)}>{l}</Button>)}
        </div>
        {count > 0 && <Button variant="ghost" size="sm" onClick={() => setPick({})}>Clear</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className={`rounded-lg border bg-card p-3 ${p.product_variants.some(v => normalize(pick[v.id] ?? 0) > 0) ? "ring-1 ring-primary bg-primary/5" : ""}`}>
            <label className="mb-2 inline-flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={p.product_variants.length > 0 && p.product_variants.every(v => normalize(pick[v.id] ?? 0) > 0)} aria-label={`Select ${p.brand} ${p.article} labels`} onChange={e => { const checked = e.target.checked; setPick(prev => ({ ...prev, ...Object.fromEntries(p.product_variants.map(v => [v.id, checked ? Math.max(1, normalize(prev[v.id] ?? 0)) : 0])) })); }} />Select article</label>
            <div className="flex justify-between gap-2">
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-primary">{p.brand}</p><p className="truncate font-semibold">{p.article}</p><p className="text-xs text-muted-foreground">{inr(p.selling_price)}{p.color ? ` · ${p.color}` : ""}</p></div>
              <Button variant="link" size="sm" onClick={() => setPick((x) => ({ ...x, ...Object.fromEntries(p.product_variants.map((v) => [v.id, normalize(v.stock)])) }))}>Use stock qty</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...p.product_variants].sort((a, b) => sizeSort(a.size, b.size)).map((v) => (
                <label key={v.id} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">Size {v.size}
                  <input type="number" min="0" max="500" value={pick[v.id] ?? 0} onChange={(e) => setPick({ ...pick, [v.id]: normalize(Number(e.target.value)) })} className="w-12 rounded border bg-background px-1" aria-label={`Labels for size ${v.size}`} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <LabelSelectionDock articles={selectedArticles} sizes={selected.length} labels={count} busy={busy} onPrint={() => void print()} onClear={() => setPick({})} />
    </div>
  );
}
