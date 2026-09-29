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
      "/dashboard": "Sales aur target: aaj ka business aur progress dekho.\nStock alerts: low aur slow-moving items pe nazar rakho.\nTrends: payment, category aur recent bills ki summary dekho; live clock se counter time milta hai.",
      "/pos": "Article naam/barcode search ya phone se scan karo; size chuno aur cart mein quantity badlo.\nCustomer mobile se lookup karo ya naya add karo; walk-in bhi allowed hai.\nDiscount, coupon, reward aur GST/payment mode set karke bill complete karo; udhaar ke liye customer zaroori hai.\nHold se adhoora cart isi device par rakho. Bill ke baad print, WhatsApp ya SMS se share karo. Quick add se naya article turant banao.",
      "/products": "Search se brand/article dhundo; har article card ke andar sizes aur stock dikhte hain. Article pe tap karke profile, rack, purchases aur movements dekho.\nQuick add se size-wise naya maal aur photo jodo. Owner CSV export/import kar sakta hai; purchase cost sirf owner ko dikhegi.",
      "/purchase": "Supplier chuno, invoice aur article/size jodo; naya article ho to Quick add karo.\nHar line ka quantity, purchase cost aur GST check karke receive karo. Stock aur purchase record saath update hote hain.",
      "/sales": "Bill number/customer se purani sale dhundo. Bill kholkar print ya WhatsApp par share karo.\nReturn/exchange mein item aur quantity chuno; damaged return ko alag record karo. Credit wale bill ka due yahin track hota hai.",
      "/suppliers": "Supplier jodo aur uske naam par tap karke contact, kharid aur payment history dekho.\nOwner pending amount ke liye payment record kar sakta hai.",
      "/customers": "Mobile/name se customer dhundo; profile mein bills, regular/premium stamps aur rewards dekho.\nNaya customer banao; owner premium status aur loyalty adjustment sambhal sakta hai.",
      "/coupons": "Owner flat ya percent coupon bana sakta hai; minimum bill, expiry, use limit aur particular customer optional hain.\nCustomer mobile lookup karke coupon save karo; WhatsApp draft kholkar bhejo. POS mein code Apply karo—ek customer same coupon dobara use nahi kar sakta.\nLoyalty tab mein earned rewards dekho.",
      "/inventory-control": "Low stock, damaged aur 60-day dead stock tabs se problem articles dekho.\nAdjust stock tab mein article search karo; uske andar har size ka stock, minimum aur rack sudharo. Damaged stock clear karne se pehle physical return/write-off confirm karo.",
      "/reports": "Date aur sales reports se revenue, best sellers aur size/category performance samjho.\nFilters badal kar alag period compare karo; report figures recorded bills par based hain.",
      "/accounting": "GST aur sales summary mein tax aur net amount dekho. Expenses add karke cash flow aur profit check karo.\nCredit collection aur supplier payments ko bhi reconcile karo; missing purani cost ho to profit estimate incomplete ho sakta hai.",
      "/barcodes": "Article aur size select karke Code 128 + QR label preview dekho.\nA4 sheet ya label-roll format chuno aur print karo; dono codes same size ko POS mein kholte hain.",
      "/settings": "Store details, phone/GSTIN, daily target aur bill footer save karo. Thermal/A4/Premium aur roll width default set karo.\nTeam mein Owner/Staff access badlo; kam se kam ek Owner hamesha rahega. Theme chuno.\nData export/import karo; reset sirf full backup aur exact confirmation ke baad use karo—yeh saara shop data mita deta hai.",
      "/community": "Naye maal ke liye date range chuno; article se message/poster banao. Light/dark poster preview, download ya print karo.\nMessage copy ya WhatsApp draft kholo; bhejne se pehle khud check karke Send dabao.",
      "/stock-ledger": "Stock-in, sale, return aur manual adjustment ka time, quantity aur note dekho.\nKisi mismatch ka source trace karne ke liye latest movements check karo.",
      "/guide": "Is guide ko kabhi bhi kholkar apni language mein kaam samjho.",
    },
  },
  english: {
    heading: "Workspace guide", note: "Open it whenever you need it. Nothing here is mandatory.",
    entries: {
      "/dashboard": "Sales and target: track today's progress.\nStock alerts: watch low and slow-moving items.\nTrends: scan payment mix, categories and recent bills alongside the live clock.",
      "/pos": "Search by article or barcode, or use the phone scanner; select a size and adjust quantity.\nFind or add a customer, or use walk-in. Set discounts, coupon, reward, tax and payment type before completing the bill; credit requires a customer.\nHold a cart on this device, or print and share a finished bill by WhatsApp or SMS. Quick add creates an article here.",
      "/products": "Search by brand or article. Each article shows all its sizes and stock. Tap its name to view its photo, rack, purchases and movements.\nQuick add creates products and sizes; add a photo. Owners can import/export CSV and see purchase cost.",
      "/purchase": "Select a supplier and invoice, then add articles and sizes. Use Quick add for a new article.\nCheck each quantity, purchase cost and tax before receiving; inventory and purchase history update together.",
      "/sales": "Search old bills by customer or bill number, then reprint or share.\nChoose an item and quantity for a return or exchange; mark damage where relevant. Track outstanding credit on the bill.",
      "/suppliers": "Add suppliers and tap a name for contact, purchase and payment history.\nOwners can record payments toward outstanding purchases.",
      "/customers": "Search by mobile or name to view bills, regular/premium stamps and rewards.\nAdd customers; owners can manage premium status and loyalty adjustments.",
      "/coupons": "Owners can create flat or percentage codes with optional minimum, expiry, limit and customer restriction.\nLook up a customer's mobile, save, then open the WhatsApp message draft. Apply the code in POS; a customer cannot redeem the same coupon twice.\nReview earned benefits under Loyalty rewards.",
      "/inventory-control": "Use Low, Damaged and Dead 60d tabs to find problem articles.\nIn Adjust stock, search for an article and update each size's count, minimum and rack. Only clear damaged stock after handling it physically.",
      "/reports": "Use date filters to review revenue and top articles, sizes and categories.\nCompare periods using the recorded sales reports.",
      "/accounting": "Review tax and net sales, record expenses and reconcile profit and cash flow.\nInclude credit collections and supplier repayments; profit can be incomplete for historic items with missing costs.",
      "/barcodes": "Pick articles and sizes to preview Code 128 and QR labels.\nPrint on an A4 sheet or label roll; both codes identify the same size at checkout.",
      "/settings": "Save shop details, GSTIN, target and bill footer. Set the default Thermal/A4/Premium bill and roll width.\nChange team roles and appearance; at least one owner remains.\nExport or import data. Reset erases shop records and requires a complete backup plus exact confirmation.",
      "/community": "Choose a recent-stock period and article, then create a message or poster. Preview, download or print the light/dark poster.\nCopy the message or open its WhatsApp draft; review it before tapping Send.",
      "/stock-ledger": "See time, quantity and notes for receipts, sales, returns and adjustments.\nTrace recent movements when a stock count looks wrong.",
      "/guide": "Return to this guide anytime in your preferred language.",
    },
  },
  hindi: {
    heading: "काम की जानकारी", note: "ज़रूरत पड़ने पर कभी भी देखें। कोई चरण अनिवार्य नहीं है।",
    entries: {
      "/dashboard": "आज की बिक्री और लक्ष्य की प्रगति देखें।\nकम और धीमे बिकने वाले स्टॉक की सूचना देखें।\nभुगतान, श्रेणी, हाल के बिल और लाइव घड़ी की जानकारी पाएँ।",
      "/pos": "नाम या बारकोड से सामान खोजें या फ़ोन से स्कैन करें; साइज़ और मात्रा चुनें।\nग्राहक खोजें/जोड़ें या बिना ग्राहक के बिल बनाएँ। छूट, कूपन, इनाम, टैक्स और भुगतान चुनें; उधार के लिए ग्राहक ज़रूरी है।\nअधूरा बिल इस फ़ोन पर रोकें; पूरे बिल को छापें या व्हाट्सऐप/एसएमएस से भेजें। नया सामान तुरंत जोड़ सकते हैं।",
      "/products": "ब्रांड या सामान खोजें; हर सामान के नीचे उसके सभी साइज़ और स्टॉक देखें। नाम पर दबाकर फ़ोटो, रैक, खरीद और स्टॉक बदलाव देखें।\nनया सामान/फ़ोटो जोड़ें; मालिक CSV आयात/निर्यात और खरीद मूल्य देख सकता है।",
      "/purchase": "सप्लायर और इनवॉइस चुनें, फिर सामान और साइज़ जोड़ें। नया सामान तुरंत बना सकते हैं।\nमात्रा, खरीद मूल्य और जीएसटी जाँचकर माल दर्ज करें; स्टॉक साथ में बढ़ता है।",
      "/sales": "बिल नंबर या ग्राहक से पुराना बिल खोजें, दोबारा छापें या भेजें।\nवापसी/बदलाव के लिए सामान और मात्रा चुनें; खराब माल अलग दर्ज करें। उधार का बकाया देखें।",
      "/suppliers": "सप्लायर जोड़ें और नाम दबाकर संपर्क, खरीद व भुगतान का इतिहास देखें।\nमालिक बकाया खरीद का भुगतान दर्ज कर सकता है।",
      "/customers": "नाम/मोबाइल से ग्राहक खोजें और बिल, स्टैम्प व इनाम देखें।\nनया ग्राहक जोड़ें; मालिक प्रीमियम दर्जा और लॉयल्टी सुधार सकता है।",
      "/coupons": "मालिक रुपये या प्रतिशत का कूपन बनाए; न्यूनतम बिल, आख़िरी तारीख़, सीमा और ग्राहक की शर्त वैकल्पिक हैं।\nमोबाइल से ग्राहक चुनें, कूपन बनाएँ और व्हाट्सऐप संदेश तैयार करें। बिलिंग में कोड लगाएँ; एक ग्राहक वही कूपन दोबारा नहीं लगा सकता।\nलॉयल्टी इनाम अलग टैब में देखें।",
      "/inventory-control": "कम, खराब और 60 दिन से नहीं बिके स्टॉक के टैब देखें।\nस्टॉक सुधार में सामान खोजें; उसके भीतर हर साइज़ की गिनती, न्यूनतम सीमा और रैक बदलें। खराब स्टॉक केवल वास्तविक वापसी/निपटान के बाद हटाएँ।",
      "/reports": "तारीख़ बदलकर बिक्री, लोकप्रिय सामान, साइज़ और श्रेणियों की रिपोर्ट देखें।\nअलग समय की दर्ज बिक्री की तुलना करें।",
      "/accounting": "जीएसटी और बिक्री देखें, खर्च दर्ज करें, लाभ और नकदी का मिलान करें।\nउधार व सप्लायर भुगतान शामिल करें; पुराने सामान की लागत न हो तो लाभ अधूरा हो सकता है।",
      "/barcodes": "सामान और साइज़ चुनकर बारकोड तथा क्यूआर लेबल देखें।\nA4 शीट या रोल पर छापें; दोनों कोड बिलिंग में उसी साइज़ को पहचानते हैं।",
      "/settings": "दुकान की जानकारी, जीएसटी नंबर, लक्ष्य और बिल पर संदेश सहेजें। बिल का डिफ़ॉल्ट आकार और रोल की चौड़ाई चुनें।\nटीम की भूमिकाएँ और रंग-रूप बदलें; कम से कम एक मालिक रहेगा।\nडेटा का बैकअप लें या आयात करें; रीसेट दुकान का रिकॉर्ड मिटाता है और पूरा बैकअप व सही पुष्टि माँगता है।",
      "/community": "नए स्टॉक की अवधि और सामान चुनकर संदेश या पोस्टर बनाएँ। हल्के/गहरे पोस्टर को देखें, डाउनलोड या छापें।\nसंदेश कॉपी करें या व्हाट्सऐप मसौदा खोलें; भेजने से पहले जाँच लें।",
      "/stock-ledger": "माल आने, बिक्री, वापसी और सुधार का समय, मात्रा व नोट देखें।\nस्टॉक में अंतर मिले तो हाल की प्रविष्टियाँ जाँचें।",
      "/guide": "अपनी भाषा में जानकारी के लिए यह गाइड कभी भी खोलें।",
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
            {expanded === module.to && <p className="whitespace-pre-line pb-4 pl-9 pr-3 text-sm leading-relaxed text-muted-foreground">{text.entries[module.to]}</p>}
          </div>)}
        </div>
      </div>}
    </section>
  );
}
