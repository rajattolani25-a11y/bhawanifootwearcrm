import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { printHtml } from "@/lib/print";
import { useStock } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/barcodes")({
  head: () => ({ meta: [{ title: "Barcodes — SoleStack POS" }, { name: "description", content: "Print barcode labels for shoe boxes." }, { property: "og:title", content: "Barcodes — SoleStack POS" }, { property: "og:description", content: "Prepare and print footwear box barcode labels." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Barcodes,
});

function svgFor(code: string) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(el, code, { format: "CODE128", height: 38, width: 1.4, fontSize: 11, margin: 0 });
  return el.outerHTML;
}

function Barcodes() {
  const { data = [] } = useStock();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Record<string, number>>({});
  const s = q.toLowerCase();
  const list = data.filter((p) => !s || `${p.brand} ${p.article} ${p.color}`.toLowerCase().includes(s)).slice(0, 60);

  function print() {
    const labels: string[] = [];
    for (const p of data) for (const v of p.product_variants) {
      const n = pick[v.id] ?? 0;
      const code = v.barcode || v.sku || v.id.slice(0, 12);
      for (let i = 0; i < n; i++) labels.push(`<div class="l"><b>${p.brand} ${p.article}</b><span>Size ${v.size} · MRP ${inr(p.mrp)}</span>${svgFor(code)}<strong>${inr(p.selling_price)}</strong></div>`);
    }
    if (!labels.length) { toast.error("Choose label count first"); return; }
    try {
      printHtml("Labels", `<div class="g">${labels.join("")}</div>`, ".g{display:grid;grid-template-columns:repeat(3,50mm);gap:2mm;padding:3mm}.l{border:1px dashed #999;padding:2mm;text-align:center;font-size:10px;height:32mm;overflow:hidden}.l b,.l span,.l strong{display:block}.l svg{max-width:100%}@page{margin:3mm}");
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="Barcodes" subtitle="Pick sizes, set label count, print on A4 sticker sheet (3 per row)." actions={<Button onClick={print}>Print labels ({Object.values(pick).reduce((a, b) => a + b, 0)})</Button>} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article" className="mb-3 h-10 w-64" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-3">
            <div className="flex justify-between"><p className="font-semibold">{p.brand} {p.article}</p><button className="text-xs underline" onClick={() => setPick((x) => ({ ...x, ...Object.fromEntries(p.product_variants.map((v) => [v.id, v.stock])) }))}>= stock qty</button></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.product_variants.map((v) => (
                <label key={v.id} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-semibold">
                  {v.size}
                  <input type="number" min={0} value={pick[v.id] ?? 0} onChange={(e) => setPick({ ...pick, [v.id]: Number(e.target.value) || 0 })} className="w-10 rounded border bg-background px-1" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
