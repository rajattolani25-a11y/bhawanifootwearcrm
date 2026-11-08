import { readCartCheckout, CART_PENDING_EVENT } from "@/lib/catalog-cart-checkout";
import { CatalogDealDock } from "@/components/catalog-commerce/CatalogDealDock";
import { CatalogCart } from "@/components/catalog-commerce/CatalogCart";
import { BargainSheet } from "@/components/catalog-commerce/BargainSheet";
import { DealTimer } from "@/components/catalog-commerce/DealTimer";
import commerce from "@/components/catalog-commerce/commerce.module.css";
import { CART_EVENT, CART_KEY, LAST_DEAL_KEY, addToCart, readCart, removeFromCart, bargainClient, type CatalogCartItem } from "@/lib/catalog-cart";
import { type CatalogDeal, dealSeconds } from "@/lib/catalog-bargain";
import { toast } from "sonner";
import { CatalogPromotions } from "@/components/CatalogPromotions";
import { catalogStyleGroups, catalogStyleMatches } from "@/lib/catalog-style-options";
import { CatalogColourOptions } from "@/components/CatalogColourOptions";
import { catalogSizeGroups, catalogSizeMatches } from "@/lib/catalog-size-options";
import { CatalogCollectionFilters, type CatalogSort } from "@/components/CatalogCollectionFilters";
import { CatalogProductGrid } from "@/components/CatalogProductGrid";
import * as catalogApi from "@/lib/catalog.functions";
import { CATALOG_ORDER_EVENT, readCatalogOrder, saveCatalogOrder, clearCatalogOrder, type PendingCatalogOrder, type OrderRequest } from "@/lib/catalog-order-recovery";
import { catalogProductLink, catalogShareText } from "@/lib/catalog-share";
import { DEPARTMENTS, parseCategory, categoryLabel, categoryMatches } from "@/lib/product-categories";
import { catalogPresentation } from "@/lib/catalog-presentation";
import { catalogDescription } from "@/lib/catalog-description";
import { CouponTicket } from "@/components/CouponTicket";
import { CatalogSpotlight } from "@/components/CatalogSpotlight";
import { InterfaceMotion } from "@/components/motion/provider";
import { BlurReveal } from "@/components/motion/blur-reveal";
import { CatalogReservation } from "@/components/catalog-reservation";
import reservationStyles from "@/components/catalog-reservation.module.css";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Clock, Globe, HelpCircle, Info, Share2, MapPin, MessageCircle, Moon, Package, Phone, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sun, Store, Truck, X } from "lucide-react";
import styles from "./catalog.module.css";
import { PhotoSearch } from "@/components/PhotoSearch";
import { CatalogProductGallery } from "@/components/CatalogProductGallery";
import { CatalogHero } from "@/components/CatalogHero";
import { checkCoupon, createBooking, getCatalog, trackOrder, type BookingResult, type CatalogProduct, type CatalogShop, type CatalogData, type Fulfillment, type TrackResult } from "@/lib/catalog.functions";
import { LanguageProvider, useLang, type AppLanguage } from "@/lib/i18n";
import { enquiryText, proofText } from "@/lib/order-messages";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CatalogAbout = lazy(() => import("@/components/CatalogAbout").then(module => ({ default: module.CatalogAbout })));

