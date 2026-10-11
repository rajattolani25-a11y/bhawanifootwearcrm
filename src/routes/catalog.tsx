import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Globe, MapPin, MessageCircle, Package, Phone, Search, ShieldCheck, Sparkles, Copy, Store, Truck, X } from "lucide-react";
import { checkCoupon, createBooking, getCatalog, type CatalogOffer, trackOrder, type BookingResult, type CatalogProduct, type CatalogShop, type Fulfillment, type TrackResult } from "@/lib/catalog.functions";
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
    <label className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs" data-no-translate>
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
  const [views, setViews] = useState(0);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("track"); if (t) setTrack(t); }, []);
  const [ptype, setPtype] = useState("All");
  const [fsize, setFsize] = useState("All");
  const products = useMemo(() => (data.products ?? []).map((p) => ({ ...p, ptype: detectType(p.article), sizes: [...p.sizes].sort((a, b) => (parseFloat(a.size) || 99) - (parseFloat(b.size) || 99) || a.size.localeCompare(b.size)) })), [data.products]);
  const brands = useMemo(() => ["All", ...new Set(products.map((p) => p.brand))], [products]);
  const types = useMemo(() => ["All", ...TYPE_RULES.map(([t]) => t).filter((t) => products.some((p) => p.ptype === t))], [products]);
  const sizeList = useMemo(() => ["All", ...[...new Set(products.filter((p) => filter === "All" || p.category === filter).flatMap((p) => p.sizes.filter((s) => s.available).map((s) => s.size)))].sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99) || a.localeCompare(b))], [products, filter]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return products.filter((p) => (filter === "All" || p.category === filter) && (brand === "All" || p.brand === brand) &&
      (ptype === "All" || p.ptype === ptype) && (fsize === "All" || p.sizes.some((x) => x.size === fsize && x.available)) &&
      (!s || [p.brand, p.article, p.color, p.category].some((f) => f?.toLowerCase().includes(s))));
  }, [products, q, filter, brand, ptype, fsize]);

  if (!data.enabled || !data.shop) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>;
  const shop = data.shop;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card text-card-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground" data-no-translate>{shop.name.slice(0, 1)}</span>
            <span className="truncate font-display font-bold" data-no-translate>{shop.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setTrack("")} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium"><Package className="h-3.5 w-3.5" /><span>Track order</span></button>
            <LangChip />
            {shop.phone && <a href={`tel:${shop.phone}`} className="rounded-full border border-border p-1.5" aria-label="Call store"><Phone className="h-3.5 w-3.5" /></a>}
          </div>
        </div>
      </div>
      {data.offer && <button type="button" onClick={() => { if (data.offer?.code) { void navigator.clipboard?.writeText(data.offer.code); } }} className="block w-full bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-medium uppercase tracking-[0.18em]">
          <span className="truncate"><span>{data.offer.title}</span>{offerText(data.offer) && <> · {offerText(data.offer)}</>}{data.offer.code && <> · <span>Code</span> <b className="font-mono" data-no-translate>{data.offer.code}</b></>}</span>
        </div>
      </button>}
      <section className="border-b bg-card text-card-foreground">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
          <h1 className="font-sans text-2xl font-bold tracking-tight sm:text-3xl">Shop the collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live sizes and prices from our store.</p>
          {shop.address && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" /><span data-no-translate>{shop.address}</span></p>}
        </div>
      </section>

      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, article or colour" className="h-10 rounded-full pl-9" />
          </div>
          <div className="mt-3 flex gap-5 overflow-x-auto text-sm">
            {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`shrink-0 border-b-2 pb-1.5 font-semibold transition ${filter === f ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>{f}</button>)}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {types.length > 2 && <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {types.map((t) => <button key={t} onClick={() => setPtype(t)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${ptype === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>)}
        </div>}
        {brands.length > 2 && <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {brands.map((b) => <button key={b} onClick={() => setBrand(b)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${brand === b ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}><span data-no-translate={b !== "All" ? "" : undefined}>{b}</span></button>)}
        </div>}
        {sizeList.length > 2 && <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Size</span>
          {sizeList.map((z) => <button key={z} onClick={() => setFsize(z)} className={`h-8 min-w-8 shrink-0 rounded-md border px-2 text-xs font-semibold ${fsize === z ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}>{z}</button>)}
        </div>}
        <p className="mb-3 text-xs text-muted-foreground">{list.length} <span>designs</span></p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
            return (
              <button key={p.id} onClick={() => { setOpen(p); setViews((v) => v + 1); }} className="group text-left">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                  {p.image ? <img src={p.image} alt={`${p.brand} ${p.article}`} loading="lazy" className="h-full w-full object-contain p-3 transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-5xl font-bold text-muted-foreground/30">{p.brand.slice(0, 1)}</div>}
                  {p.few_left && <span className="absolute left-2 top-2 rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-destructive">Few sizes left</span>}
                </div>
                <div className="pt-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground" data-no-translate>{p.brand}</p>
                  <p className="truncate text-sm font-semibold" data-no-translate>{p.article}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-1.5"><span className="font-sans text-base font-bold">{inr(p.price)}</span>{off > 0 && <><span className="text-xs text-muted-foreground line-through">{inr(p.mrp)}</span><span className="text-xs font-semibold text-success">{off}% <span>OFF</span></span></>}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground"><span>Sizes</span>: <span data-no-translate>{p.sizes.filter((s) => s.available).map((s) => s.size).join(", ")}</span></p>
                </div>
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div className="py-16 text-center"><p className="font-semibold">No designs found.</p><p className="text-sm text-muted-foreground">Try another search or category.</p></div>}
        <p className="py-6 text-center text-xs text-muted-foreground" data-no-translate>© {shop.name}</p>
      </main>
      <ProductDialog key={open?.id ?? "none"} product={open} all={products} onPick={setOpen} shop={shop} offerCode={data.offer?.code ?? ""} onClose={() => setOpen(null)} onTrack={(no) => { setOpen(null); setTrack(no); }} />
      {track !== null && <TrackDialog initial={track} onClose={() => setTrack(null)} />}
    </div>
  );
}

