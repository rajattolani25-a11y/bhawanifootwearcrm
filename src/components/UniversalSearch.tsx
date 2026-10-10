import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Package, User, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Prod = { id: string; brand: string; article: string; selling_price: number; product_variants: { size: string; stock: number; barcode: string | null; sku: string | null }[] };
type Cust = { id: string; name: string; mobile: string; shoe_size: string | null };
type Bill = { id: string; bill_no: string; customer_name: string | null; total: number; due_amount: number; sale_date: string };

export function UniversalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ p: Prod[]; c: Cust[]; b: Bill[] }>({ p: [], c: [], b: [] });
  const navigate = useNavigate();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[,()%]/g, "");
    if (term.length < 2) { setRes({ p: [], c: [], b: [] }); return; }
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const sel = "id, brand, article, selling_price, product_variants(size, stock, barcode, sku)";
      const [p1, v, c, b] = await Promise.all([
        supabase.from("products").select(sel).or(`article.ilike.${like},brand.ilike.${like}`).limit(8),
        supabase.from("product_variants").select("product_id").or(`barcode.eq.${term},sku.ilike.${like}`).limit(8),
        supabase.from("customers").select("id, name, mobile, shoe_size").or(`name.ilike.${like},mobile.ilike.${like}`).limit(6),
        supabase.from("sales").select("id, bill_no, customer_name, total, due_amount, sale_date").or(`bill_no.ilike.${like},customer_name.ilike.${like}`).order("sale_date", { ascending: false }).limit(6),
      ]);
      let prods = (p1.data ?? []) as unknown as Prod[];
      const ids = (v.data ?? []).map((x) => x.product_id).filter((id) => !prods.some((p) => p.id === id));
      if (ids.length) {
        const extra = await supabase.from("products").select(sel).in("id", ids);
        prods = [...((extra.data ?? []) as unknown as Prod[]), ...prods];
      }
      setRes({ p: prods, c: (c.data ?? []) as Cust[], b: (b.data ?? []) as Bill[] });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(fn: () => void) { setOpen(false); setQ(""); fn(); }
  const empty = q.trim().length >= 2 && !res.p.length && !res.c.length && !res.b.length;

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
        <Search className="h-4 w-4" /> <span className="flex-1 text-left">Search article, barcode, customer, bill…</span>
        <kbd className="hidden rounded border px-1 text-[10px] md:inline">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[10%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Article, brand, barcode, size code, customer, mobile, bill no…" className="h-12 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-2">
            {q.trim().length < 2 && <p className="p-4 text-center text-sm text-muted-foreground">Type at least 2 letters or scan a barcode.</p>}
            {empty && <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>}
            {res.p.length > 0 && <p className="px-2 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Products & stock</p>}
            {res.p.map((p) => {
              const vs = [...p.product_variants].sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }));
              const total = vs.reduce((s, x) => s + x.stock, 0);
              return (
                <button key={p.id} onClick={() => go(() => navigate({ to: "/products", search: { article: p.article } }))} className="flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-accent">
                  <Package className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.brand} · {p.article} <span className="text-muted-foreground">₹{p.selling_price} · {total} pairs</span></p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <span key={v.size} className={`rounded border px-1.5 text-[11px] ${v.stock > 0 ? "" : "text-muted-foreground line-through"}`}>{v.size}({v.stock})</span>
                      ))}
                    </p>
                  </div>
                </button>
              );
            })}
            {res.c.length > 0 && <p className="px-2 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Customers</p>}
            {res.c.map((c) => (
              <button key={c.id} onClick={() => go(() => navigate({ to: "/customers" }))} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent">
                <User className="h-4 w-4" />
                <span className="text-sm">{c.name} <span className="text-muted-foreground">· {c.mobile}{c.shoe_size ? ` · Size ${c.shoe_size}` : ""}</span></span>
              </button>
            ))}
            {res.b.length > 0 && <p className="px-2 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Bills</p>}
            {res.b.map((b) => (
              <button key={b.id} onClick={() => go(() => navigate({ to: "/sales" }))} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent">
                <Receipt className="h-4 w-4" />
                <span className="text-sm">#{b.bill_no} · ₹{b.total} <span className="text-muted-foreground">· {b.customer_name || "Walk-in"} · {new Date(b.sale_date).toLocaleDateString()}{b.due_amount > 0 ? ` · Due ₹${b.due_amount}` : ""}</span></span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
