import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, MessageCircle, RotateCcw } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { AppLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Photo inquiry — no automatic matching. Customer optionally previews a photo (stays on phone),
 * picks section + size, and opens WhatsApp to the store with a prefilled message; the photo is attached there.
 */
type P = CatalogProduct & { ptype: string };
const SECTIONS = ["Gents", "Ladies", "Kids"] as const;

const TXT = {
  english: {
    title: "Ask by photo", pick: "Choose a photo (optional)", hint: "Only for your reference — it stays on your phone.", section: "For", size: "Size", any: "Not sure",
    ask: "Send photo on WhatsApp", attach: "WhatsApp will open — attach your photo there and send.", retake: "Change",
    msg: (s: string, c: string, z: string) => `Hello ${s}, I'm looking for a shoe like the photo I'm sending${c ? ` (${c})` : ""}${z ? `, Size ${z}` : ""}. Do you have this or a similar model?`,
  },
  hindi: {
    title: "फोटो से पूछें", pick: "फोटो चुनें (ज़रूरी नहीं)", hint: "सिर्फ आपके देखने के लिए — फोटो आपके फोन में ही रहती है।", section: "किसके लिए", size: "साइज़", any: "पता नहीं",
    ask: "WhatsApp पर फोटो भेजें", attach: "WhatsApp खुलेगा — वहाँ अपनी फोटो जोड़कर भेजें।", retake: "बदलें",
    msg: (s: string, c: string, z: string) => `नमस्ते ${s}, मुझे इस फोटो जैसा जूता चाहिए${c ? ` (${c})` : ""}${z ? `, साइज़ ${z}` : ""}। क्या यह या इससे मिलता-जुलता मॉडल उपलब्ध है?`,
  },
  hinglish: {
    title: "Photo se poochein", pick: "Photo chunein (optional)", hint: "Sirf aapke dekhne ke liye — photo aapke phone me hi rehti hai.", section: "Kiske liye", size: "Size", any: "Pata nahi",
    ask: "WhatsApp par photo bhejein", attach: "WhatsApp khulega — wahan apni photo attach karke bhej dein.", retake: "Badlein",
    msg: (s: string, c: string, z: string) => `Namaste ${s}, mujhe is photo jaisa joota chahiye${c ? ` (${c})` : ""}${z ? `, Size ${z}` : ""}. Kya yeh ya isse milta-julta model available hai?`,
  },
} satisfies Record<AppLanguage, unknown>;

export function PhotoSearch({ open, onClose, products, shopName, waLink, lang }: {
  open: boolean; onClose: () => void; products: P[]; shopName: string; waLink: (text: string) => string | null; lang: AppLanguage; onPick?: (p: P) => void;
}) {
  const t = TXT[lang] ?? TXT.english;
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [section, setSection] = useState("");
  const [size, setSize] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const sizes = useMemo(() => [...new Set(products.filter((p) => !section || (section === "Kids" ? ["Kids", "Boys", "Girls"].includes(p.category) : p.category === section)).flatMap((p) => p.sizes.map((s) => s.size)))]
    .sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99)), [products, section]);

  const wa = waLink(t.msg(shopName, section, size));
  const reset = () => { setPreview(null); setSection(""); setSize(""); if (fileRef.current) fileRef.current.value = ""; };
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-sm" data-no-translate>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />{t.title}</DialogTitle></DialogHeader>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
        {!preview ? (
          <button onClick={() => fileRef.current?.click()} className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-sm font-medium">
            <ImagePlus className="h-6 w-6 text-muted-foreground" />{t.pick}
            <span className="px-6 text-center text-[11px] font-normal text-muted-foreground">{t.hint}</span>
          </button>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-muted">
            <img src={preview} alt="" className="mx-auto max-h-44 object-contain" />
            <button onClick={() => fileRef.current?.click()} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium"><RotateCcw className="h-3 w-3" />{t.retake}</button>
          </div>
        )}
        <div className="space-y-3">
          <Row label={t.section}>{SECTIONS.map((s) => <button key={s} onClick={() => { setSection(section === s ? "" : s); setSize(""); }} className={chip(section === s)}>{s}</button>)}</Row>
          {sizes.length > 0 && <Row label={t.size}><button onClick={() => setSize("")} className={chip(!size)}>{t.any}</button>{sizes.map((s) => <button key={s} onClick={() => setSize(s)} className={chip(size === s)}>{s}</button>)}</Row>}
        </div>
        {wa && (
          <div className="space-y-1.5 pt-1">
            <Button asChild className="h-11 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />{t.ask}</a></Button>
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
