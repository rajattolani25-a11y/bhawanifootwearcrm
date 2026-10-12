import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, MessageCircle, RotateCcw } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { AppLanguage } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Search by Photo — runs fully on the customer's phone. The photo is never uploaded or saved.
 * Pipeline: centre crop → background removal (border colour) → CIE Lab colours for upper (top 75%)
 * and sole (bottom 25%, shadow rows skipped) → shape profile → hard locks (section, style, live size)
 * → strict cutoff. If nothing is close enough, no pair is shown; WhatsApp to the owner is always offered.
 */
type P = CatalogProduct & { ptype: string };
type Lab = [number, number, number];
type Print = { upper: Lab; sole: Lab; ratio: number; fill: number };

const SECTIONS = ["Gents", "Ladies", "Kids"] as const;
const STYLES: { key: string; label: string; types: string[] }[] = [
  { key: "sports", label: "Sports / Sneaker", types: ["Sports", "Sneakers", "School"] },
  { key: "formal", label: "Formal / Party", types: ["Formal", "School"] },
  { key: "open", label: "Sandal / Slipper", types: ["Sandals", "Slippers"] },
];
const OPEN_TYPES = ["Sandals", "Slippers"];

// Named footwear colours (sRGB) used when a catalog photo can't be read — matched against the product's colour text.
const NAMED: Record<string, [number, number, number]> = {
  black: [25, 25, 28], white: [240, 240, 238], grey: [128, 128, 130], gray: [128, 128, 130], navy: [30, 40, 80], blue: [40, 90, 190],
  brown: [110, 70, 40], tan: [190, 140, 90], beige: [220, 200, 170], cream: [235, 225, 200], red: [190, 30, 40], maroon: [110, 20, 35],
  green: [40, 120, 60], olive: [100, 110, 50], pink: [230, 140, 170], yellow: [235, 200, 40], orange: [235, 120, 30], purple: [110, 60, 150], silver: [190, 190, 195], gold: [200, 165, 70],
};

function toLab([r, g, b]: [number, number, number]): Lab {
  const f = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(y) - 16, 500 * (h(x) - h(y)), 200 * (h(y) - h(z))];
}
/** CIE76 ΔE with lightness softened, so indoor/outdoor light changes count less than real hue changes. */
const dE = (a: Lab, b: Lab) => Math.sqrt(((a[0] - b[0]) * 0.6) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

function loadImg(src: string, cors: boolean) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); if (cors) i.crossOrigin = "anonymous";
    i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}

