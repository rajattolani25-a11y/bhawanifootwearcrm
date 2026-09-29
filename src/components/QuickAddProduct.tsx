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

export type QuickAddResult = { product_id: string; variants: { id: string; size: string }[]; cost: number; qty: Record<string, number> };

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

export function QuickAddProduct({ open, onClose, onAdded, mode = "stock", initialArticle = "" }: {
  open: boolean; onClose: () => void; onAdded?: (r: QuickAddResult) => void; mode?: "stock" | "purchase"; initialArticle?: string;
}) {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const [f, setF] = useState({ brand: "", article: "", category: "", color: "", mrp: "", selling_price: "", cost: "", rack: "" });
  const [sizeText, setSizeText] = useState("6-10");
  const [defQty, setDefQty] = useState(mode === "purchase" ? "0" : "1");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF((x) => ({ ...x, article: initialArticle || x.article })); }, [open, initialArticle]);
  const sizes = parseSizes(sizeText);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const sp = Number(f.selling_price);
    if (!f.article.trim()) return toast.error("Article name likho");
    if (!(sp > 0)) return toast.error("Selling price likho");
    if (!sizes.length) return toast.error("Kam se kam ek size do");
    const rows = sizes.map((s) => ({ size: s, qty: mode === "purchase" ? 0 : Math.max(0, Math.floor(Number(qty[s] ?? defQty) || 0)) }));
    setBusy(true);
    const { data, error } = await supabase.rpc("quick_add_product", {
      _product: { brand: f.brand.trim(), article: f.article.trim(), category: f.category.trim(), color: f.color.trim(), mrp: Number(f.mrp) || sp, selling_price: sp, rack: f.rack.trim() },
      _sizes: rows,
      _cost: isOwner && Number(f.cost) > 0 ? Number(f.cost) : (null as unknown as number),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as { product_id: string; variants: { id: string; size: string }[] };
    toast.success(`${f.brand.toUpperCase()} ${f.article} ready — ${rows.reduce((a, x) => a + x.qty, 0)} pairs added`);
    ["products", "stock-all", "pos-products"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onAdded?.({ ...r, cost: Number(f.cost) || 0, qty: Object.fromEntries(rows.map((x) => [x.size, x.qty])) });
    setF({ brand: f.brand, article: "", category: f.category, color: "", mrp: "", selling_price: "", cost: "", rack: f.rack });
    setQty({});
    onClose();
  }

  const fields = ([["brand", "Brand"], ["article", "Article *"], ["category", "Category"], ["color", "Colour"], ["selling_price", "Selling price *"], ["mrp", "MRP"], ...(isOwner ? [["cost", "Purchase cost"]] : []), ["rack", "Rack"]] as [keyof typeof f, string][]);

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
        <div className="grid grid-cols-[1fr_90px] gap-2.5">
          <div className="space-y-1"><Label className="text-xs">Sizes (6-10 ya 6,7,8)</Label><Input value={sizeText} onChange={(e) => setSizeText(e.target.value)} className="h-9" /></div>
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
