import type { AppLanguage } from "./i18n";
import type { CartOrderResult } from "./catalog-cart-checkout";
import { inr } from "./modules";
export function cartProofMessage(
  lang: AppLanguage,
  result: CartOrderResult,
  name: string,
  address: string,
) {
  const c = {
    english: {
      hello: "Hello",
      ref: "Cart order",
      size: "Size",
      products: "Product total",
      coupon: "Coupon discount",
      delivery: "Delivery",
      due: "Amount to pay",
      name: "Customer",
      address: "Address",
      note: "I will attach the payment screenshot here. Please verify the payment and confirm this order.",
    },
    hindi: {
      hello: "नमस्ते",
      ref: "कार्ट ऑर्डर",
      size: "साइज़",
      products: "उत्पादों का कुल",
      coupon: "कूपन की छूट",
      delivery: "डिलीवरी",
      due: "देय राशि",
      name: "ग्राहक",
      address: "पता",
      note: "मैं भुगतान का स्क्रीनशॉट यहाँ भेजूँगा। कृपया भुगतान जाँचकर ऑर्डर पक्का करें।",
    },
    hinglish: {
      hello: "Namaste",
      ref: "Cart order",
      size: "Size",
      products: "Products ka total",
      coupon: "Coupon discount",
      delivery: "Delivery",
      due: "Abhi dena hai",
      name: "Customer",
      address: "Address",
      note: "Payment ka screenshot yahin bhejunga. Payment verify karke order confirm karein.",
    },
  }[lang];
  const discount = result.orders.reduce((sum, item) => sum + (item.coupon_discount ?? 0), 0);
  return `${c.hello} ${result.shop},\n\n*${c.ref}: ${result.cart_no}*\n${result.orders.map((item, i) => `${i + 1}. ${item.product}${item.color ? ` · ${item.color}` : ""}\n${c.size}: ${item.size} · ${inr(item.price)}`).join("\n\n")}${discount > 0 ? `\n\n${c.coupon}: −${inr(discount)}` : ""}\n\n${c.products}: ${inr(result.price)}\n${c.delivery}: ${inr(result.delivery_charge)}\n*${c.due}: ${inr(result.advance)}*${name ? `\n${c.name}: ${name}` : ""}${address ? `\n${c.address}: ${address}` : ""}\n\n${c.note}`;
}
export function cartPaymentUpdate(lang: AppLanguage, ref: string, shop: string, url: string) {
  return {
    english: `Hello, payment has been verified for your cart order *${ref}* at *${shop}*. Thank you!\n\nTrack each pair here:\n${url}`,
    hindi: `नमस्ते, *${shop}* में आपके कार्ट ऑर्डर *${ref}* का भुगतान सत्यापित हो गया है। धन्यवाद!\n\nहर जोड़ी की स्थिति यहाँ देखें:\n${url}`,
    hinglish: `Namaste, *${shop}* par aapke cart order *${ref}* ka payment verify ho gaya. Thank you!\n\nHar pair ka status yahan dekhein:\n${url}`,
  }[lang];
}
