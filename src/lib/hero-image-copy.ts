import type { AppLanguage } from "./i18n";

type ImageCopy = {
  title: string;
  steps: string[];
  removal: string;
  upload: string;
  requirements: string;
  existing: string;
  chooseProduct: string;
  checkPhoto: string;
  originalSafe: string;
  checking: string;
};

export const HERO_IMAGE_COPY: Record<AppLanguage, ImageCopy> = {
  english: {
    title: "How to prepare a good hero image",
    steps: [
      "Photograph one shoe clearly from the side or a slight angle, in soft daylight. Keep the whole shoe and sole in the frame.",
      "Remove the background in an image editor. Export a transparent PNG/WebP, not a JPG or screenshot.",
      "Aim for around 1200 × 1200 pixels, under 5 MB. Leave a little margin; avoid text, watermarks and large empty areas.",
      "Zoom in and check the laces, sole and edges. A checkerboard printed into the photo is not real transparency.",
      "Check both mobile and desktop previews. Transparency checks cannot guarantee cutout quality or product accuracy.",
    ],
    removal:
      "Background removal is not built in. In an editor such as GIMP, add an alpha channel, select and remove the background, refine the edges, then export PNG. Check the edges manually even after automatic removal.",
    upload: "Transparent product image",
    requirements: "PNG/WebP · Under 5 MB · Uploaded only when you save",
    existing: "Or choose an existing product photo",
    chooseProduct: "Choose a catalog product",
    checkPhoto: "Check and use photo",
    originalSafe: "Must already be transparent. The original product photo is never modified.",
    checking: "Checking transparency…",
  },
  hindi: {
    title: "हीरो के लिए अच्छी तस्वीर कैसे तैयार करें",
    steps: [
      "हल्की दिन की रोशनी में एक जूते की साफ़ तस्वीर बगल से या थोड़े कोण से लें। पूरा जूता और तला तस्वीर में रखें।",
      "तस्वीर संपादक में पृष्ठभूमि हटाएँ। पारदर्शी PNG/WebP में सहेजें, JPG या स्क्रीनशॉट में नहीं।",
      "लगभग 1200 × 1200 पिक्सेल और 5 MB से कम रखें। थोड़ा खाली किनारा छोड़ें; लिखावट, वॉटरमार्क और बहुत अधिक खाली जगह से बचें।",
      "तस्वीर बड़ी करके फीते, तले और किनारों की जाँच करें। तस्वीर में बनी चौखाने वाली पृष्ठभूमि असली पारदर्शिता नहीं है।",
      "मोबाइल और डेस्कटॉप, दोनों का पूर्वावलोकन देखें। पारदर्शिता की जाँच से कटआउट की गुणवत्ता या उत्पाद की सही तस्वीर होने की गारंटी नहीं मिलती।",
    ],
    removal:
      "पृष्ठभूमि हटाने की सुविधा इसमें शामिल नहीं है। GIMP जैसे संपादक में अल्फ़ा चैनल जोड़ें, पृष्ठभूमि चुनकर हटाएँ, किनारे ठीक करें और PNG में सहेजें। अपने-आप पृष्ठभूमि हटाने के बाद भी किनारे जाँचें।",
    upload: "पारदर्शी उत्पाद तस्वीर",
    requirements: "PNG/WebP · 5 MB से कम · सहेजने पर ही अपलोड होगी",
    existing: "या उत्पाद की मौजूदा तस्वीर चुनें",
    chooseProduct: "कैटलॉग से उत्पाद चुनें",
    checkPhoto: "तस्वीर जाँचें और इस्तेमाल करें",
    originalSafe: "तस्वीर पहले से पारदर्शी होनी चाहिए। उत्पाद की मूल तस्वीर नहीं बदलेगी।",
    checking: "पारदर्शिता की जाँच हो रही है…",
  },
  hinglish: {
    title: "Hero ke liye achhi photo kaise banayein",
    steps: [
      "Soft daylight mein ek shoe ki clear side ya angle photo lein. Poora shoe aur sole frame mein rakhein.",
      "Image editor mein background hataayein. Transparent PNG/WebP export karein, JPG ya screenshot nahi.",
      "Lagbhag 1200 × 1200 pixels aur 5 MB se kam rakhein. Thoda margin chhodein; text, watermark aur bahut khaali jagah avoid karein.",
      "Zoom karke laces, sole aur edges check karein. Photo mein bana checkerboard asli transparency nahi hota.",
      "Mobile aur desktop, dono previews dekhein. Transparency check se cutout quality ya product ki sahi photo hone ki guarantee nahi milti.",
    ],
    removal:
      "Background removal ismein built-in nahi hai. GIMP jaise editor mein alpha channel add karein, background select karke hataayein, edges saaf karein aur PNG export karein. Automatic removal ke baad bhi edges khud check karein.",
    upload: "Transparent product photo",
    requirements: "PNG/WebP · 5 MB se kam · Save karne par hi upload hogi",
    existing: "Ya product ki existing photo chunein",
    chooseProduct: "Catalog se product chunein",
    checkPhoto: "Photo check karke use karein",
    originalSafe: "Photo pehle se transparent honi chahiye. Original product photo nahi badlegi.",
    checking: "Transparency check ho rahi hai…",
  },
};