/** Dominant colour of a pixel set: bucket in Lab, take the largest bucket's mean (ignores small logos/laces). */
function dominant(px: Lab[]): Lab | null {
  if (px.length < 8) return null;
  const buckets = new Map<string, Lab[]>();
  for (const p of px) { const k = `${Math.round(p[0] / 18)}|${Math.round(p[1] / 16)}|${Math.round(p[2] / 16)}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p); }
  const big = [...buckets.values()].sort((a, b) => b.length - a.length)[0]!;
  return [0, 1, 2].map((i) => big.reduce((s, p) => s + p[i]!, 0) / big.length) as Lab;
}

function fingerprint(img: HTMLImageElement, cropCentre: boolean): Print | null {
  const N = 72, c = document.createElement("canvas"); c.width = N; c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return null;
  const w = img.naturalWidth, h = img.naturalHeight, m = cropCentre ? 0.12 : 0; // outer edges cut for customer photos (floor, pants)
  const side = Math.min(w, h) * (1 - 2 * m);
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const lab = (x: number, y: number) => { const i = (y * N + x) * 4; return toLab([d[i]!, d[i + 1]!, d[i + 2]!]); };
  // Background = border colour. Normalise brightness against it (lighting tolerance).
  const border: Lab[] = []; for (let i = 0; i < N; i++) border.push(lab(i, 0), lab(i, N - 1), lab(0, i), lab(N - 1, i));
  const bg = dominant(border)!;
  const fg: boolean[] = new Array(N * N).fill(false);
  let x0 = N, x1 = 0, y0 = N, y1 = 0, count = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (dE(lab(x, y), bg) > 14) { fg[y * N + x] = true; count++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (count < N * N * 0.04) return null; // nothing that looks like a pair
  const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
  const soleTop = y0 + Math.floor(bh * 0.75), shadowFrom = y1 - Math.floor(bh * 0.08);
  const up: Lab[] = [], so: Lab[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!fg[y * N + x]) continue;
    if (y < soleTop) up.push(lab(x, y)); else if (y < shadowFrom) so.push(lab(x, y)); // bottom rows = shadow, skipped
  }
  const upper = dominant(up), sole = dominant(so) ?? upper;
  if (!upper || !sole) return null;
  return { upper, sole, ratio: bw / bh, fill: count / (bw * bh) };
}

function namedPrint(color: string | null): Print | null {
  const words = (color ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => NAMED[w]);
  if (!words.length) return null;
  return { upper: toLab(NAMED[words[0]!]!), sole: toLab(NAMED[words[1] ?? words[0]!]!), ratio: 0, fill: 0 };
}

const TXT = {
  english: {
    title: "Search by photo", pick: "Take or choose a photo", hint: "Keep the pair in the centre. Your photo stays on your phone.", section: "Section", style: "Type", size: "Your size", any: "Any",
    checking: "Checking our store…", found: "Similar pairs available at", none: "This design isn't in the online catalog yet — fresh stock may have arrived at the store! Ask the store owner directly on WhatsApp.",
    ask: "Ask store owner on WhatsApp", attach: "WhatsApp will open — please attach your photo there.", retake: "Change photo", view: "View",
    msg: (s: string, z: string) => `Hello ${s}, I checked your catalog for a shoe like this photo${z ? ` in Size ${z}` : ""}. Do you have this or any similar models in store? Please share details. (Photo attached)`,
  },
  hindi: {
    title: "फोटो से खोजें", pick: "फोटो लें या चुनें", hint: "जूता बीच में रखें। आपकी फोटो आपके फोन में ही रहती है।", section: "सेक्शन", style: "टाइप", size: "आपका साइज़", any: "कोई भी",
    checking: "दुकान का स्टॉक देख रहे हैं…", found: "मिलते-जुलते जोड़े उपलब्ध हैं —", none: "यह डिज़ाइन अभी ऑनलाइन कैटलॉग में नहीं है — हो सकता है दुकान पर नया स्टॉक आ चुका हो! सीधे दुकान के ओनर से WhatsApp पर बात करें।",
    ask: "WhatsApp पर ओनर से बात करें", attach: "WhatsApp खुलेगा — वहाँ अपनी फोटो जोड़ दें।", retake: "फोटो बदलें", view: "देखें",
    msg: (s: string, z: string) => `नमस्ते ${s}, मैंने कैटलॉग पर इस फोटो जैसा जूता चेक किया${z ? ` (साइज़ ${z})` : ""}। क्या आपकी दुकान में यह या इससे मिलता-जुलता नया स्टॉक उपलब्ध है? कृपया जानकारी दें। (फोटो साथ में है)`,
  },
  hinglish: {
    title: "Photo se khojein", pick: "Photo lein ya chunein", hint: "Joota beech me rakhein. Aapki photo aapke phone me hi rehti hai.", section: "Section", style: "Type", size: "Aapka size", any: "Koi bhi",
    checking: "Dukan ka stock dekh rahe hain…", found: "Milte-julte pairs available hain —", none: "Yeh design abhi online catalog me nahi hai — ho sakta hai store par naya stock aaya ho! Seedha dukan ke owner se WhatsApp par pata karein.",
    ask: "WhatsApp par owner se poochein", attach: "WhatsApp khulega — wahan apni photo attach kar dein.", retake: "Photo badlein", view: "Dekhein",
    msg: (s: string, z: string) => `Namaste ${s}, maine catalog par is photo jaisa joota check kiya${z ? ` (Size ${z})` : ""}. Kya aapke paas yeh ya isse milta-julta naya stock available hai? Details share karein. (Photo saath me hai)`,
  },
} satisfies Record<AppLanguage, unknown>;

const printCache = new Map<string, Print | null>();
async function productPrint(p: P): Promise<Print | null> {
  if (printCache.has(p.id)) return printCache.get(p.id)!;
  let fp: Print | null = null;
  if (p.image) { try { fp = fingerprint(await loadImg(p.image, true), false); } catch { fp = null; } }
  fp = fp ?? namedPrint(p.color);
  printCache.set(p.id, fp);
  return fp;
}

export function PhotoSearch({ open, onClose, products, shopName, waLink, lang, onPick }: {
  open: boolean; onClose: () => void; products: P[]; shopName: string; waLink: (text: string) => string | null; lang: AppLanguage; onPick: (p: P) => void;
}) {
  const t = TXT[lang] ?? TXT.english;
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [print, setPrint] = useState<Print | null | undefined>(undefined);
  const [section, setSection] = useState<string>("");
  const [style, setStyle] = useState<string>("");
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<P[] | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const sizes = useMemo(() => [...new Set(products.filter((p) => !section || inSection(p, section)).flatMap((p) => p.sizes.filter((s) => s.available).map((s) => s.size)))]
    .sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99)), [products, section]);

  async function onFile(f?: File) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPreview(url); setMatches(null); setPrint(undefined);
    try {
      const fp = fingerprint(await loadImg(url, false), true);
      setPrint(fp);
      if (fp && !style) setStyle(fp.fill < 0.55 && fp.ratio > 2.2 ? "open" : ""); // open footwear shows floor through it
    } catch { setPrint(null); }
  }

  // Re-run matching whenever photo or locks change.
  useEffect(() => {
    if (!print) { if (print === null) setMatches([]); return; }
    let live = true; setBusy(true);
    (async () => {
      const st = STYLES.find((s) => s.key === style);
      const pool = products.filter((p) =>
        (!section || inSection(p, section)) &&
        (st ? st.types.includes(p.ptype) : true) &&
        // never mix open and closed footwear, even without a chosen type
        (style === "open" ? true : !(isOpenShape(print) && !OPEN_TYPES.includes(p.ptype) && p.ptype !== "Other")) &&
        (size ? p.sizes.some((s) => s.size === size && s.available) : p.sizes.some((s) => s.available)));
      const scored: { p: P; d: number }[] = [];
      for (const p of pool) {
        const fp = await productPrint(p); if (!fp) continue;
        const du = dE(print.upper, fp.upper), ds = dE(print.sole, fp.sole);
        // Strict cutoff: both upper and sole colours must be close; shape must agree when known.
        if (du > 20 || ds > 26) continue;
        const shape = fp.ratio ? Math.abs(Math.log(print.ratio / fp.ratio)) : 0.2;
        if (shape > 0.6) continue;
        scored.push({ p, d: du * 1 + ds * 0.6 + shape * 20 });
      }
      if (!live) return;
      setMatches(scored.sort((a, b) => a.d - b.d).slice(0, 3).map((s) => s.p));
      setBusy(false);
    })();
    return () => { live = false; };
  }, [print, section, style, size, products]);

  const wa = waLink(t.msg(shopName, size));
  const reset = () => { setPreview(null); setPrint(undefined); setMatches(null); if (fileRef.current) fileRef.current.value = ""; };
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md" data-no-translate>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />{t.title}</DialogTitle></DialogHeader>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {!preview ? (
          <button onClick={() => fileRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 text-sm font-medium">
            <ImagePlus className="h-7 w-7 text-muted-foreground" />{t.pick}
            <span className="max-w-[240px] text-center text-xs font-normal text-muted-foreground">{t.hint}</span>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-muted">
            <img src={preview} alt="" className="mx-auto max-h-56 object-contain" />
            <div className="pointer-events-none absolute inset-[12%] rounded-lg border-2 border-background/80 shadow-[0_0_0_999px_hsl(0_0%_0%/0.25)]">
              {(busy || print === undefined) && (
                <>
                  {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map((c) => (
                    <span key={c} className={`absolute h-5 w-5 rounded-sm border-primary ${c}`} />
                  ))}
                  <span className="photo-scan-line absolute inset-x-1 h-0.5 rounded-full bg-primary shadow-[0_0_12px_2px_var(--color-primary)]" />
                </>
              )}
            </div>
            <button onClick={() => { reset(); fileRef.current?.click(); }} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium"><RotateCcw className="h-3 w-3" />{t.retake}</button>
          </div>
        )}

        <div className="space-y-2.5">
          <Row label={t.section}>{SECTIONS.map((s) => <button key={s} onClick={() => setSection(section === s ? "" : s)} className={chip(section === s)}>{s}</button>)}</Row>
          <Row label={t.style}>{STYLES.map((s) => <button key={s.key} onClick={() => setStyle(style === s.key ? "" : s.key)} className={chip(style === s.key)}>{s.label}</button>)}</Row>
          {sizes.length > 0 && <Row label={t.size}><button onClick={() => setSize("")} className={chip(!size)}>{t.any}</button>{sizes.map((s) => <button key={s} onClick={() => setSize(s)} className={chip(size === s)}>{s}</button>)}</Row>}
        </div>

        {preview && (busy || print === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t.checking}</p>
        ) : matches && matches.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold">{t.found} {shopName}</p>
            <div className="grid grid-cols-3 gap-2">
              {matches.map((p) => (
                <button key={p.id} onClick={() => { onPick(p); onClose(); reset(); }} className="text-left">
                  <div className="aspect-square overflow-hidden rounded-lg border bg-muted">{p.image && <img src={p.image} alt={`${p.brand} ${p.article}`} className="h-full w-full object-contain p-1.5" />}</div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{p.brand}</p>
                  <p className="truncate text-xs font-medium">{p.article}</p>
                  <p className="text-xs font-semibold">{inr(p.price)}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{p.sizes.filter((s) => s.available).map((s) => s.size).join(", ")}</p>
                </button>
              ))}
            </div>
          </div>
        ) : matches ? <p className="rounded-lg bg-muted p-3 text-sm">{t.none}</p> : null)}

        {preview && wa && (
          <div className="space-y-1.5 border-t pt-3">
            <Button asChild variant={matches && matches.length ? "outline" : "default"} className="h-11 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />{t.ask}</a></Button>
            <p className="text-center text-[11px] text-muted-foreground">{t.attach}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p><div className="flex gap-1.5 overflow-x-auto pb-0.5">{children}</div></div>;
}
const inSection = (p: P, s: string) => (s === "Kids" ? ["Kids", "Boys", "Girls"].includes(p.category) : p.category === s);
const isOpenShape = (fp: Print) => fp.fill < 0.5 && fp.ratio > 2.4;
