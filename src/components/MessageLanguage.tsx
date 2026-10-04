import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { translateLocal } from "@/lib/message-templates";

type Lang = "english" | "hindi" | "hinglish";
type Pending = { kind: "wa" | "sms" | "share"; url: string; text: string; title?: string };

/** Asks the message language before every WhatsApp / SMS / share send (free, offline templates). */
export function MessageLanguage() {
  const [p, setP] = useState<Pending | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const busy = null as Lang | null;
  const bypass = useRef(false);

  useEffect(() => {
    const parse = (url: string): Pending | null => {
      try {
        if (url.startsWith("sms:")) { const u = new URL(url); return { kind: "sms", url, text: u.searchParams.get("body") ?? "" }; }
        const u = new URL(url);
        if (u.hostname === "wa.me" || u.hostname === "api.whatsapp.com") return { kind: "wa", url, text: u.searchParams.get("text") ?? "" };
      } catch { /* not a message link */ }
      return null;
    };
    const onClick = (e: MouseEvent) => {
      if (bypass.current) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const x = a && parse(a.href);
      if (x?.text) { e.preventDefault(); e.stopPropagation(); setOut(null); setP(x); }
    };
    const origOpen = window.open;
    window.open = function (url?: string | URL, ...rest: unknown[]) {
      const x = !bypass.current && url ? parse(String(url)) : null;
      if (x?.text) { setOut(null); setP(x); return null; }
      return origOpen.call(window, url, ...(rest as [string?, string?]));
    } as typeof window.open;
    const onShare = (e: Event) => { const d = (e as CustomEvent<{ text: string; title: string }>).detail; setOut(null); setP({ kind: "share", url: "", text: d.text, title: d.title }); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("solestack-share", onShare);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("solestack-share", onShare); window.open = origOpen; };
  }, []);

  function pick(lang: Lang) {
    if (!p) return;
    setOut(translateLocal(p.text, lang));
  }

  async function send(text: string) {
    if (!p) return;
    const cur = p; setP(null);
    if (cur.kind === "share") {
      try { if (navigator.share) await navigator.share({ title: cur.title ?? "", text }); else { await navigator.clipboard.writeText(text); toast.success("Message copy ho gaya"); } } catch { /* cancelled */ }
      return;
    }
    let url: string;
    if (cur.kind === "sms") url = cur.url.split("?")[0] + "?body=" + encodeURIComponent(text);
    else { const u = new URL(cur.url); u.searchParams.set("text", text); url = u.toString(); }
    bypass.current = true;
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noreferrer"; document.body.appendChild(a); a.click(); a.remove();
    bypass.current = false;
  }

  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && setP(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Message kis bhasha mein bhejna hai?</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {([["english", "English"], ["hindi", "हिंदी"], ["hinglish", "Hinglish"]] as const).map(([l, label]) => (
            <Button key={l} variant="outline" disabled={!!busy} onClick={() => pick(l)}>{busy === l ? "…" : label}</Button>
          ))}
        </div>
        <textarea data-no-translate className="h-48 w-full rounded-md border bg-background p-2 text-sm" value={out ?? p?.text ?? ""} onChange={(e) => setOut(e.target.value)} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => send(out ?? p?.text ?? "")}>Bhejo</Button>
        </div>
        <p className="text-xs text-muted-foreground">Bhasha chuno, message dekh lo (badal bhi sakte ho), phir Bhejo dabao.</p>
      </DialogContent>
    </Dialog>
  );
}
