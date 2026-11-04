import { CameraScanner } from "@/components/CameraScanner";
import { parseCategory, categoryLabel, categoryMatches } from "@/lib/product-categories";
import { useAuth } from "@/hooks/use-auth";
import { requireRetailIntegrity } from "@/lib/retail-integrity";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { CouponTicket } from "@/components/CouponTicket";
import { m, useReducedMotion } from "motion/react";
import { SuccessMark } from "@/components/motion/success-mark";
import { loadReceiptResources } from "@/components/motion/receipt-resources";
import { useShop } from "@/hooks/use-shop";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, ReceiptText as ReceiptTextIcon, Minus, Plus, Trash2, Pause, Play, X, UserPlus, Gift, Crown, Search, MessageCircle, Printer, Share2, Smartphone, ScanLine, PackagePlus, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { beep, computeBill, waLink, type CartItem } from "@/lib/pos";
import { printBill, type PrintDesign } from "@/lib/print";
import { billMessage, shareText, smsLink } from "@/lib/messages";
import { sizeSort, useStock } from "@/lib/stock";
import { QuickAddProduct } from "@/components/QuickAddProduct";
import { useLang } from "@/lib/i18n";
import styles from "./pos.module.css";

export const Route = createFileRoute("/_authenticated/pos")({
  validateSearch: (search: Record<string, unknown>): { product?: string } => (typeof search["product"] === "string" && search["product"] ? { product: search["product"] } : {}),
  head: () => ({ meta: [{ title: "POS Billing — SoleStack POS" }, { name: "description", content: "Fast footwear billing with size chips and loyalty." }, { property: "og:title", content: "POS Billing — SoleStack POS" }, { property: "og:description", content: "Fast footwear billing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: POS,
});

type Customer = { id: string; mobile: string; name: string; is_premium: boolean; regular_stamps: number; premium_stamps: number; last_stamp_date: string | null };
type Reward = { id: string; card: string; milestone: number; amount: number; expires_at: string };
type Held = { id: string; at: string; cart: CartItem[]; mobile: string; label: string };
const HOLD_KEY = "solestack-held-bills";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function POS() {
  const { product: selectedProduct } = Route.useSearch();
  const navigate = Route.useNavigate();
  const shop = useShop();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const { lang, t } = useLang();
  const [mobilePane, setMobilePane] = useState<"products" | "cart">("products");
  const copy = POS_COPY[lang];
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const deferredSearch = useDeferredValue(q);
  const [visibleCount, setVisibleCount] = useState(60);
  const [cat, setCat] = useState("All");
  const [brand, setBrand] = useState("All");
  function showAllProducts() {
    setQ(""); setCat("All"); setBrand("All");
    void navigate({ search: {}, replace: true });
  }
  useEffect(() => setVisibleCount(60), [q, cat, brand]);
  const [cart, setCart] = useState<CartItem[]>([]);
  useEffect(() => {
    // Warm the lazy decoration during preparation; confirmation never waits for it.
    if (cart.length && !reduceMotion) void loadReceiptResources().catch(() => {});
  }, [cart.length, reduceMotion]);
  const [mobile, setMobile] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newName, setNewName] = useState("");
  const customerLookupRequest = useRef(0);
  const [lookupDone, setLookupDone] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rewardOn, setRewardOn] = useState(true);
  const [giveStamp, setGiveStamp] = useState(true);
  const [billDiscount, setBillDiscount] = useState("");
  const [billType, setBillType] = useState<"gst" | "simple">("simple");
  const [rate, setRate] = useState(5);
  const [pay, setPay] = useState<"Cash" | "UPI" | "Card" | "Split" | "Credit">("Cash");
  const [splitCash, setSplitCash] = useState("");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("inclusive");
  const [design, setDesign] = useState<PrintDesign>("Thermal");
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const pendingSaleRef = useRef<null | { sale: Record<string, string | number | boolean>; items: { variant_id: string; product_name: string; size: string; sku: string | null; price: number; qty: number; discount: number }[] }>(null);
  const [retryPending, setRetryPending] = useState(false);
  const requestStorageKey = "solestack-pending-billing-v1";
  useEffect(() => {
    if (!user) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(requestStorageKey) ?? "null");
      if (saved?.userId === user.id && saved.payload?.sale?.request_id && Array.isArray(saved.payload.items)) {
        pendingSaleRef.current = saved.payload;
        setRetryPending(true);
      }
    } catch { toast.error("Pending bill recovery could not be read. Check Sales History before retrying a previous purchase."); }
  }, [user]);
  const [done, setDone] = useState<null | { bill_no: string; total: number; paid: number; due: number; mobile: string; name: string; stamp: boolean; unlocked: { card: string; amount: number }[] }>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<null | { id: string; code: string; title: string; amount: number }>(null);
  const couponRequestRef = useRef(0);
  const [couponBusy, setCouponBusy] = useState(false);
  const { data: storeCfg } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("store_settings").select("*").eq("id", 1).single()).data });
  const defaultsLoaded = useRef(false);
  useEffect(() => {
    if (!storeCfg || (cart.length && defaultsLoaded.current) || pendingSaleRef.current) return;
    defaultsLoaded.current=true;
    setBillType(storeCfg.default_bill_type === "gst" || (!storeCfg.default_bill_type && storeCfg.gstin?.trim()) ? "gst" : "simple");
    setTaxMode(storeCfg.default_tax_mode === "exclusive" ? "exclusive" : "inclusive");
    setRate(Number(storeCfg.default_gst_rate ?? 5));
  }, [storeCfg, cart.length]);
  useEffect(() => { const d = storeCfg?.bill_design; if (d) setDesign(d as PrintDesign); }, [storeCfg?.bill_design]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]");
      setHeld(Array.isArray(saved) ? saved.filter((h): h is Held => !!h && typeof h === "object" && typeof h.id === "string" && Array.isArray(h.cart)) : []);
    } catch { setHeld([]); }
  }, []);
  const saveHeld = (h: Held[]) => {
    setHeld(h);
    localStorage.setItem(HOLD_KEY, JSON.stringify(h));
  };

  const { data: products = [], error: productsError, isPending: productsPending } = useStock({ activeOnly: true });

  const cats = useMemo(() => ["All", ...new Set(products.map((p) => parseCategory(p.category).department).filter(Boolean))], [products]);
  const brands = useMemo(() => ["All", ...new Set(products.map((p) => p.brand).filter(Boolean))], [products]);
  const list = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        (!selectedProduct || p.id === selectedProduct) &&
        (categoryMatches(p.category, cat)) &&
        (brand === "All" || p.brand === brand) &&
        (!s || [p.brand, p.article, p.color, p.category, categoryLabel(p.category)].some((f) => f?.toLowerCase().includes(s)) || p.product_variants.some((v) => v.sku?.toLowerCase() === s || v.barcode === s || v.label_code?.toLowerCase() === s)),
    );
  }, [products, deferredSearch, cat, brand, selectedProduct]);

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

  const scanIndex = useMemo(() => {
    const index = new Map<string, { p: (typeof products)[number]; v: (typeof products)[number]["product_variants"][number] } | null>();
    for (const p of products) for (const v of p.product_variants) for (const code of [v.barcode, v.sku, v.label_code]) {
      const key = code?.trim().toLowerCase();
      if (!key) continue;
      if (index.has(key) && index.get(key)?.v.id !== v.id) index.set(key, null);
      else if (!index.has(key)) index.set(key, { p, v });
    }
    return index;
  }, [products]);
  const scanCode = useCallback((code: string) => {
    const match = scanIndex.get(code.trim().toLowerCase());
    if (match) {
      if (match.v.stock <= 0) { beep(false); toast.error(`Size ${match.v.size} is out of stock`); return false; }
      addVariant(match.p, match.v); setQ(""); return true;
    }
    beep(false); toast.error(match === null ? "This code matches multiple sizes. Select the correct size or print its unique label." : "No product with this scan code"); return false;
  }, [scanIndex,addVariant]);

  useEffect(() => {
    let buffer = ""; let last = 0; let rapid = 0;
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || cameraOpen || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"], #print-preview')) return;
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
    if (e.key !== "Enter" || e.repeat) return;
    if (q.trim()) scanCode(q);
  }

  async function lookup(m = mobile) {
    const request = ++customerLookupRequest.current;
    const clean = m.replace(/\D/g, "");
    if (clean.length !== 10) return;
    const { data } = await supabase.from("customers").select("id,mobile,name,is_premium,regular_stamps,premium_stamps,last_stamp_date").eq("mobile", clean).maybeSingle();
    if (request !== customerLookupRequest.current) return;
    setCustomer(data);
    setLookupDone(true);
    setRewardOn(true);
    if (data) {
      const { data: rw } = await supabase.from("loyalty_rewards").select("id,card,milestone,amount,expires_at").eq("customer_id", data.id).eq("status", "active").gt("expires_at", new Date().toISOString()).order("amount", { ascending: false });
      if (request === customerLookupRequest.current) setRewards(rw ?? []);
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
    customerLookupRequest.current++;
    setMobile("");
    setCustomer(null);
    setRewards([]);
    setLookupDone(false);
    setNewName("");
  }

  const reward = rewards[0];
  const rewardAmt = reward && rewardOn ? Number(reward.amount) : 0;
  const cartChanged = cart.some(item => {
    const p = products.find(p => p.product_variants.some(v => v.id===item.variant_id));
    const v = p?.product_variants.find(v=>v.id===item.variant_id);
    return !p || !v || Number(p.selling_price)!==item.price || v.stock<item.qty;
  });
  function updateCart() {
    if (!window.confirm("Review current prices and remove unavailable pairs?")) return;
    setCart(items=>items.flatMap(item=>{
      const p=products.find(p=>p.product_variants.some(v=>v.id===item.variant_id));const v=p?.product_variants.find(v=>v.id===item.variant_id);
      return p && v && v.stock>0 ? [{...item,price:Number(p.selling_price),qty:Math.min(item.qty,v.stock),max:v.stock}] : [];
    }));
  }
  const cartSubtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const couponAmt = coupon ? Number(coupon.amount) : 0;
  const bill = computeBill(cart, Number(billDiscount) || 0, rewardAmt + couponAmt, { billType, taxMode, rate });

  async function checkCoupon(code: string, silent = false) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const request = ++couponRequestRef.current;
    setCouponBusy(true);
    try {
      const { data, error } = await supabase.rpc("coupon_discount", { _code: c, _customer: customer?.id ?? (null as unknown as string), _subtotal: cartSubtotal });
      if (request !== couponRequestRef.current) return;
      if (error) { setCoupon(null); if (!silent) { beep(false); toast.error(error.message); } else toast.error(`Coupon ${c} removed: ${error.message}`); return; }
      const result = data as { id: string; code: string; title: string; amount: number };
      setCoupon(result);
      if (!silent) { beep(true); toast.success(`${result.code} applied · −${inr(result.amount)}`); }
    } catch (error) {
      if (request === couponRequestRef.current) { setCoupon(null); toast.error((error as Error).message); }
    } finally { if (request === couponRequestRef.current) setCouponBusy(false); }
  }
  // Re-check the coupon whenever the cart value or customer changes (percent / min-bill / customer-only rules).
  useEffect(() => {
    if (!coupon) return;
    if (!cart.length) { couponRequestRef.current++; setCouponBusy(false); setCoupon(null); return; }
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
    setCouponBusy(false);
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
    if (customer && customer.mobile === mobile.replace(/\D/g, "").slice(-10)) return customer;
    const clean = mobile.replace(/\D/g, "").slice(-10);
    if (!clean.length && !newName.trim()) return null;
    if (clean.length !== 10) throw new Error("Enter a valid 10-digit customer mobile, or choose Walk-in.");
    const cols = "id,mobile,name,is_premium,regular_stamps,premium_stamps,last_stamp_date";
    const found = await supabase.from("customers").select(cols).eq("mobile", clean).maybeSingle();
    if (found.error) throw new Error("Customer lookup failed. Retry before billing: " + found.error.message);
    if (found.data) { setCustomer(found.data); return found.data; }
    const { data, error } = await supabase.from("customers").insert({ mobile: clean, name: newName.trim() || "Walk-in Customer" }).select(cols).single();
    if (error) throw new Error("Customer could not be saved. Retry before billing: " + error.message);
    setCustomer(data); setNewName(""); toast.success(`Customer ${clean} saved`);
    return data;
  }

  async function complete() {
    if ((!cart.length && !pendingSaleRef.current) || submittingRef.current) return;
    if (cartChanged && !pendingSaleRef.current) { toast.error("Stock or prices changed. Review and refresh the cart."); return; }
    submittingRef.current = true;
    setBusy(true);
    try {
      await requireRetailIntegrity();
      if (!user) throw new Error("Sign in before billing.");
      const existingPending = JSON.parse(sessionStorage.getItem(requestStorageKey) ?? "null");
      if (existingPending && existingPending.userId !== user.id) throw new Error("A previous cashier has an unresolved bill in this tab. Ask them to recover it before starting another bill.");
      if (!pendingSaleRef.current && (!Number.isFinite(recv) || recv < 0)) throw new Error("Enter a valid non-negative amount received");
      const customer = pendingSaleRef.current ? null : await ensureCustomer();
      if (!pendingSaleRef.current && pay === "Credit" && recv > 0) throw new Error("Choose Cash, UPI or Card for partial payment; Credit means unpaid");
      if (!pendingSaleRef.current && pay === "Credit" && !customer) {
        toast.error("Credit bill ke liye customer mobile zaroori hai");
        mobileRef.current?.focus();
        return;
      }
      if (!pendingSaleRef.current && due > 0 && !customer) {
        toast.error("Baaki (due) amount ke liye customer mobile zaroori hai");
        mobileRef.current?.focus();
        return;
      }
      if (!pendingSaleRef.current && pay === "Split" && (Number(splitCash) < 0 || Number(splitCash) > paid)) { toast.error("Cash part must be between zero and amount received"); return; }
      const request = pendingSaleRef.current ?? {
        sale: {
          request_id: crypto.randomUUID(),
          customer_id: customer?.id ?? "",
          customer_name: customer?.name || "Walk-in",
          customer_mobile: customer?.mobile ?? "",
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
        items: cart.map((i) => ({ variant_id: i.variant_id, product_name: i.product_name, size: i.size, sku: i.sku, price: i.price, qty: i.qty, discount: 0 })),
      };
      sessionStorage.setItem(requestStorageKey, JSON.stringify({ userId: user.id, payload: request }));
      pendingSaleRef.current = request;
      const { data, error } = await supabase.rpc("create_sale", { _sale: request.sale, _items: request.items });
      if (error) {
        // A PostgreSQL business error rolls back; transport/proxy errors may follow a committed sale.
        if (/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST")) { pendingSaleRef.current = null; sessionStorage.removeItem(requestStorageKey); setRetryPending(false); }
        else setRetryPending(true);
        if (/price changed|product or size changed|out of stock/i.test(error.message)) void qc.invalidateQueries({queryKey:["stock-all"]});
        throw error;
      }
      pendingSaleRef.current = null; sessionStorage.removeItem(requestStorageKey); setRetryPending(false);
      const r = data as { bill_no: string; stamp_regular: boolean; stamp_premium?: boolean; unlocked: { card: string; amount: number }[] };
       setDone({ bill_no: r.bill_no, total: Number(request.sale["total"]), paid: Number(request.sale["paid_amount"]), due: Number(request.sale["due_amount"]), mobile: String(request.sale["customer_mobile"] ?? ""), name: String(request.sale["customer_name"] ?? ""), stamp: r.stamp_regular || !!r.stamp_premium, unlocked: r.unlocked ?? [] });
      reset();
      refreshOperationalData(qc);
    } catch (e) {
      if (pendingSaleRef.current) setRetryPending(true);
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
    <div className={styles["workspace"]} data-mobile-pane={mobilePane}>
      <nav className={styles["mobileTabs"]} aria-label={copy.workspace}>
        <button aria-pressed={mobilePane === "products"} onClick={() => setMobilePane("products")}><PackagePlus aria-hidden="true" /><span>{copy.products}</span></button>
        <button aria-pressed={mobilePane === "cart"} onClick={() => setMobilePane("cart")}><ReceiptTextIcon /><span>{copy.cart}</span><b>{cart.reduce((a, i) => a + i.qty, 0)}</b></button>
      </nav>
      <section className={styles["productsPanel"]} aria-label={copy.products}>
        <header className={styles["productHeader"]}>
          <div><p className={styles["eyebrow"]} data-no-translate>{shop.name}</p><h1>POS Billing</h1><p>Scan, choose size and complete the bill</p></div>
          <span className={styles["status"]} role="status">{productsPending ? "Loading…" : productsError ? "Unavailable" : "Ready"}</span>
        </header>
        {selectedProduct && <div role="note" className="mx-4 mb-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Record shop sale</p>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={showAllProducts}>Show all products</Button>
          </div>
          <p className="mt-2 text-xs">Choose size, quantity and payment, then complete the bill.</p>
          <p className="mt-1 text-xs text-muted-foreground">Already billed in POS? Do not enter it again.</p>
        </div>}
        <div className={styles["searchBar"]}>
          <div className={styles["searchInput"]}><Search aria-hidden="true" /><Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} aria-label="Search or scan products" placeholder="F2 · Scan barcode or search article" /></div>
          <Button variant="outline" size="icon" title="Scan with phone camera" aria-label="Scan with phone camera" onClick={() => setCameraOpen(true)}><ScanLine className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setQuickOpen(true)} aria-label="Quick add product"><PackagePlus className="h-4 w-4" /><span className={styles["quickAddText"]}>Quick add</span></Button>
        </div>
        <div className={styles["categories"]} role="group" aria-label="Category">
          {cats.map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className={styles["brands"]} role="group" aria-label="Brand">
          {brands.map((b) => <button key={b} aria-pressed={brand === b} onClick={() => setBrand(b)} data-no-translate>{b}</button>)}
        </div>
        {held.length > 0 && <div className={styles["heldBills"]}>
          {held.map((h) => <button key={h.id} onClick={() => resume(h)}><Play aria-hidden="true" /><span>{h.label} · {h.cart.reduce((a, i) => a + i.qty, 0)} pairs</span></button>)}
        </div>}
        <div className={styles["productGrid"]}>
          {list.slice(0, visibleCount).map((p) => <article key={p.id} className={styles["productCard"]}>
            <div className={styles["productPhoto"]}>{p.image_src ? <img src={p.image_src} alt={`${p.brand} ${p.article}`} loading="lazy" /> : <div className={styles["photoFallback"]}><PackagePlus aria-hidden="true" /><span data-no-translate>{p.brand}</span></div>}</div>
            <div className={styles["productInfo"]}><p className={styles["productBrand"]} data-no-translate>{p.brand}</p><h2 data-no-translate>{p.article}</h2><strong>{inr(p.selling_price)}</strong></div>
            <div className={styles["quickSizes"]} role="group" aria-label={`${p.brand} ${p.article} sizes`}>
              {[...p.product_variants].sort((a, b) => sizeSort(a.size, b.size)).map((v) => <button key={v.id} onClick={() => addVariant(p, v)} aria-label={`${p.brand} ${p.article}, size ${v.size}, ${v.stock} in stock`} data-available={v.stock > 0}>
                <b>{v.size}</b><span>{v.stock} <span>left</span></span>
              </button>)}
            </div>
          </article>)}
          {list.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount(n => n + 60)}>Show more products</Button>}
          {!list.length && <div className={styles["emptyProducts"]}><Search aria-hidden="true" /><p>{productsPending ? "Loading products…" : productsError ? "Unable to load products." : "No products found."}</p>{productsError && <button onClick={() => qc.refetchQueries({ queryKey: ["stock-all"] })}>Try again</button>}</div>}
        </div>
        <div className={styles["shortcuts"]}><span>F2 · Search</span><span>F4 · Customer</span><span>F8 · Complete Sale</span></div>
      </section>

      <aside className={styles["cartPanel"]} aria-label={copy.cart}>
        <div className={styles["customerSection"]}>
          <div className={styles["cartHeading"]}><h2>{copy.cart} <span>({cart.reduce((a, i) => a + i.qty, 0)})</span></h2>{cart.length > 0 && <button onClick={reset} className={styles["clearCart"]}><Trash2 aria-hidden="true" /><span>Clear</span></button>}</div>
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
                  <Input ref={mobileRef} value={mobile} inputMode="numeric" maxLength={10} placeholder="F4 · Customer mobile" onChange={(e) => { customerLookupRequest.current++; setMobile(e.target.value); setLookupDone(false); if (e.target.value.replace(/\D/g, "").length === 10) lookup(e.target.value); }} className="h-11" />
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
        <div className={styles["cartItems"]}>
          {cart.map((i) => <m.div key={i.variant_id} className={styles["cartItem"]} initial={reduceMotion ? false : { opacity: 0.6, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}>
            <div className={styles["cartItemText"]}><p data-no-translate>{i.brand} {i.product_name}</p><span>Size <b>{i.size}</b> · {inr(i.price)}</span></div>
            <div className={styles["quantity"]}>
              <button aria-label={`Decrease ${i.product_name} size ${i.size}`} onClick={() => setCart((c) => c.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus aria-hidden="true" /></button>
              <span>{i.qty}</span>
              <button aria-label={`Increase ${i.product_name} size ${i.size}`} onClick={() => setCart((c) => c.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x)))}><Plus aria-hidden="true" /></button>
            </div>
            <strong className={styles["itemAmount"]}>{inr(i.price * i.qty)}</strong>
            <button className={styles["removeItem"]} aria-label={`Remove ${i.product_name} size ${i.size}`} onClick={() => setCart((c) => c.filter((x) => x.variant_id !== i.variant_id))}><Trash2 aria-hidden="true" /></button>
          </m.div>)}
          {!cart.length && <div className={styles["emptyCart"]}><ReceiptTextIcon /><p>Scan or tap a size to add.</p></div>}
        </div>
        {cartChanged && !retryPending && <div role="alert" className="m-3 rounded-lg border p-3 text-sm">Stock or prices changed. <Button size="sm" variant="outline" onClick={updateCart}>Refresh cart prices</Button></div>}
        <section className={styles["checkout"]} aria-label={copy.payment}>
            {reward && (
              <div className={`flex items-center justify-between rounded-lg p-2.5 text-sm ${rewardOn ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground line-through"}`}>
                <span className="flex items-center gap-1.5"><Gift className="h-4 w-4" /> {reward.card === "premium" ? "Premium" : "Regular"} reward −{inr(reward.amount)}</span>
                <button className="text-xs font-semibold underline" onClick={() => setRewardOn(!rewardOn)}>{rewardOn ? "Remove" : "Apply"}</button>
              </div>
            )}

          <details className={styles["billOptions"]}>
            <summary>{copy.options}<span>{copy.optionHint}</span></summary>
            <div className={styles["optionFields"]}>
            {coupon ? (
              <CouponTicket code={coupon.code} amount={coupon.amount} title={coupon.title} pending={couponBusy}
                onRemove={() => { couponRequestRef.current++; setCouponBusy(false); setCoupon(null); setCouponInput(""); }} />
            ) : (
              <div className="flex gap-1.5">
                <Input value={couponInput} onChange={(e) => { couponRequestRef.current++; setCouponBusy(false); setCouponInput(e.target.value.toUpperCase()); }} onKeyDown={(e) => { if (e.key === "Enter") void checkCoupon(couponInput); }} placeholder="Coupon code" className="h-9 text-sm uppercase" aria-label="Coupon code" />
                <Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled={couponBusy || !couponInput.trim() || !cart.length} onClick={() => checkCoupon(couponInput)}><Ticket className="h-3.5 w-3.5" /> {couponBusy ? "Checking…" : "Apply"}</Button>
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
             <div className="grid grid-cols-3 gap-1.5 text-xs font-medium text-muted-foreground">
              <label>Bill type
                 <select value={billType} onChange={(e) => setBillType(e.target.value as "gst" | "simple")} className="mt-0.5 h-9 w-full rounded-md border bg-background px-1 text-xs text-foreground">
                  <option value="gst">GST Invoice</option><option value="simple">Cash Memo</option>
                </select>
              </label>
              <label>Tax mode
                 <select value={taxMode} disabled={billType !== "gst"} onChange={(e) => setTaxMode(e.target.value as "inclusive" | "exclusive")} className="mt-0.5 h-9 w-full rounded-md border bg-background px-1 text-xs text-foreground">
                  <option value="exclusive">Exclusive (Add)</option><option value="inclusive">Inclusive (Extract)</option>
                </select>
              </label>
              <label>Print style
                 <select value={design} onChange={(e) => setDesign(e.target.value as PrintDesign)} className="mt-0.5 h-9 w-full rounded-md border bg-background px-1 text-xs text-foreground">
                  <option>Thermal</option><option>A4</option><option>Premium</option>
                </select>
              </label>
            </div>
             <div className="grid grid-cols-2 gap-1.5 text-xs font-medium text-muted-foreground">
               <label>Bill discount ₹<Input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-0.5 h-9 text-sm" /></label>
              <label>GST %
                 <select value={billType === "gst" ? rate : 0} disabled={billType !== "gst"} onChange={(e) => setRate(Number(e.target.value))} className="mt-0.5 h-9 w-full rounded-md border bg-background px-1 text-xs text-foreground">
                  {billType !== "gst" && <option value={0}>No GST</option>}
                  {[5, 12, 18].map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </label>
            </div>

            </div>
          </details>
          <div className={styles["breakdown"]}>
              <Row k="Subtotal" v={inr(bill.subtotal)} />
              <Row k={couponAmt || rewardAmt ? "Discount (all)" : "Bill discount"} v={`−${inr(bill.discount)}`} />
              {bill.rate > 0 && <Row k="Taxable" v={inr(bill.taxable)} />}
              {bill.rate > 0 && <Row k={`GST ${bill.rate}% ${taxMode === "inclusive" ? "(incl.)" : "(added)"}`} v={inr(bill.gst)} />}
              <Row k={due > 0 ? "Due" : "Change"} v={inr(due > 0 ? due : change)} />

          </div>
          <div className={styles["paymentMethods"]} role="group" aria-label={copy.payment}>
            {(["Cash", "UPI", "Card", "Split", "Credit"] as const).map((m) => <button key={m} type="button" aria-pressed={pay === m} onClick={() => setPay(m)}>{m === "Cash" ? <Banknote aria-hidden="true" /> : m === "UPI" ? <Smartphone aria-hidden="true" /> : m === "Card" ? <CreditCard aria-hidden="true" /> : null}<span>{m}</span></button>)}
          </div>
          {pay === "Split" && <Input value={splitCash} onChange={(e) => setSplitCash(e.target.value)} inputMode="decimal" aria-label="Split cash amount" placeholder={`Cash part · rest ${inr(bill.total - (Number(splitCash) || 0))}`} className={styles["received"]} />}
          <Input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" min="0" aria-label="Amount received" placeholder={pay === "Credit" ? "Credit = unpaid · choose Cash/UPI for partial payment" : "Amount received · blank = exact"} className={styles["received"]} />
          <div className={styles["quickAmounts"]}>
            {[["Exact", 0], ["+100", 100], ["+500", 500], ["+1000", 1000]].map(([l, v]) => <button key={l} type="button" onClick={() => setReceived(String(v === 0 ? bill.total : (Number(received) || 0) + Number(v)))}>{l}</button>)}
          </div>
        </section>
        <footer className={styles["paymentFooter"]}>
          <div className={styles["grandTotal"]}><span>Total</span><m.strong key={bill.total} initial={{ opacity: .6 }} animate={{ opacity: 1 }} transition={{ duration: .14 }}>{inr(bill.total)}</m.strong></div>
          <div className={styles["saleActions"]}>
            <Button variant="outline" onClick={hold} disabled={!cart.length}><Pause className="h-4 w-4" /> Hold</Button>
            <Button onClick={complete} disabled={!cart.length || busy}>{busy ? "Saving…" : `F8 · Complete Sale ${inr(bill.total)}`}</Button>
          </div>
        </footer>
      </aside>
      <button className={styles["mobileCartBar"]} onClick={() => setMobilePane("cart")}><span>{copy.cart} · {cart.reduce((a, i) => a + i.qty, 0)} pairs</span><strong>{inr(bill.total)} →</strong></button>

      <Dialog open={!!done} onOpenChange={(o) => !o && setDone(null)}>
        <DialogContent className={`${styles["savedBill"]} sm:max-w-sm`}>
          <DialogHeader><DialogTitle>Bill saved</DialogTitle></DialogHeader>
          {done && (
            <div className="space-y-3 text-center">
              <SuccessMark />
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
      <Dialog open={retryPending}><DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}><DialogHeader><DialogTitle>Confirm the last bill</DialogTitle></DialogHeader><p>The connection interrupted billing. Retry the same request to retrieve its bill safely. Do not start a second bill for this purchase.</p><Button disabled={busy} onClick={() => void complete()}>Retry / recover bill</Button></DialogContent></Dialog>
      <QuickAddProduct open={quickOpen} initialArticle={q && !/^[A-Z0-9]{8,}$/i.test(q) ? q : ""} onClose={() => setQuickOpen(false)} onAdded={(r) => { const first = r.variants.find((v) => (r.qty[v.size] ?? 0) > 0); toast.message(first ? "Ab size tap karke bill mein daalo" : "Stock 0 hai — pehle pairs add karo"); }} />
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}><DialogContent><DialogHeader><DialogTitle>Scan box label</DialogTitle></DialogHeader>{cameraOpen && <CameraScanner onScan={(code)=>{const accepted=scanCode(code);if(accepted)setCameraOpen(false);return accepted;}} />}</DialogContent></Dialog>
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

const POS_COPY = {
  english: { products: "Products", cart: "Cart", payment: "Payment", options: "Bill options", optionHint: "Coupon, tax & print", workspace: "POS workspace" },
  hindi: { products: "प्रोडक्ट", cart: "कार्ट", payment: "भुगतान", options: "बिल विकल्प", optionHint: "कूपन, टैक्स और प्रिंट", workspace: "बिलिंग स्क्रीन" },
  hinglish: { products: "Products", cart: "Cart", payment: "Payment", options: "Bill ke options", optionHint: "Coupon, tax aur print", workspace: "POS workspace" },
};
