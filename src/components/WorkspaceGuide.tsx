import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { copy, type Language } from "@/lib/guide-data";

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
             <Button asChild variant="ghost" className="h-auto min-h-12 w-full justify-start whitespace-normal py-3 text-left">
               <Link to={module.to} onClick={() => { sessionStorage.setItem("solestack-guide-request", JSON.stringify({ path: module.to, language })); }}>
                 <module.icon /> <span className="flex-1">{module.label}</span> <ChevronRight />
               </Link>
             </Button>
          </div>)}
        </div>
      </div>}
    </section>
  );
}
