import { useShop } from "@/hooks/use-shop";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Pause, Play, X, UserPlus, Gift, Crown, Search, MessageCircle, Printer, Share2, Smartphone, ScanLine, PackagePlus, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { beep, computeBill, waLink, type CartItem } from "@/lib/pos";
import { printBill, type PrintDesign } from "@/lib/print";
import { addSignedImages } from "@/lib/product-images";
import { billMessage, shareText, smsLink } from "@/lib/messages";
import { sizeSort } from "@/lib/stock";
import { QuickAddProduct } from "@/components/QuickAddProduct";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS Billing — SoleStack POS" }, { name: "description", content: "Fast footwear billing with size chips and loyalty." }, { property: "og:title", content: "POS Billing — SoleStack POS" }, { property: "og:description", content: "Fast footwear billing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: POS,
});

type Customer = { id: string; mobile: string; name: string; is_premium: boolean; regular_stamps: number; premium_stamps: number; last_stamp_date: string | null };
type Reward = { id: string; card: string; milestone: number; amount: number; expires_at: string };
type Held = { id: string; at: string; cart: CartItem[]; mobile: string; label: string };
const HOLD_KEY = "solestack-held-bills";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function POS() {
  const shop = useShop();
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
  const [pay, setPay] = useState<"Cash" | "UPI" | "Card" | "Split" | "Credit">("Cash");
  const [splitCash, setSplitCash] = useState("");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [design, setDesign] = useState<PrintDesign>("Thermal");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [done, setDone] = useState<null | { bill_no: string; total: number; paid: number; due: number; mobile: string; name: string; stamp: boolean; unlocked: { card: string; amount: number }[] }>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<null | { id: string; code: string; title: string; amount: number }>(null);
  const couponRequestRef = useRef(0);
  const { data: storeCfg } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("store_settings").select("*").eq("id", 1).single()).data });
  useEffect(() => { const d = storeCfg?.bill_design; if (d) setDesign(d as PrintDesign); }, [storeCfg?.bill_design]);

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
        .select("id,brand,article,category,color,selling_price,mrp,status,image_url,product_variants(id,size,stock,sku,barcode)")
        .eq("status", "Active")
        .limit(2000);
      if (error) throw error;
      return addSignedImages(data);
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

  const scanCode = useCallback((code: string) => {
    const key = code.trim().toLowerCase();
    for (const p of products) for (const v of p.product_variants) if (v.barcode?.toLowerCase() === key || v.sku?.toLowerCase() === key) { addVariant(p,v); setQ(""); return true; }
    beep(false); toast.error("No product with this scan code"); return false;
  }, [products,addVariant]);

  useEffect(() => {
    let buffer = ""; let last = 0; let rapid = 0;
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || cameraOpen) return;
      const el = e.target as HTMLElement;
      const editing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
      const now = performance.now();
      if (now-last > 85) { buffer=""; rapid=0; }
      last=now;
      if (e.key === "Enter") { if (el !== searchRef.current && buffer.length >= 6 && rapid >= 5) { e.preventDefault(); scanCode(buffer); } buffer=""; rapid=0; return; }
      if (e.key.length !== 1) return;
      if (!editing || el === searchRef.current) { buffer += e.key; rapid++; }
    };
    window.addEventListener("keydown",handle); return () => window.removeEventListener("keydown",handle);
  },[scanCode,cameraOpen]);

  // Barcode scanner: scanners type the code + Enter into the search box
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (q.trim()) scanCode(q);
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
  const cartSubtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const couponAmt = coupon ? Number(coupon.amount) : 0;
  const bill = computeBill(cart, Number(billDiscount) || 0, rewardAmt + couponAmt, { billType, taxMode, rate });

  async function checkCoupon(code: string, silent = false) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const request = ++couponRequestRef.current;
    const { data, error } = await supabase.rpc("coupon_discount", { _code: c, _customer: customer?.id ?? (null as unknown as string), _subtotal: cartSubtotal });
    if (request !== couponRequestRef.current) return;
    if (error) { setCoupon(null); if (!silent) { beep(false); toast.error(error.message); } else toast.error(`Coupon ${c} removed: ${error.message}`); return; }
    const r = data as { id: string; code: string; title: string; amount: number };
    setCoupon(r);
    if (!silent) { beep(true); toast.success(`${r.code} applied · −${inr(r.amount)}`); }
  }
  // Re-check the coupon whenever the cart value or customer changes (percent / min-bill / customer-only rules).
  useEffect(() => {
    if (!coupon) return;
    if (!cart.length) { couponRequestRef.current++; setCoupon(null); return; }
    void checkCoupon(coupon.code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSubtotal, customer?.id]);
  const recv = received.trim() === "" ? (pay === "Credit" ? 0 : bill.total) : Number(received) || 0;
  const paid = Math.min(recv, bill.total);
  const due = Math.max(bill.total - recv, 0);
  const change = Math.max(recv - bill.total, 0);
  const stampedToday = customer?.last_stamp_date === todayIST();
  const stampPreview = customer && giveStamp && !stampedToday && bill.total >= 299 ? (bill.total >= 999 ? "Premium +1" : "Regular +1") : null;

  function reset() {
    couponRequestRef.current++;
    setCart([]);
    setBillDiscount("");
    setSplitCash("");
    setGiveStamp(true);
    setPay("Cash");
    setReceived("");
    setCoupon(null);
    setCouponInput("");
    clearCustomer();
  }

  // Typed a 10-digit mobile but customer isn't saved yet → save automatically so they appear in Customers.
  async function ensureCustomer(): Promise<Customer | null> {
    if (customer) return customer;
    const clean = mobile.replace(/\D/g, "").slice(-10);
    if (clean.length !== 10) return null;
    const cols = "id,mobile,name,is_premium,regular_stamps,premium_stamps,last_stamp_date";
    const found = await supabase.from("customers").select(cols).eq("mobile", clean).maybeSingle();
    if (found.data) { setCustomer(found.data); return found.data; }
    const { data, error } = await supabase.from("customers").insert({ mobile: clean, name: newName.trim() || "Walk-in Customer" }).select(cols).single();
    if (error) { toast.error("Customer save nahi hua: " + error.message); return null; }
    setCustomer(data); setNewName(""); toast.success(`Customer ${clean} saved`);
    return data;
  }

  async function complete() {
    if (!cart.length || submittingRef.current) return;
    submittingRef.current = true;
    const customer = await ensureCustomer();
    submittingRef.current = false;
    if (pay === "Credit" && !customer) {
      toast.error("Credit bill ke liye customer mobile zaroori hai");
      mobileRef.current?.focus();
      return;
    }
    if (due > 0 && !customer) {
      toast.error("Baaki (due) amount ke liye customer mobile zaroori hai");
      mobileRef.current?.focus();
      return;
    }
    if (pay === "Split" && (Number(splitCash) < 0 || Number(splitCash) > paid)) { toast.error("Cash part must be between zero and amount received"); return; }
    submittingRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_sale", {
        _sale: {
          customer_id: customer?.id ?? "",
          customer_name: customer?.name || "Walk-in",
          payment_mode: pay,
          split_cash: pay === "Split" ? Number(splitCash) || 0 : 0,
          bill_type: billType,
          tax_mode: taxMode,
          subtotal: bill.subtotal,
          discount: bill.discount,
          taxable: bill.taxable,
          gst_rate: bill.rate,
          gst_amount: bill.gst,
          total: bill.total,
          paid_amount: paid,
          due_amount: due,
          give_stamp: giveStamp,
          reward_id: reward && rewardOn ? reward.id : "",
          removed_reward_id: reward && !rewardOn ? reward.id : "",
          coupon_code: coupon?.code ?? "",
        },
        _items: cart.map((i) => ({ variant_id: i.variant_id, product_name: i.product_name, size: i.size, sku: i.sku, price: i.price, qty: i.qty, discount: 0 })),
      });
      if (error) throw error;
      const r = data as { bill_no: string; stamp_regular: boolean; stamp_premium?: boolean; unlocked: { card: string; amount: number }[] };
       setDone({ bill_no: r.bill_no, total: bill.total, paid, due, mobile: customer?.mobile ?? "", name: customer?.name ?? "", stamp: r.stamp_regular || !!r.stamp_premium, unlocked: r.unlocked ?? [] });
      reset();
      qc.invalidateQueries();
    } catch (e) {
      beep(false);
      toast.error((e as Error).message);
    } finally {
      submittingRef.current = false;
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
      if (e.key === "F8" && !e.repeat) { e.preventDefault(); complete(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const waText = done ? billMessage({ shop: shop.name, name: done.name, billNo: done.bill_no, total: done.total, paid: done.paid, due: done.due, stamp: done.stamp, rewards: done.unlocked }) : "";

  return (
    <div className="grid min-h-[calc(100vh-2.5rem)] gap-3 md:h-[calc(100vh-4.5rem)] md:min-h-[460px] md:grid-cols-[minmax(0,1fr)_320px] md:overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT: products */}
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
          <div><h1 className="text-lg font-bold">POS Billing</h1><p className="text-[11px] text-muted-foreground">Scan, choose size and complete the bill</p></div>
          <span className="hidden items-center gap-1.5 rounded-md bg-success/15 px-2 py-1 text-[10px] font-semibold text-success sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />Ready</span>
        </div>
        <div className="flex shrink-0 gap-2 p-3 pb-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="F2 · Scan barcode or search article" className="h-9 pl-9 text-sm" /></div><Button variant="outline" size="icon" className="h-9 w-9" title="Scan with phone camera" aria-label="Scan with phone camera" onClick={()=>setCameraOpen(true)}><ScanLine className="h-4 w-4"/></Button><Button variant="outline" className="h-9 px-2.5 text-xs" onClick={()=>setQuickOpen(true)}><PackagePlus className="h-4 w-4"/><span className="hidden sm:inline">Quick add</span></Button></div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-1">
          {cats.map((c) => (
             <Button key={c} size="sm" variant={cat === c ? "default" : "secondary"} onClick={() => setCat(c)} className="h-7 shrink-0 px-2.5 text-xs">{c}</Button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2">
          {brands.map((b) => (
             <Button key={b} size="sm" variant="outline" onClick={() => setBrand(b)} className={`h-7 shrink-0 px-2.5 text-[10px] uppercase ${brand === b ? "border-primary text-primary" : "text-muted-foreground"}`}>{b}</Button>
          ))}
        </div>
        {held.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 px-3 pb-2">
            {held.map((h) => (
              <Button key={h.id} variant="outline" size="sm" onClick={() => resume(h)} className="h-7 border-warning bg-warning/15 px-2 text-xs">
                <Play className="h-3 w-3" /> {h.label} · {h.cart.reduce((a, i) => a + i.qty, 0)} pairs
              </Button>
            ))}
          </div>
        )}
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary">
              <div className="flex h-16 items-center gap-2 bg-muted/50 p-2">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-background">{p.image_src ? <img src={p.image_src} alt={`${p.brand} ${p.article}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center font-display text-lg text-muted-foreground/35">{p.brand.slice(0, 1)}{p.article.slice(0, 1)}</div>}</div>
                <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase text-primary">{p.brand}</p><p className="truncate text-sm font-semibold">{p.article}</p><p className="text-xs font-bold">{inr(p.selling_price)}</p></div>
              </div>
              <div className="flex flex-wrap gap-1 p-2">
                {[...p.product_variants].sort((a, b) => sizeSort(a.size, b.size)).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => addVariant(p, v)}
                    className={`min-w-9 rounded-md px-1.5 py-1 text-xs font-bold transition active:scale-95 ${v.stock <= 0 ? "bg-destructive/15 text-destructive line-through" : "bg-success/15 text-success hover:bg-success hover:text-success-foreground"}`}
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
       <aside className="min-h-0 md:h-full">
         <div className="flex h-full min-h-[460px] flex-col overflow-hidden rounded-lg border bg-card">
          {/* customer */}
           <div className="shrink-0 border-b p-3">
             <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Active transaction · {cart.reduce((a, i) => a + i.qty, 0)} pairs</p>{cart.length > 0 && <Button variant="ghost" size="sm" onClick={reset} className="h-6 px-2 text-[10px] text-destructive">Clear</Button>}</div>
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
           <div className="min-h-[36px] flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {cart.map((i) => (
               <div key={i.variant_id} className="flex items-center gap-1.5 rounded-md bg-muted/60 p-1.5">
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
           <div className="shrink-0 space-y-1 border-t bg-muted/25 p-2.5">
            {reward && (
              <div className={`flex items-center justify-between rounded-lg p-2.5 text-sm ${rewardOn ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground line-through"}`}>
                <span className="flex items-center gap-1.5"><Gift className="h-4 w-4" /> {reward.card === "premium" ? "Premium" : "Regular"} reward −{inr(reward.amount)}</span>
                <button className="text-xs font-semibold underline" onClick={() => setRewardOn(!rewardOn)}>{rewardOn ? "Remove" : "Apply"}</button>
              </div>
            )}
            {coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-accent p-2 text-sm text-accent-foreground">
                <span className="flex items-center gap-1.5"><Ticket className="h-4 w-4" /> {coupon.code}{coupon.title ? ` · ${coupon.title}` : ""} −{inr(coupon.amount)}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold underline" onClick={() => { couponRequestRef.current++; setCoupon(null); setCouponInput(""); }}>Remove</Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void checkCoupon(couponInput); }} placeholder="Coupon code" className="h-7 text-xs uppercase" aria-label="Coupon code" />
                <Button type="button" variant="secondary" className="h-7 px-2 text-[11px]" disabled={!couponInput.trim() || !cart.length} onClick={() => checkCoupon(couponInput)}><Ticket className="h-3.5 w-3.5" /> Apply</Button>
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
             <div className="grid grid-cols-3 gap-1.5 text-[9px] font-medium text-muted-foreground">
              <label>Bill type
                 <select value={billType} onChange={(e) => setBillType(e.target.value as "gst" | "simple")} className="mt-0.5 h-7 w-full rounded-md border bg-background px-1 text-[11px] text-foreground">
                  <option value="gst">GST Invoice</option><option value="simple">Cash Memo</option>
                </select>
              </label>
              <label>Tax mode
                 <select value={taxMode} disabled={billType !== "gst"} onChange={(e) => setTaxMode(e.target.value as "inclusive" | "exclusive")} className="mt-0.5 h-7 w-full rounded-md border bg-background px-1 text-[11px] text-foreground">
                  <option value="exclusive">Exclusive (Add)</option><option value="inclusive">Inclusive (Extract)</option>
                </select>
              </label>
              <label>Print style
                 <select value={design} onChange={(e) => setDesign(e.target.value as PrintDesign)} className="mt-0.5 h-7 w-full rounded-md border bg-background px-1 text-[11px] text-foreground">
                  <option>Thermal</option><option>A4</option><option>Premium</option>
                </select>
              </label>
            </div>
             <div className="grid grid-cols-2 gap-1.5 text-[9px] font-medium text-muted-foreground">
               <label>Bill discount ₹<Input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-0.5 h-7 text-xs" /></label>
              <label>GST %
                 <select value={billType === "gst" ? rate : 0} disabled={billType !== "gst"} onChange={(e) => setRate(Number(e.target.value))} className="mt-0.5 h-7 w-full rounded-md border bg-background px-1 text-[11px] text-foreground">
                  {billType !== "gst" && <option value={0}>No GST</option>}
                  {[5, 12, 18].map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(["Cash", "UPI", "Card", "Split", "Credit"] as const).map((m) => (
                 <Button key={m} type="button" variant={pay === m ? "default" : "secondary"} onClick={() => setPay(m)} className="h-7 px-1 text-[10px]">{m}</Button>
              ))}
            </div>
             {pay === "Split" && <Input value={splitCash} onChange={(e) => setSplitCash(e.target.value)} inputMode="decimal" placeholder={`Cash part · rest ${inr(bill.total - (Number(splitCash) || 0))}`} className="h-7 text-xs" />}
            <div>
               <Input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder={pay === "Credit" ? "Advance received · customer required" : "Amount received · blank = exact"} className="h-7 text-xs" />
               <div className="mt-1 grid grid-cols-4 gap-1">
                {[["Exact", 0], ["+100", 100], ["+500", 500], ["+1000", 1000]].map(([l, v]) => (
                   <Button key={l} type="button" variant="secondary" onClick={() => setReceived(String(v === 0 ? bill.total : (Number(received) || 0) + Number(v)))} className="h-6 px-1 text-[10px]">{l}</Button>
                ))}
              </div>
            </div>
             <div className="grid grid-cols-2 gap-x-3 rounded-md bg-muted/60 p-2 text-[11px]">
              <Row k="Subtotal" v={inr(bill.subtotal)} />
              <Row k={couponAmt || rewardAmt ? "Discount (all)" : "Bill discount"} v={`−${inr(bill.discount)}`} />
              {bill.rate > 0 && <Row k="Taxable" v={inr(bill.taxable)} />}
              {bill.rate > 0 && <Row k={`GST ${bill.rate}% ${taxMode === "inclusive" ? "(incl.)" : "(added)"}`} v={inr(bill.gst)} />}
              <Row k={due > 0 ? "Due" : "Change"} v={inr(due > 0 ? due : change)} />
               <div className="col-span-2 mt-1 flex items-end justify-between border-t pt-1">
                <span className="font-semibold">Total</span>
                 <span className="font-display text-xl font-bold">{inr(bill.total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2">
               <Button variant="outline" className="h-8" onClick={hold} disabled={!cart.length}><Pause className="h-4 w-4" /> Hold</Button>
               <Button className="h-8 text-sm" onClick={complete} disabled={!cart.length || busy}>
                {busy ? "Saving…" : `F8 · Complete Sale ${inr(bill.total)}`}
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
                 <p key={u.card} className="rounded-lg bg-accent p-2 text-sm font-medium text-accent-foreground">{u.card === "premium" ? "Premium" : "Regular"} reward unlocked: {inr(u.amount)} off</p>
              ))}
              <div className="grid gap-2">
                {done.mobile && (
                   <Button asChild className="h-11">
                     <a href={waLink(done.mobile, waText)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                )}
                 <div className="grid grid-cols-3 gap-2">
                   <Button variant="outline" className="h-10" onClick={() => printBill(done.bill_no, design).catch((e) => toast.error(e.message))}><Printer className="h-4 w-4" /> Print</Button>
                   {done.mobile && <Button variant="outline" asChild className="h-10"><a href={smsLink(done.mobile, waText)}><Smartphone className="h-4 w-4" /> Text</a></Button>}
                   <Button variant="outline" className="h-10" onClick={() => shareText(done.bill_no, waText).then(() => toast.success("Bill shared or copied")).catch(() => {})}><Share2 className="h-4 w-4" /> Share</Button>
                </div>
                <Button variant="outline" className="h-11" onClick={() => { setDone(null); searchRef.current?.focus(); }}>New bill</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <QuickAddProduct open={quickOpen} initialArticle={q && !/^[A-Z0-9]{8,}$/i.test(q) ? q : ""} onClose={() => setQuickOpen(false)} onAdded={(r) => { const first = r.variants.find((v) => (r.qty[v.size] ?? 0) > 0); toast.message(first ? "Ab size tap karke bill mein daalo" : "Stock 0 hai — pehle pairs add karo"); }} />
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}><DialogContent><DialogHeader><DialogTitle>Scan box label</DialogTitle></DialogHeader>{cameraOpen && <CameraScanner onScan={(code)=>{if(scanCode(code))setCameraOpen(false);}} />}</DialogContent></Dialog>
    </div>
  );
}

function CameraScanner({onScan}:{onScan:(code:string)=>void}) {
  const video=useRef<HTMLVideoElement>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true; let controls:{stop:()=>void}|undefined;
    import("@zxing/browser").then(async ({BrowserMultiFormatReader})=>{if(!active)return;const reader=new BrowserMultiFormatReader();try{const target=video.current;if(!target)return;controls=await reader.decodeFromConstraints({video:{facingMode:{ideal:"environment"}}},target,(result)=>{if(result&&active)onScan(result.getText());});if(!active)controls.stop();}catch(e){if(active)setError((e as Error).message);}}).catch(e=>setError((e as Error).message));
    return()=>{active=false;controls?.stop();};
  },[onScan]);
  return <div><video ref={video} muted playsInline className="aspect-video w-full bg-muted object-cover"/>{error&&<p role="alert" className="mt-2 text-sm text-destructive">Camera unavailable: {error}</p>}</div>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
