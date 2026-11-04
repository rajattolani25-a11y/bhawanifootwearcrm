import { useRef } from "react";
import { Clock, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import type { CatalogShop } from "@/lib/catalog.functions";
import styles from "./catalog-about.module.css";

const ADDRESS =
  "Main Road, Near Indore Sweets, Jawahar Nagar, Adhartal, Jabalpur, Madhya Pradesh – 482004";
const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=23.2010194%2C79.9501189";
const COPY = {
  english: {
    title: "About our store",
    address: "Visit our store",
    hours: "Store timings",
    directions: "Get Directions",
    map: "Bhawani Footwear location",
    call: "Call store",
    whatsapp: "WhatsApp",
  },
  hindi: {
    title: "हमारी दुकान के बारे में",
    address: "हमारी दुकान पर आएँ",
    hours: "दुकान का समय",
    directions: "रास्ता देखें",
    map: "भवानी फुटवियर का स्थान",
    call: "दुकान पर कॉल करें",
    whatsapp: "WhatsApp",
  },
  hinglish: {
    title: "Hamari dukaan ke baare mein",
    address: "Hamari dukaan par aayein",
    hours: "Dukaan ka time",
    directions: "Raasta dekhein",
    map: "Bhawani Footwear ki location",
    call: "Store ko call karein",
    whatsapp: "WhatsApp",
  },
};
/** Mounted only on demand. Location/timings are the owner's approved Bhawani details. */
export function CatalogAbout({ shop, onClose }: { shop: CatalogShop; onClose: () => void }) {
  const { lang } = useLang();
  const root = useRef<HTMLDivElement>(null);
  const copy = COPY[lang];
  const digits = shop.phone?.replace(/\D/g, "") ?? "";
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const contact = phone.length >= 10 && phone.length <= 15;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={root}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          root.current?.focus({ preventScroll: true });
        }}
        aria-describedby={undefined}
        className={styles["dialog"]}
        data-catalog-about
        data-no-translate
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <div className={styles["body"]}>
          <h2 className={styles["name"]} data-no-translate>
            Bhawani Footwear
          </h2>
          <section className={styles["detail"]}>
            <MapPin aria-hidden="true" />
            <div>
              <h3>{copy.address}</h3>
              <p>{ADDRESS}</p>
            </div>
          </section>
          <section className={styles["detail"]}>
            <Clock aria-hidden="true" />
            <div>
              <h3>{copy.hours}</h3>
              <p>10:30 AM – 10:30 PM</p>
            </div>
          </section>
          <iframe
            className={styles["map"]}
            title={copy.map}
            tabIndex={-1}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src="https://maps.google.com/maps?q=23.2010194%2C79.9501189&z=17&output=embed"
          />
          <Button asChild className="h-auto min-h-12 w-full whitespace-normal">
            <a href={DIRECTIONS} target="_blank" rel="noopener noreferrer">
              <Navigation className="h-4 w-4" />
              {copy.directions}
            </a>
          </Button>
          {contact && (
            <div className={styles["contacts"]}>
              <Button asChild variant="outline" className="h-auto min-h-12 whitespace-normal">
                <a href={`tel:+${phone}`}>
                  <Phone className="h-4 w-4" />
                  {copy.call}
                  <span>{shop.phone}</span>
                </a>
              </Button>
              <Button asChild variant="outline" className="h-auto min-h-12 whitespace-normal">
                <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  {copy.whatsapp}
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
