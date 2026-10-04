// Free, offline message translation: every line the app writes in outgoing messages
// is matched against a known template and rebuilt in the chosen language.
// Unknown lines (names, custom text) stay as written.
export type MsgLang = "english" | "hindi" | "hinglish";
type T = (m: RegExpMatchArray) => string;
type Rule = [RegExp, T, T, T]; // [pattern, english, hindi, hinglish]

const r = (re: RegExp, en: T, hi: T, hg: T): Rule => [re, en, hi, hg];

const RULES: Rule[] = [
  // Greetings
  r(/^(?:Dear|Namaste|Hello) (.+?)( ji)?,$/, (m) => `Dear ${m[1]},`, (m) => `नमस्ते ${m[1]} जी,`, (m) => `Namaste ${m[1]} ji,`),
  r(/^Hello (.+?), greetings from (.+?)\.(.*)$/, (m) => `Hello ${m[1]}, greetings from ${m[2]}.${m[3]}`, (m) => `नमस्ते ${m[1]} जी, ${m[2]} की ओर से शुभकामनाएँ।${m[3].replace("Call / WhatsApp:", "कॉल / WhatsApp:")}`, (m) => `Namaste ${m[1]} ji, ${m[2]} ki taraf se shubhkamnayein.${m[3].replace("Call / WhatsApp:", "Call / WhatsApp:")}`),
  // Bill
  r(/^Thank you for shopping at (.+)\.$/, (m) => `Thank you for shopping at ${m[1]}.`, (m) => `${m[1]} से खरीदारी करने के लिए धन्यवाद।`, (m) => `${m[1]} se shopping karne ke liye dhanyavaad.`),
  r(/^Bill: (.+)$/, (m) => `Bill: ${m[1]}`, (m) => `बिल: ${m[1]}`, (m) => `Bill: ${m[1]}`),
  r(/^Total: (.+)$/, (m) => `Total: ${m[1]}`, (m) => `कुल: ${m[1]}`, (m) => `Total: ${m[1]}`),
  r(/^Paid: (.+)$/, (m) => `Paid: ${m[1]}`, (m) => `जमा: ${m[1]}`, (m) => `Jama: ${m[1]}`),
  r(/^Balance due: (.+)$/, (m) => `Balance due: ${m[1]}`, (m) => `बाकी: ${m[1]}`, (m) => `Baaki: ${m[1]}`),
  r(/^Your loyalty stamp has been added\.$/, () => "Your loyalty stamp has been added.", () => "आपका लॉयल्टी स्टैम्प जोड़ दिया गया है।", () => "Aapka loyalty stamp jud gaya hai."),
  r(/^Reward unlocked: (.+) on your next bill\.$/, (m) => `Reward unlocked: ${m[1]} on your next bill.`, (m) => `इनाम मिला: अगले बिल पर ${m[1].replace(/ off/g, " की छूट")}।`, (m) => `Reward mila: agle bill pe ${m[1].replace(/ off/g, " ki chhoot")}.`),
  r(/^Size exchange is available within 7 days with this bill\.$/, () => "Size exchange is available within 7 days with this bill.", () => "इस बिल के साथ 7 दिनों के अंदर साइज़ बदला जा सकता है।", () => "Is bill ke saath 7 din ke andar size exchange ho sakta hai."),
  r(/^We look forward to serving you again\.$/, () => "We look forward to serving you again.", () => "आपकी दोबारा सेवा का इंतज़ार रहेगा।", () => "Aapki dobara seva ka intezaar rahega."),
  // Due reminders
  r(/^This is a gentle payment reminder from (.+)\.$/, (m) => `This is a gentle payment reminder from ${m[1]}.`, (m) => `${m[1]} की ओर से भुगतान की विनम्र याद।`, (m) => `${m[1]} ki taraf se payment ka chhota sa reminder.`),
  r(/^This is a gentle reminder from (.+)\. Your outstanding balance is (.+)\.$/, (m) => `This is a gentle reminder from ${m[1]}. Your outstanding balance is ${m[2]}.`, (m) => `${m[1]} की ओर से विनम्र याद। आपका बकाया ${m[2]} है।`, (m) => `${m[1]} ki taraf se reminder. Aapka baaki ${m[2]} hai.`),
  r(/^Outstanding balance: (.+)$/, (m) => `Outstanding balance: ${m[1]}`, (m) => `बकाया राशि: ${m[1]}`, (m) => `Baaki raashi: ${m[1]}`),
  r(/^Please ignore this message if (?:payment has already been made|already paid)\. Thank you\.$/, () => "Please ignore this message if payment has already been made. Thank you.", () => "यदि भुगतान हो चुका है तो कृपया इस संदेश को अनदेखा करें। धन्यवाद।", () => "Agar payment ho chuka hai to is message ko ignore karein. Dhanyavaad."),
  r(/^Call: (.+)$/, (m) => `Call: ${m[1]}`, (m) => `कॉल: ${m[1]}`, (m) => `Call: ${m[1]}`),
  // New arrival
  r(/^\*(.+) \| New in store\*$/, (m) => `*${m[1]} | New in store*`, (m) => `*${m[1]} | नया स्टॉक आया है*`, (m) => `*${m[1]} | Naya stock aaya hai*`),
  r(/^Colour: (.+)$/, (m) => `Colour: ${m[1]}`, (m) => `रंग: ${m[1]}`, (m) => `Colour: ${m[1]}`),
  r(/^Price: (.+)$/, (m) => `Price: ${m[1]}`, (m) => `कीमत: ${m[1]}`, (m) => `Rate: ${m[1]}`),
  r(/^Available sizes: (.+)$/, (m) => `Available sizes: ${m[1]}`, (m) => `उपलब्ध साइज़: ${m[1]}`, (m) => `Available size: ${m[1]}`),
  r(/^Interested\? Reply with your size and we'll confirm availability\.$/, () => "Interested? Reply with your size and we'll confirm availability.", () => "पसंद आया? अपना साइज़ भेजें, हम उपलब्धता बता देंगे।", () => "Pasand aaya? Apna size bhejo, hum availability bata denge."),
  r(/^Call \/ WhatsApp: (.+)$/, (m) => `Call / WhatsApp: ${m[1]}`, (m) => `कॉल / WhatsApp: ${m[1]}`, (m) => `Call / WhatsApp: ${m[1]}`),
  r(/^Visit us in store to try your pair\.$/, () => "Visit us in store to try your pair.", () => "अपनी जोड़ी पहनकर देखने के लिए दुकान पर आएँ।", () => "Apni pair try karne dukaan pe zaroor aayein."),
  // Coupons
  r(/^A special offer from (.+) is ready for you\.$/, (m) => `A special offer from ${m[1]} is ready for you.`, (m) => `${m[1]} की ओर से आपके लिए खास ऑफ़र तैयार है।`, (m) => `${m[1]} ki taraf se aapke liye special offer ready hai.`),
  r(/^Your coupon code: (.+)$/, (m) => `Your coupon code: ${m[1]}`, (m) => `आपका कूपन कोड: ${m[1]}`, (m) => `Aapka coupon code: ${m[1]}`),
  r(/^Offer: (.+)$/, (m) => `Offer: ${m[1]}`, (m) => `ऑफ़र: ${m[1]}`, (m) => `Offer: ${m[1]}`),
  r(/^Valid until (.+)\.$/, (m) => `Valid until ${m[1]}.`, (m) => `${m[1]} तक मान्य।`, (m) => `${m[1]} tak valid.`),
  r(/^Share this code with us at billing to redeem your offer\..*$/, () => "Share this code with us at billing to redeem your offer. Valid once per customer, subject to availability and offer terms.", () => "ऑफ़र पाने के लिए बिलिंग के समय यह कोड बताएँ। प्रति ग्राहक एक बार मान्य, शर्तें लागू।", () => "Offer lene ke liye billing ke time ye code batayein. Har customer ke liye ek baar valid, sharten laagu."),
  r(/^Warm regards,$/, () => "Warm regards,", () => "सादर,", () => "Dhanyavaad,"),
  // Supplier
  r(/^This is (.+)\. Please share your latest footwear rate list \/ catalogue and delivery time\.$/, (m) => `This is ${m[1]}. Please share your latest footwear rate list / catalogue and delivery time.`, (m) => `हम ${m[1]} से बात कर रहे हैं। कृपया अपनी नई रेट लिस्ट / कैटलॉग और डिलीवरी समय भेजें।`, (m) => `Hum ${m[1]} se bol rahe hain. Please apni latest rate list / catalogue aur delivery time bhejein.`),
  r(/^Thank you\.$/, () => "Thank you.", () => "धन्यवाद।", () => "Dhanyavaad."),
  // Khatabook statement
  r(/^\*(.+) — Khata statement\*$/, (m) => `*${m[1]} — Account statement*`, (m) => `*${m[1]} — खाता विवरण*`, (m) => `*${m[1]} — Khata statement*`),
  r(/^Koi entry nahi$/, () => "No entries", () => "कोई एंट्री नहीं", () => "Koi entry nahi"),
  r(/^Aapka baaki: (.+)$/, (m) => `Your balance due: ${m[1]}`, (m) => `आपका बाकी: ${m[1]}`, (m) => `Aapka baaki: ${m[1]}`),
  r(/^Kripya jaldi jama karein\.$/, () => "Kindly clear it at the earliest.", () => "कृपया जल्दी जमा करें।", () => "Kripya jaldi jama karein."),
  r(/^Aapka koi baaki nahi hai\. Dhanyavaad!$/, () => "You have no pending balance. Thank you!", () => "आपका कोई बाकी नहीं है। धन्यवाद!", () => "Aapka koi baaki nahi hai. Dhanyavaad!"),
  r(/^Hamari taraf baaki: (.+)$/, (m) => `Balance payable by us: ${m[1]}`, (m) => `हमारी तरफ़ बाकी: ${m[1]}`, (m) => `Hamari taraf baaki: ${m[1]}`),
];

const IDX: Record<MsgLang, 1 | 2 | 3> = { english: 1, hindi: 2, hinglish: 3 };

export function translateLocal(text: string, lang: MsgLang): string {
  const i = IDX[lang];
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    for (const rule of RULES) {
      const m = trimmed.match(rule[0]);
      if (m) return (rule[i] as T)(m);
    }
    return line;
  }).join("\n");
}
