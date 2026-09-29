import { useCallback, useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copy, type Language } from "@/lib/guide-data";
import { guideTargets } from "@/lib/guide-targets";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/use-auth";

type TourState = { path: string; language: Language; index: number };
const labels = {
  hinglish: { guide: "Guide", next: "Aage", back: "Peechhe", finish: "Ho gaya", skip: "Band karo", step: "Step" },
  english: { guide: "Guide", next: "Next", back: "Back", finish: "Done", skip: "Close", step: "Step" },
  hindi: { guide: "गाइड", next: "आगे", back: "पीछे", finish: "समाप्त", skip: "बंद करें", step: "चरण" },
};

function getTarget(path: string, index: number) {
  const selector = guideTargets[path]?.[index];
  if (!selector) return null;
  if (selector.startsWith("text:")) {
    const text = selector.slice(5);
    const nodes = Array.from(document.querySelectorAll("main button, main h1, main h2, main h3"));
    return nodes.find((node) => node.textContent?.trim().includes(text)) as HTMLElement | undefined ?? null;
  }
  return document.querySelector<HTMLElement>(selector);
}

export function GuidedTour() {
  const { pathname } = useLocation();
  const { isOwner } = useAuth();
  const module = MODULES.find((item) => item.to === pathname);
  const allowed = module && (!module.ownerOnly || isOwner) && pathname !== "/guide";
  const [tour, setTour] = useState<TourState | null>(null);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [language, setLanguage] = useState<Language>("hinglish");

  useEffect(() => {
    setTour((current) => current?.path === pathname ? current : null);
    setTarget(null);
  }, [pathname]);

  useEffect(() => {
    const request = sessionStorage.getItem("solestack-guide-request");
    if (!request) return;
    sessionStorage.removeItem("solestack-guide-request");
    try {
      const parsed = JSON.parse(request) as { path: string; language: Language };
      if (parsed.path === pathname && guideTargets[pathname] && (!module?.ownerOnly || isOwner)) {
        const lang = parsed.language in copy ? parsed.language : "hinglish";
        setLanguage(lang);
        setTour({ path: pathname, language: lang, index: 0 });
      }
    } catch { /* Ignore an outdated guide request. */ }
  }, [pathname, isOwner, module?.ownerOnly]);

  useEffect(() => {
    const startHere = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; language: Language }>).detail;
      if (detail?.path === pathname && (!module?.ownerOnly || isOwner)) {
        setLanguage(detail.language);
        setTour({ ...detail, index: 0 });
      }
    };
    window.addEventListener("solestack-guide-start", startHere);
    return () => window.removeEventListener("solestack-guide-start", startHere);
  }, [pathname, isOwner, module?.ownerOnly]);

  const steps = tour ? copy[tour.language].entries[tour.path]?.split("\n") ?? [] : [];
  const locate = useCallback(() => {
    if (!tour) return;
    const node = getTarget(tour.path, tour.index) ?? document.querySelector<HTMLElement>("main h1");
    if (node && node.getBoundingClientRect().width > 0) {
      setTarget(node.getBoundingClientRect());
    } else {
      setTarget(null);
    }
  }, [tour]);

  useEffect(() => {
    if (!tour) return;
    setTarget(null);
    let timer: ReturnType<typeof setTimeout>;
    const node = getTarget(tour.path, tour.index) ?? document.querySelector<HTMLElement>("main h1");
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    timer = setTimeout(locate, 300);
    window.addEventListener("scroll", locate, true);
    window.addEventListener("resize", locate);
    return () => { clearTimeout(timer); window.removeEventListener("scroll", locate, true); window.removeEventListener("resize", locate); };
  }, [tour, locate]);

  if (!allowed) return null;
  const t = labels[tour?.language ?? language];
  return <>
    {!tour && <Button type="button" variant="secondary" size="icon" className="fixed bottom-5 right-5 z-30 size-11 rounded-full border shadow-lg" aria-label={`${module.label} ${t.guide}`} title={`${module.label} ${t.guide}`} onClick={() => setTour({ path: pathname, language, index: 0 })}><BookOpen className="size-5" /></Button>}
    {tour && <>
      {target ? <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
        <div className="absolute left-0 right-0 top-0 bg-foreground/55" style={{ height: Math.max(0, target.top - 5) }} />
        <div className="absolute left-0 right-0 bottom-0 bg-foreground/55" style={{ top: target.bottom + 5 }} />
        <div className="absolute left-0 bg-foreground/55" style={{ top: Math.max(0, target.top - 5), height: target.height + 10, width: Math.max(0, target.left - 5) }} />
        <div className="absolute right-0 bg-foreground/55" style={{ top: Math.max(0, target.top - 5), height: target.height + 10, left: target.right + 5 }} />
      </div> : <div className="pointer-events-none fixed inset-0 z-40 bg-foreground/50" aria-hidden="true" />}
      {target && <div className="pointer-events-none fixed z-50 rounded border-2 border-primary" aria-hidden="true" style={{ top: Math.max(0, target.top - 5), left: Math.max(0, target.left - 5), width: target.width + 10, height: target.height + 10 }} />}
      <div role="dialog" aria-modal="true" aria-label={`${module.label} ${t.guide}`} className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md rounded-md border bg-card p-4 text-card-foreground shadow-xl sm:bottom-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{module.label} <span className="font-normal text-muted-foreground">· {t.step} {tour.index + 1}/{steps.length}</span></p>
          <Button type="button" size="icon" variant="ghost" aria-label={t.skip} onClick={() => setTour(null)}><X className="size-4" /></Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{steps[tour.index]}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-label="Guide language">{(["hinglish", "english", "hindi"] as const).map((lang) => <Button key={lang} type="button" variant={tour.language === lang ? "default" : "ghost"} size="sm" aria-pressed={tour.language === lang} onClick={() => { setLanguage(lang); setTour({ ...tour, language: lang }); }}>{lang === "hindi" ? "हिंदी" : lang === "english" ? "EN" : "Hinglish"}</Button>)}</div>
          <div className="flex gap-1">
            {tour.index > 0 && <Button type="button" variant="outline" size="icon" aria-label={t.back} onClick={() => setTour({ ...tour, index: tour.index - 1 })}><ChevronLeft className="size-4" /></Button>}
            <Button type="button" size="sm" onClick={() => tour.index + 1 < steps.length ? setTour({ ...tour, index: tour.index + 1 }) : setTour(null)}>{tour.index + 1 < steps.length ? t.next : t.finish}{tour.index + 1 < steps.length && <ChevronRight className="size-4" />}</Button>
          </div>
        </div>
      </div>
    </>}
  </>;
}