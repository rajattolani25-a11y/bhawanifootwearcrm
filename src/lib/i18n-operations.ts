/** Offline copy for the verified stock/payment workflows. */
export const OPERATIONS: Record<string, { hindi: string; hinglish: string }> = {
  "Owner review": { hindi: "मालिक द्वारा जाँच", hinglish: "Owner review" },
  "Historical payment method needs owner review": {
    hindi: "पुराने भुगतान का माध्यम मालिक को जाँचना है",
    hinglish: "Purani payment ka method owner ko check karna hai",
  },
  "Original opening balance before recorded repayments": {
    hindi: "रिकॉर्ड किए गए भुगतानों से पहले की मूल शुरुआती बकाया राशि",
    hinglish: "Recorded repayments se pehle ka original opening balance",
  },
  "Opening balance remaining:": {
    hindi: "शुरुआती बकाया में से बाकी:",
    hinglish: "Opening balance mein se baaki:",
  },
  "Opening balance remaining (included above):": {
    hindi: "शुरुआती बकाया में से बाकी (ऊपर शामिल):",
    hinglish: "Opening balance mein se baaki (upar included):",
  },
  "Stock changed. Reload inventory before saving.": {
    hindi: "स्टॉक बदल गया है। सेव करने से पहले इन्वेंटरी दोबारा खोलें।",
    hinglish: "Stock badal gaya hai. Save se pehle inventory reload karein.",
  },
  "Return to supplier": { hindi: "सप्लायर को वापस भेजें", hinglish: "Supplier ko wapas bhejein" },
  "Write off damaged": {
    hindi: "खराब माल राइट ऑफ करें",
    hinglish: "Damaged maal write off karein",
  },
  "Stock adjustment reason": { hindi: "स्टॉक बदलने का कारण", hinglish: "Stock badalne ka reason" },
  "Reason for damaged stock disposition (no supplier credit is created)": {
    hindi: "खराब माल हटाने का कारण (सप्लायर क्रेडिट अपने आप नहीं बनेगा)",
    hinglish: "Damaged maal hatane ka reason (supplier credit apne aap nahi banega)",
  },
  "Loading inventory…": {
    hindi: "इन्वेंटरी लोड हो रही है…",
    hinglish: "Inventory load ho rahi hai…",
  },
  "Inventory could not be loaded.": {
    hindi: "इन्वेंटरी लोड नहीं हो सकी।",
    hinglish: "Inventory load nahi ho saki.",
  },
  "Purchase data could not be loaded.": {
    hindi: "खरीद की जानकारी लोड नहीं हो सकी।",
    hinglish: "Purchase data load nahi ho saka.",
  },
  "Purchase history": { hindi: "खरीद का इतिहास", hinglish: "Purchase history" },
  "Refresh cart prices": {
    hindi: "कार्ट की कीमतें अपडेट करें",
    hinglish: "Cart ki prices update karein",
  },
  "Stock or prices changed.": {
    hindi: "स्टॉक या कीमतें बदल गई हैं।",
    hinglish: "Stock ya prices badal gayi hain.",
  },
  "Enter a valid non-negative amount received": {
    hindi: "प्राप्त भुगतान की सही, शून्य या अधिक राशि लिखें",
    hinglish: "Received amount sahi likhein; negative nahi hona chahiye",
  },
  "Choose Cash, UPI or Card for partial payment; Credit means unpaid": {
    hindi: "आंशिक भुगतान के लिए Cash, UPI या Card चुनें; Credit का मतलब बिना भुगतान है",
    hinglish: "Partial payment ke liye Cash, UPI ya Card chunein; Credit ka matlab unpaid hai",
  },
  "Credit = unpaid · choose Cash/UPI for partial payment": {
    hindi: "Credit = बिना भुगतान · आंशिक भुगतान के लिए Cash/UPI चुनें",
    hinglish: "Credit = unpaid · partial payment ke liye Cash/UPI chunein",
  },
  "Cancelled — refund pending": {
    hindi: "ऑर्डर रद्द — रिफंड बाकी",
    hinglish: "Order cancel — refund baaki",
  },
  "Refund sent (recorded)": {
    hindi: "रिफंड भेजना रिकॉर्ड किया गया",
    hinglish: "Refund bhejna record hua",
  },
  "Verify original payment receipt": {
    hindi: "मूल भुगतान की रसीद सत्यापित करें",
    hinglish: "Original payment receipt verify karein",
  },
  "Record completed refund": {
    hindi: "भेजा गया रिफंड रिकॉर्ड करें",
    hinglish: "Bheja hua refund record karein",
  },
  "Send the refund using your bank/payment app first. This form records it; it does not transfer money.":
    {
      hindi:
        "पहले अपने बैंक या पेमेंट ऐप से रिफंड भेजें। यह फ़ॉर्म केवल रिकॉर्ड करता है, पैसे ट्रांसफर नहीं करता।",
      hinglish:
        "Pehle bank/payment app se refund bhejein. Yeh form sirf record karta hai, paise transfer nahi karta.",
    },
  "Refund method": { hindi: "रिफंड का माध्यम", hinglish: "Refund ka method" },
  "Payment reference / receipt note": {
    hindi: "भुगतान संदर्भ / रसीद नोट",
    hinglish: "Payment reference / receipt note",
  },
  "I have sent the refund and verified the amount.": {
    hindi: "मैंने रिफंड भेज दिया है और राशि जाँच ली है।",
    hinglish: "Maine refund bhej diya hai aur amount verify kar liya hai.",
  },
  "Record refund": { hindi: "रिफंड रिकॉर्ड करें", hinglish: "Refund record karein" },
  "Refund recorded": { hindi: "रिफंड रिकॉर्ड हो गया", hinglish: "Refund record ho gaya" },
  "WhatsApp update": { hindi: "WhatsApp अपडेट", hinglish: "WhatsApp update" },
  "Cancellation reason (refund is recorded separately)": {
    hindi: "रद्द करने का कारण (रिफंड अलग से रिकॉर्ड होगा)",
    hinglish: "Cancel karne ka reason (refund alag record hoga)",
  },
  "Refund is pending. Send it outside the app, then record the payment reference.": {
    hindi: "रिफंड बाकी है। ऐप के बाहर भेजकर भुगतान संदर्भ रिकॉर्ड करें।",
    hinglish: "Refund baaki hai. App ke bahar bhejkar payment reference record karein.",
  },
  "Bill total (including delivery)": {
    hindi: "बिल का कुल (डिलीवरी सहित)",
    hinglish: "Bill total (delivery ke saath)",
  },
  "Delivery charge": { hindi: "डिलीवरी शुल्क", hinglish: "Delivery charge" },
  "Saved transaction awaiting confirmation": {
    hindi: "सेव किए गए लेनदेन की पुष्टि बाकी है",
    hinglish: "Saved transaction ki confirmation baaki hai",
  },
  "A transaction response was not confirmed. Retry the saved request to recover its result safely.":
    {
      hindi:
        "लेनदेन का जवाब नहीं मिला। सुरक्षित रूप से परिणाम पाने के लिए सेव किया गया अनुरोध दोबारा भेजें।",
      hinglish:
        "Transaction ka response confirm nahi hua. Result safely paane ke liye saved request retry karein.",
    },
  "A previous cashier has an unresolved transaction": {
    hindi: "पिछले कैशियर का एक लेनदेन अनिश्चित है",
    hinglish: "Pichhle cashier ka transaction unresolved hai",
  },
  "Retry saved request": {
    hindi: "सेव किया गया अनुरोध दोबारा भेजें",
    hinglish: "Saved request retry karein",
  },
  "Saved transaction confirmed. Check its history before making another entry.": {
    hindi: "सेव किए गए लेनदेन की पुष्टि हो गई। नई एंट्री से पहले इतिहास जाँचें।",
    hinglish: "Saved transaction confirm ho gaya. Nayi entry se pehle history check karein.",
  },
  "Pending requests could not be read. Check transaction history before proceeding.": {
    hindi: "अधूरे अनुरोध पढ़े नहीं जा सके। आगे बढ़ने से पहले लेनदेन इतिहास जाँचें।",
    hinglish:
      "Pending requests read nahi ho sakin. Aage badhne se pehle transaction history check karein.",
  },
  "An earlier order response was not confirmed. Recover it before placing another order.": {
    hindi: "पिछले ऑर्डर का जवाब नहीं मिला। नया ऑर्डर करने से पहले उसका परिणाम प्राप्त करें।",
    hinglish:
      "Pichhle order ka response confirm nahi hua. Naya order karne se pehle usse recover karein.",
  },
  "Recover saved order": {
    hindi: "सेव किए गए ऑर्डर का परिणाम पाएँ",
    hinglish: "Saved order recover karein",
  },
  "The order response was interrupted. Recover the original request to avoid booking the pair twice.":
    {
      hindi:
        "ऑर्डर का जवाब बीच में रुक गया। जोड़ी दो बार बुक होने से बचाने के लिए मूल अनुरोध का परिणाम पाएँ।",
      hinglish:
        "Order ka response ruk gaya. Pair do baar book na ho, isliye original request recover karein.",
    },
  "Default invoice": { hindi: "डिफॉल्ट बिल प्रकार", hinglish: "Default invoice" },
  "Cash Memo (no GST)": { hindi: "कैश मेमो (बिना GST)", hinglish: "Cash Memo (bina GST)" },
  "GST rate": { hindi: "GST दर", hinglish: "GST rate" },
  "Tax pricing": { hindi: "कीमत में टैक्स", hinglish: "Price mein tax" },
  "Included in price": { hindi: "कीमत में शामिल", hinglish: "Price mein included" },
  "Add to price": { hindi: "कीमत के ऊपर जोड़ें", hinglish: "Price ke upar add karein" },
  "Unsaved changes — save before leaving this page.": {
    hindi: "बदलाव सेव नहीं हुए — पेज छोड़ने से पहले सेव करें।",
    hinglish: "Changes save nahi hue — page chhodne se pehle save karein.",
  },
  "Cash received against dues / order advances": {
    hindi: "उधार / ऑर्डर एडवांस से मिला नकद",
    hinglish: "Udhar / order advance se mila cash",
  },
  "Historical payment receipt needs owner reconciliation; the original invoice is unchanged.": {
    hindi: "पुराने भुगतान की रसीद का मालिक को मिलान करना है; मूल बिल नहीं बदला गया है।",
    hinglish: "Purani payment receipt owner ko reconcile karni hai; original bill nahi badla hai.",
  },
};
