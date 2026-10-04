import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, MessageCircle, Phone, Search, Store, X, Clock, ShieldCheck } from "lucide-react";
import { createBooking, getCatalog, type BookingResult, type CatalogProduct } from "@/lib/catalog.functions";
import { LanguageProvider, LanguageSelect } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/catalog")({
  loader: () => getCatalog(),
  head: ({ loaderData }) => {
    const name = loaderData?.shop?.name || "Footwear Store";
    const title = `${name} — Footwear Catalog`;
    const desc = `See new footwear designs, prices and available sizes at ${name}. Visit the store or ask on WhatsApp.`;
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  errorComponent: () => <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: () => <LanguageProvider><Catalog /></LanguageProvider>,
});

const FILTERS = ["All", "Gents", "Ladies", "Boys", "Girls"] as const;
const waNum = (p?: string | null) => { const m = (p ?? "").replace(/\D/g, ""); return m.length === 10 ? `91${m}` : m; };

function Catalog() {
  const data = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [brand, setBrand] = useState("All");
  const [open, setOpen] = useState<CatalogProduct | null>(null);
  const products = data.products ?? [];
  const brands = useMemo(() => ["All", ...new Set(products.map((p) => p.brand))], [products]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return products.filter((p) => (filter === "All" || p.category === filter) && (brand === "All" || p.brand === brand) &&
      (!s || [p.brand, p.article, p.color, p.category].some((f) => f?.toLowerCase().includes(s))));
  }, [products, q, filter, brand]);

  if (!data.enabled || !data.shop) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">Catalog is not available right now. Please try again later.</div>;
  const shop = data.shop;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Footwear Catalog</p>
              <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl" data-no-translate>{shop.name}</h1>
              {shop.address && <p className="mt-2 flex items-center gap-1.5 text-sm opacity-80"><MapPin className="h-4 w-4" /><span data-no-translate>{shop.address}</span></p>}
            </div>
            {shop.phone && <a href={`tel:${shop.phone}`} className="shrink-0 rounded-full border border-sidebar-border p-2.5" aria-label="Call store"><Phone className="h-4 w-4" /></a>}
          </div>
          <p className="mt-4 max-w-xl text-sm opacity-80">See what's in stock, pick your size, and visit the store to try it on.</p>
          <div className="mt-4"><LanguageSelect /></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, article or colour" className="h-11 pl-9" />
        </div>
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{f}</button>)}
        </div>
        {brands.length > 2 && <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {brands.map((b) => <button key={b} onClick={() => setBrand(b)} className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold uppercase ${brand === b ? "border-primary text-primary" : "text-muted-foreground"}`}><span data-no-translate={b !== "All" ? "" : undefined}>{b}</span></button>)}
        </div>}

        <p className="mb-3 text-xs text-muted-foreground">{list.length} designs</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="group overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md">
              <div className="aspect-square bg-muted">
                {p.image ? <img src={p.image} alt={`${p.brand} ${p.article}`} loading="lazy" className="h-full w-full object-contain p-2 transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center font-display text-4xl text-muted-foreground/30">{p.brand.slice(0, 1)}</div>}
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary" data-no-translate>{p.brand}</p>
                <p className="truncate font-semibold" data-no-translate>{p.article}</p>
                <p className="mt-1 flex items-baseline gap-1.5"><span className="font-display text-lg font-bold">{inr(p.price)}</span>{p.mrp > p.price && <span className="text-xs text-muted-foreground line-through">{inr(p.mrp)}</span>}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground"><span>Sizes</span> {p.sizes.filter((s) => s.available).map((s) => s.size).join(", ")}</p>
              </div>
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="py-16 text-center text-muted-foreground">No designs found.</p>}

        <div className="mt-10 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-3">
          <div className="flex gap-3"><Store className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Try in store</p><p className="text-sm text-muted-foreground">Visit us and try the pair before you buy.</p></div></div>
          <div className="flex gap-3"><MessageCircle className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Ask on WhatsApp</p><p className="text-sm text-muted-foreground">We confirm your size before you come.</p></div></div>
          <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Live stock</p><p className="text-sm text-muted-foreground">Only sizes in stock are shown.</p></div></div>
        </div>
      </main>
      <ProductDialog product={open} shop={shop} onClose={() => setOpen(null)} />
    </div>
  );
}

function ProductDialog({ product, shop, onClose }: { product: CatalogProduct | null; shop: NonNullable<ReturnType<typeof Route.useLoaderData>["shop"]>; onClose: () => void }) {
  const [size, setSize] = useState<string | null>(null);
  const [step, setStep] = useState<"view" | "form" | "done">("view");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<BookingResult | null>(null);
  const close = () => { setSize(null); setStep("view"); setErr(""); setRes(null); onClose(); };
  if (!product) return null;
  const chosen = product.sizes.find((s) => s.id === size);
  const label = `${product.brand} ${product.article}`;
  const ask = `Hello ${shop.name}, I saw ${label}${chosen ? ` (size ${chosen.size})` : ""} in your catalog. Is it available? I would like to visit the store.`;
  const wa = shop.phone ? `https://wa.me/${waNum(shop.phone)}?text=${encodeURIComponent(ask)}` : null;

  async function book() {
    if (!chosen) return;
    setBusy(true); setErr("");
    try { setRes(await createBooking({ data: { variantId: chosen.id, name, mobile } })); setStep("done"); }
    catch (e) { setErr((e as Error).message.replace(/^.*?:\s*/, "")); }
    finally { setBusy(false); }
  }
  const upi = res ? `upi://pay?pa=${encodeURIComponent(res.upi_id)}&pn=${encodeURIComponent(res.shop)}&am=${res.advance}&cu=INR&tn=${encodeURIComponent(res.booking_no)}` : "";
  const proof = res && shop.phone ? `https://wa.me/${waNum(shop.phone)}?text=${encodeURIComponent(`Booking ${res.booking_no}: I have paid the advance ${inr(res.advance)} for ${res.product} size ${res.size}. Name: ${name}.`)}` : null;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><span data-no-translate>{label}</span></DialogTitle></DialogHeader>
        {step === "view" && <>
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">{product.image ? <img src={product.image} alt={label} className="h-full w-full object-contain p-3" /> : null}</div>
          <div className="flex items-baseline justify-between"><p className="text-sm text-muted-foreground">{[product.category, product.color].filter(Boolean).join(" · ")}</p><p><span className="font-display text-2xl font-bold">{inr(product.price)}</span>{product.mrp > product.price && <span className="ml-2 text-sm text-muted-foreground line-through">{inr(product.mrp)}</span>}</p></div>
          <div>
            <p className="mb-2 text-sm font-semibold">Choose size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => <button key={s.id} disabled={!s.available} onClick={() => setSize(s.id)} className={`min-w-12 rounded-md border px-3 py-2 text-sm font-semibold ${!s.available ? "cursor-not-allowed text-muted-foreground/40 line-through" : size === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s.size}</button>)}
            </div>
          </div>
          {wa && <Button asChild className="h-12 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Ask on WhatsApp & visit store</a></Button>}
          {shop.booking && <button disabled={!chosen} onClick={() => setStep("form")} className="w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline">{chosen ? "Can't come today? Reserve this pair" : "Select a size to reserve this pair"}</button>}
        </>}
        {step === "form" && chosen && <div className="space-y-3">
          <p className="text-sm">Reserve <b data-no-translate>{label}</b> · <span>Size</span> <b>{chosen.size}</b></p>
          <div className="rounded-lg bg-muted p-3 text-sm"><p>A small advance of <b>{shop.advance_percent}%</b> ({inr(Math.ceil(product.price * shop.advance_percent / 100))}) keeps this pair aside for you for {shop.hold_hours} hours. The rest is paid at the store.</p></div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} className="h-11" />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" inputMode="numeric" maxLength={13} className="h-11" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("view")} className="h-11 flex-1">Back</Button><Button disabled={busy || name.trim().length < 2 || mobile.replace(/\D/g, "").length < 10} onClick={book} className="h-11 flex-1">{busy ? "Please wait…" : "Reserve"}</Button></div>
        </div>}
        {step === "done" && res && <div className="space-y-3 text-sm">
          <p className="text-base font-semibold">Pair kept aside for you</p>
          <p>Booking no. <b data-no-translate>{res.booking_no}</b> · <span data-no-translate>{res.product}</span> · <span>Size</span> {res.size}</p>
          <div className="rounded-lg border p-3"><p>Advance to pay</p><p className="font-display text-2xl font-bold">{inr(res.advance)}</p><p className="text-xs text-muted-foreground">Balance at store: {inr(res.price - res.advance)}</p></div>
          <p className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /> Please pay within 30 minutes, otherwise the pair is released.</p>
          <Button asChild className="h-12 w-full"><a href={upi}>Pay with UPI</a></Button>
          <p className="text-center text-xs text-muted-foreground" data-no-translate>UPI: {res.upi_id}</p>
          {proof && <Button asChild variant="outline" className="h-11 w-full"><a href={proof} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Send payment screenshot</a></Button>}
          <Button variant="ghost" onClick={close} className="w-full"><X className="h-4 w-4" /> Close</Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
