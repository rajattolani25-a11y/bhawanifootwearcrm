import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppLanguage = "english" | "hindi" | "hinglish";

// Keyed by the English text shown in the app. Missing phrases fall back to English.
const DICT: Record<string, { hindi: string; hinglish: string }> = {
  "Dashboard": { hindi: "डैशबोर्ड", hinglish: "Dashboard" },
  "POS Billing": { hindi: "नया बिल", hinglish: "Naya Bill" },
  "Products": { hindi: "सामान", hinglish: "Saman" },
  "Purchase": { hindi: "माल आया (स्टॉक)", hinglish: "Naya Maal Aaya" },
  "Sales History": { hindi: "बिक्री इतिहास", hinglish: "Bikri History" },
  "Suppliers": { hindi: "सप्लायर", hinglish: "Supplier" },
  "Customers": { hindi: "ग्राहक", hinglish: "Grahak" },
  "Khata": { hindi: "खाता", hinglish: "Khata" },
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
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const t = (text: string) => (lang === "english" ? text : DICT[text]?.[lang] ?? text);
  return { lang, setLang, t };
}

export function LanguageSelect() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Language")}>
      {([["english", "English"], ["hindi", "हिंदी"], ["hinglish", "Hinglish"]] as const).map(([v, l]) => (
        <button key={v} type="button" onClick={() => setLang(v)} aria-pressed={lang === v}
          className={`rounded-md border px-4 py-2 text-sm ${lang === v ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l}</button>
      ))}
    </div>
  );
}
