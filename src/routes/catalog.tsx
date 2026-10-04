import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Globe, MapPin, MessageCircle, Package, Phone, Search, ShieldCheck, Store, Truck, X } from "lucide-react";
import { createBooking, getCatalog, trackOrder, type BookingResult, type CatalogProduct, type CatalogShop, type Fulfillment, type TrackResult } from "@/lib/catalog.functions";
import { LanguageProvider, useLang, type AppLanguage } from "@/lib/i18n";
import { enquiryText, proofText } from "@/lib/order-messages";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/catalog")({
  loader: () => getCatalog(),
  head: ({ loaderData }) => {
    const name = loaderData?.shop?.name || "Footwear Store";
    const title = `${name} — Footwear Catalog`;
    const desc = `See new footwear designs, prices and available sizes at ${name}. Visit the store, order for delivery or ask on WhatsApp.`;
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  errorComponent: () => <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: () => <LanguageProvider><Catalog /></LanguageProvider>,
});

const FILTERS = ["All", "Gents", "Ladies", "Boys", "Girls"] as const;
const waNum = (p?: string | null) => { const m = (p ?? "").replace(/\D/g, ""); return m.length === 10 ? `91${m}` : m; };
const waTo = (phone: string | null, text: string) => (phone ? `https://wa.me/${waNum(phone)}?text=${encodeURIComponent(text)}` : null);

function LangChip() {
  const { lang, setLang } = useLang();
  return (
    <label className="flex items-center gap-1 rounded-full border border-sidebar-border px-2.5 py-1 text-xs" data-no-translate>
      <Globe className="h-3.5 w-3.5" />
      <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as AppLanguage)} className="bg-transparent text-xs font-medium outline-none [&>option]:text-foreground">
        <option value="english">EN</option><option value="hindi">हिंदी</option><option value="hinglish">Hinglish</option>
      </select>
    </label>
  );
}