const STEPS_PICKUP = ["pending", "confirmed", "packed", "picked"];
const STEPS_DELIVERY = ["pending", "confirmed", "packed", "shipped", "delivered"];
const STATUS_LABEL: Record<string, string> = { pending: "Order placed", confirmed: "Payment confirmed", packed: "Packed", shipped: "Out for delivery", delivered: "Delivered", picked: "Picked up", cancelled: "Cancelled", expired: "Cancelled (not paid)", refunded: "Cancelled - refund initiated" };
const TYPE_LABEL: Record<string, string> = { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" };

function offerText(o: NonNullable<CatalogOffer>) {
  if (!o.value) return "";
  const v = o.kind === "percent" ? `${o.value}% OFF` : `${inr(o.value)} OFF`;
  return o.min_bill ? `${v} above ${inr(o.min_bill)}` : v;
}

function OfferCard({ offer, views }: { offer: NonNullable<CatalogOffer>; views: number }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("offer-seen")) return;
    const t = setTimeout(() => setShow(true), 20000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (views >= 2 && !sessionStorage.getItem("offer-seen")) setShow(true); }, [views]);
  if (!show) return null;
  const close = () => { sessionStorage.setItem("offer-seen", "1"); setShow(false); };
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md animate-in slide-in-from-bottom-6 fade-in duration-500">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-4 pr-10 shadow-2xl">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl" />
        <button onClick={close} aria-label="Close" className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary"><span>{offer.title}</span></p>
        <p className="mt-1 font-display text-lg font-bold leading-tight">{offerText(offer) || offer.subtitle}</p>
        {offer.subtitle && offerText(offer) && <p className="text-xs text-muted-foreground">{offer.subtitle}</p>}
        <button onClick={() => { void navigator.clipboard?.writeText(offer.code ?? ""); setCopied(true); setTimeout(close, 1500); }} className="mt-3 flex w-full items-center justify-between rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-2">
          <span className="font-mono text-base font-bold tracking-[0.2em]" data-no-translate>{offer.code}</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">{copied ? <><Check className="h-3.5 w-3.5" /> <span>Copied</span></> : <><Copy className="h-3.5 w-3.5" /> <span>Tap to copy</span></>}</span>
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">Use this code when you place your order.</p>
      </div>
    </div>
  );
}

