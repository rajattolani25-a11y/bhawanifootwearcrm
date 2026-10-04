import { EXTRA, GENERATED } from "@/lib/i18n-dict";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppLanguage = "english" | "hindi" | "hinglish";

// Keyed by the English text shown in the app. Missing phrases fall back to English.
const DICT: Record<string, { english?: string; hindi: string; hinglish: string }> = {
  ...GENERATED,
  ...EXTRA,
  "SoleStack": { hindi: "SoleStack", hinglish: "SoleStack" },
  "Summary": { hindi: "सारांश", hinglish: "Summary" },
  "Profit & Loss": { hindi: "लाभ और हानि", hinglish: "Munafa-Nuksaan" },
  "Cash Book": { hindi: "नकद बही", hinglish: "Cash Khata" },
  "Tax & Payables": { hindi: "टैक्स और देनदारी", hinglish: "Tax aur Dena" },
  "Dashboard": { hindi: "डैशबोर्ड", hinglish: "Dashboard" },
  "POS Billing": { hindi: "नया बिल", hinglish: "Naya Bill" },
  "Products": { hindi: "सामान", hinglish: "Saman" },
  "Purchase": { hindi: "माल आया (स्टॉक)", hinglish: "Naya Maal Aaya" },
  "Sales History": { hindi: "बिक्री इतिहास", hinglish: "Bikri History" },
  "Suppliers": { hindi: "सप्लायर", hinglish: "Supplier" },
  "Customers": { hindi: "ग्राहक", hinglish: "Grahak" },
  "Khatabook": { hindi: "खाता बही", hinglish: "Khatabook" },
  "Size Finder": { hindi: "साइज़ खोजें", hinglish: "Size Dhundo" },
  "Rewards & Coupons": { hindi: "इनाम और कूपन", hinglish: "Inaam & Coupon" },
  "Inventory Control": { hindi: "स्टॉक नियंत्रण", hinglish: "Stock Control" },
  "Reports": { hindi: "रिपोर्ट", hinglish: "Hisaab-Kitab" },
  "Accounting": { hindi: "हिसाब", hinglish: "Hisaab" },
  "Barcodes": { hindi: "बारकोड", hinglish: "Barcode" },
  "Settings": { hindi: "सेटिंग्स", hinglish: "Settings" },
  "WhatsApp & Posters": { hindi: "व्हाट्सऐप और पोस्टर", hinglish: "WhatsApp & Poster" },
  "Stock Ledger": { hindi: "स्टॉक खाता", hinglish: "Stock Khata" },
  "Guide": { hindi: "गाइड", hinglish: "Guide" },
  "Sign out": { hindi: "लॉग आउट", hinglish: "Log out" },
  "Language": { hindi: "भाषा", hinglish: "Bhasha" },
  "Customer Ledger": { hindi: "ग्राहक खाता", hinglish: "Grahak Khata" },
  "Supplier Ledger": { hindi: "सप्लायर खाता", hinglish: "Supplier Khata" },
  "Due Balance": { hindi: "उधार बकाया", hinglish: "Udhar Baaki" },
  "Returns": { hindi: "वापसी", hinglish: "Return" },
  "Stock In": { hindi: "माल आया", hinglish: "Naya Maal Aaya" },
  "New Bill": { hindi: "नया बिल", hinglish: "Naya Bill" },
  "Date": { hindi: "तारीख", hinglish: "Tareekh" },
  "Details": { hindi: "विवरण", hinglish: "Detail" },
  "Debit": { hindi: "नामे", hinglish: "Naame" },
  "Credit": { hindi: "जमा", hinglish: "Jama" },
  "Balance": { hindi: "बकाया", hinglish: "Baaki" },
  "Opening balance": { hindi: "पुराना बकाया", hinglish: "Purana Baaki" },
  "Share on WhatsApp": { hindi: "व्हाट्सऐप पर भेजें", hinglish: "WhatsApp pe bhejo" },
  "Search": { hindi: "खोजें", hinglish: "Dhundo" },
  "Store details, team and data.": { hindi: "दुकान की जानकारी, टीम और डेटा।", hinglish: "Dukaan ki details, team aur data." },
  "Who you buy from, how much is pending.": { hindi: "किससे माल लेते हैं, कितना बाकी है।", hinglish: "Kisse maal lete ho, kitna baaki hai." },
  "Every entry with running balance for customers and suppliers.": { hindi: "ग्राहक और सप्लायर की हर एंट्री, चलते बकाये के साथ।", hinglish: "Grahak aur supplier ki har entry, chalte baaki ke saath." },
  "Pick a size, see what is in stock, and send it on WhatsApp.": { hindi: "साइज़ चुनें, स्टॉक देखें और व्हाट्सऐप पर भेजें।", hinglish: "Size chuno, stock dekho aur WhatsApp pe bhejo." },
  "Credit received": { hindi: "उधार जमा", hinglish: "Udhar jama" },
  "Goods received": { hindi: "माल आया", hinglish: "Maal aaya" },
  "Payment made": { hindi: "भुगतान दिया", hinglish: "Payment diya" },
  "Paid at billing": { hindi: "बिल के समय दिया", hinglish: "Bill ke time diya" },
  "Total to receive (from customers)": { hindi: "कुल लेना है (ग्राहकों से)", hinglish: "Total lena hai (grahak se)" },
  "Total to pay (to suppliers)": { hindi: "कुल देना है (सप्लायर को)", hinglish: "Total dena hai (supplier ko)" },
  "days": { hindi: "दिन", hinglish: "din" },
  "Balance is only": { english: "Balance is only", hindi: "बाकी सिर्फ", hinglish: "Baaki sirf" },
};