function Catalog() {
  const data = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [brand, setBrand] = useState("All");
  const [open, setOpen] = useState<CatalogProduct | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("track"); if (t) setTrack(t); }, []);
  const products = useMemo(() => (data.products ?? []).map((p) => ({ ...p, sizes: [...p.sizes].sort((a, b) => (parseFloat(a.size) || 99) - (parseFloat(b.size) || 99) || a.size.localeCompare(b.size)) })), [data.products]);
  const brands = useMemo(() => ["All", ...new Set(products.map((p) => p.brand))], [products]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return products.filter((p) => (filter === "All" || p.category === filter) && (brand === "All" || p.brand === brand) &&
      (!s || [p.brand, p.article, p.color, p.category].some((f) => f?.toLowerCase().includes(s))));
  }, [products, q, filter, brand]);

  if (!data.enabled || !data.shop) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>;
  const shop = data.shop;
  const delivers = shop.local || shop.outside;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground" data-no-translate>{shop.name.slice(0, 1)}</span>
            <span className="truncate font-display font-bold" data-no-translate>{shop.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setTrack("")} className="flex items-center gap-1 rounded-full border border-sidebar-border px-2.5 py-1 text-xs font-medium"><Package className="h-3.5 w-3.5" /><span>Track order</span></button>
            <LangChip />
            {shop.phone && <a href={`tel:${shop.phone}`} className="rounded-full border border-sidebar-border p-1.5" aria-label="Call store"><Phone className="h-3.5 w-3.5" /></a>}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-7 pt-4 sm:pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Footwear Catalog</p>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight sm:text-5xl">New arrivals, live sizes.</h1>
          <p className="mt-2 max-w-xl text-sm opacity-80">See what's in stock, pick your size, and visit the store to try it on.</p>
          {shop.address && <p className="mt-3 flex items-center gap-1.5 text-sm opacity-80"><MapPin className="h-4 w-4 shrink-0" /><span data-no-translate>{shop.address}</span></p>}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full bg-sidebar-accent px-3 py-1"><Store className="h-3.5 w-3.5" /><span>Try in store</span></span>
            {delivers && <span className="flex items-center gap-1 rounded-full bg-sidebar-accent px-3 py-1"><Truck className="h-3.5 w-3.5" /><span>Home delivery</span></span>}
            <span className="flex items-center gap-1 rounded-full bg-sidebar-accent px-3 py-1"><ShieldCheck className="h-3.5 w-3.5" /><span>Direct UPI, no extra fee</span></span>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, article or colour" className="h-10 pl-9" />
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full border px-4 py-1 text-sm font-medium ${filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{f}</button>)}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {brands.length > 2 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {brands.map((b) => <button key={b} onClick={() => setBrand(b)} className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold uppercase ${brand === b ? "border-primary text-primary" : "text-muted-foreground"}`}><span data-no-translate={b !== "All" ? "" : undefined}>{b}</span></button>)}
        </div>}
        <p className="mb-3 text-xs text-muted-foreground">{list.length} <span>designs</span></p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
            return (
              <button key={p.id} onClick={() => setOpen(p)} className="group relative overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative aspect-square bg-muted">
                  {p.image ? <img src={p.image} alt={`${p.brand} ${p.article}`} loading="lazy" className="h-full w-full object-contain p-2 transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center font-display text-5xl text-muted-foreground/30">{p.brand.slice(0, 1)}</div>}
                  {off > 0 && <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{off}% <span>OFF</span></span>}
                  {p.few_left && <span className="absolute right-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Few sizes left</span>}
                </div>
                <div className="p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary" data-no-translate>{p.brand}</p>
                  <p className="truncate font-semibold" data-no-translate>{p.article}</p>
                  <p className="mt-1 flex items-baseline gap-1.5"><span className="font-display text-lg font-bold">{inr(p.price)}</span>{p.mrp > p.price && <span className="text-xs text-muted-foreground line-through">{inr(p.mrp)}</span>}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{p.sizes.filter((s) => s.available).slice(0, 6).map((s) => <span key={s.id} className="rounded border px-1.5 text-[11px]">{s.size}</span>)}</div>
                </div>
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div className="py-16 text-center"><p className="font-semibold">No designs found.</p><p className="text-sm text-muted-foreground">Try another search or category.</p></div>}

        <div className="mt-10 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
          <div className="flex gap-3"><Store className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Try in store</p><p className="text-sm text-muted-foreground">Visit us and try the pair before you buy.</p></div></div>
          <div className="flex gap-3"><MessageCircle className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Ask on WhatsApp</p><p className="text-sm text-muted-foreground">We confirm your size before you come.</p></div></div>
          <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Live stock</p><p className="text-sm text-muted-foreground">Only sizes in stock are shown.</p></div></div>
        </div>
        <p className="py-6 text-center text-xs text-muted-foreground" data-no-translate>© {shop.name}</p>
      </main>
      <ProductDialog key={open?.id ?? "none"} product={open} shop={shop} onClose={() => setOpen(null)} onTrack={(no) => { setOpen(null); setTrack(no); }} />
      {track !== null && <TrackDialog initial={track} onClose={() => setTrack(null)} />}
    </div>
  );
}

const STEPS_PICKUP = ["pending", "confirmed", "packed", "picked"];
const STEPS_DELIVERY = ["pending", "confirmed", "packed", "shipped", "delivered"];
const STATUS_LABEL: Record<string, string> = { pending: "Order placed", confirmed: "Payment confirmed", packed: "Packed", shipped: "Out for delivery", delivered: "Delivered", picked: "Picked up", cancelled: "Cancelled", expired: "Cancelled (not paid)", refunded: "Cancelled - refund initiated" };
const TYPE_LABEL: Record<string, string> = { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" };

function ProductDialog({ product, shop, onClose, onTrack }: { product: CatalogProduct | null; shop: CatalogShop; onClose: () => void; onTrack: (no: string) => void }) {
  const { lang } = useLang();
  const [size, setSize] = useState<string | null>(null);
  const [step, setStep] = useState<"view" | "method" | "form" | "done">("view");
  const [method, setMethod] = useState<Fulfillment>("pickup");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<BookingResult | null>(null);
  if (!product) return null;
  const chosen = product.sizes.find((s) => s.id === size);
  const label = `${product.brand} ${product.article}`;
  const wa = waTo(shop.phone, enquiryText(lang, shop.name, label, chosen?.size ?? ""));
  const canOrder = shop.booking || shop.local || shop.outside;
  const charge = (f: Fulfillment) => (f === "pickup" ? 0 : f === "local" ? (shop.free_delivery_above != null && product.price >= shop.free_delivery_above ? 0 : shop.local_charge) : shop.outside_charge);
  const payNow = method === "pickup" ? Math.ceil(product.price * shop.advance_percent / 100) : product.price + charge(method);
  const delivery = method !== "pickup";
  const valid = name.trim().length >= 2 && /^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, "")) && (!delivery || address.trim().length >= 10);

  async function order() {
    if (!chosen) return;
    setBusy(true); setErr("");
    try { setRes(await createBooking({ data: { variantId: chosen.id, name, mobile: mobile.replace(/[\s-]/g, ""), fulfillment: method, address: delivery ? address : "", area: delivery ? area : "" } })); setStep("done"); }
    catch (e) { setErr((e as Error).message.replace(/^.*?:\s*/, "")); }
    finally { setBusy(false); }
  }
  const upi = res ? `upi://pay?pa=${encodeURIComponent(res.upi_id)}&pn=${encodeURIComponent(res.shop)}&am=${res.advance}&cu=INR&tn=${encodeURIComponent(res.booking_no)}` : "";
  const proof = res ? waTo(shop.phone, proofText(lang, { booking_no: res.booking_no, product: res.product, size: res.size, name, price: res.price, advance: res.advance, delivery_charge: res.delivery_charge, fulfillment: res.fulfillment, shop: res.shop, address: delivery ? `${address}${area ? `, ${area}` : ""}` : null })) : null;
  const Opt = ({ f, icon, title, sub, price }: { f: Fulfillment; icon: React.ReactNode; title: string; sub: string; price: string }) => (
    <button onClick={() => setMethod(f)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${method === f ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}>
      <span className="text-primary">{icon}</span>
      <span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
      <span className="text-sm font-bold">{price}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><span data-no-translate>{label}</span></DialogTitle></DialogHeader>
        {step === "view" && <>
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">{product.image ? <img src={product.image} alt={label} className="h-full w-full object-contain p-3" /> : null}</div>
          <div className="flex items-baseline justify-between"><p className="text-sm text-muted-foreground"><span>{product.category}</span>{product.color && <> · <span data-no-translate>{product.color}</span></>}</p><p><span className="font-display text-2xl font-bold">{inr(product.price)}</span>{product.mrp > product.price && <span className="ml-2 text-sm text-muted-foreground line-through">{inr(product.mrp)}</span>}</p></div>
          <div>
            <p className="mb-2 text-sm font-semibold">Choose size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => <button key={s.id} disabled={!s.available} onClick={() => setSize(s.id)} className={`min-w-12 rounded-md border px-3 py-2 text-sm font-semibold ${!s.available ? "cursor-not-allowed text-muted-foreground/40 line-through" : size === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s.size}</button>)}
            </div>
          </div>
          {wa && <Button asChild variant={canOrder ? "outline" : "default"} className="h-12 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Ask on WhatsApp & visit store</a></Button>}
          {canOrder && <Button disabled={!chosen} onClick={() => setStep("method")} className="h-12 w-full">{chosen ? "Get this pair" : "Select a size to continue"}</Button>}
        </>}
        {step === "method" && chosen && <div className="space-y-3">
          <p className="text-sm font-semibold">How do you want it?</p>
          {shop.booking && <Opt f="pickup" icon={<Store className="h-5 w-5" />} title="Pickup from store" sub="Pay a small advance now, rest at the store" price="Free" />}
          {shop.local && <Opt f="local" icon={<Truck className="h-5 w-5" />} title="Local delivery" sub={shop.delivery_note || "Within city"} price={charge("local") === 0 ? "Free" : inr(charge("local"))} />}
          {shop.outside && <Opt f="outside" icon={<Package className="h-5 w-5" />} title="Outside Jabalpur delivery" sub="Full payment, delivered to your address" price={inr(charge("outside"))} />}
          {shop.free_delivery_above != null && shop.local && <p className="text-xs text-muted-foreground"><span>Free local delivery above</span> {inr(shop.free_delivery_above)}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("view")} className="h-11 flex-1">Back</Button><Button onClick={() => setStep("form")} className="h-11 flex-1" disabled={(method === "pickup" && !shop.booking) || (method === "local" && !shop.local) || (method === "outside" && !shop.outside)}>Continue</Button></div>
        </div>}
        {step === "form" && chosen && <div className="space-y-3">
          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between"><span data-no-translate>{label}</span><span><span>Size</span> <b>{chosen.size}</b></span></div>
            <div className="flex justify-between"><span>Price</span><span>{inr(product.price)}</span></div>
            {delivery && <div className="flex justify-between"><span>Delivery charge</span><span>{charge(method) ? inr(charge(method)) : <span>Free</span>}</span></div>}
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>{method === "pickup" ? "Advance to pay now" : "Total to pay"}</span><span>{inr(payNow)}</span></div>
            {method === "pickup" && <p className="text-xs text-muted-foreground"><span>Balance at store:</span> {inr(product.price - payNow)} · <span>Pair kept aside for</span> {shop.hold_hours} <span>hours</span></p>}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} className="h-11" />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" inputMode="numeric" maxLength={14} className="h-11" />
          {delivery && <>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address (house, street, landmark)" maxLength={300} rows={3} />
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="City / Pincode" maxLength={80} className="h-11" />
          </>}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("method")} className="h-11 flex-1">Back</Button><Button disabled={busy || !valid} onClick={order} className="h-11 flex-1">{busy ? "Please wait…" : "Place order"}</Button></div>
        </div>}
        {step === "done" && res && <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span><p className="text-base font-semibold">Order placed — pair kept aside</p></div>
          <p><span>Order no.</span> <b data-no-translate>{res.booking_no}</b> · <span>{TYPE_LABEL[res.fulfillment]}</span></p>
          <div className="rounded-lg border p-3"><p>{res.fulfillment === "pickup" ? "Advance to pay now" : "Total to pay"}</p><p className="font-display text-2xl font-bold">{inr(res.advance)}</p>{res.fulfillment === "pickup" && <p className="text-xs text-muted-foreground"><span>Balance at store:</span> {inr(res.price - res.advance)}</p>}</div>
          <p className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /> Please pay within 30 minutes, otherwise the pair is released.</p>
          <Button asChild className="h-12 w-full"><a href={upi}>Pay with UPI</a></Button>
          <p className="text-center text-xs text-muted-foreground" data-no-translate>UPI: {res.upi_id}</p>
          {proof && <Button asChild variant="outline" className="h-11 w-full"><a href={proof} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Send payment screenshot</a></Button>}
          <p className="text-xs text-muted-foreground">After paying, send the screenshot on WhatsApp. The store confirms your order and you can track it anytime.</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => onTrack(res.booking_no)} className="flex-1"><Package className="h-4 w-4" /> Track order</Button><Button variant="ghost" onClick={onClose} className="flex-1"><X className="h-4 w-4" /> Close</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

function TrackDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [no, setNo] = useState(initial);
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [r, setR] = useState<TrackResult | undefined>(undefined);
  async function check() {
    setBusy(true); setErr("");
    try { const x = await trackOrder({ data: { bookingNo: no, mobile: mobile.replace(/[\s-]/g, "") } }); if (!x) setErr("No order found. Check the order no. and mobile number."); setR(x); }
    catch { setErr("No order found. Check the order no. and mobile number."); }
    finally { setBusy(false); }
  }
  const steps = r ? (r.fulfillment === "pickup" ? STEPS_PICKUP : STEPS_DELIVERY) : [];
  const closed = r && ["cancelled", "expired", "refunded"].includes(r.status);
  const idx = r ? steps.indexOf(r.status) : -1;
  const when = (s: string) => r?.history?.filter((h) => h.status === s).pop()?.at;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Track your order</DialogTitle></DialogHeader>
        <Input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="Order no. (e.g. BK-1004-AB12)" className="h-11" />
        <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" inputMode="numeric" maxLength={14} className="h-11" />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={busy || no.trim().length < 4 || mobile.replace(/\D/g, "").length < 10} onClick={check} className="h-11">{busy ? "Please wait…" : "Check status"}</Button>
        {r && <div className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="flex justify-between gap-2"><div><p className="font-semibold" data-no-translate>{r.product}</p><p className="text-muted-foreground"><span>Size</span> {r.size} · <span>{TYPE_LABEL[r.fulfillment]}</span></p></div><p className="font-display font-bold">{inr(r.advance)}</p></div>
          {closed ? <p className="rounded-md bg-destructive/10 p-2 font-semibold text-destructive">{STATUS_LABEL[r.status]}</p> :
            <ol className="space-y-3">
              {steps.map((s, i) => {
                const done = i <= idx; const at = when(s);
                return <li key={s} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{done && <Check className="h-3 w-3" />}</span>
                  <span><span className={`block ${done ? "font-semibold" : "text-muted-foreground"}`}>{s === "packed" && r.fulfillment === "pickup" ? "Ready for pickup" : STATUS_LABEL[s]}</span>{at && <span className="block text-xs text-muted-foreground">{new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}</span>
                </li>;
              })}
            </ol>}
          {r.status === "pending" && <p className="text-xs text-muted-foreground">Waiting for payment. Please pay within 30 minutes, otherwise the pair is released.</p>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
