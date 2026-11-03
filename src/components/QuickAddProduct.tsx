import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { sizeSort } from "@/lib/stock";

export type QuickAddResult = { product_id: string; variants: { id: string; size: string }[]; cost: number; qty: Record<string, number>; name: string };

/** Expand "6-10" or "6,7,8" or "S M L" into a size list. */
function parseSizes(text: string) {
  const out: string[] = [];
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 40; i++) out.push(String(i)); }
    else out.push(part.toUpperCase());
  }
  return [...new Set(out)].sort(sizeSort);
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

/** Indian footwear size chart per category: all sizes + quick 1-tap sets. */
type Chart = { all: string[]; sets: [string, string[], string][] };
const SIZE_CHART: Record<"Gents" | "Ladies" | "Boys" | "Girls" | "Kids", Chart> = {
  Gents: { all: range(6, 12), sets: [["6-10", range(6, 10), "Regular"], ["11-12", range(11, 12), "Bade size"]] },
  Ladies: { all: range(5, 12), sets: [["5-9", range(5, 9), "Regular"], ["10-12", range(10, 12), "Plus size"]] },
  Boys: { all: range(1, 5), sets: [["1-5", range(1, 5), "Full set"]] },
  Girls: { all: range(1, 5), sets: [["1-5", range(1, 5), "Full set"]] },
  Kids: { all: range(1, 13), sets: [["1-5", range(1, 5), "Chhote"], ["6-10", range(6, 10), "Medium"], ["11-13", range(11, 13), "Bade"], ["All", range(1, 13), "1-13"]] },
};

export function QuickAddProduct({ open, onClose, onAdded, mode = "stock", initialArticle = "" }: {
  open: boolean; onClose: () => void; onAdded?: (r: QuickAddResult) => void; mode?: "stock" | "purchase"; initialArticle?: string;
}) {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const [f, setF] = useState({ brand: "", article: "", category: "Gents", color: "", mrp: "", selling_price: "", cost: "", rack: "" });
  const [picked, setPicked] = useState<string[]>(range(6, 10));
  const [extraSizes, setExtraSizes] = useState("");
  const [defQty, setDefQty] = useState(mode === "purchase" ? "0" : "1");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF((x) => ({ ...x, article: initialArticle || x.article })); }, [open, initialArticle]);
  const chart: Chart = SIZE_CHART[f.category as keyof typeof SIZE_CHART] ?? SIZE_CHART.Gents;
  const sizes = [...new Set([...picked, ...parseSizes(extraSizes)])].sort(sizeSort);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const pickCategory = (c: string) => { setF({ ...f, category: c }); setPicked(SIZE_CHART[c as keyof typeof SIZE_CHART].sets[0]?.[1] ?? []); };
  const toggleSet = (list: string[]) => setPicked((p) => (list.every((s) => p.includes(s)) ? p.filter((s) => !list.includes(s)) : [...new Set([...p, ...list])]));
  const toggleSize = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  async function save() {
    const sp = Number(f.selling_price);
    if (!f.article.trim()) { toast.error("Article name likho"); return; }
    if (!(sp > 0)) { toast.error("Selling price likho"); return; }
    if (!sizes.length) { toast.error("Kam se kam ek size do"); return; }
    const rows = sizes.map((s) => ({ size: s, qty: mode === "purchase" ? 0 : Math.max(0, Math.floor(Number(qty[s] ?? defQty) || 0)) }));
    setBusy(true);
    const { data, error } = await supabase.rpc("quick_add_product", {
      _product: { brand: f.brand.trim(), article: f.article.trim(), category: f.category.trim(), color: f.color.trim(), mrp: Number(f.mrp) || sp, selling_price: sp, rack: f.rack.trim() },
      _sizes: rows,
      _cost: isOwner && Number(f.cost) > 0 ? Number(f.cost) : (null as unknown as number),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { product_id: string; variants: { id: string; size: string }[] };
    toast.success(`${f.brand.toUpperCase()} ${f.article} ready — ${rows.reduce((a, x) => a + x.qty, 0)} pairs added`);
    ["products", "stock-all", "pos-products"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onAdded?.({ ...r, name: `${f.brand.trim().toUpperCase()} ${f.article.trim()}`.trim(), cost: Number(f.cost) || 0, qty: Object.fromEntries(rows.map((x) => [x.size, x.qty])) });
    setF({ brand: f.brand, article: "", category: f.category, color: "", mrp: "", selling_price: "", cost: "", rack: f.rack });
    setQty({}); setExtraSizes("");
    onClose();
  }

  const fields = ([["brand", "Brand"], ["article", "Article *"], ["color", "Colour"], ["selling_price", "Selling price *"], ["mrp", "MRP"], ...(isOwner ? [["cost", "Purchase cost"]] : []), ["rack", "Rack"]] as [keyof typeof f, string][]);
  const chip = (on: boolean) => `rounded-md border font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick add product</DialogTitle>
          <DialogDescription>{mode === "purchase" ? "Naya article banao, phir sizes purchase list mein aa jayenge." : "Article aur sizes turant stock mein — scan code apne aap ban jayega."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          {fields.map(([k, l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{l}</Label>
              <Input value={f[k]} onChange={set(k)} autoFocus={k === "article"} inputMode={["mrp", "selling_price", "cost"].includes(k) ? "decimal" : undefined} className="h-9" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {Object.keys(SIZE_CHART).map((c) => (
            <button key={c} type="button" onClick={() => pickCategory(c)} className={`${chip(f.category === c)} px-1 py-2 text-xs`}>{c}</button>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quick set</Label>
          <div className="flex gap-1.5">
            {chart.sets.map(([g, list, hint]) => (
              <button key={g} type="button" onClick={() => toggleSet(list)} className={`${chip(list.every((s) => picked.includes(s)))} flex-1 px-2 py-1.5 text-sm`}>
                {g}<span className="block text-[10px] font-normal leading-tight opacity-80">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cut sizes — sirf jo aaye hain unpe tap karo</Label>
          <div className="flex flex-wrap gap-1.5">
            {chart.all.map((s) => (
              <button key={s} type="button" onClick={() => toggleSize(s)} className={`${chip(picked.includes(s))} h-9 min-w-9 px-2 text-sm`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-2.5">
          <div className="space-y-1"><Label className="text-xs">Extra size (optional)</Label><Input value={extraSizes} onChange={(e) => setExtraSizes(e.target.value)} className="h-9" placeholder="jaise 13 ya 4" /></div>
          {mode !== "purchase" && <div className="space-y-1"><Label className="text-xs">Pairs / size</Label><Input value={defQty} onChange={(e) => setDefQty(e.target.value)} inputMode="numeric" className="h-9" /></div>}
        </div>
        {mode !== "purchase" && sizes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((s) => (
              <label key={s} className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs font-semibold">
                {s}<input value={qty[s] ?? defQty} onChange={(e) => setQty({ ...qty, [s]: e.target.value })} inputMode="numeric" aria-label={`Pairs for size ${s}`} className="w-9 rounded border bg-background px-1 text-center" />
              </label>
            ))}
          </div>
        )}

        {mode !== "purchase" && isOwner && !(Number(f.cost) > 0) && <p className="text-xs text-warning-foreground">Cost khaali hai — profit report mein "cost missing" dikhega.</p>}
        <Button onClick={save} disabled={busy} className="h-11">{busy ? "Saving…" : "Save & add"}</Button>
      </DialogContent>
    </Dialog>
  );
}
