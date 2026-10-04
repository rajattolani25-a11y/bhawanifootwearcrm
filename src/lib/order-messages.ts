import type { AppLanguage } from "@/lib/i18n";
import { inr } from "@/lib/modules";

/** Professional WhatsApp texts for catalog orders, in the chosen language. Free, offline templates. */
export type OrderInfo = { booking_no: string; product: string; size: string; name: string; price: number; advance: number; delivery_charge: number; fulfillment: string; shop: string; address?: string | null };

const L = {
  english: {
    hi: (n: string) => `Dear ${n},`, hello: (s: string) => `Hello ${s},`, thanks: "Thank you for shopping with us.", regards: "Warm regards,",
    order: "Order no.", item: "Item", size: "Size", amount: "Amount", paid: "Amount paid", balance: "Balance at store", delivery: "Delivery", address: "Address",
    type: { pickup: "Store pickup", local: "Local delivery", outside: "Outside city delivery" } as Record<string, string>,
    ask: (p: string, sz: string) => `I saw *${p}*${sz ? ` (size ${sz})` : ""} in your online catalog. Is it available? I would like to visit the store.`,
    proof: "I have placed an order and paid on UPI. Sharing the payment screenshot below.", name: "Name",
    st: {
      pending: "Your order is placed and is waiting for payment. Please complete the UPI payment within 30 minutes to confirm it.",
      confirmed: "We have received your payment. Your order is confirmed.",
      packed_pickup: "Your pair is packed and ready for pickup. Please visit the store at your convenience.",
      packed: "Your pair is packed and will be dispatched soon.",
      shipped: "Your order is out for delivery. Please keep your phone reachable.",
      done: "Your order is complete. We hope you love your new pair!",
      refunded: "Your order has been cancelled and the refund has been initiated to your UPI account.",
    } as Record<string, string>,
  },
  hindi: {
    hi: (n: string) => `प्रिय ${n} जी,`, hello: (s: string) => `नमस्ते ${s},`, thanks: "हमारे साथ खरीदारी करने के लिए धन्यवाद।", regards: "सादर,",
    order: "ऑर्डर नं.", item: "सामान", size: "साइज़", amount: "राशि", paid: "भुगतान किया", balance: "दुकान पर बाकी", delivery: "डिलीवरी", address: "पता",
    type: { pickup: "दुकान से लेना", local: "लोकल डिलीवरी", outside: "शहर के बाहर डिलीवरी" } as Record<string, string>,
    ask: (p: string, sz: string) => `मैंने आपके ऑनलाइन कैटलॉग में *${p}*${sz ? ` (साइज़ ${sz})` : ""} देखा। क्या यह उपलब्ध है? मैं दुकान आना चाहता/चाहती हूँ।`,
    proof: "मैंने ऑर्डर किया है और UPI से भुगतान कर दिया है। भुगतान का स्क्रीनशॉट नीचे भेज रहा/रही हूँ।", name: "नाम",
    st: {
      pending: "आपका ऑर्डर हो गया है, भुगतान बाकी है। कृपया 30 मिनट में UPI भुगतान करके पक्का करें।",
      confirmed: "आपका भुगतान मिल गया है। आपका ऑर्डर पक्का हो गया है।",
      packed_pickup: "आपकी जोड़ी पैक होकर तैयार है। कृपया अपनी सुविधा से दुकान आकर ले जाएँ।",
      packed: "आपकी जोड़ी पैक हो गई है और जल्द भेजी जाएगी।",
      shipped: "आपका ऑर्डर डिलीवरी के लिए निकल चुका है। कृपया फ़ोन चालू रखें।",
      done: "आपका ऑर्डर पूरा हुआ। उम्मीद है नई जोड़ी आपको पसंद आएगी!",
      refunded: "आपका ऑर्डर रद्द हुआ और रिफंड आपके UPI खाते में भेजा जा रहा है।",
    } as Record<string, string>,
  },
  hinglish: {
    hi: (n: string) => `Dear ${n} ji,`, hello: (s: string) => `Namaste ${s},`, thanks: "Humare saath shopping karne ke liye dhanyavaad.", regards: "Saadar,",
    order: "Order no.", item: "Saman", size: "Size", amount: "Amount", paid: "Payment kiya", balance: "Dukaan pe baaki", delivery: "Delivery", address: "Address",
    type: { pickup: "Dukaan se lena", local: "Local delivery", outside: "Shehar ke bahar delivery" } as Record<string, string>,
    ask: (p: string, sz: string) => `Maine aapke online catalog mein *${p}*${sz ? ` (size ${sz})` : ""} dekha. Kya ye available hai? Main dukaan aana chahta/chahti hoon.`,
    proof: "Maine order kiya hai aur UPI se payment kar diya hai. Payment ka screenshot neeche bhej raha/rahi hoon.", name: "Naam",
    st: {
      pending: "Aapka order ho gaya hai, payment baaki hai. Please 30 minute mein UPI payment karke confirm karein.",
      confirmed: "Aapka payment mil gaya hai. Aapka order confirm ho gaya hai.",
      packed_pickup: "Aapka pair pack hokar ready hai. Apni suvidha se dukaan aakar le jaayein.",
      packed: "Aapka pair pack ho gaya hai aur jaldi bheja jayega.",
      shipped: "Aapka order delivery ke liye nikal chuka hai. Please phone chalu rakhein.",
      done: "Aapka order poora hua. Umeed hai naya pair aapko pasand aayega!",
      refunded: "Aapka order cancel hua aur refund aapke UPI account mein bheja ja raha hai.",
    } as Record<string, string>,
  },
};

const lines = (t: (typeof L)["english"], o: OrderInfo) => {
  const out = [`*${t.order}:* ${o.booking_no}`, `*${t.item}:* ${o.product}`, `*${t.size}:* ${o.size}`, `*${t.delivery}:* ${t.type[o.fulfillment] ?? o.fulfillment}`, `*${t.paid}:* ${inr(o.advance)}`];
  if (o.fulfillment === "pickup" && o.price > o.advance) out.push(`*${t.balance}:* ${inr(o.price - o.advance)}`);
  if (o.address) out.push(`*${t.address}:* ${o.address}`);
  return out.join("\n");
};

/** Customer -> shop: enquiry about a product. */
export function enquiryText(lang: AppLanguage, shop: string, product: string, size: string) {
  const t = L[lang];
  return `${t.hello(shop)}\n\n${t.ask(product, size)}`;
}

/** Customer -> shop: payment proof after ordering. */
export function proofText(lang: AppLanguage, o: OrderInfo) {
  const t = L[lang];
  return `${t.hello(o.shop)}\n\n${t.proof}\n\n${lines(t, o)}\n*${t.name}:* ${o.name}`;
}

/** Shop -> customer: status update for an order. */
export function statusText(lang: AppLanguage, o: OrderInfo, status: string, trackUrl?: string) {
  const t = L[lang];
  const key = status === "packed" && o.fulfillment === "pickup" ? "packed_pickup" : status === "picked" || status === "delivered" ? "done" : status === "cancelled" ? "refunded" : status;
  return `${t.hi(o.name)}\n\n${t.st[key] ?? ""}\n\n${lines(t, o)}${trackUrl ? `\n\n${trackUrl}` : ""}\n\n${t.thanks}\n${t.regards}\n*${o.shop}*`;
}
