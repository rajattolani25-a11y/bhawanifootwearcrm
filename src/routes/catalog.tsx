import { catalogPresentation } from "@/lib/catalog-presentation";
import { CouponTicket } from "@/components/CouponTicket";
import { CatalogSpotlight } from "@/components/CatalogSpotlight";
import { InterfaceMotion } from "@/components/motion/provider";
import { BlurReveal } from "@/components/motion/blur-reveal";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Camera, Check, Clock, Globe, HelpCircle, MapPin, MessageCircle, Moon, Package, Phone, Search, ShieldCheck, ShoppingBag, Sun, Copy, Store, Truck, X } from "lucide-react";
import styles from "./catalog.module.css";
import { PhotoSearch } from "@/components/PhotoSearch";
import { CatalogHero } from "@/components/CatalogHero";
import { checkCoupon, createBooking, getCatalog, type CatalogOffer, trackOrder, type BookingResult, type CatalogProduct, type CatalogShop, type CatalogData, type Fulfillment, type TrackResult } from "@/lib/catalog.functions";
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
  component: () => <InterfaceMotion><LanguageProvider><Catalog /></LanguageProvider></InterfaceMotion>,
});

const FILTERS = ["All", "Gents", "Ladies", "Boys", "Girls", "Kids"] as const;
const waNum = (p?: string | null) => { const m = (p ?? "").replace(/\D/g, ""); return m.length === 10 ? `91${m}` : m; };
const waTo = (phone: string | null, text: string) => (phone ? `https://wa.me/${waNum(phone)}?text=${encodeURIComponent(text)}` : null);

function LangChip() {
  const { lang, setLang } = useLang();
  return (
    <label className={styles["language"]} data-no-translate>
      <Globe className="h-3.5 w-3.5" />
      <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as AppLanguage)} className="bg-transparent text-xs font-medium outline-none [&>option]:text-foreground">
        <option value="english">EN</option><option value="hindi">हिंदी</option><option value="hinglish">Hinglish</option>
      </select>
    </label>
  );
}

function Catalog() {
  return <CatalogView data={Route.useLoaderData()} />;
}

