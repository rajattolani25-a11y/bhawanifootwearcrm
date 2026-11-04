import type { AppLanguage } from "@/lib/i18n";
import { inr } from "@/lib/modules";

/** Professional WhatsApp texts for catalog orders, in the chosen language. Free, offline templates. */
export type OrderInfo = { booking_no: string; product: string; size: string; name: string; price: number; advance: number; delivery_charge: number; fulfillment: string; shop: string; address?: string | null };

const L = {
  english: {
    hi: (n: string) => `Dear ${n},`, hello: (s: string) => `Hello ${s},`, thanks: "Thank you for shopping with us.", regards: "Warm regards,",
    order: "Order no.", item: "Item", size: "Size", amount: "Amount", paid: "Amount paid", due: "Payment due", balance: "Balance at store", delivery: "Delivery", address: "Address",
    type: { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" } as Record<string, string>,
    ask: (p: string, sz: string) => `I saw *${p}*${sz ? ` (size ${sz})` : ""} in your online catalog. Is it available? I would like to visit the store.`,
    policy: "Note: No cash refund or return. Size exchange within 7 days with bill.", proof: "I have completed the UPI payment for my order. Please verify the payment screenshot and confirm my order.", name: "Name",
    st: {
      pending: "Your order is placed and is waiting for payment. Please complete the UPI payment within 30 minutes to confirm it.",
      confirmed: "We have received your payment. Your order is confirmed.",
      packed_pickup: "Your pair is packed and ready for pickup. Please visit the store at your convenience.",
      packed: "Your pair is packed and will be dispatched soon.",
      shipped: "Your order is out for delivery. Please keep your phone reachable.",
      done: "Your order is complete. We hope you love your new pair!",
      refund_pending: "Your order has been cancelled. Your refund is pending with the store; we will update you once it is sent.",
      refunded: "Your refund has been sent and recorded by the store. Please check your account.",
      cancelled: "Your unpaid order has been cancelled. Please contact us if you already made a payment.",
    } as Record<string, string>,
  },
  hindi: {
    hi: (n: string) => `प्रिय ${n} जी,`, hello: (s: string) => `नमस्ते ${s},`, thanks: "हमारे साथ खरीदारी करने के लिए धन्यवाद।", regards: "सादर,",
    order: "ऑर्डर नं.", item: "सामान", size: "साइज़", amount: "राशि", paid: "भुगतान किया", due: "भुगतान बाकी", balance: "दुकान पर बाकी", delivery: "डिलीवरी", address: "पता",
    type: { pickup: "दुकान से लेना", local: "लोकल डिलीवरी", outside: "जबलपुर के बाहर डिलीवरी" } as Record<string, string>,
    ask: (p: string, sz: string) => `मैंने आपके ऑनलाइन कैटलॉग में *${p}*${sz ? ` (साइज़ ${sz})` : ""} देखा। क्या यह उपलब्ध है? मैं दुकान आना चाहता/चाहती हूँ।`,
    policy: "नोट: पैसे वापस या रिटर्न नहीं। बिल के साथ 7 दिन में साइज़ एक्सचेंज।", proof: "मैंने अपने ऑर्डर का UPI भुगतान कर दिया है। कृपया भुगतान के स्क्रीनशॉट की जाँच करके मेरा ऑर्डर पक्का करें।", name: "नाम",
    st: {
      pending: "आपका ऑर्डर हो गया है, भुगतान बाकी है। कृपया 30 मिनट में UPI भुगतान करके पक्का करें।",
      confirmed: "आपका भुगतान मिल गया है। आपका ऑर्डर पक्का हो गया है।",
      packed_pickup: "आपकी जोड़ी पैक होकर तैयार है। कृपया अपनी सुविधा से दुकान आकर ले जाएँ।",
      packed: "आपकी जोड़ी पैक हो गई है और जल्द भेजी जाएगी।",
      shipped: "आपका ऑर्डर डिलीवरी के लिए निकल चुका है। कृपया फ़ोन चालू रखें।",
      done: "आपका ऑर्डर पूरा हुआ। उम्मीद है नई जोड़ी आपको पसंद आएगी!",
      refund_pending: "आपका ऑर्डर रद्द हो गया है। दुकान से रिफंड भेजना अभी बाकी है; भेजने पर आपको जानकारी मिलेगी।",
      refunded: "दुकान ने आपका रिफंड भेजकर रिकॉर्ड कर दिया है। कृपया अपने खाते में जाँच करें।",
      cancelled: "आपका बिना भुगतान वाला ऑर्डर रद्द हो गया है। भुगतान कर दिया हो तो हमसे संपर्क करें।",
    } as Record<string, string>,
  },
  hinglish: {
    hi: (n: string) => `Dear ${n} ji,`, hello: (s: string) => `Namaste ${s},`, thanks: "Humare saath shopping karne ke liye dhanyavaad.", regards: "Saadar,",
    order: "Order no.", item: "Saman", size: "Size", amount: "Amount", paid: "Payment kiya", due: "Payment baaki", balance: "Dukaan pe baaki", delivery: "Delivery", address: "Address",
    type: { pickup: "Dukaan se lena", local: "Local delivery", outside: "Jabalpur ke bahar delivery" } as Record<string, string>,
    ask: (p: string, sz: string) => `Maine aapke online catalog mein *${p}*${sz ? ` (size ${sz})` : ""} dekha. Kya ye available hai? Main dukaan aana chahta/chahti hoon.`,
    policy: "Note: Cash refund ya return nahi. Bill ke saath 7 din mein size exchange.", proof: "Maine apne order ki UPI payment kar di hai. Kripya payment screenshot verify karke mera order confirm karein.", name: "Naam",
    st: {
      pending: "Aapka order ho gaya hai, payment baaki hai. Please 30 minute mein UPI payment karke confirm karein.",
      confirmed: "Aapka payment mil gaya hai. Aapka order confirm ho gaya hai.",
      packed_pickup: "Aapka pair pack hokar ready hai. Apni suvidha se dukaan aakar le jaayein.",
      packed: "Aapka pair pack ho gaya hai aur jaldi bheja jayega.",
      shipped: "Aapka order delivery ke liye nikal chuka hai. Please phone chalu rakhein.",
      done: "Aapka order poora hua. Umeed hai naya pair aapko pasand aayega!",
      refund_pending: "Aapka order cancel ho gaya hai. Dukaan se refund bhejna abhi baaki hai; bhejne par update milega.",
      refunded: "Dukaan ne aapka refund bhejkar record kar diya hai. Apne account mein check karein.",
      cancelled: "Aapka unpaid order cancel ho gaya hai. Payment kar di ho toh humse contact karein.",
    } as Record<string, string>,
  },
};

const lines = (t: (typeof L)["english"], o: OrderInfo, paid = true, balance = true) => {
  const out = [`*${t.order}:* ${o.booking_no}`, `*${t.item}:* ${o.product}`, `*${t.size}:* ${o.size}`, `*${t.delivery}:* ${t.type[o.fulfillment] ?? o.fulfillment}`, `*${paid ? t.paid : t.due}:* ${inr(o.advance)}`];
  if (balance && o.fulfillment === "pickup" && o.price > o.advance) out.push(`*${t.balance}:* ${inr(o.price - o.advance)}`);
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
  const key = status === "packed" && o.fulfillment === "pickup" ? "packed_pickup" : status === "picked" || status === "delivered" ? "done" : status === "expired" ? "cancelled" : status;
  return `${t.hi(o.name)}\n\n${t.st[key] ?? ""}\n\n${lines(t, o, !["pending", "cancelled", "expired"].includes(status), !["refund_pending", "refunded", "cancelled", "expired"].includes(status))}${trackUrl ? `\n\n${trackUrl}` : ""}\n\n${t.thanks}\n${t.regards}\n*${o.shop}*`;
}
