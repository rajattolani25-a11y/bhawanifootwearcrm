import { ENGLISH } from "./i18n-english";
import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppLanguage = "english" | "hindi" | "hinglish";

const Ctx = createContext<{ lang: AppLanguage; setLang: (l: AppLanguage) => void }>({
  lang: "english",
  setLang: () => {},
});
const KEY = "solestack-language";
// The full dictionary is needed only for Hindi/Hinglish. English legacy
// aliases stay eager so existing screens keep their original English copy.
let translations: typeof import("./i18n-data") | undefined;
let translationRequest: Promise<void> | undefined;
function loadTranslations() {
  if (!translationRequest) {
    translationRequest = import("./i18n-data")
      .then((module) => {
        translations = module;
      })
      .catch((error) => {
        translationRequest = undefined;
        throw error;
      });
  }
  return translationRequest;
}
function phrase(text: string, lang: AppLanguage) {
  return lang === "english"
    ? (ENGLISH[text] ?? text)
    : (translations?.translatePhrase(text, lang) ?? text);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>("english");
  const request = useRef(0);
  const setLang = useCallback((next: AppLanguage) => {
    const id = ++request.current;
    const apply = () => {
      if (id !== request.current) return;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* session-only selection */
      }
      setLangState(next);
    };
    if (next === "english" || translations) apply();
    else
      void loadTranslations()
        .then(apply)
        .catch(() => {
          if (id === request.current) toast.error("Could not load language. Please try again.");
        });
  }, []);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* restricted device storage */
    }
    if (saved === "hindi" || saved === "hinglish" || saved === "english") setLang(saved);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Numeric generation invalidates late language imports after unmount.
      request.current++;
    };
  }, [setLang]);
  useEffect(() => translateDom(lang), [lang]);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  const t = (text: string) => phrase(text, lang);
  return { lang, setLang, t };
}

export function LanguageSelect() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Language")}>
      {(
        [
          ["english", "English"],
          ["hindi", "हिंदी"],
          ["hinglish", "Hinglish"],
        ] as const
      ).map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => setLang(v)}
          aria-pressed={lang === v}
          className={`rounded-md border px-4 py-2 text-sm ${lang === v ? "border-primary bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// Translates every visible text and placeholder on screen, so all pages follow the chosen language.
const origText = new WeakMap<Node, string>();
const shownText = new WeakMap<Node, string>();
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
function lookup(text: string, lang: AppLanguage) {
  const k = text.trim();
  const v = k ? phrase(k, lang) : undefined;
  return v ? text.replace(k, v) : null;
}
function translateText(node: Text, lang: AppLanguage) {
  const p = node.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest("[data-no-translate]")) return;
  const cur = node.nodeValue ?? "";
  if (shownText.get(node) !== cur) origText.set(node, cur); // React wrote new text
  const orig = origText.get(node) ?? cur;
  const next = lookup(orig, lang) ?? orig;
  if (next !== cur) node.nodeValue = next;
  shownText.set(node, next);
}
function translateAttrs(el: Element, lang: AppLanguage) {
  if (el.closest("[data-no-translate]")) return;
  for (const a of ["placeholder", "title", "aria-label"]) {
    const v = el.getAttribute(a);
    if (v === null) continue;
    const key = `data-i18n-${a}`;
    let orig = el.getAttribute(key);
    const shown = el.getAttribute(`${key}-shown`);
    if (orig === null || shown !== v) {
      orig = v;
      el.setAttribute(key, v);
    }
    const next = lookup(orig, lang) ?? orig;
    el.setAttribute(`${key}-shown`, next);
    if (next !== v) el.setAttribute(a, next);
  }
}
function walk(root: Node, lang: AppLanguage) {
  if (root.nodeType === 3) return translateText(root as Text, lang);
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (SKIP.has(el.tagName) || el.closest("[data-no-translate]")) return;
  translateAttrs(el, lang);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (
        node.nodeType === 1 &&
        (SKIP.has((node as Element).tagName) || (node as Element).hasAttribute("data-no-translate"))
      )
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) translateText(n as Text, lang);
    else translateAttrs(n as Element, lang);
  }
}
let observer: MutationObserver | null = null;
function translateDom(lang: AppLanguage) {
  observer?.disconnect();
  document.documentElement.lang = lang === "hindi" ? "hi" : "en";
  walk(document.body, lang);
  observer = new MutationObserver((list) => {
    observer!.disconnect();
    for (const m of list) {
      if (m.type === "characterData") translateText(m.target as Text, lang);
      else if (m.type === "attributes") translateAttrs(m.target as Element, lang);
      else m.addedNodes.forEach((n) => walk(n, lang));
    }
    observer!.observe(document.body, OPTS);
  });
  observer.observe(document.body, OPTS);
  return () => observer?.disconnect();
}
const OPTS: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["placeholder", "title", "aria-label"],
};