export function CatalogView({ data }: { data: CatalogData }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [brand, setBrand] = useState("All");
  const [open, setOpen] = useState<CatalogProduct | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [views, setViews] = useState(0);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("track"); if (t) setTrack(t); }, []);
  // Catalog has its own customer theme (light by default, customer can switch in footer), independent of the app's setting.
  const [dark, setDark] = useState(false);
  useEffect(() => { if (localStorage.getItem("catalog-theme") === "dark") setDark(true); }, []);
  useEffect(() => {
    const el = document.documentElement;
    const wasDark = el.classList.contains("dark");
    const prev = el.style.colorScheme;
    const force = () => { el.classList.toggle("dark", dark); el.style.colorScheme = dark ? "dark" : "light"; };
    force();
    const obs = new MutationObserver(() => { if (el.classList.contains("dark") !== dark) force(); });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => { obs.disconnect(); el.classList.toggle("dark", wasDark); el.style.colorScheme = prev; };
  }, [dark]);
  const toggleTheme = () => { const d = !dark; setDark(d); localStorage.setItem("catalog-theme", d ? "dark" : "light"); };
  const [ptype, setPtype] = useState("All");
  const [photo, setPhoto] = useState(false);
  const [help, setHelp] = useState(false);
  const { lang } = useLang();
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
  const presentation = catalogPresentation(data.presentation);

  const copy = CATALOG_COPY[lang];
  const resetFilters = () => { setQ(""); setFilter("All"); setPtype("All"); setBrand("All"); setFsize("All"); };
  const heroAction = () => {
    const hero = data.hero;
    if (!hero) return;
    if (hero.action === "whatsapp" && shop.phone) {
      const link = waTo(shop.phone, `Hello ${shop.name}, I would like to ask about: ${hero.heading}`);
      if (link) window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    if (hero.action === "product") {
      const product = products.find((p) => p.id === hero.product_id);
      if (product) { setOpen(product); return; }
    }
    resetFilters();
    if (hero.action === "category" && FILTERS.some((f) => f === hero.category)) setFilter(hero.category as (typeof FILTERS)[number]);
    document.getElementById("catalog-collection")?.scrollIntoView({ block: "start" });
  };
  const introduction = <section className={styles["welcome"]}>
    <div className={styles["welcomeInner"]}>
      <div>
        <p className={styles["eyebrow"]} data-no-translate>{copy.eyebrow}</p>
        <h1 data-no-translate>{copy.heading}</h1>
        <p className={styles["intro"]}>Live sizes and prices from our store.</p>
        {shop.address && <p className={styles["address"]}><MapPin aria-hidden="true" /><span data-no-translate>{shop.address}</span></p>}
      </div>
      <div className={styles["services"]}>
        {shop.booking && <span><Store aria-hidden="true" /><span>Store pickup</span></span>}
        {(shop.local || shop.outside) && <span><Truck aria-hidden="true" /><span>{shop.local ? "Local delivery" : "Outside Jabalpur delivery"}</span></span>}
      </div>
    </div>
  </section>;

  return (
    <div className={styles["store"]} data-theme={dark ? "dark" : "light"} data-tone={presentation.category_accents ? (ptype !== "All" ? ptype : filter) : "All"} data-motion={presentation.motion_enabled}>
      <header className={styles["header"]}>
        <div className={styles["headerInner"]}>
          <a href="#catalog-collection" className={styles["identity"]} aria-label={shop.name}>
            <span className={styles["logo"]}><ShoppingBag aria-hidden="true" /></span>
            <span className={styles["wordmark"]} data-no-translate>{shop.name}</span>
          </a>
          <div className={styles["headerActions"]}>
            <button onClick={() => setTrack("")} aria-label="Track order" className={styles["trackButton"]}><Package aria-hidden="true" /><span>Track order</span></button>
            <LangChip />
            {shop.phone && <a href={`tel:${shop.phone}`} className={styles["iconButton"]} aria-label="Call store"><Phone aria-hidden="true" /></a>}
          </div>
        </div>
      </header>
      {data.offer && <button type="button" onClick={() => { if (data.offer?.code) void navigator.clipboard?.writeText(data.offer.code); }} className={styles["offer"]}>
        <span>{data.offer.title}</span>{offerText(data.offer) && <> · {offerText(data.offer)}</>}{data.offer.code && <> · <span>Code</span> <b data-no-translate>{data.offer.code}</b></>}
        {data.offer.code && <Copy aria-hidden="true" />}
      </button>}

      {data.hero ? <CatalogHero key={data.hero.image} theme={presentation.theme ?? "studio"} hero={{ ...data.hero, motion: data.hero.motion && presentation.motion_enabled }} onAction={heroAction} fallback={introduction} /> : <BlurReveal enabled={presentation.motion_enabled}>{introduction}</BlurReveal>}

      <div className={styles["discovery"]}>
        <div className={styles["discoveryInner"]}>
          <div className={styles["search"]}>
            <Search aria-hidden="true" />
            <input aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.search} data-no-translate />
            {q && <button onClick={() => setQ("")} aria-label="Clear search"><X aria-hidden="true" /></button>}
            <button type="button" onClick={() => setPhoto(true)} aria-label="Ask about a photo" title={copy.photo}><Camera aria-hidden="true" /></button>
          </div>
          <nav className={styles["categories"]} aria-label={copy.categories}>
            {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={filter === f ? styles["activeCategory"] : styles["category"]}>
              {f === "All" && <ShoppingBag aria-hidden="true" />}<span>{f}</span>
            </button>)}
          </nav>
        </div>
      </div>
      <PhotoSearch open={photo} onClose={() => setPhoto(false)} products={products} shopName={shop.name} lang={lang} waLink={(text) => waTo(shop.phone, text)} onPick={(p) => setOpen(p)} />

      <main id="catalog-collection" className={styles["collection"]}>
        <div className={styles["collectionHeader"]}>
          <div><h2>Shop the collection</h2><p>{list.length} <span>designs</span></p></div>
          <div className={styles["filters"]}>
            {([["Type", types, ptype, setPtype], ["Brand", brands, brand, setBrand], ["Size", sizeList, fsize, setFsize]] as [string, string[], string, (v: string) => void][]).filter(([, opts]) => opts.length > 1).map(([label, opts, val, setVal]) => (
              <label key={label} className={styles["filter"]}>
                <span>{label}</span>
                <select aria-label={label} value={val} onChange={(e) => setVal(e.target.value)}>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
            {(ptype !== "All" || brand !== "All" || fsize !== "All") && <button onClick={() => { setPtype("All"); setBrand("All"); setFsize("All"); }} className={styles["clear"]}>Clear</button>}
          </div>
        </div>
        {presentation.gallery_enabled && list.length > 1 && <CatalogSpotlight key={`${filter}-${brand}-${ptype}-${fsize}-${q}`} products={list} motionEnabled={presentation.motion_enabled} onOpen={product => { setOpen(product); setViews(v => v + 1); }} />}
        <div className={styles["productGrid"]}>
          {list.map((p) => {
            const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
            const available = p.sizes.filter((size) => size.available);
            return (
              <button key={p.id} onClick={() => { setOpen(p); setViews((v) => v + 1); }} className={styles["productCard"]} aria-label={`${p.brand} ${p.article}`}>
                <div className={styles["productImage"]}>
                  {p.image ? <img src={p.image} alt={`${p.brand} ${p.article}`} loading="lazy" /> : <div className={styles["imageFallback"]}><ShoppingBag aria-hidden="true" /><span data-no-translate>{p.brand}</span></div>}
                  {off > 0 && <span className={styles["discount"]}>{off}% <span>OFF</span></span>}
                  {p.few_left && <span className={styles["limited"]}>Few sizes left</span>}
                </div>
                <div className={styles["productInfo"]}>
                  <p className={styles["brand"]} data-no-translate>{p.brand}</p>
                  <h3 data-no-translate>{p.article}</h3>
                  <p className={styles["price"]}><strong>{inr(p.price)}</strong>{off > 0 && <del>{inr(p.mrp)}</del>}</p>
                  <div className={styles["sizeSummary"]}><span>Sizes</span><span className={styles["sizeChips"]} data-no-translate>{available.length ? available.map((size) => <span key={size.id}>{size.size}</span>) : "—"}</span></div>
                  <span className={styles["cardAction"]}><span>{available.length ? "Choose size" : "Out of stock"}</span><ArrowRight aria-hidden="true" /></span>
                </div>
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div className={styles["empty"]}><Search aria-hidden="true" /><h3>No designs found.</h3><p>Try another search or category.</p><button onClick={resetFilters} data-no-translate>{copy.reset}</button></div>}
        <footer className={styles["footer"]}>
          <div><p data-no-translate>{shop.name}</p>{shop.address && <span data-no-translate>{shop.address}</span>}</div>
          <div className={styles["footerActions"]}>
            <button onClick={() => setHelp(true)} data-no-translate>{copy.help}</button>
            <button onClick={toggleTheme} aria-label="Switch theme">{dark ? <><Sun aria-hidden="true" /><span>Light</span></> : <><Moon aria-hidden="true" /><span>Dark</span></>}</button>
          </div>
        </footer>
      </main>
      <nav className={styles["bottomNav"]} aria-label={copy.navigation}>
        <a href="#catalog-collection" aria-current="page"><ShoppingBag aria-hidden="true" /><span data-no-translate>{copy.shop}</span></a>
        <button onClick={() => setTrack("")}><Package aria-hidden="true" /><span data-no-translate>{copy.orders}</span></button>
        <button onClick={() => setHelp(true)}><HelpCircle aria-hidden="true" /><span data-no-translate>{copy.help}</span></button>
      </nav>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className={`${styles["dialog"]} sm:max-w-md`}>
          <DialogHeader><DialogTitle data-no-translate>{copy.help}</DialogTitle></DialogHeader>
          <p className="font-semibold" data-no-translate>{shop.name}</p>
          {shop.address && <p className="text-sm text-muted-foreground" data-no-translate>{shop.address}</p>}
          {shop.phone && <Button asChild variant="outline" className="h-12"><a href={`tel:${shop.phone}`}><Phone className="h-4 w-4" /><span>Call store</span><span data-no-translate>{shop.phone}</span></a></Button>}
          {shop.phone && <Button asChild className="h-12"><a href={waTo(shop.phone, enquiryText(lang, shop.name, "", ""))!} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /><span>Ask on WhatsApp & visit store</span></a></Button>}
          <Button variant="secondary" className="h-12" onClick={() => { setHelp(false); setTrack(""); }}><Package className="h-4 w-4" /><span>Track order</span></Button>
        </DialogContent>
      </Dialog>
      <ProductDialog key={open?.id ?? "none"} product={open} all={products} onPick={setOpen} shop={shop} offerCode={data.offer?.code ?? ""} onClose={() => setOpen(null)} onTrack={(no) => { setOpen(null); setTrack(no); }} />
      {track !== null && <TrackDialog initial={track} onClose={() => setTrack(null)} />}
    </div>
  );
}

const CATALOG_COPY: Record<AppLanguage, { eyebrow: string; heading: string; search: string; photo: string; categories: string; reset: string; shop: string; orders: string; help: string; navigation: string }> = {
  english: { eyebrow: "GOOD FOOTWEAR. EVERY DAY.", heading: "Find your everyday pair.", search: "Search footwear or brand", photo: "Ask about a photo on WhatsApp", categories: "Footwear categories", reset: "Clear all filters", shop: "Shop", orders: "Orders", help: "Help", navigation: "Catalog navigation" },
  hindi: { eyebrow: "हर दिन, आराम के साथ।", heading: "अपनी पसंद की जोड़ी चुनें।", search: "जूते, चप्पल या ब्रांड खोजें", photo: "फोटो के बारे में WhatsApp पर पूछें", categories: "फुटवियर श्रेणियाँ", reset: "सभी फ़िल्टर हटाएँ", shop: "खरीदें", orders: "ऑर्डर", help: "मदद", navigation: "कैटलॉग नेविगेशन" },
  hinglish: { eyebrow: "HAR DIN KE LIYE ACHHE FOOTWEAR.", heading: "Apni pasand ki jodi chunein.", search: "Footwear ya brand khojein", photo: "Photo ke baare mein WhatsApp par poochein", categories: "Footwear categories", reset: "Saare filters hatayein", shop: "Shop", orders: "Orders", help: "Madad", navigation: "Catalog navigation" },
};

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

export function ProductDialog({ product, all, onPick, shop, onClose, onTrack, offerCode }: { product: CatalogProduct | null; all: CatalogProduct[]; onPick: (p: CatalogProduct) => void; shop: CatalogShop; offerCode: string; onClose: () => void; onTrack: (no: string) => void }) {
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
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRequest = useRef(0);
  useEffect(() => { couponRequest.current++; setDisc(null); setCErr(""); setCouponBusy(false); }, [product?.id, size, mobile]);
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
    const request = ++couponRequest.current;
    setCErr(""); setDisc(null); setCouponBusy(true);
    try {
      const result = await checkCoupon({ data: { variantId: chosen.id, code: code.trim(), mobile: mobile.replace(/[\s-]/g, "") } });
      if (request === couponRequest.current) setDisc(result);
    } catch (e) { if (request === couponRequest.current) setCErr((e as Error).message.replace(/^.*?:\s*/, "")); }
    finally { if (request === couponRequest.current) setCouponBusy(false); }
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
      <DialogContent className={`${styles["dialog"]} max-h-[92vh] overflow-y-auto sm:max-w-lg`}>
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
            <Input value={code} onChange={(e) => { couponRequest.current++; setCouponBusy(false); setCode(e.target.value.toUpperCase()); setDisc(null); }} placeholder="Coupon code (optional)" maxLength={30} className="h-11 min-w-0 flex-1 font-mono uppercase" />
            <Button type="button" variant="outline" className="h-11 min-w-20 shrink-0 whitespace-nowrap" disabled={couponBusy || !code.trim() || !/^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, ""))} onClick={applyCoupon}>{couponBusy ? "Checking…" : "Apply"}</Button>
          </div>
          {disc && <CouponTicket code={disc.code} amount={disc.amount} onRemove={() => { couponRequest.current++; setDisc(null); setCode(""); }} />}
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
      <DialogContent className={`${styles["dialog"]} max-h-[92vh] overflow-y-auto sm:max-w-md`}>
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
