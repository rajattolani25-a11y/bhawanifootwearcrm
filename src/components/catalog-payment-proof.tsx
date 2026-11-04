import { MessageCircle } from "lucide-react";
import type { AppLanguage } from "@/lib/i18n";
import { Button } from "./ui/button";

const COPY = {
  english: {
    title: "Payment screenshot required",
    note: "After paying, open our WhatsApp chat, attach your payment screenshot and tap Send. Your order details are already filled in.",
    action: "Send screenshot on WhatsApp",
    verification: "The store will verify the payment before confirming your order.",
  },
  hindi: {
    title: "भुगतान का स्क्रीनशॉट भेजना ज़रूरी है",
    note: "भुगतान के बाद हमारी WhatsApp चैट खोलें, भुगतान का स्क्रीनशॉट लगाएँ और भेजें। ऑर्डर की जानकारी पहले से भरी हुई है।",
    action: "WhatsApp पर स्क्रीनशॉट भेजें",
    verification: "दुकान भुगतान की जाँच करने के बाद आपका ऑर्डर पक्का करेगी।",
  },
  hinglish: {
    title: "Payment screenshot bhejna zaroori hai",
    note: "Payment ke baad hamari WhatsApp chat kholein, payment screenshot attach karein aur Send dabayein. Order details pehle se bhari hain.",
    action: "WhatsApp par screenshot bhejein",
    verification: "Dukaan payment verify karke aapka order confirm karegi.",
  },
};

/** Open the shop chat; the customer attaches proof in WhatsApp, never in the app. */
export function CatalogPaymentProof({
  language,
  whatsappUrl,
}: {
  language: AppLanguage;
  whatsappUrl: string;
}) {
  const copy = COPY[language];
  return (
    <section
      data-payment-proof
      className="space-y-3 rounded-xl border bg-muted/30 p-3"
      data-no-translate
    >
      <div>
        <h3 className="text-sm font-semibold">{copy.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
      </div>
      <Button
        asChild
        variant="outline"
        className="h-auto min-h-11 w-full whitespace-normal text-center"
      >
        <a href={whatsappUrl} target="_blank" rel="noreferrer">
          <MessageCircle className="h-4 w-4 shrink-0" />
          {copy.action}
        </a>
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.verification}</p>
    </section>
  );
}