const Ctx = createContext<{ lang: AppLanguage; setLang: (l: AppLanguage) => void }>({ lang: "english", setLang: () => {} });
const KEY = "solestack-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>("english");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "hindi" || v === "hinglish" || v === "english") setLangState(v);
  }, []);
  const setLang = (l: AppLanguage) => { localStorage.setItem(KEY, l); setLangState(l); };
  useEffect(() => translateDom(lang), [lang]);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const t = (text: string) => DICT[text]?.[lang] ?? text;
  return { lang, setLang, t };
}

export function LanguageSelect() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Language")}>
      {([["english", "English"], ["hindi", "हिंदी"], ["hinglish", "Hinglish"]] as const).map(([v, l]) => (
        <button key={v} type="button" onClick={() => setLang(v)} aria-pressed={lang === v}
          className={`rounded-md border px-4 py-2 text-sm ${lang === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

// Translates every visible text and placeholder on screen, so all pages follow the chosen language.
const origText = new WeakMap<Node, string>();
const shownText = new WeakMap<Node, string>();
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
function lookup(text: string, lang: AppLanguage) {
  const k = text.trim();
  const v = k ? DICT[k]?.[lang] : undefined;
  return v ? text.replace(k, v) : null;
}
function translateText(node: Text, lang: AppLanguage) {
  const p = node.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest("[data-no-translate]")) return;
  const cur = node.nodeValue ?? "";
  if (shownText.get(node) !== cur) origText.set(node, cur); // React wrote new text
  const orig = origText.get(node) ?? cur;
  const next = lookup(orig, lang) ?? orig;
  if (next !== cur) node.nodeValue = next;
  shownText.set(node, next);
}
function translateAttrs(el: Element, lang: AppLanguage) {
  for (const a of ["placeholder", "title", "aria-label"]) {
    const v = el.getAttribute(a); if (v === null) continue;
    const key = `data-i18n-${a}`;
    let orig = el.getAttribute(key);
    const shown = el.getAttribute(`${key}-shown`);
    if (orig === null || shown !== v) { orig = v; el.setAttribute(key, v); }
    const next = lookup(orig, lang) ?? orig;
    el.setAttribute(`${key}-shown`, next);
    if (next !== v) el.setAttribute(a, next);
  }
}
function walk(root: Node, lang: AppLanguage) {
  if (root.nodeType === 3) return translateText(root as Text, lang);
  if (root.nodeType !== 1) return;
  translateAttrs(root as Element, lang);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? translateText(n as Text, lang) : translateAttrs(n as Element, lang);
}
let observer: MutationObserver | null = null;
function translateDom(lang: AppLanguage) {
  observer?.disconnect();
  document.documentElement.lang = lang === "hindi" ? "hi" : "en";
  walk(document.body, lang);
  observer = new MutationObserver((list) => {
    observer!.disconnect();
    for (const m of list) {
      if (m.type === "characterData") translateText(m.target as Text, lang);
      else if (m.type === "attributes") translateAttrs(m.target as Element, lang);
      else m.addedNodes.forEach((n) => walk(n, lang));
    }
    observer!.observe(document.body, OPTS);
  });
  observer.observe(document.body, OPTS);
  return () => observer?.disconnect();
}
const OPTS: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] };