const IMAGE_ERRORS: Record<string, { hindi: string; hinglish: string }> = {
  "Choose a transparent PNG or WebP. JPG does not support transparency.": {
    hindi: "पारदर्शी PNG या WebP चुनें। JPG में पारदर्शिता नहीं होती।",
    hinglish: "Transparent PNG ya WebP chunein. JPG mein transparency nahi hoti.",
  },
  "Choose an image under 5 MB.": {
    hindi: "5 MB से कम की तस्वीर चुनें।",
    hinglish: "5 MB se kam ki photo chunein.",
  },
  "Resize the image to around 1200 × 1200 pixels first.": {
    hindi: "पहले तस्वीर का आकार लगभग 1200 × 1200 पिक्सेल करें।",
    hinglish: "Pehle photo ko lagbhag 1200 × 1200 pixels ka karein.",
  },
  "Image preview is unavailable in this browser.": {
    hindi: "इस ब्राउज़र में तस्वीर का पूर्वावलोकन उपलब्ध नहीं है।",
    hinglish: "Is browser mein photo preview available nahi hai.",
  },
  "Background is not sufficiently transparent. Remove it and export a transparent PNG/WebP first.":
    {
      hindi: "पृष्ठभूमि पर्याप्त पारदर्शी नहीं है। पहले इसे हटाकर पारदर्शी PNG/WebP में सहेजें।",
      hinglish:
        "Background kaafi transparent nahi hai. Pehle use hataakar transparent PNG/WebP export karein.",
    },
  "The product is barely visible. Choose a clear product cutout.": {
    hindi: "उत्पाद ठीक से दिखाई नहीं दे रहा। उत्पाद का साफ़ कटआउट चुनें।",
    hinglish: "Product saaf nahi dikh raha. Clear product cutout chunein.",
  },
  "Could not prepare an image under 5 MB. Resize it and try again.": {
    hindi: "तस्वीर 5 MB से कम नहीं बन पाई। आकार घटाकर फिर कोशिश करें।",
    hinglish: "Photo 5 MB se kam nahi ban paayi. Size ghataakar phir try karein.",
  },
  "Could not read this image.": {
    hindi: "यह तस्वीर पढ़ी नहीं जा सकी। दूसरी PNG/WebP चुनें।",
    hinglish: "Yeh photo read nahi ho paayi. Doosri PNG/WebP chunein.",
  },
  "Could not read this product photo. Upload a transparent PNG/WebP instead.": {
    hindi: "उत्पाद की यह तस्वीर पढ़ी नहीं जा सकी। पारदर्शी PNG/WebP अपलोड करें।",
    hinglish: "Product ki yeh photo read nahi ho paayi. Transparent PNG/WebP upload karein.",
  },
  "Choose a valid transparent product image before enabling the hero.": {
    hindi: "हीरो चालू करने से पहले उत्पाद की सही पारदर्शी तस्वीर चुनें।",
    hinglish: "Hero ON karne se pehle valid transparent product photo chunein.",
  },
};

export function heroImageError(message: string, lang: AppLanguage) {
  return lang === "english" ? message : (IMAGE_ERRORS[message]?.[lang] ?? message);
}
