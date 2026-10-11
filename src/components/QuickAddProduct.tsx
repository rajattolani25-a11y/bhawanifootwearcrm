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
const SIZE_CHART: Record<string, { all: string[]; sets: [string, string[], string][] }> = {
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
  const chart = SIZE_CHART[f.category] ?? SIZE_CHART.Gents;
  const sizes = [...new Set([...picked, ...parseSizes(extraSizes)])].sort(sizeSort);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const pickCategory = (c: string) => { setF({ ...f, category: c }); setPicked(SIZE_CHART[c].sets[0][1]); };
  const toggleSet = (list: string[]) => setPicked((p) => (list.every((s) => p.includes(s)) ? p.filter((s) => !list.includes(s)) : [...new Set([...p, ...list])]));
  const toggleSize = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

        {mode !== "purchase" && isOwner && !(Number(f.cost) > 0) && <p className="text-xs text-warning-foreground">Cost khaali hai — profit report mein "cost missing" dikhega.</p>}
        <Button onClick={save} disabled={busy} className="h-11">{busy ? "Saving…" : "Save & add"}</Button>
      </DialogContent>
    </Dialog>
  );
}