const TYPE_WORDS = ["sneaker", "running", "sports", "loafer", "sandal", "slipper", "flip", "slide", "boot", "formal", "belly", "ballerina", "clog", "crocs", "heel", "wedge", "juti", "mojari", "kolhapuri", "school", "canvas", "floater"];
function similarTo(p: CatalogProduct, all: CatalogProduct[]) {
  const words = TYPE_WORDS.filter((w) => p.article.toLowerCase().includes(w));
  return all
    .filter((x) => x.id !== p.id && x.category === p.category && (!p.gender || !x.gender || x.gender === p.gender) && x.sizes.some((s) => s.available) && x.price >= p.price * 0.7 && x.price <= p.price * 1.3)
    .map((x) => ({ x, score: (words.some((w) => x.article.toLowerCase().includes(w)) ? 50 : 0) + (x.brand === p.brand ? 30 : 0) + (p.color && x.color === p.color ? 10 : 0) - Math.abs(x.price - p.price) / Math.max(p.price, 1) * 10 }))
    .sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.x);
}

function ProductDialog({ product, all, onPick, shop, onClose, onTrack, offerCode }: { product: CatalogProduct | null; all: CatalogProduct[]; onPick: (p: CatalogProduct) => void; shop: CatalogShop; offerCode: string; onClose: () => void; onTrack: (no: string) => void }) {
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
  const [code, setCode] = useState(offerCode);
  const [disc, setDisc] = useState<{ code: string; amount: number } | null>(null);
  const [cErr, setCErr] = useState("");
  if (!product) return null;
  const chosen = product.sizes.find((s) => s.id === size);
  const label = `${product.brand} ${product.article}`;
  const wa = waTo(shop.phone, enquiryText(lang, shop.name, label, chosen?.size ?? ""));
  const canOrder = shop.booking || shop.local || shop.outside;
  const charge = (f: Fulfillment) => (f === "pickup" ? 0 : f === "local" ? (shop.free_delivery_above != null && product.price >= shop.free_delivery_above ? 0 : shop.local_charge) : shop.outside_charge);
  const net = product.price - (disc?.amount ?? 0);
  const payNow = method === "pickup" ? Math.ceil(net * shop.advance_percent / 100) : net + (method === "local" && shop.free_delivery_above != null && net >= shop.free_delivery_above ? 0 : charge(method));
  async function applyCoupon() {
    if (!chosen || !code.trim()) return;
    setCErr(""); setDisc(null);
    try { setDisc(await checkCoupon({ data: { variantId: chosen.id, code: code.trim(), mobile: mobile.replace(/[\s-]/g, "") } })); }
    catch (e) { setCErr((e as Error).message.replace(/^.*?:\s*/, "")); }
  }
  const delivery = method !== "pickup";
  const valid = name.trim().length >= 2 && /^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, "")) && (!delivery || address.trim().length >= 10);

  async function order() {
    if (!chosen) return;
    setBusy(true); setErr("");
    try { setRes(await createBooking({ data: { variantId: chosen.id, name, mobile: mobile.replace(/[\s-]/g, ""), fulfillment: method, address: delivery ? address : "", area: delivery ? area : "", coupon: disc?.code ?? "" } })); setStep("done"); }
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
        {step === "view" && <div className="flex flex-col gap-4">
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">{product.image ? <img src={product.image} alt={label} className="h-full w-full object-contain p-3" /> : null}</div>
          <div className="flex items-baseline justify-between"><p className="text-sm text-muted-foreground"><span>{product.category}</span>{product.color && <> · <span data-no-translate>{product.color}</span></>}</p><p><span className="font-display text-2xl font-bold">{inr(product.price)}</span>{product.mrp > product.price && <span className="ml-2 text-sm text-muted-foreground line-through">{inr(product.mrp)}</span>}</p></div>
          <div>
            <p className="mb-2 text-sm font-semibold">Choose size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => <button key={s.id} disabled={!s.available} onClick={() => setSize(s.id)} className={`min-w-12 rounded-md border px-3 py-2 text-sm font-semibold ${!s.available ? "cursor-not-allowed text-muted-foreground/40 line-through" : size === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s.size}</button>)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {wa && <Button asChild variant={canOrder ? "outline" : "default"} className="h-12 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Ask on WhatsApp & visit store</a></Button>}
            {canOrder && <Button disabled={!chosen} onClick={() => setStep("method")} className="h-12 w-full">{chosen ? "Get this pair" : "Select a size to continue"}</Button>}
          </div>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p><b className="block">Exchange policy</b><span className="text-muted-foreground">No cash refund or return. Only size exchange within 7 days, with bill and unworn pair.</span></p></div>
          {(() => { const sim = similarTo(product, all); return sim.length > 0 && <div>
            <p className="mb-2 text-sm font-semibold">Similar pairs you might like</p>
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {sim.map((s) => <button key={s.id} onClick={() => onPick(s)} className="w-28 shrink-0 snap-start text-left">
                <div className="aspect-square overflow-hidden rounded-lg border bg-muted">{s.image && <img src={s.image} alt={`${s.brand} ${s.article}`} loading="lazy" className="h-full w-full object-contain p-1.5" />}</div>
                <p className="mt-1 truncate text-xs font-medium" data-no-translate>{s.brand} {s.article}</p>
                <p className="text-xs font-bold">{inr(s.price)}</p>
              </button>)}
            </div>
          </div>; })()}
        </div>}
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
            {disc && <div className="flex justify-between text-primary"><span><span>Coupon</span> <span data-no-translate>{disc.code}</span></span><span>− {inr(disc.amount)}</span></div>}
            {delivery && <div className="flex justify-between"><span>Delivery charge</span><span>{charge(method) ? inr(charge(method)) : <span>Free</span>}</span></div>}
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>{method === "pickup" ? "Advance to pay now" : "Total to pay"}</span><span>{inr(payNow)}</span></div>
            {method === "pickup" && <p className="text-xs text-muted-foreground"><span>Balance at store:</span> {inr(net - payNow)} · <span>Pair kept aside for</span> {shop.hold_hours} <span>hours</span></p>}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} className="h-11" />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" inputMode="numeric" maxLength={14} className="h-11" />
          {delivery && <>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address (house, street, landmark)" maxLength={300} rows={3} />
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="City / Pincode" maxLength={80} className="h-11" />
          </>}
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setDisc(null); }} placeholder="Coupon code (optional)" maxLength={30} className="h-11 font-mono uppercase" />
            <Button type="button" variant="outline" className="h-11" disabled={!code.trim() || !/^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, ""))} onClick={applyCoupon}>Apply</Button>
          </div>
          {disc && <p className="flex items-center gap-1 text-xs font-semibold text-primary"><Check className="h-3.5 w-3.5" /> <span>You save</span> {inr(disc.amount)}</p>}
          {cErr && <p className="text-xs text-destructive">{cErr}</p>}
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

/** Strict auto type from article name. First matching rule wins; no keyword = only in "All" (never a wrong section). */
const TYPE_RULES: [string, RegExp][] = [
  ["School", /\bschool\b|\buniform\b/i],
  ["Formal", /\bformal\b|\boxford\b|\bderby\b|\bloafer|\bmocc?asin|\bbrogue|\bmojari|\bjutti|\bbellies\b|\bbelly\b|\bpump/i],
  ["Sports", /\bsports?\b|\brunn(ing|er)\b|\btrain(er|ing)\b|\bgym\b|\bjogg|\btrek|\bwalking\b|\bcourt\b|\btennis\b|\bfootball\b|\bstuds?\b/i],
  ["Sneakers", /\bsneak|\bcasual shoe|\bcanvas\b/i],
  ["Sandals", /\bsandal|\bfloater|\bkolhapuri|\bwedge|\bheel/i],
  ["Slippers", /\bslipper|\bchappal|\bflip ?flop|\bslides?\b|\bclog|\bcrocs?\b|\bhawai/i],
];
function detectType(article: string) {
  return TYPE_RULES.find(([, rx]) => rx.test(article))?.[0] ?? "Other";
}
