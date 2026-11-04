import { useId, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowUpRight, Clock, Package } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { CatalogPaymentProof } from "@/components/catalog-payment-proof";
import type { CatalogProduct, BookingResult } from "@/lib/catalog.functions";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import css from "./catalog-reservation.module.css";

const COPY = {
  english: {
    eyebrow: "A GOOD PAIR. KEPT FOR YOU.",
    title: "Your pair is reserved.",
    subtitle: "Complete payment to confirm your order.",
    pending: "PAYMENT PENDING",
    order: "Order no.",
    size: "Selected size",
    price: "Product price",
    coupon: "Coupon discount",
    advance: "Advance to pay now",
    total: "Total to pay",
    rest: "Balance at pickup",
    delivery: "Delivery charge",
    free: "Free",
    deadline: "Pay within 30 minutes to keep this reservation.",
    pay: "Pay with UPI",
    track: "Track order",
    close: "Close",
    paymentMissing: "Payment details are unavailable. Contact the store with your order number.",
    contact: "Contact store",
    photo: "Selected product photo",
    noPhoto: "Your selected pair",
    proofMissing: "After paying, contact the store with your order number and payment screenshot.",
    pickup: "Store pickup",
    local: "Local delivery",
    outside: "Outside Jabalpur delivery",
  },
  hindi: {
    eyebrow: "आपकी पसंद की जोड़ी, आपके लिए सुरक्षित।",
    title: "आपकी जोड़ी आरक्षित है।",
    subtitle: "ऑर्डर पक्का करने के लिए भुगतान करें।",
    pending: "भुगतान बाकी है",
    order: "ऑर्डर नं.",
    size: "चुना गया साइज़",
    price: "प्रोडक्ट की कीमत",
    coupon: "कूपन की छूट",
    advance: "अभी देना है (एडवांस)",
    total: "कुल भुगतान",
    rest: "दुकान पर बाकी",
    delivery: "डिलीवरी शुल्क",
    free: "मुफ़्त",
    deadline: "आरक्षण बनाए रखने के लिए 30 मिनट में भुगतान करें।",
    pay: "UPI से भुगतान करें",
    track: "ऑर्डर ट्रैक करें",
    close: "बंद करें",
    paymentMissing: "भुगतान की जानकारी उपलब्ध नहीं है। ऑर्डर नंबर के साथ दुकान से संपर्क करें।",
    contact: "दुकान से संपर्क करें",
    photo: "चुने गए प्रोडक्ट की तस्वीर",
    noPhoto: "आपकी चुनी हुई जोड़ी",
    proofMissing: "भुगतान के बाद ऑर्डर नंबर और भुगतान का स्क्रीनशॉट दुकान को भेजें।",
    pickup: "दुकान से लेना",
    local: "लोकल डिलीवरी",
    outside: "जबलपुर के बाहर डिलीवरी",
  },
  hinglish: {
    eyebrow: "AAPKA PASANDIDA PAIR. AAPKE LIYE RESERVED.",
    title: "Aapka pair reserved hai.",
    subtitle: "Order confirm karne ke liye payment karein.",
    pending: "PAYMENT BAAKI HAI",
    order: "Order no.",
    size: "Selected size",
    price: "Product ki price",
    coupon: "Coupon discount",
    advance: "Abhi dena hai (advance)",
    total: "Total payment",
    rest: "Pickup par baaki",
    delivery: "Delivery charge",
    free: "Free",
    deadline: "Reservation rakhne ke liye 30 minute mein payment karein.",
    pay: "UPI se pay karo",
    track: "Order track karo",
    close: "Band karo",
    paymentMissing:
      "Payment details nahi mil sakin. Order number ke saath store se contact karein.",
    contact: "Store se contact karein",
    photo: "Selected product ki photo",
    noPhoto: "Aapka selected pair",
    proofMissing: "Payment ke baad order number aur payment screenshot store ko bhejein.",
    pickup: "Dukaan se lena",
    local: "Local delivery",
    outside: "Jabalpur ke bahar delivery",
  },
};

