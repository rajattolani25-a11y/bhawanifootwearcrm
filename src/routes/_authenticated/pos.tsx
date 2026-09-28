import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Pause, Play, X, UserPlus, Gift, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { beep, computeBill, waLink, type CartItem } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS Billing — SoleStack POS" }, { name: "description", content: "Fast footwear billing with size chips and loyalty." }] }),
  component: POS,
});

type Customer = { id: string; mobile: string; name: string; is_premium: boolean; regular_stamps: number; premium_stamps: number; last_stamp_date: string | null };
type Reward = { id: string; card: string; milestone: number; amount: number; expires_at: string };
type Held = { id: string; at: string; cart: CartItem[]; mobile: string; label: string };
const HOLD_KEY = "solestack-held-bills";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function POS() {
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [brand, setBrand] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mobile, setMobile] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState("");
  const [lookupDone, setLookupDone] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rewardOn, setRewardOn] = useState(true);
  const [giveStamp, setGiveStamp] = useState(true);
  const [billDiscount, setBillDiscount] = useState("");
  const [billType, setBillType] = useState<"gst" | "simple">("gst");
  const [rate, setRate] = useState(5);
  const [pay, setPay] = useState<"Cash" | "UPI" | "Card" | "Split">("Cash");
  const [splitCash, setSplitCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { bill_no: string; total: number; mobile: string; name: string; stamp: boolean; unlocked: { card: string; amount: number }[] }>(null);
  const [held, setHeld] = useState<Held[]>([]);

  useEffect(() => {
    setHeld(JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]"));
  }, []);
  const saveHeld = (h: Held[]) => {
    setHeld(h);
    localStorage.setItem(HOLD_KEY, JSON.stringify(h));
  };

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,article,category,color,selling_price,mrp,status,product_variants(id,size,stock,sku,barcode)")
        .eq("status", "Active")
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("pos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, () => qc.invalidateQueries({ queryKey: ["pos-products"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cats = useMemo(() => ["All", ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const brands = useMemo(() => ["All", ...new Set(products.map((p) => p.brand).filter(Boolean))], [products]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return products.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (brand === "All" || p.brand === brand) &&
        (!s || [p.brand, p.article, p.color, p.category].some((f) => f?.toLowerCase().includes(s)) || p.product_variants.some((v) => v.sku?.toLowerCase() === s || v.barcode === s)),
    );
  }, [products, q, cat, brand]);

  const addVariant = useCallback((p: (typeof products)[number], v: (typeof products)[number]["product_variants"][number]) => {
    if (v.stock <= 0) {
      beep(false);
      toast.error(`Size ${v.size} is out of stock`);
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.variant_id === v.id);
      if (ex) {
        if (ex.qty >= v.stock) {
          toast.error(`Only ${v.stock} pairs of size ${v.size}`);
          return c;
        }
        return c.map((i) => (i.variant_id === v.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { variant_id: v.id, product_name: p.article, brand: p.brand, size: v.size, sku: v.sku, price: Number(p.selling_price), qty: 1, max: v.stock }];
    });
    beep(true);
  }, []);

  // Barcode scanner: scanners type the code + Enter into the search box
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = q.trim();
    for (const p of products)
      for (const v of p.product_variants)
        if (v.barcode === code || v.sku === code) {
          addVariant(p, v);
          setQ("");
          return;
        }
    if (code) {
      beep(false);
      toast.error("No product with this barcode");
    }
  }

  async function lookup(m = mobile) {
    const clean = m.replace(/\D/g, "");
    if (clean.length < 10) return;
    const { data } = await supabase.from("customers").select("id,mobile,name,is_premium,regular_stamps,premium_stamps,last_stamp_date").eq("mobile", clean).maybeSingle();
    setCustomer(data);
    setLookupDone(true);
    setRewardOn(true);
    if (data) {
      const { data: rw } = await supabase.from("loyalty_rewards").select("id,card,milestone,amount,expires_at").eq("customer_id", data.id).eq("status", "active").gt("expires_at", new Date().toISOString()).order("amount", { ascending: false });
      setRewards(rw ?? []);
    } else setRewards([]);
  }

  async function quickAdd() {
    const clean = mobile.replace(/\D/g, "");
    if (clean.length !== 10 || !newName.trim()) {
      toast.error("Enter 10-digit mobile and name");
      return;
    }
    const { error } = await supabase.from("customers").insert({ mobile: clean, name: newName.trim() });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Customer added");
    setNewName("");
    lookup(clean);
  }

  function clearCustomer() {
    setMobile("");
    setCustomer(null);
    setRewards([]);
    setLookupDone(false);
    setNewName("");
  }

  const reward = rewards[0];
  const rewardAmt = reward && rewardOn ? Number(reward.amount) : 0;
  const bill = computeBill(cart, Number(billDiscount) || 0, rewardAmt, { billType, taxMode: "inclusive", rate });
  const stampedToday = customer?.last_stamp_date === todayIST();
  const stampPreview = customer && giveStamp && !stampedToday && bill.total >= 299 ? (bill.total >= 999 ? "Regular +1 and Premium +1" : "Regular +1") : null;

  function reset() {
    setCart([]);
    setBillDiscount("");
    setSplitCash("");
    setGiveStamp(true);
    setPay("Cash");
    clearCustomer();
  }

  async function complete() {
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_sale", {
        _sale: {
          customer_id: customer?.id ?? "",
          customer_name: customer?.name || "Walk-in",
          payment_mode: pay,
          split_cash: pay === "Split" ? Number(splitCash) || 0 : 0,
          bill_type: billType,
          tax_mode: "inclusive",
          subtotal: bill.subtotal,
          discount: bill.discount,
          taxable: bill.taxable,
          gst_rate: bill.rate,
          gst_amount: bill.gst,
          total: bill.total,
          paid_amount: bill.total,
          due_amount: 0,
          give_stamp: giveStamp,
          reward_id: reward && rewardOn ? reward.id : "",
          removed_reward_id: reward && !rewardOn ? reward.id : "",
        },
        _items: cart.map((i) => ({ variant_id: i.variant_id, product_name: i.product_name, size: i.size, sku: i.sku, price: i.price, qty: i.qty, discount: 0 })),
      });
      if (error) throw error;
      const r = data as { bill_no: string; stamp_regular: boolean; unlocked: { card: string; amount: number }[] };
      setDone({ bill_no: r.bill_no, total: bill.total, mobile: customer?.mobile ?? "", name: customer?.name ?? "", stamp: r.stamp_regular, unlocked: r.unlocked ?? [] });
      reset();
      qc.invalidateQueries();
    } catch (e) {
      beep(false);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function hold() {
    if (!cart.length) return;
    saveHeld([...held, { id: crypto.randomUUID(), at: new Date().toISOString(), cart, mobile, label: customer?.name || "Walk-in" }]);
    reset();
    toast.success("Bill put on hold");
  }
  function resume(h: Held) {
    setCart(h.cart);
    saveHeld(held.filter((x) => x.id !== h.id));
    if (h.mobile) {
      setMobile(h.mobile);
      lookup(h.mobile);
    }
  }

  // Keyboard shortcuts: F2 search, F4 mobile, F8 complete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); mobileRef.current?.focus(); }
      if (e.key === "F8") { e.preventDefault(); complete(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const waText = done
    ? `Hello ${done.name || "there"}, thank you for shopping with us.\nBill: ${done.bill_no}\nAmount: ${inr(done.total)}` +
      (done.stamp ? `\nA loyalty stamp has been added to your card.` : "") +
      (done.unlocked.length ? `\nReward unlocked: ${done.unlocked.map((u) => inr(u.amount)).join(" + ")} off on your next bill (valid 30 days).` : "") +
      `\nSize exchange within 7 days with this bill.`
    : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* LEFT: products */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">POS Billing</h1>
          <span className="hidden items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />Ready for scan</span>
        </div>
        <Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="F2 · Scan barcode or search brand, article, colour…" className="h-12 text-base" />
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c}</button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          {brands.map((b) => (
            <button key={b} onClick={() => setBrand(b)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${brand === b ? "border-primary text-primary" : "text-muted-foreground"}`}>{b}</button>
          ))}
        </div>
        {held.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {held.map((h) => (
              <button key={h.id} onClick={() => resume(h)} className="flex items-center gap-1.5 rounded-lg border border-warning bg-warning/15 px-3 py-1.5 text-xs font-medium">
                <Play className="h-3 w-3" /> {h.label} · {h.cart.reduce((a, i) => a + i.qty, 0)} pairs
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{p.brand}</p>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold leading-tight">{p.article}</p>
                <p className="font-display font-bold">{inr(p.selling_price)}</p>
              </div>
              <p className="text-xs text-muted-foreground">{[p.category, p.color].filter(Boolean).join(" · ")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...p.product_variants].sort((a, b) => Number(a.size) - Number(b.size)).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => addVariant(p, v)}
                    className={`min-w-11 rounded-lg px-2 py-2 text-sm font-bold transition active:scale-95 ${v.stock <= 0 ? "bg-destructive/15 text-destructive line-through" : "bg-success/15 text-success hover:bg-success hover:text-success-foreground"}`}
                  >
                    {v.size}
                    <span className="block text-[9px] font-medium opacity-80">{v.stock}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!list.length && <p className="text-sm text-muted-foreground">No products found.</p>}
        </div>
      </section>

      {/* RIGHT: cart */}
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-4rem)]">
        <div className="flex h-full flex-col rounded-2xl border bg-card">
          {/* customer */}
          <div className="border-b p-4">
            {customer ? (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">{customer.name} {customer.is_premium && <Crown className="h-4 w-4 text-warning" />}</p>
                  <p className="text-xs text-muted-foreground">{customer.mobile} · Regular {customer.regular_stamps} · Premium {customer.premium_stamps}{stampedToday ? " · stamped today" : ""}</p>
                </div>
                <button onClick={clearCustomer} aria-label="Remove customer"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input ref={mobileRef} value={mobile} inputMode="numeric" maxLength={10} placeholder="F4 · Customer mobile" onChange={(e) => { setMobile(e.target.value); setLookupDone(false); if (e.target.value.replace(/\D/g, "").length === 10) lookup(e.target.value); }} className="h-11" />
                  <Button variant="outline" className="h-11" onClick={clearCustomer}>Walk-in</Button>
                </div>
                {lookupDone && !customer && (
                  <div className="mt-2 flex gap-2">
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New customer name" className="h-10" />
                    <Button className="h-10" onClick={quickAdd}><UserPlus className="h-4 w-4" /> Add</Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* items */}
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {cart.map((i) => (
              <div key={i.variant_id} className="flex items-center gap-2 rounded-lg bg-muted/60 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.brand} {i.product_name}</p>
                  <p className="text-xs text-muted-foreground">Size <b className="text-foreground">{i.size}</b> · {inr(i.price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="rounded bg-card p-1.5" onClick={() => setCart((c) => c.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center text-sm font-bold">{i.qty}</span>
                  <button className="rounded bg-card p-1.5" onClick={() => setCart((c) => c.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x)))}><Plus className="h-3 w-3" /></button>
                </div>
                <p className="w-16 text-right text-sm font-semibold">{inr(i.price * i.qty)}</p>
                <button onClick={() => setCart((c) => c.filter((x) => x.variant_id !== i.variant_id))}><Trash2 className="h-4 w-4 text-destructive" /></button>
              </div>
            ))}
            {!cart.length && <p className="py-10 text-center text-sm text-muted-foreground">Scan or tap a size to add.</p>}
          </div>

          {/* totals */}
          <div className="space-y-3 border-t p-4">
            {reward && (
              <div className={`flex items-center justify-between rounded-lg p-2.5 text-sm ${rewardOn ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground line-through"}`}>
                <span className="flex items-center gap-1.5"><Gift className="h-4 w-4" /> {reward.card === "premium" ? "Premium" : "Regular"} reward −{inr(reward.amount)}</span>
                <button className="text-xs font-semibold underline" onClick={() => setRewardOn(!rewardOn)}>{rewardOn ? "Remove" : "Apply"}</button>
              </div>
            )}
            {customer && (
              <div className="flex items-center justify-between text-sm">
                <span>Give loyalty stamp</span>
                <div className="flex items-center gap-2">
                  {stampPreview && <span className="text-xs text-success">{stampPreview}</span>}
                  <Switch checked={giveStamp} onCheckedChange={setGiveStamp} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder="Discount ₹" className="h-10" />
              <select value={billType} onChange={(e) => setBillType(e.target.value as "gst" | "simple")} className="h-10 rounded-md border bg-background px-2 text-sm">
                <option value="gst">GST bill</option>
                <option value="simple">Simple bill</option>
              </select>
              <select value={rate} disabled={billType !== "gst"} onChange={(e) => setRate(Number(e.target.value))} className="h-10 rounded-md border bg-background px-2 text-sm">
                {[5, 12, 18].map((r) => <option key={r} value={r}>GST {r}%</option>)}
              </select>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(["Cash", "UPI", "Card", "Split"] as const).map((m) => (
                <button key={m} onClick={() => setPay(m)} className={`h-10 rounded-lg text-sm font-semibold ${pay === m ? "bg-foreground text-background" : "bg-muted"}`}>{m}</button>
              ))}
            </div>
            {pay === "Split" && <Input value={splitCash} onChange={(e) => setSplitCash(e.target.value)} inputMode="decimal" placeholder={`Cash part (rest ${inr(bill.total - (Number(splitCash) || 0))} by UPI/Card)`} className="h-10" />}
            <div className="space-y-0.5 text-sm">
              <Row k="Subtotal" v={inr(bill.subtotal)} />
              {bill.discount > 0 && <Row k="Discount" v={`−${inr(bill.discount)}`} />}
              {bill.rate > 0 && <Row k={`GST ${bill.rate}% (incl.)`} v={inr(bill.gst)} />}
              <div className="flex items-end justify-between pt-1">
                <span className="font-semibold">Total</span>
                <span className="font-display text-3xl font-bold">{inr(bill.total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="outline" className="h-12" onClick={hold} disabled={!cart.length}><Pause className="h-4 w-4" /> Hold</Button>
              <Button className="h-12 bg-success text-base text-success-foreground hover:bg-success/90" onClick={complete} disabled={!cart.length || busy}>
                {busy ? "Saving…" : `F8 · Complete ${inr(bill.total)}`}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={!!done} onOpenChange={(o) => !o && setDone(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Bill saved</DialogTitle></DialogHeader>
          {done && (
            <div className="space-y-3 text-center">
              <p className="font-mono text-sm">{done.bill_no}</p>
              <p className="font-display text-4xl font-bold">{inr(done.total)}</p>
              {done.stamp && <p className="text-sm text-success">Loyalty stamp added</p>}
              {done.unlocked.map((u) => (
                <p key={u.card} className="rounded-lg bg-accent p-2 text-sm font-medium text-accent-foreground">🎉 {u.card === "premium" ? "Premium" : "Regular"} reward unlocked: {inr(u.amount)} off</p>
              ))}
              <div className="grid gap-2">
                {done.mobile && (
                  <Button asChild className="h-11 bg-success text-success-foreground hover:bg-success/90">
                    <a href={waLink(done.mobile, waText)} target="_blank" rel="noreferrer">Send bill on WhatsApp</a>
                  </Button>
                )}
                <Button variant="outline" className="h-11" onClick={() => { setDone(null); searchRef.current?.focus(); }}>New bill</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
