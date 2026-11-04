import { categoryMatches, parseCategory } from "@/lib/product-categories";
import { useMemo, useState } from "react";
import { Camera, MessageCircle } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog.functions";
import type { AppLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Photo inquiry — choose section/size, then open WhatsApp with a prefilled message.
 * The customer attaches and sends their photo in WhatsApp; the catalog never chooses or uploads it.
 */
type P = CatalogProduct;
const SECTIONS = ["Men", "Women", "Kids"] as const;

const TXT = {
  english: {
    title: "Ask by photo", section: "For", size: "Size", any: "Not sure",
    ask: "Continue on WhatsApp", attach: "WhatsApp will open — attach your photo there and send.",
    msg: (s: string, c: string, z: string) => `Hello ${s}, I'm looking for a shoe like the photo I'm sending${c ? ` (${c})` : ""}${z ? `, Size ${z}` : ""}. Do you have this or a similar model?`,
  },
  hindi: {
    title: "फोटो से पूछें", section: "किसके लिए", size: "साइज़", any: "पता नहीं",
    ask: "WhatsApp पर जारी रखें", attach: "WhatsApp खुलेगा — वहाँ अपनी फोटो जोड़कर भेजें।",
    msg: (s: string, c: string, z: string) => `नमस्ते ${s}, मुझे इस फोटो जैसा जूता चाहिए${c ? ` (${c})` : ""}${z ? `, साइज़ ${z}` : ""}। क्या यह या इससे मिलता-जुलता मॉडल उपलब्ध है?`,
  },
  hinglish: {
    title: "Photo se poochein", section: "Kiske liye", size: "Size", any: "Pata nahi",
    ask: "WhatsApp par continue karein", attach: "WhatsApp khulega — wahan apni photo attach karke bhej dein.",
    msg: (s: string, c: string, z: string) => `Namaste ${s}, mujhe is photo jaisa joota chahiye${c ? ` (${c})` : ""}${z ? `, Size ${z}` : ""}. Kya yeh ya isse milta-julta model available hai?`,
  },
} satisfies Record<AppLanguage, unknown>;

export function PhotoSearch({ open, onClose, products, shopName, waLink, lang }: {
  open: boolean; onClose: () => void; products: P[]; shopName: string; waLink: (text: string) => string | null; lang: AppLanguage; onPick?: (p: P) => void;
}) {
  const t = TXT[lang] ?? TXT.english;
  const [section, setSection] = useState("");
  const [size, setSize] = useState("");

  const sizes = useMemo(() => [...new Set(products.filter((p) => !section || (section === "Kids" ? ["Kids", "Boys"].includes(parseCategory(p.category).department) : categoryMatches(p.category, section))).flatMap((p) => p.sizes.map((s) => s.size)))]
    .sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99)), [products, section]);

  const wa = waLink(t.msg(shopName, section, size));
  const reset = () => { setSection(""); setSize(""); };
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-sm" data-no-translate>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />{t.title}</DialogTitle></DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.attach}</p>
        <div className="space-y-3">
          <Row label={t.section}>{SECTIONS.map((s) => <button key={s} onClick={() => { setSection(section === s ? "" : s); setSize(""); }} className={chip(section === s)}>{s}</button>)}</Row>
          {sizes.length > 0 && <Row label={t.size}><button onClick={() => setSize("")} className={chip(!size)}>{t.any}</button>{sizes.map((s) => <button key={s} onClick={() => setSize(s)} className={chip(size === s)}>{s}</button>)}</Row>}
        </div>
        {wa && (
          <div className="space-y-1.5 pt-1">
            <Button asChild className="h-11 w-full"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />{t.ask}</a></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p><div className="flex gap-1.5 overflow-x-auto pb-0.5">{children}</div></div>;
}
