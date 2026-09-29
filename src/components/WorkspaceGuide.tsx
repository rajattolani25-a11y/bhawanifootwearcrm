import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/use-auth";

type Language = "hinglish" | "english" | "hindi";
const copy: Record<Language, { heading: string; note: string; entries: Record<string, string> }> = {
  hinglish: {
    heading: "Kaam ki guide", note: "Jab zaroorat ho tab dekho. Koi step compulsory nahi hai.",
    entries: {
      "/dashboard": "Aaj ki sales, target, stock aur alerts ek jagah dekho.",
      "/pos": "Article/size chuno ya scan karo, customer aur discount lagao, payment lekar bill banao aur share/print karo.",
      "/products": "Ek article ke andar saare sizes aur unka stock dekho; photo aur naye articles yahin add karo.",
      "/purchase": "Supplier se aaya maal size aur cost ke saath receive karo; stock update hota hai.",
      "/sales": "Purane bills dhundo, reprint/share karo aur return ya exchange sambhalo.",
      "/suppliers": "Supplier ki details, purchase history aur pending payment dekho.",
      "/customers": "Customer mobile se dhundo; history, stamps aur rewards dekho.",
      "/coupons": "Customer ke liye coupon banao, WhatsApp draft bhejo aur billing mein apply karo.",
      "/inventory-control": "Low, damaged aur purana stock dekho; article ke andar sizes ki count/rack sudharo.",
      "/reports": "Sales aur product performance ki reports dekho.",
      "/accounting": "GST, expenses, cost, profit aur payments milao.",
      "/barcodes": "Size-wise barcode aur QR labels print karo; billing par scan karo.",
      "/settings": "Shop, printing, team roles aur backup/reset controls yahan hain.",
      "/community": "WhatsApp messages aur product posters taiyar karke share karo.",
      "/stock-ledger": "Har stock-in, sale, return aur adjustment ka record dekho.",
    },
  },
  english: {
    heading: "Workspace guide", note: "Open it whenever you need it. Nothing here is mandatory.",
    entries: {
      "/dashboard": "See today's sales, target, stock and alerts at a glance.",
      "/pos": "Scan or choose an article and size, add a customer and discounts, take payment, then print or share the bill.",
      "/products": "See every size under its article, check stock, add photos or create a new article.",
      "/purchase": "Receive supplier stock by size and cost to update inventory.",
      "/sales": "Find previous bills, reprint or share them, and handle returns or exchanges.",
      "/suppliers": "View supplier details, purchase history and pending payments.",
      "/customers": "Find a customer by mobile number and view purchases, stamps and rewards.",
      "/coupons": "Create coupons for customers, share a WhatsApp draft and apply codes at billing.",
      "/inventory-control": "Review low, damaged and older stock; adjust counts and racks by size within each article.",
      "/reports": "Review sales and product performance.",
      "/accounting": "Review GST, expenses, costs, profit and payments.",
      "/barcodes": "Print size-specific barcode and QR labels for scanning at checkout.",
      "/settings": "Manage shop details, printing, team roles and backup/reset controls.",
      "/community": "Prepare and share WhatsApp messages and product posters.",
      "/stock-ledger": "Trace every receipt, sale, return and adjustment to stock.",
    },
  },
  hindi: {
    heading: "काम की जानकारी", note: "ज़रूरत पड़ने पर कभी भी देखें। कोई चरण अनिवार्य नहीं है।",
    entries: {
      "/dashboard": "आज की बिक्री, लक्ष्य, स्टॉक और ज़रूरी सूचनाएँ देखें।",
      "/pos": "सामान और साइज़ चुनें या स्कैन करें, ग्राहक व छूट जोड़ें, भुगतान लें, फिर बिल छापें या भेजें।",
      "/products": "एक सामान के अंदर सभी साइज़ और उनका स्टॉक देखें; फ़ोटो या नया सामान जोड़ें।",
      "/purchase": "सप्लायर से आया माल साइज़ और खरीद मूल्य के साथ दर्ज करें।",
      "/sales": "पुराने बिल खोजें, दोबारा छापें या भेजें, और वापसी या बदलाव संभालें।",
      "/suppliers": "सप्लायर की जानकारी, खरीद और बकाया भुगतान देखें।",
      "/customers": "मोबाइल नंबर से ग्राहक खोजें; खरीद, स्टैम्प और इनाम देखें।",
      "/coupons": "ग्राहक के लिए कूपन बनाएँ, व्हाट्सऐप संदेश तैयार करें और बिल में कोड लगाएँ।",
      "/inventory-control": "कम, खराब और पुराने स्टॉक को देखें; हर सामान के अंदर साइज़ का स्टॉक और रैक सुधारें।",
      "/reports": "बिक्री और सामान के प्रदर्शन की रिपोर्ट देखें।",
      "/accounting": "जीएसटी, खर्च, लागत, लाभ और भुगतान देखें।",
      "/barcodes": "हर साइज़ के बारकोड और क्यूआर लेबल छापें और बिलिंग में स्कैन करें।",
      "/settings": "दुकान, बिल छपाई, टीम की भूमिकाएँ और बैकअप/रीसेट संभालें।",
      "/community": "व्हाट्सऐप संदेश और सामान के पोस्टर बनाकर साझा करें।",
      "/stock-ledger": "स्टॉक आने, बिक्री, वापसी और बदलाव का हिसाब देखें।",
    },
  },
};

export function WorkspaceGuide({ collapsible = false }: { collapsible?: boolean }) {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(!collapsible);
  const [language, setLanguage] = useState<Language>("hinglish");
  const [expanded, setExpanded] = useState<string | null>(null);
  const text = copy[language];
  return (
    <section className="border-t pt-5">
      <Button variant="ghost" className="w-full justify-between px-0 text-left text-lg font-semibold" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {text.heading} {open ? <ChevronDown /> : <ChevronRight />}
      </Button>
      {open && <div className="mt-3 space-y-4">
        <p className="text-sm text-muted-foreground">{text.note}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Guide language">
          {(["hinglish", "english", "hindi"] as const).map((lang) => <Button key={lang} size="sm" variant={language === lang ? "default" : "outline"} onClick={() => setLanguage(lang)} aria-pressed={language === lang}>{lang === "hindi" ? "हिन्दी" : lang === "english" ? "English" : "Hinglish"}</Button>)}
        </div>
        <div className="divide-y border-y">
          {MODULES.filter((m) => !m.ownerOnly || isOwner).map((module) => <div key={module.to}>
            <Button variant="ghost" className="h-auto min-h-12 w-full justify-start whitespace-normal py-3 text-left" onClick={() => setExpanded(expanded === module.to ? null : module.to)} aria-expanded={expanded === module.to}>
              <module.icon /> <span className="flex-1">{module.label}</span> {expanded === module.to ? <ChevronDown /> : <ChevronRight />}
            </Button>
            {expanded === module.to && <p className="pb-4 pl-9 pr-3 text-sm leading-relaxed text-muted-foreground">{text.entries[module.to]}</p>}
          </div>)}
        </div>
      </div>}
    </section>
  );
}