/** Saved reservation only: never imply that a UPI payment has been verified. */
export function CatalogReservation({
  product,
  result,
  upi,
  proof,
  motionEnabled,
  dark,
  onClose,
  onTrack,
}: {
  product: CatalogProduct;
  result: BookingResult;
  upi: string;
  proof: string | null;
  motionEnabled: boolean;
  dark: boolean;
  onClose: () => void;
  onTrack: () => void;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const reduced = useReducedMotion();
  const motion = motionEnabled && !reduced;
  const id = useId().replace(/:/g, "");
  const [failedPhoto, setFailedPhoto] = useState(false);
  const [opaque, setOpaque] = useState(true);
  const [cors, setCors] = useState(true);
  const shop = result.shop.trim() || "Footwear Store";
  const split = /^(.+?)\s+footwear$/i.exec(shop);
  const name = split?.[1] ?? shop;
  const subtitle = split ? "FOOTWEAR" : "";
  const brand =
    product.brand && result.product.startsWith(product.brand + " ") ? product.brand : "";
  const title = brand ? result.product.slice(brand.length + 1) : result.product;
  const pickup = result.fulfillment === "pickup";
  const discount = Number(result.coupon_discount ?? 0);
  const photo = failedPhoto ? null : product.image;
  function inspectPhoto(img: HTMLImageElement) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      const bytes = ctx.getImageData(0, 0, 64, 64).data;
      let transparent = 0;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i]! < 30) transparent++;
      setOpaque(transparent / 4096 < 0.1);
    } catch {
      setOpaque(true);
    }
  }
  return (
    <main
      className={css["experience"] + (motion ? " " + css["animate"] : "")}
      data-order-success
      data-motion={motion}
      data-theme={dark ? "dark" : "light"}
      data-no-translate
    >
      <svg
        className={css["silk"] + " " + css["silk-still"]}
        viewBox="0 0 430 932"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${id}-ribbon`} x1="0" x2="1" y1="0" y2=".9">
            <stop stopColor="#d2b787" stopOpacity=".3" />
            <stop offset=".4" stopColor="#fffdf6" />
            <stop offset=".63" stopColor="#dfc79c" stopOpacity=".35" />
            <stop offset="1" stopColor="#fffaf0" />
          </linearGradient>
          <linearGradient id={`${id}-ribbon2`} x1="0" x2="1">
            <stop stopColor="#f1e4ca" />
            <stop offset=".6" stopColor="#fffdf9" />
            <stop offset="1" stopColor="#ddc195" stopOpacity=".45" />
          </linearGradient>
        </defs>
        <path
          d="M-140 250C-70 125 46 121 74 -85L148 -65C103 127 22 177 -71 315Z"
          fill={`url(#${id}-ribbon)`}
        />
        <path d="M-128 238C-16 77 58 81 86 -55" fill="none" stroke="#fffefa" strokeWidth="2" />
        <path
          d="M480 390C259 492 354 666 481 738L489 627C413 587 369 514 487 486Z"
          fill={`url(#${id}-ribbon)`}
        />
        <path
          d="M-97 669C24 741 48 879 258 865S473 809 548 916L522 1028C395 878 211 1062 54 883S-12 819 -97 802Z"
          fill={`url(#${id}-ribbon2)`}
        />
        <path
          d="M-60 719C44 801 53 913 275 889S447 869 499 923"
          stroke="#fffefb"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M-44 744C50 828 72 936 277 904S451 890 490 935"
          stroke="#c7aa78"
          strokeOpacity=".19"
          fill="none"
        />
      </svg>
      <div className={css["cream-light"]} aria-hidden="true" />
      <header className={css["topbar"]}>
        <div className={css["wordmark"]}>
          {name}
          {subtitle && <span>{subtitle}</span>}
        </div>
      </header>
      <section className={css["content"]}>
        <svg className={css["seal"]} viewBox="0 0 60 60" fill="none" aria-hidden="true">
          <path
            d="M30 4 37 8 45 9 49 16 54 22 52 30 54 38 49 44 45 51 37 52 30 56 23 52 15 51 11 44 6 38 8 30 6 22 11 16 15 9 23 8Z"
            fill="#f8f5e9"
            stroke="#31563b"
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
          <path
            className={css["tick"]}
            d="m19 30 8 8 16-17"
            stroke="#31563b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className={css["eyebrow"]}>{copy.eyebrow}</p>
        <DialogTitle className={css["headline"]}>{copy.title}</DialogTitle>
        <p className={css["sub"]}>{copy.subtitle}</p>
        <p className={css["pending"]} role="status">
          <span className={css["dot"]} />
          {copy.pending}
        </p>
        <p className={css["order-ref"]}>
          {copy.order} <b>{result.booking_no}</b>
        </p>
        <div
          className={css["stage"]}
          data-image-kind={!photo ? "missing" : opaque ? "opaque" : "transparent"}
        >
          <div className={css["ground"]} />
          <svg className={css["box"]} viewBox="0 0 380 235" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-lidFill`} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#eee1c5" />
                <stop offset=".28" stopColor="#fff9e9" />
                <stop offset="1" stopColor="#cfb585" />
              </linearGradient>
              <linearGradient id={`${id}-lidInside`} x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#e8d4ab" />
                <stop offset="1" stopColor="#faf0d8" />
              </linearGradient>
              <linearGradient id={`${id}-side`} x1="0" x2="1">
                <stop stopColor="#e1cea9" />
                <stop offset="1" stopColor="#f8edd9" />
              </linearGradient>
            </defs>
            <g className={css["halo"]} fill="none" stroke="#cbb68d" strokeWidth="1">
              <path d="M35 143V54Q35 38 51 38H328Q345 38 345 54V172" />
              <path d="M25 145V48Q25 28 45 28H334Q355 28 355 48V174" />
            </g>
            <g className={css["box-lid"]}>
              <path
                d="M54 133 48 57Q48 48 58 47L318 43Q328 43 329 53L334 133Z"
                fill={`url(#${id}-lidFill)`}
                stroke="#cbb38a"
              />
              <path d="m62 129-5-72 262-5 7 76Z" fill={`url(#${id}-lidInside)`} stroke="#fff8e6" />
              <path d="m62 57 8 70h249l-1-75" fill="none" stroke="#cfba94" strokeWidth="1" />
            </g>
            <g className={css["box-body"]}>
              <path d="m54 134 41-30 203-3 36 32-26 63H74Z" fill="#ead9b5" stroke="#cbb58c" />
              <path d="m74 171 18-37 205-1 14 37Z" fill="#fff8e9" />
              <path
                d="M67 155c40-11 45 2 71-6s43 7 73-1 43 5 71-3 33 4 43 10l-13 22H75Z"
                fill="#fffaf1"
                stroke="#ece3d3"
              />
            </g>
            <path
              className={css["glint"]}
              d="M68 144 129 93h31L96 150Z"
              fill="#fffefb"
              opacity="0"
            />
          </svg>
          {photo ? (
            <img
              className={css["shoe"]}
              src={photo}
              crossOrigin={cors ? "anonymous" : undefined}
              alt={`${result.product} — ${copy.photo}`}
              onLoad={(e) => inspectPhoto(e.currentTarget)}
              onError={() => {
                if (cors) {
                  setCors(false);
                  setOpaque(true);
                } else setFailedPhoto(true);
              }}
            />
          ) : (
            <span className={css["photo-fallback"]}>
              <Package aria-hidden="true" />
              <span>{copy.noPhoto}</span>
            </span>
          )}
          <svg className={css["box-front"]} viewBox="0 0 380 235" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-front`} x1="0" x2="1">
                <stop stopColor="#eee0c5" />
                <stop offset=".4" stopColor="#fff7e9" />
                <stop offset="1" stopColor="#e0cba5" />
              </linearGradient>
            </defs>
            <g className={css["box-body"]}>
              <path
                d="m54 144 20 66 235 1 25-68-20 14H74Z"
                fill={`url(#${id}-front)`}
                stroke="#c7b38e"
              />
              <path d="m54 144 20 13h240l20-14" fill="none" stroke="#fffdf5" strokeWidth="2" />
              <path d="M74 157v53m240-53-5 54" stroke="#cfbc96" />
              <text
                x="192"
                y="184"
                fill="#46603c"
                textAnchor="middle"
                fontFamily="Georgia,serif"
                fontSize="12"
                letterSpacing="2"
              >
                {name}
              </text>
              <text
                x="192"
                y="195"
                fill="#64704d"
                textAnchor="middle"
                fontFamily="Arial,sans-serif"
                fontSize="6"
                letterSpacing="3"
              >
                {subtitle}
              </text>
            </g>
          </svg>
        </div>
        <div className={css["product-meta"]}>
          {brand && <p className={css["brand"]}>{brand}</p>}
          <h3>{title}</h3>
          <p className={css["variant"]}>
            {product.color && (
              <>
                <span>{product.color}</span> ·{" "}
              </>
            )}
            {copy.size} <strong>{result.size}</strong> · {copy[result.fulfillment]}
          </p>
        </div>
        <div className={css["receipt"]}>
          <div className={css["row"]}>
            <span>{copy.price}</span>
            <strong>{inr(Number(result.price) + discount)}</strong>
          </div>
          {discount > 0 && (
            <div className={css["row"]}>
              <span>
                {copy.coupon}
                {result.coupon_code ? ` · ${result.coupon_code}` : ""}
              </span>
              <strong>− {inr(discount)}</strong>
            </div>
          )}
          {!pickup && (
            <div className={css["row"]}>
              <span>{copy.delivery}</span>
              <strong>
                {result.delivery_charge ? inr(Number(result.delivery_charge)) : copy.free}
              </strong>
            </div>
          )}
          <div className={css["row"] + " " + css["highlight"]}>
            <span>{pickup ? copy.advance : copy.total}</span>
            <strong>{inr(Number(result.advance))}</strong>
          </div>
          {pickup && (
            <div className={css["row"] + " " + css["total-rest"]}>
              <span>{copy.rest}</span>
              <strong>{inr(Math.max(0, Number(result.price) - Number(result.advance)))}</strong>
            </div>
          )}
        </div>
        <p className={css["deadline"]}>
          <Clock aria-hidden="true" />
          {copy.deadline}
        </p>
        {result.upi_id && upi ? (
          <a className={css["pay"]} href={upi} aria-label={copy.pay}>
            <span>
              {copy.pay} · {inr(Number(result.advance))}
            </span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        ) : (
          <p role="alert" className={css["helper"]}>
            {copy.paymentMissing}
          </p>
        )}
        <div className={css["proof-wrapper"]}>
          {proof ? (
            <CatalogPaymentProof language={lang} whatsappUrl={proof} />
          ) : (
            <p className={css["helper"]}>{copy.proofMissing}</p>
          )}
        </div>
        <div className={css["actions"]}>
          <button type="button" className={css["track"]} onClick={onTrack}>
            {copy.track}
          </button>
          <button type="button" className={css["track"]} onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </section>
    </main>
  );
}
