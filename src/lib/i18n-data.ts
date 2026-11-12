import { COMMERCE } from "./i18n-commerce.ts";
import { OPERATIONS } from "./i18n-operations.ts";
import { CATEGORY_TRANSLATIONS } from "./i18n-categories.ts";
import { EXTRA, GENERATED } from "./i18n-dict.ts";
import { ORDERS } from "./i18n-orders.ts";
import { POSTERS } from "./i18n-posters.ts";

// Keyed by the English text shown in the app. Missing phrases fall back to English.
export const DICT: Record<string, { english?: string; hindi: string; hinglish: string }> = {
  ...GENERATED,
  ...EXTRA,
  ...ORDERS,
  ...POSTERS,
  ...CATEGORY_TRANSLATIONS,
  ...OPERATIONS,
  ...COMMERCE,
  SoleStack: { hindi: "SoleStack", hinglish: "SoleStack" },
  Summary: { hindi: "सारांश", hinglish: "Summary" },
  "Profit & Loss": { hindi: "लाभ और हानि", hinglish: "Munafa-Nuksaan" },
  "Cash Book": { hindi: "नकद बही", hinglish: "Cash Khata" },
  "Tax & Payables": { hindi: "टैक्स और देनदारी", hinglish: "Tax aur Dena" },
  Dashboard: { hindi: "डैशबोर्ड", hinglish: "Dashboard" },
  "POS Billing": { hindi: "नया बिल", hinglish: "Naya Bill" },
  Products: { hindi: "सामान", hinglish: "Saman" },
  Purchase: { hindi: "माल आया (स्टॉक)", hinglish: "Naya Maal Aaya" },
  "Sales History": { hindi: "बिक्री इतिहास", hinglish: "Bikri History" },
  Suppliers: { hindi: "सप्लायर", hinglish: "Supplier" },
  Customers: { hindi: "ग्राहक", hinglish: "Grahak" },
  Khatabook: { hindi: "खाता बही", hinglish: "Khatabook" },
  "Size Finder": { hindi: "साइज़ खोजें", hinglish: "Size Dhundo" },
  "Rewards & Coupons": { hindi: "इनाम और कूपन", hinglish: "Inaam & Coupon" },
  "Inventory Control": { hindi: "स्टॉक नियंत्रण", hinglish: "Stock Control" },
  Reports: { hindi: "रिपोर्ट", hinglish: "Hisaab-Kitab" },
  Accounting: { hindi: "हिसाब", hinglish: "Hisaab" },
  Barcodes: { hindi: "बारकोड", hinglish: "Barcode" },
  Settings: { hindi: "सेटिंग्स", hinglish: "Settings" },
  "WhatsApp & Posters": { hindi: "व्हाट्सऐप और पोस्टर", hinglish: "WhatsApp & Poster" },
  "Stock Ledger": { hindi: "स्टॉक खाता", hinglish: "Stock Khata" },
  Guide: { hindi: "गाइड", hinglish: "Guide" },
  "Sign out": { hindi: "लॉग आउट", hinglish: "Log out" },
  Language: { hindi: "भाषा", hinglish: "Bhasha" },
  "Customer Ledger": { hindi: "ग्राहक खाता", hinglish: "Grahak Khata" },
  "Supplier Ledger": { hindi: "सप्लायर खाता", hinglish: "Supplier Khata" },
  "Due Balance": { hindi: "उधार बकाया", hinglish: "Udhar Baaki" },
  Returns: { hindi: "वापसी", hinglish: "Return" },
  "Stock In": { hindi: "माल आया", hinglish: "Naya Maal Aaya" },
  "New Bill": { hindi: "नया बिल", hinglish: "Naya Bill" },
  Date: { hindi: "तारीख", hinglish: "Tareekh" },
  Details: { hindi: "विवरण", hinglish: "Detail" },
  Debit: { hindi: "नामे", hinglish: "Naame" },
  Credit: { hindi: "जमा", hinglish: "Jama" },
  Balance: { hindi: "बकाया", hinglish: "Baaki" },
  "Opening balance": { hindi: "पुराना बकाया", hinglish: "Purana Baaki" },
  "Share on WhatsApp": { hindi: "व्हाट्सऐप पर भेजें", hinglish: "WhatsApp pe bhejo" },
  Search: { hindi: "खोजें", hinglish: "Dhundo" },
  "Store details, team and data.": {
    hindi: "दुकान की जानकारी, टीम और डेटा।",
    hinglish: "Dukaan ki details, team aur data.",
  },
  "Who you buy from, how much is pending.": {
    hindi: "किससे माल लेते हैं, कितना बाकी है।",
    hinglish: "Kisse maal lete ho, kitna baaki hai.",
  },
  "Every entry with running balance for customers and suppliers.": {
    hindi: "ग्राहक और सप्लायर की हर एंट्री, चलते बकाये के साथ।",
    hinglish: "Grahak aur supplier ki har entry, chalte baaki ke saath.",
  },
  "Pick a size, see what is in stock, and send it on WhatsApp.": {
    hindi: "साइज़ चुनें, स्टॉक देखें और व्हाट्सऐप पर भेजें।",
    hinglish: "Size chuno, stock dekho aur WhatsApp pe bhejo.",
  },
  "Credit received": { hindi: "उधार जमा", hinglish: "Udhar jama" },
  "Goods received": { hindi: "माल आया", hinglish: "Maal aaya" },
  "Payment made": { hindi: "भुगतान दिया", hinglish: "Payment diya" },
  "Paid at billing": { hindi: "बिल के समय दिया", hinglish: "Bill ke time diya" },
  "Total to receive (from customers)": {
    hindi: "कुल लेना है (ग्राहकों से)",
    hinglish: "Total lena hai (grahak se)",
  },
  "Total to pay (to suppliers)": {
    hindi: "कुल देना है (सप्लायर को)",
    hinglish: "Total dena hai (supplier ko)",
  },
  days: { hindi: "दिन", hinglish: "din" },
  "Balance is only": { english: "Balance is only", hindi: "बाकी सिर्फ", hinglish: "Baaki sirf" },
};

// Some older screens use Hinglish as the source key. Also recognise their
// explicit English copy, so a React-rendered translation can switch back.
const BY_ENGLISH = Object.fromEntries(
  Object.values(DICT)
    .filter((v) => v.english)
    .map((v) => [v.english!, v]),
);
export function translatePhrase(text: string, lang: "english" | "hindi" | "hinglish") {
  return (DICT[text] ?? BY_ENGLISH[text])?.[lang] ?? text;
}
