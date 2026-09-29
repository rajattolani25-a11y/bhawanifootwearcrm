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

/** Kids size categories: 5-10 (chhote), 11-1 (11,12,13,1), 2-5 (bade kids). */
const KID_GROUPS: [string, string[]][] = [
  ["5-10", ["5", "6", "7", "8", "9", "10"]],
  ["11-1", ["11", "12", "13", "1"]],
  ["2-5", ["2", "3", "4", "5"]],
];

/** Ladies size categories: 5-9 (normal), 10-12 (badi size). */
const LADY_GROUPS: [string, string[], string][] = [
  ["5-9", ["5", "6", "7", "8", "9"], "Normal"],
  ["10-12", ["10", "11", "12"], "Badi size"],
];

/** Dedupe + sort a merged size list. */
function combine(list: string[]) {
  return [...new Set(list)].sort(sizeSort);
}

export function QuickAddProduct({ open, onClose, onAdded, mode = "stock", initialArticle = "" }: {
  open: boolean; onClose: () => void; onAdded?: (r: QuickAddResult) => void; mode?: "stock" | "purchase"; initialArticle?: string;
}) {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const [f, setF] = useState({ brand: "", article: "", category: "", color: "", mrp: "", selling_price: "", cost: "", rack: "" });
  const [sizeText, setSizeText] = useState("6-10");
  const [sizeKind, setSizeKind] = useState<"adults" | "kids">("adults");
  const [kidCats, setKidCats] = useState<string[]>(["5-10"]);
  const [ladyCats, setLadyCats] = useState<string[]>(["5-9"]);
  const [extraSizes, setExtraSizes] = useState("");
  const [defQty, setDefQty] = useState(mode === "purchase" ? "0" : "1");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF((x) => ({ ...x, article: initialArticle || x.article })); }, [open, initialArticle]);
  useEffect(() => { setF((x) => ({ ...x, category: sizeKind === "kids" ? "Boys" : "Gents" })); }, [sizeKind]);
  const sizes = sizeKind === "kids"
    ? combine(KID_GROUPS.filter(([g]) => kidCats.includes(g)).flatMap(([, list]) => list))
    : sizeKind === "adults" && f.category === "Ladies"
      ? combine([...LADY_GROUPS.filter(([g]) => ladyCats.includes(g)).flatMap(([, list]) => list), ...parseSizes(extraSizes)])
      : parseSizes(sizeText);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

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
    setQty({});
    onClose();
  }

  const fields = ([["brand", "Brand"], ["article", "Article *"], ["color", "Colour"], ["selling_price", "Selling price *"], ["mrp", "MRP"], ...(isOwner ? [["cost", "Purchase cost"]] : []), ["rack", "Rack"]] as [keyof typeof f, string][]);

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
        <div className="flex gap-2">
          {(["adults", "kids"] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setSizeKind(k); if (k === "kids") setKidCats((c) => (c.length ? c : ["5-10"])); }} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${sizeKind === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              {k === "adults" ? "Adults" : "Kids"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(sizeKind === "adults" ? ["Gents", "Ladies"] : ["Boys", "Girls"]).map((k) => (
            <button key={k} type="button" onClick={() => { setF({ ...f, category: k }); if (k === "Ladies") setLadyCats((c) => (c.length ? c : ["5-9"])); }} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${f.category === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-2.5">
          {sizeKind === "adults" ? (
            <div className="space-y-1"><Label className="text-xs">Sizes (6-10 ya 6,7,8)</Label><Input value={sizeText} onChange={(e) => setSizeText(e.target.value)} className="h-9" /></div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Kids size category</Label>
              <div className="flex gap-1.5">
                {KID_GROUPS.map(([g]) => (
                  <button key={g} type="button" onClick={() => setKidCats((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]))} className={`flex-1 rounded-md border px-2 py-2 text-sm font-semibold ${kidCats.includes(g) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
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