export const Route = createFileRoute("/catalog")({
  loader: () => getCatalog(),
  head: ({ loaderData }) => {
    const name = loaderData?.shop?.name || "Footwear Store";
    const title = `${name} — Footwear Catalog`;
    const desc = `See new footwear designs, prices and available sizes at ${name}. Visit the store, order for delivery or ask on WhatsApp.`;
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  errorComponent: () => <div className="flex min-h-screen items-center justify-center p-6 text-center"><div><h1 className="text-xl font-semibold">Catalog couldn't load</h1><p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p><Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button></div></div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: () => <InterfaceMotion><LanguageProvider><Catalog /></LanguageProvider></InterfaceMotion>,
});

const FILTERS = ["All", ...DEPARTMENTS] as const;
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

export function CatalogView({ data: initialData }: { data: CatalogData }) {
  const [data, setData] = useState(initialData);
  const snapshotRef = useRef(data);
  snapshotRef.current = data;
  const [pendingOrder, setPendingOrder] = useState<PendingCatalogOrder | null>(null);
  const [recoveryNonce, setRecoveryNonce] = useState(0);
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [activeQuote,setActiveQuote]=useState<CatalogDeal|null>(null);
  const dismissQuote=useCallback(()=>{setActiveQuote(null);try{localStorage.removeItem(LAST_DEAL_KEY);}catch{/* Optional reminder cannot block shopping. */}},[]);
  const rememberQuote=useCallback((quote:CatalogDeal)=>{setActiveQuote(quote);try{localStorage.setItem(LAST_DEAL_KEY,JSON.stringify(quote));}catch{/* The live quote remains usable in this tab. */}},[]);
  useEffect(()=>{try{const q=JSON.parse(localStorage.getItem(LAST_DEAL_KEY)??"null") as CatalogDeal|null;if(q&&typeof q.id==="string"&&Number.isFinite(q.price)&&Number.isFinite(Date.parse(q.expires_at)))setActiveQuote(q);}catch{/* Malformed optional reminder is ignored. */}
    const used=()=>{setActiveQuote(null);try{localStorage.removeItem(LAST_DEAL_KEY);}catch{/* Order already saved. */}};window.addEventListener("solestack-catalog-deal-used",used);return()=>window.removeEventListener("solestack-catalog-deal-used",used);},[]);
  const [cartOpen, setCartOpen] = useState(false);
  const [pendingCart,setPendingCart]=useState(false);
  useEffect(()=>{const changed=()=>{try{setPendingCart(!!readCartCheckout());}catch{setPendingCart(true);}};changed();window.addEventListener(CART_PENDING_EVENT,changed);const stored=(event:StorageEvent)=>{if(event.key==="solestack-catalog-checkout-pending-v1")changed();};window.addEventListener("storage",stored);return()=>{window.removeEventListener(CART_PENDING_EVENT,changed);window.removeEventListener("storage",stored);};},[]);
  const [cartError, setCartError] = useState("");
  const [checkoutSelection, setCheckoutSelection] = useState<CatalogCartItem | null>(null);
  useEffect(() => {
    const changed = () => {try {setCart(readCart());setCartError("");} catch(e) {setCart([]);setCartError((e as Error).message);}};
    changed(); window.addEventListener(CART_EVENT,changed);window.addEventListener("solestack-store-reset",changed);
    const storage = (e:StorageEvent) => {if(e.key === CART_KEY) changed();};
    window.addEventListener("storage",storage);
    return () => {window.removeEventListener(CART_EVENT,changed);window.removeEventListener("solestack-store-reset",changed);window.removeEventListener("storage",storage);};
  }, []);
  useEffect(() => setData(previous => initialData.enabled && initialData.heroUnavailable && previous.hero
    ? { ...initialData, hero: previous.hero } : initialData), [initialData]);
  useEffect(() => {
    const changed = () => { try { setPendingOrder(readCatalogOrder()); } catch { /* Ordering remains fail-closed on unreadable recovery state. */ } };
    changed(); window.addEventListener(CATALOG_ORDER_EVENT,changed);
    return () => window.removeEventListener(CATALOG_ORDER_EVENT,changed);
  }, []);
  useEffect(() => {
    let stopped = false, busy = false;
    async function refresh() {
      if (busy || document.hidden || typeof catalogApi.getCatalogSnapshot !== "function") return;
      busy = true;
      try {
        const fresh = await catalogApi.getCatalogSnapshot();
        if (stopped) return;
        const previous = snapshotRef.current;
        const oldProducts = new Map((previous.products ?? []).map(p => [p.id, p]));
        const needPhotos = (fresh.products ?? []).some(p => p.image_key && (p.image_key !== oldProducts.get(p.id)?.image_key || !oldProducts.get(p.id)?.image));
        setData({ ...previous, ...fresh, products: (fresh.products ?? []).map(p => {
          const old = oldProducts.get(p.id);
          return { ...p, image: p.image_key && p.image_key===old?.image_key ? old?.image ?? null : null };
        }) });
        // Signing is needed only for a new/replaced photo, never for unchanged stock.
        if (needPhotos) { const full = await getCatalog(); if (!stopped) setData(previous => full.enabled && full.heroUnavailable && previous.hero ? { ...full, hero: previous.hero } : full); }
      } catch { /* Keep the usable snapshot; checkout independently validates the quote. */ }
      finally { busy = false; }
    }
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(() => void refresh(),30000);
    window.addEventListener("focus",visible);window.addEventListener("solestack-catalog-refresh",visible);document.addEventListener("visibilitychange",visible);
    return () => { stopped=true;clearInterval(timer);window.removeEventListener("focus",visible);window.removeEventListener("solestack-catalog-refresh",visible);document.removeEventListener("visibilitychange",visible); };
  }, []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState<CatalogProduct | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const openProduct = useCallback((product: CatalogProduct) => { setCheckoutSelection(null);setOpen(product); }, []);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("track"); if (t) setTrack(t); }, []);
  // Catalog has its own customer theme (light by default, customer can switch in footer), independent of the app's setting.
  const [dark, setDark] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("catalog-theme") === "dark") setDark(true); } catch { /* Theme is optional when device storage is blocked. */ } }, []);
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
  const toggleTheme = () => { const d = !dark; setDark(d); try { localStorage.setItem("catalog-theme", d ? "dark" : "light"); } catch { /* Session-only theme still works. */ } };
  const [photo, setPhoto] = useState(false);
  const [help, setHelp] = useState(false);
  const [about, setAbout] = useState(false);
  const { lang, t } = useLang();
  const deferredQuery=useDeferredValue(q);
  const [fsize, setFsize] = useState("All");
  const [fstyle, setFstyle] = useState("All");
  const [sort, setSort] = useState<CatalogSort>("default");
  const products = useMemo(() => (data.products ?? []).map((p) => ({ ...p, sizes: [...p.sizes].sort((a, b) => (parseFloat(a.size) || 99) - (parseFloat(b.size) || 99) || a.size.localeCompare(b.size)) })), [data.products]);
  useEffect(() => {
    setOpen(current => current ? products.find(p => p.id===current.id) ?? { ...current, sizes: current.sizes.map(s => ({ ...s, available: false })) } : null);
  }, [products]);
  const sharedProductHandled = useRef("");
  const [sharedUnavailable, setSharedUnavailable] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product");
    if (!id || sharedProductHandled.current === id) return;
    sharedProductHandled.current = id;
    const found = products.find((p) => p.id === id);
    if (found) setOpen(found); else setSharedUnavailable(true);
  }, [products]);
  const closeProduct = () => {
    setOpen(null);setCheckoutSelection(null);
    const link = new URL(window.location.href);
    link.searchParams.delete("product"); link.searchParams.delete("size");
    window.history.replaceState(window.history.state,"",link.toString());
  };
  const sizeGroups = useMemo(() => catalogSizeGroups(products.filter(product => catalogStyleMatches(product.category, fstyle)), filter), [products, filter, fstyle]);
  const styleGroups = useMemo(() => catalogStyleGroups(products, filter), [products, filter]);
  const list = useMemo(() => {
    const s = deferredQuery.toLowerCase().trim();
    const filtered = products.filter((p) => categoryMatches(p.category, filter) && catalogStyleMatches(p.category, fstyle) &&
      (fsize === "All" || p.sizes.some((x) => x.available && catalogSizeMatches(p.category, x.size, fsize))) &&
      (!s || [p.brand, p.article, p.color, p.category, categoryLabel(p.category)].some((f) => f?.toLowerCase().includes(s))));
    if (sort === "price-asc") filtered.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") filtered.sort((a, b) => b.price - a.price);
    else if (sort === "name") filtered.sort((a, b) => a.article.localeCompare(b.article, undefined, { sensitivity: "base", numeric: true }));
    else if (sort === "discount") {
      const discount = (p: CatalogProduct) => p.mrp > 0 ? Math.max(0, 1 - p.price / p.mrp) : 0;
      filtered.sort((a, b) => discount(b) - discount(a));
    }
    return filtered;
  }, [products, deferredQuery, filter, fsize, fstyle, sort]);

  if (!data.enabled || !data.shop) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>;
  const shop = data.shop;
  const presentation = catalogPresentation(data.presentation);

  const copy = CATALOG_COPY[lang];
  const resetFilters = () => { setQ(""); setFilter("All"); setFsize("All"); setFstyle("All"); setSort("default"); };
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
    if (hero.action === "category") { const dept = parseCategory(hero.category).department; if (FILTERS.some((f) => f === dept)) setFilter(dept as (typeof FILTERS)[number]); }
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
    <div className={styles["store"]} data-theme={dark ? "dark" : "light"} data-palette={presentation.theme ?? "studio"} data-tone={presentation.category_accents ? filter : "All"} data-motion={presentation.motion_enabled}>
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
      {cartError && <p role="alert" className="px-4 py-2 text-sm">{cartError}<button className="ml-2 min-h-11 underline" onClick={()=>{try{localStorage.removeItem(CART_KEY);window.dispatchEvent(new Event(CART_EVENT));}catch{setCartError("Device storage is unavailable.");}}}>Clear cart</button></p>}
      {activeQuote && !open && !cartOpen && <CatalogDealDock deal={activeQuote} onDismiss={dismissQuote} onReview={()=>{const p=products.find(p=>p.id===activeQuote.product_id);if(p){setCheckoutSelection({productId:p.id,variantId:activeQuote.variant_id,reviewBargain:true});setRecoveryNonce(n=>n+1);setOpen(p);}else setActiveQuote(null);}}/>}
      {cartOpen && <CatalogCart motionEnabled={presentation.motion_enabled} items={cart} products={products} shop={shop} onClose={()=>setCartOpen(false)} onTrack={ref=>{setCartOpen(false);setTrack(ref);}}/>}
      {pendingCart && <div role="alert" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm"><p>{t("An earlier cart order response was not confirmed. Recover it before placing another order.")}</p><Button variant="outline" onClick={()=>setCartOpen(true)}>{t("Recover saved cart order")}</Button></div>}
      {pendingOrder && <div role="alert" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm"><p>An earlier order response was not confirmed. Recover it before placing another order.</p><Button variant="outline" onClick={() => { setRecoveryNonce(n=>n+1);setOpen(pendingOrder.product); }}>Recover saved order</Button></div>}

      {data.hero ? <CatalogHero theme={presentation.theme ?? "studio"} hero={{ ...data.hero, motion: data.hero.motion && presentation.motion_enabled }} onAction={heroAction} fallback={introduction} /> : <BlurReveal enabled={presentation.motion_enabled}>{introduction}</BlurReveal>}

      <div className={styles["discovery"]}>
        <div className={styles["discoveryInner"]}>
          <div className={styles["search"]}>
            <Search aria-hidden="true" />
            <input aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.search} data-no-translate />
            {q && <button onClick={() => setQ("")} aria-label="Clear search"><X aria-hidden="true" /></button>}
            <button type="button" onClick={() => setPhoto(true)} aria-label="Ask about a photo" title={copy.photo}><Camera aria-hidden="true" /></button>
          </div>
          <nav className={styles["categories"]} aria-label={copy.categories}>
            {FILTERS.map((f) => <button key={f} onClick={() => { setFilter(f); setFsize("All"); setFstyle("All"); }} aria-pressed={filter === f} className={filter === f ? styles["activeCategory"] : styles["category"]}>
              {f === "All" && <ShoppingBag aria-hidden="true" />}<span>{f}</span>
            </button>)}
          </nav>
        </div>
      </div>
      <PhotoSearch open={photo} onClose={() => setPhoto(false)} products={products} shopName={shop.name} lang={lang} waLink={(text) => waTo(shop.phone, text)} onPick={(p) => setOpen(p)} />

      {sharedUnavailable && <p role="status" className="mx-auto max-w-6xl px-4 py-3 text-sm">This shared product is currently unavailable. Please browse the collection or contact the store.</p>}
      <main id="catalog-collection" className={styles["collection"]}>
        {presentation.gallery_enabled && list.length > 1 && <CatalogSpotlight key={`${filter}-${fsize}-${fstyle}-${deferredQuery}`} products={list} motionEnabled={presentation.motion_enabled} onOpen={openProduct} />}
        <CatalogPromotions offer={data.offer ?? null} products={products} department={filter} motionEnabled={presentation.motion_enabled} onProduct={openProduct} onShop={audience=>{setQ("");setFilter(audience === "men" ? "Men" : audience === "women" ? "Women" : "All");setFsize("All");setFstyle("All");window.requestAnimationFrame(()=>document.getElementById("catalog-products")?.scrollIntoView({behavior: presentation.motion_enabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto", block:"start"}));}} />
        <div className={styles["collectionHeader"]}>
          <h2 id="catalog-products">Shop the collection</h2>
        </div>
        <CatalogCollectionFilters groups={sizeGroups} size={fsize} setSize={setFsize} sort={sort} setSort={setSort}
          styleGroups={styleGroups} selectedStyle={fstyle} setStyle={value => { setFstyle(value); setFsize("All"); }}
          onClear={() => { setFsize("All"); setFstyle("All"); setSort("default"); }} />
        <CatalogProductGrid products={list} onOpen={openProduct} />
        {list.length === 0 && <div className={styles["empty"]}><Search aria-hidden="true" /><h3>No designs found.</h3><p>Try another search or category.</p><button onClick={resetFilters} data-no-translate>{copy.reset}</button></div>}
        <footer className={styles["footer"]}>
          <div><p data-no-translate>{shop.name}</p>{shop.address && <span data-no-translate>{shop.address}</span>}</div>
          <div className={styles["footerActions"]}>
            <button onClick={() => setAbout(true)} data-no-translate>{copy.about}</button>
            <button onClick={() => setHelp(true)} data-no-translate>{copy.help}</button>
            <button onClick={toggleTheme} aria-label="Switch theme">{dark ? <><Sun aria-hidden="true" /><span>Light</span></> : <><Moon aria-hidden="true" /><span>Dark</span></>}</button>
          </div>
        </footer>
      </main>
      <nav className={styles["bottomNav"]} aria-label={copy.navigation}>
        <a href="#catalog-collection" aria-current="page"><ShoppingBag aria-hidden="true" /><span data-no-translate>{copy.shop}</span></a>
        <button onClick={() => setTrack("")}><Package aria-hidden="true" /><span data-no-translate>{copy.orders}</span></button>
        <button className={commerce["cartButton"]} aria-label={t("Your cart")} onClick={() => setCartOpen(true)}><span className={styles["navCartIcon"]}><ShoppingCart aria-hidden="true"/>{cart.length>0&&<sup>{cart.length}</sup>}</span><span>{t("Cart")}</span></button>
        <button onClick={() => setHelp(true)}><HelpCircle aria-hidden="true" /><span data-no-translate>{copy.help}</span></button>
        <button onClick={() => setAbout(true)}><Info aria-hidden="true" /><span data-no-translate>{copy.aboutNav}</span></button>
      </nav>
      {about && <Suspense fallback={<Dialog open onOpenChange={setAbout}><DialogContent><DialogHeader><DialogTitle data-no-translate>{copy.about}</DialogTitle></DialogHeader><p role="status">Loading…</p></DialogContent></Dialog>}><CatalogAbout shop={shop} onClose={() => setAbout(false)} /></Suspense>}
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
      <ProductDialog key={`${open?.id ?? "none"}:${recoveryNonce}`} dark={dark} motionEnabled={presentation.motion_enabled} product={open} all={products} onPick={p=>{setCheckoutSelection(null);setOpen(p);}} shop={shop} offerCode={data.offer?.code ?? ""} cartItem={checkoutSelection} onQuote={rememberQuote} onDiscardDeal={dismissQuote} onClose={closeProduct} onTrack={(no) => { setOpen(null); setTrack(no); }} />
      {track !== null && <TrackDialog initial={track} onClose={() => setTrack(null)} />}
    </div>
  );
}

const CATALOG_COPY: Record<AppLanguage, { eyebrow: string; heading: string; search: string; photo: string; categories: string; reset: string; shop: string; orders: string; help: string; about: string; aboutNav: string; navigation: string }> = {
  english: { eyebrow: "GOOD FOOTWEAR. EVERY DAY.", heading: "Find your everyday pair.", search: "Search footwear or brand", photo: "Ask about a photo on WhatsApp", categories: "Footwear categories", reset: "Clear all filters", shop: "Shop", orders: "Orders", help: "Help", about: "About our store", aboutNav: "About", navigation: "Catalog navigation" },
  hindi: { eyebrow: "हर दिन, आराम के साथ।", heading: "अपनी पसंद की जोड़ी चुनें।", search: "जूते, चप्पल या ब्रांड खोजें", photo: "फोटो के बारे में WhatsApp पर पूछें", categories: "फुटवियर श्रेणियाँ", reset: "सभी फ़िल्टर हटाएँ", shop: "खरीदें", orders: "ऑर्डर", help: "मदद", about: "हमारी दुकान", aboutNav: "जानकारी", navigation: "कैटलॉग नेविगेशन" },
  hinglish: { eyebrow: "HAR DIN KE LIYE ACHHE FOOTWEAR.", heading: "Apni pasand ki jodi chunein.", search: "Footwear ya brand khojein", photo: "Photo ke baare mein WhatsApp par poochein", categories: "Footwear categories", reset: "Saare filters hatayein", shop: "Shop", orders: "Orders", help: "Madad", about: "Hamari dukaan", aboutNav: "About", navigation: "Catalog navigation" },
};

const STEPS_PICKUP = ["pending", "confirmed", "packed", "picked"];
const STEPS_DELIVERY = ["pending", "confirmed", "packed", "shipped", "delivered"];
const STATUS_LABEL: Record<string, string> = { pending: "Order placed", confirmed: "Payment confirmed", packed: "Packed", shipped: "Out for delivery", delivered: "Delivered", picked: "Picked up", cancelled: "Cancelled", expired: "Cancelled (not paid)", refund_pending: "Cancelled — refund pending", refunded: "Refund sent (recorded)" };
const TYPE_LABEL: Record<string, string> = { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" };

const TYPE_WORDS = ["sneaker", "running", "sports", "loafer", "sandal", "slipper", "flip", "slide", "boot", "formal", "belly", "ballerina", "clog", "crocs", "heel", "wedge", "juti", "mojari", "kolhapuri", "school", "canvas", "floater"];
function similarTo(p: CatalogProduct, all: CatalogProduct[]) {
  const words = TYPE_WORDS.filter((w) => p.article.toLowerCase().includes(w));
  return all
    .filter((x) => x.id !== p.id && categoryMatches(x.category, parseCategory(p.category).department) && (!p.gender || !x.gender || x.gender === p.gender) && x.sizes.some((s) => s.available) && x.price >= p.price * 0.7 && x.price <= p.price * 1.3)
    .map((x) => ({ x, score: (words.some((w) => x.article.toLowerCase().includes(w)) ? 50 : 0) + (x.brand === p.brand ? 30 : 0) + (p.color && x.color === p.color ? 10 : 0) - Math.abs(x.price - p.price) / Math.max(p.price, 1) * 10 }))
    .sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.x);
}

export function ProductDialog({ product, all, onPick, shop, onClose, onTrack, offerCode, dark = false, motionEnabled = true, cartItem = null, onQuote = () => {}, onDiscardDeal = () => {} }: { dark?: boolean; motionEnabled?: boolean; cartItem?: CatalogCartItem | null; onQuote?: (deal:CatalogDeal)=>void; onDiscardDeal?: ()=>void; product: CatalogProduct | null; all: CatalogProduct[]; onPick: (p: CatalogProduct) => void; shop: CatalogShop; offerCode: string; onClose: () => void; onTrack: (no: string) => void }) {
  const { lang, t } = useLang();
  const sizesRef = useRef<HTMLElement>(null);
  const [bargainOpen, setBargainOpen] = useState(!!cartItem?.reviewBargain);
  const [deal, setDeal] = useState<CatalogDeal | null>(cartItem?.deal ?? null);
  const [lastQuote, setLastQuote] = useState<CatalogDeal | null>(cartItem?.deal ?? null);
  const [dealExpiry, setDealExpiry] = useState(false);
  const reservationRef = useRef<HTMLDivElement>(null);
  const [needsSize, setNeedsSize] = useState(false);
  const [size, setSize] = useState<string | null>(() => {
    if (!product || typeof window === "undefined") return null;
    if(cartItem?.productId===product.id) return cartItem.variantId;
    const params = new URLSearchParams(window.location.search);
    if (params.get("product") !== product.id) return null;
    return product.sizes.find((s) => s.available && s.size === params.get("size"))?.id ?? null;
  });
  const [step, setStep] = useState<"view" | "method" | "form" | "done" | "recover">("view");
  const [method, setMethod] = useState<Fulfillment>("pickup");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<BookingResult | null>(null);
  const [reservedProduct, setReservedProduct] = useState<CatalogProduct | null>(null);
  useEffect(() => {
    try {
      const saved = readCatalogOrder();
      if (saved && product && saved.product.id===product.id) {
        setName(saved.data.name);setMobile(saved.data.mobile);setMethod(saved.data.fulfillment);setAddress(saved.data.address);setArea(saved.data.area);setSize(saved.data.variantId);setStep("recover");
      }
    } catch (e) { setErr((e as Error).message); }
  }, [product]);
  const [code, setCode] = useState(offerCode);
  const [disc, setDisc] = useState<{ code: string; amount: number } | null>(null);
  const [cErr, setCErr] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const couponRequest = useRef(0);
  useEffect(() => { couponRequest.current++; setDisc(null); setCErr(""); setCouponBusy(false); }, [product?.id, product?.price, size, mobile]);
  if (!product) return null;
  const chosen = product.sizes.find((s) => s.id === size);
  const label = `${product.brand} ${product.article}${product.color?.trim() ? ` · ${product.color.trim()}` : ""}`;
  const shareUrl = typeof window === "undefined" ? "" : catalogProductLink(window.location.origin, product.id, chosen?.size);
  const shareText = catalogShareText({ shop: shop.name, brand: product.brand, article: `${product.article}${product.color?.trim() ? ` · ${product.color.trim()}` : ""}`, price: product.price, url: shareUrl, ...(chosen ? { size: chosen.size } : {}), language: lang });

  const wa = waTo(shop.phone, enquiryText(lang, shop.name, label, chosen?.size ?? ""));
  const canOrder = shop.booking || shop.local || shop.outside;
  const hasStock = product.sizes.some(s => s.available);
  function startOrder() {
    if (!canOrder || !hasStock || invalidDeal) return;
    if (!chosen?.available) {
      setNeedsSize(true);
      sizesRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      sizesRef.current?.focus({ preventScroll: true });
      return;
    }
    setMethod(shop.booking ? "pickup" : shop.local ? "local" : "outside");
    setStep("method");
  }
  const charge = (f: Fulfillment, amount = product.price) => (f === "pickup" ? 0 : f === "local" ? (shop.free_delivery_above != null && amount >= shop.free_delivery_above ? 0 : shop.local_charge) : shop.outside_charge);
  const activeDeal = deal && deal.product_id===product.id && deal.variant_id===chosen?.id && chosen.available && product.bargain_enabled!==false && deal.listed_price===product.price ? deal : null;
  const invalidDeal = !!deal && !activeDeal;
  const quoteForTimer = lastQuote?.variant_id === chosen?.id ? lastQuote : activeDeal;
  const net = activeDeal ? activeDeal.price : product.price - (disc?.amount ?? 0);
  const payNow = method === "pickup" ? Math.ceil(net * shop.advance_percent / 100) : net + charge(method,net);
  async function applyCoupon() {
    if (!chosen || !code.trim() || activeDeal) return;
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

  async function order(recover = false) {
    if (!chosen || !product) return;
    if (!recover && activeDeal && dealSeconds(activeDeal,Date.now())===0) {setDealExpiry(true);setErr(t("This bargain price has expired. Choose the listed price to continue."));return;}
    setBusy(true); setErr("");
    try {
      if(readCartCheckout())throw Error(t("Recover the saved cart order before placing another order."));
      const saved = readCatalogOrder();
      if (saved && !recover) throw new Error("Recover the saved order before placing another order.");
      const payload: OrderRequest = recover && saved ? saved.data : { variantId: chosen.id, ...(shop.cart_ready?{cartReady:true}:{}), ...(activeDeal ? {bargain:{id:activeDeal.id,client:bargainClient()}} : {}), name, mobile: mobile.replace(/[\s-]/g,""), fulfillment: method, address: delivery ? address : "", area: delivery ? area : "", coupon: disc?.code ?? "", requestId: crypto.randomUUID(), quote: { price: product.price, net, charge: charge(method,net), advance: payNow } };
      if (!saved) saveCatalogOrder({ product, data: payload });
      const result = await createBooking({ data: payload });
      setReservedProduct(saved?.product ?? product); setRes(result); setStep("done");
      window.dispatchEvent(new Event("solestack-catalog-deal-used"));
      try {removeFromCart(payload.variantId);} catch {toast.error(t("Order saved. Remove this pair from your cart manually."));}
      try { clearCatalogOrder(); } catch { /* Saved order remains visible even if device cleanup fails. */ }
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("ORDER_REJECTED:")) { try { clearCatalogOrder(); } catch { /* Keep exact recovery state if storage fails. */ } setStep("form"); }
      else { try { if (readCatalogOrder()) setStep("recover"); } catch { /* Show the original failure. */ } }
      if (message.includes("ORDER_REJECTED:") && /bargain price.*(?:expired|changed)/i.test(message)) setDealExpiry(true);
      if (message.includes("ORDER_REJECTED:")) window.dispatchEvent(new Event("solestack-catalog-refresh"));
      setErr(message.replace(/^.*?(?:ORDER_REJECTED|ORDER_UNCONFIRMED):\s*/,""));
    } finally { setBusy(false); }
  }

  const upi = res ? `upi://pay?pa=${encodeURIComponent(res.upi_id)}&pn=${encodeURIComponent(res.shop)}&am=${res.advance}&cu=INR&tn=${encodeURIComponent(res.booking_no)}` : "";
  const paymentProofMessage = res ? proofText(lang, { booking_no: res.booking_no, product: `${res.product}${(reservedProduct ?? product).color ? ` · ${(reservedProduct ?? product).color}` : ""}`, size: res.size, name, price: res.price, advance: res.advance, delivery_charge: res.delivery_charge, fulfillment: res.fulfillment, shop: res.shop, address: delivery ? `${address}${area ? `, ${area}` : ""}` : null }) : "";
  const proof = res ? waTo(shop.phone, paymentProofMessage) : null;
  if (step === "done" && res) return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        key="reservation"
        ref={reservationRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          reservationRef.current?.focus({ preventScroll: true });
        }}
        aria-describedby={undefined}
        className={`${reservationStyles["dialog"]} translate-x-0 translate-y-0`}
      >
        <CatalogReservation
          product={reservedProduct ?? product} result={res} upi={upi} proof={proof}
          motionEnabled={motionEnabled} dark={dark}
          onClose={onClose} onTrack={() => onTrack(res.booking_no)}
        />
      </DialogContent>
    </Dialog>
  );
  const Opt = ({ f, icon, title, sub, price }: { f: Fulfillment; icon: React.ReactNode; title: string; sub: string; price: string }) => (
    <button onClick={() => setMethod(f)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${method === f ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}>
      <span className="text-primary">{icon}</span>
      <span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
      <span className="text-sm font-bold">{price}</span>
    </button>
  );

  return (<>
    {bargainOpen && chosen && <BargainSheet motionEnabled={motionEnabled} product={product} variantId={chosen.id} onClose={()=>setBargainOpen(false)} onListedPrice={()=>{setDeal(null);setLastQuote(null);setDealExpiry(false);setBargainOpen(false);onDiscardDeal();}} onQuote={quote=>{setLastQuote(quote);onQuote(quote);}} onAccept={quote=>{setDeal(quote);setLastQuote(quote);setDealExpiry(false);setDisc(null);setCode("");setErr("");setBargainOpen(false);setMethod(shop.booking ? "pickup" : shop.local ? "local" : "outside");setStep("method");}}/>}
    {!bargainOpen && <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-product-motion={motionEnabled ? "on" : "off"} data-product-theme={dark ? "dark" : "light"} className={`${styles["dialog"]} ${styles["productModal"]} ${step === "view" ? styles["productDialog"] : commerce["checkout"]}`}>
        <DialogHeader className={step === "view" ? styles["productHeader"] : commerce["checkoutHeader"]}>{step === "view" && <button type="button" onClick={onClose} className={styles["productBack"]} aria-label={t("Back to catalog")}><ArrowLeft aria-hidden="true" className="h-5 w-5" /></button>}{step === "view" && <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className={styles["productShare"]} aria-label={t("Share product on WhatsApp")} title={t("Share product on WhatsApp")}><Share2 aria-hidden="true" className="h-5 w-5" /></a>}<DialogTitle>{step === "view" ? t("Product details") : <span data-no-translate>{label}</span>}</DialogTitle></DialogHeader>
        {step === "view" && <div className={styles["productBody"]} role="region" aria-label={t("Product information")} tabIndex={0}>
          <CatalogColourOptions product={product} products={all} onPick={onPick} />
          <CatalogProductGallery key={product.id} productId={product.id} cover={product.image} label={label} imageClassName={styles["detailPhoto"] ?? ""} />
          <div className={styles["detailHeading"]}>
            <p className={styles["detailBrand"]} data-no-translate>{product.brand}</p>
            <h3 data-no-translate>{product.article}</h3>
          </div>
          <p className="text-sm text-muted-foreground"><span>{categoryLabel(product.category)}</span>{product.color && <> · <span data-no-translate>{product.color}</span></>}</p>
          <div className={styles["priceOfferRow"]}>
            <p className={styles["detailPrice"]}><span className="font-display text-2xl font-bold">{inr(product.price)}</span>{product.mrp > product.price && <span className="ml-2 text-sm text-muted-foreground line-through">{inr(product.mrp)}</span>}</p>
            {product.bargain_enabled && canOrder && hasStock && <button className={styles["priceOfferButton"]} type="button" onClick={()=>{if(!chosen){setNeedsSize(true);sizesRef.current?.scrollIntoView({block:"center"});sizesRef.current?.focus({preventScroll:true});}else setBargainOpen(true);}}><span>{t("Make an offer")}</span><ArrowRight aria-hidden="true" className="h-4 w-4"/></button>}
          </div>
          <section ref={sizesRef} tabIndex={-1} className={styles["detailSizes"]} data-attention={needsSize && !chosen} aria-label={t("Choose size")}>
            <p className="mb-2 text-sm font-semibold">Choose size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => <button key={s.id} disabled={!s.available} aria-pressed={size === s.id} onClick={() => { setSize(s.id); setNeedsSize(false); }} className={`min-w-12 rounded-md border px-3 py-2 text-sm font-semibold ${!s.available ? "cursor-not-allowed text-muted-foreground/40 line-through" : size === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s.size}</button>)}
            </div>
          </section>
          {catalogDescription(product.description) && <section className="space-y-2 rounded-xl border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">Product description</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]" data-no-translate>{catalogDescription(product.description)}</p>
          </section>}

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
        {step === "view" && (wa || canOrder) && <footer className={styles["productActions"]} aria-label={t("Product actions")}>
          {(invalidDeal || activeDeal && dealExpiry) && <div className="text-xs" role="alert"><p>{t(invalidDeal ? "The product price or selection changed. Review the listed price to continue." : "This bargain price has expired. Choose the listed price to continue.")}</p><button className="min-h-11 underline" onClick={()=>{setDeal(null);setLastQuote(null);setDealExpiry(false);onDiscardDeal();}}>{t("Use listed price")} · {inr(product.price)}</button></div>}
          {quoteForTimer && <DealTimer deal={quoteForTimer} onExpired={()=>setDealExpiry(true)}/>}
          <div className={styles["actionSummary"]}>
            <div className={styles["actionSummaryCopy"]}>
            <strong>{inr(activeDeal?.price ?? product.price)}</strong>
            <span role="status">{!hasStock ? t("Out of stock") : chosen ? <><span>{t("Size")}</span> <span data-no-translate>{chosen.size}</span> <span>{t("selected")}</span></> : t(canOrder ? "Select a size to continue" : "Choose a size (optional)")}</span>
            </div>
            {canOrder && <button type="button" className={styles["addCartAction"]} onClick={()=>{if(!chosen?.available){setNeedsSize(true);sizesRef.current?.focus();return;}try{addToCart({productId:product.id,variantId:chosen.id,...(activeDeal?{deal:activeDeal}:{})});toast.success(t("Added to cart"));}catch(e){toast.error(t((e as Error).message));}}} disabled={!hasStock}><ShoppingCart aria-hidden="true" className="h-[18px] w-[18px]"/><span>{t("Add to cart")}</span></button>}
          </div>

          <div className={styles["actionButtons"]}>
            {wa && <Button asChild variant="outline" className={styles["whatsappAction"]}><a href={wa} target="_blank" rel="noreferrer" aria-label={t("Ask on WhatsApp & visit store")}><MessageCircle aria-hidden="true" /><span>WhatsApp</span></a></Button>}
            {canOrder && <Button type="button" disabled={!hasStock || invalidDeal} onClick={startOrder} className={styles["orderAction"]}><span>{t(hasStock ? "Get this pair" : "Out of stock")}</span><ArrowRight aria-hidden="true" /></Button>}
          </div>
        </footer>}
        {step !== "view" && <div className={commerce["checkoutBody"]}>
        {(activeDeal && dealExpiry || invalidDeal) && <div role="alert" className="space-y-2 text-sm"><p>{t(invalidDeal ? "The product price or selection changed. Review the listed price to continue." : "This bargain price has expired. Choose the listed price to continue.")}</p><Button variant="outline" onClick={()=>{setDeal(null);setLastQuote(null);setDealExpiry(false);onDiscardDeal();}}>{t("Use listed price")} · {inr(product.price)}</Button></div>}
        {step === "method" && chosen && <div className="space-y-3">
          <p className="text-sm font-semibold">How do you want it?</p>
          {shop.booking && <Opt f="pickup" icon={<Store className="h-5 w-5" />} title="Pickup from store" sub="Pay a small advance now, rest at the store" price="Free" />}
          {shop.local && <Opt f="local" icon={<Truck className="h-5 w-5" />} title="Local delivery" sub={shop.delivery_note || "Within city"} price={charge("local",net) === 0 ? "Free" : inr(charge("local",net))} />}
          {shop.outside && <Opt f="outside" icon={<Package className="h-5 w-5" />} title="Outside Jabalpur delivery" sub="Full payment, delivered to your address" price={inr(charge("outside",net))} />}
          {shop.free_delivery_above != null && shop.local && <p className="text-xs text-muted-foreground"><span>Free local delivery above</span> {inr(shop.free_delivery_above)}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("view")} className="h-11 flex-1">Back</Button><Button onClick={() => setStep("form")} className="h-11 flex-1" disabled={(method === "pickup" && !shop.booking) || (method === "local" && !shop.local) || (method === "outside" && !shop.outside)}>Continue</Button></div>
        </div>}
        {step === "form" && chosen && <div className="space-y-3">
          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between"><span data-no-translate>{label}</span><span><span>Size</span> <b>{chosen.size}</b></span></div>
            <div className="flex justify-between"><span>Price</span><span>{inr(activeDeal?.price ?? product.price)}</span></div>
            {disc && <div className="flex justify-between text-primary"><span><span>Coupon</span> <span data-no-translate>{disc.code}</span></span><span>− {inr(disc.amount)}</span></div>}
            {delivery && <div className="flex justify-between"><span>Delivery charge</span><span>{charge(method,net) ? inr(charge(method,net)) : <span>Free</span>}</span></div>}
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>{method === "pickup" ? "Advance to pay now" : "Total to pay"}</span><span>{inr(payNow)}</span></div>
            {method === "pickup" && <p className="text-xs text-muted-foreground"><span>Balance at store:</span> {inr(net - payNow)} · <span>Pair kept aside for</span> {shop.hold_hours} <span>hours</span></p>}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} className="h-11" />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" inputMode="numeric" maxLength={14} className="h-11" />
          {delivery && <>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address (house, street, landmark)" maxLength={300} rows={3} />
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="City / Pincode" maxLength={80} className="h-11" />
          </>}
          {!activeDeal && <div className="flex gap-2">
            <Input value={code} onChange={(e) => { couponRequest.current++; setCouponBusy(false); setCode(e.target.value.toUpperCase()); setDisc(null); }} placeholder="Coupon code (optional)" maxLength={30} className="h-11 min-w-0 flex-1 font-mono uppercase" />
            <Button type="button" variant="outline" className="h-11 min-w-20 shrink-0 whitespace-nowrap" disabled={couponBusy || !code.trim() || !/^(\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s-]/g, ""))} onClick={applyCoupon}>{couponBusy ? "Checking…" : "Apply"}</Button>
          </div>}
          {disc && <CouponTicket code={disc.code} amount={disc.amount} onRemove={() => { couponRequest.current++; setDisc(null); setCode(""); }} />}
          {cErr && <p className="text-xs text-destructive">{cErr}</p>}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("method")} className="h-11 flex-1">Back</Button><Button disabled={busy || !valid || !!activeDeal && dealExpiry} onClick={() => void order()} className="h-11 flex-1">{busy ? "Please wait…" : "Place order"}</Button></div>
        </div>}
        {step === "recover" && <div className="space-y-3 text-sm"><p>The order response was interrupted. Recover the original request to avoid booking the pair twice.</p><p data-no-translate>{name} · {mobile}</p>{err && <p role="alert" className="text-destructive">{err}</p>}<Button disabled={busy} onClick={() => void order(true)} className="h-11 w-full">{busy ? "Please wait…" : "Recover saved order"}</Button></div>}

        </div>}
        {step!=="view"&&quoteForTimer&&<footer className={commerce["footer"]}><DealTimer deal={quoteForTimer} onExpired={()=>setDealExpiry(true)}/></footer>}
      </DialogContent>
    </Dialog>}</>
  );
}

function TrackDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [no, setNo] = useState(initial);
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tracked, setR] = useState<TrackResult | import("@/lib/catalog-cart-checkout").CartOrderResult | undefined>(undefined);
  const cartTrack=tracked&&"orders"in tracked?tracked:null;
  const r=tracked&&!cartTrack?tracked as TrackResult:undefined;
  async function check() {
    setBusy(true); setErr("");
    try { const x = await trackOrder({ data: { bookingNo: no, mobile: mobile.replace(/[\s-]/g, "") } }); if (!x) setErr("No order found. Check the order no. and mobile number."); setR(x); }
    catch { setErr("No order found. Check the order no. and mobile number."); }
    finally { setBusy(false); }
  }
  const steps = r ? (r.fulfillment === "pickup" ? STEPS_PICKUP : STEPS_DELIVERY) : [];
  const closed = r && ["cancelled", "expired", "refund_pending", "refunded"].includes(r.status);
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
        {cartTrack && <div className="space-y-3"><p className="font-semibold" data-no-translate>{cartTrack.cart_no}</p>{cartTrack.orders.map(item=><article key={item.booking_no} className="rounded-lg border p-3 text-sm"><strong data-no-translate>{item.product}</strong><p><span>Size</span> {item.size} · <span data-no-translate>{item.color}</span></p><p>{STATUS_LABEL[item.status]??item.status}</p><p>{inr(item.price)} · <span data-no-translate>{item.booking_no}</span></p></article>)}</div>}
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
