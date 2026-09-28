import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { sizeSort, useStock, type Product } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({ meta: [{ title: "WhatsApp & Posters — SoleStack POS" }, { name: "description", content: "New stock messages for WhatsApp community and status posters." }] }),
  component: Community,
});

const sizesOf = (p: Product) => p.product_variants.filter((v) => v.stock > 0).map((v) => v.size).sort(sizeSort);

function drawPoster(p: Product, shop: string, phone: string, tag: string) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1920;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, "#0b1220"); bg.addColorStop(1, "#1e293b");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = "#d4af37"; g.fillRect(0, 0, 1080, 16); g.fillRect(0, 1904, 1080, 16);
  g.textAlign = "center";
  g.fillStyle = "#fff"; g.font = "bold 64px sans-serif"; g.fillText(shop, 540, 170);
  g.fillStyle = "#10b981"; g.beginPath(); g.roundRect(290, 250, 500, 100, 50); g.fill();
  g.fillStyle = "#fff"; g.font = "bold 52px sans-serif"; g.fillText(tag, 540, 318);
  g.fillStyle = "#d4af37"; g.font = "bold 56px sans-serif"; g.fillText(p.brand.toUpperCase(), 540, 560);
  g.fillStyle = "#fff"; g.font = "bold 110px sans-serif";
  const words = p.article.split(" "); let line = ""; let y = 720;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 950) { g.fillText(line, 540, y); y += 120; line = w; } else line = t; }
  g.fillText(line, 540, y);
  g.fillStyle = "#94a3b8"; g.font = "44px sans-serif"; g.fillText([p.category, p.color].filter(Boolean).join(" · "), 540, y + 90);
  if (Number(p.mrp) > Number(p.selling_price)) { g.fillStyle = "#94a3b8"; g.font = "60px sans-serif"; g.fillText(`MRP ${inr(p.mrp)}`, 540, 1150); g.fillRect(360, 1130, 360, 5); }
  g.fillStyle = "#10b981"; g.font = "bold 170px sans-serif"; g.fillText(inr(p.selling_price), 540, 1330);
  g.fillStyle = "#fff"; g.font = "bold 46px sans-serif"; g.fillText("SIZES AVAILABLE", 540, 1480);
  const sz = sizesOf(p); const w = 110; let x = 540 - (sz.length * (w + 16) - 16) / 2;
  for (const s of sz) { g.fillStyle = "#1f2937"; g.strokeStyle = "#d4af37"; g.lineWidth = 4; g.beginPath(); g.roundRect(x, 1520, w, 110, 20); g.fill(); g.stroke(); g.fillStyle = "#fff"; g.font = "bold 56px sans-serif"; g.fillText(s, x + w / 2, 1596); x += w + 16; }
  g.fillStyle = "#cbd5e1"; g.font = "44px sans-serif"; g.fillText(phone ? `WhatsApp / Call ${phone}` : "Visit the store today", 540, 1780);
  return c;
}

function Community() {
  const { data = [] } = useStock();
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState("NEW ARRIVAL");
  const [q, setQ] = useState("");
  const { data: st } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle()).data });
  const { data: recentIds = new Set<string>() } = useQuery({
    queryKey: ["recent-purchase", days],
    queryFn: async () => {
      const { data } = await supabase.from("stock_movements").select("variant_id").eq("type", "PURCHASE").gte("moved_at", new Date(Date.now() - days * 864e5).toISOString());
      return new Set((data ?? []).map((r) => r.variant_id as string));
    },
  });
  const since = Date.now() - days * 864e5;
  const fresh = data.filter((p) => sizesOf(p).length && (new Date(p.created_at).getTime() > since || p.product_variants.some((v) => recentIds.has(v.id))));
  const s = q.toLowerCase();
  const all = data.filter((p) => sizesOf(p).length && (!s || `${p.brand} ${p.article}`.toLowerCase().includes(s))).slice(0, 30);
  const shop = st?.business_name ?? "Our Store";

  const msg = `✨ *${tag} at ${shop}* ✨\n\n` + fresh.slice(0, 25).map((p) => `👟 *${p.brand} ${p.article}*${p.color ? ` (${p.color})` : ""}\n   ${inr(p.selling_price)} · Sizes ${sizesOf(p).join(", ")}`).join("\n\n") + `\n\n📍 ${st?.business_address ?? ""}\n📞 ${st?.business_phone ?? ""}\nReply with your size to reserve!`;

  function poster(p: Product) {
    const c = drawPoster(p, shop, st?.business_phone ?? "", tag);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${p.brand}-${p.article}-poster.png`;
    a.click();
  }
  async function sharePoster(p: Product) {
    const c = drawPoster(p, shop, st?.business_phone ?? "", tag);
    c.toBlob(async (b) => {
      if (!b) return;
      const file = new File([b], "poster.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${p.brand} ${p.article} ${inr(p.selling_price)}` }).catch(() => {});
      else { poster(p); toast.info("Poster downloaded — attach it in WhatsApp status"); }
    });
  }

  return (
    <div>
      <PageHeader title="WhatsApp Community & Posters" subtitle="New stock message for your community group + 9:16 status posters. Free, no API." />
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm">New stock of last</span>
            {[3, 7, 15, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1 text-sm ${days === d ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{d} days</button>)}
            <Input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} className="h-8 w-44" />
          </div>
          <p className="mb-2 text-sm text-muted-foreground">{fresh.length} new articles found</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fresh.map((p) => <PCard key={p.id} p={p} onPoster={() => poster(p)} onShare={() => sharePoster(p)} />)}
          </div>
          <h3 className="mb-2 mt-5 font-semibold">Poster for any stock</h3>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article" className="mb-2 h-9 w-64" />
          <div className="grid gap-2 sm:grid-cols-2">{all.map((p) => <PCard key={p.id} p={p} onPoster={() => poster(p)} onShare={() => sharePoster(p)} />)}</div>
        </div>
        <div className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-4">
          <p className="mb-2 font-semibold">Community message</p>
          <textarea readOnly value={msg} className="h-80 w-full rounded-lg border bg-muted/50 p-2 text-xs" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(msg); toast.success("Copied — paste in your WhatsApp community"); }}><Copy className="h-4 w-4" /> Copy</Button>
            <Button className="bg-success text-success-foreground hover:bg-success/90" asChild><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(msg)}`}><MessageCircle className="h-4 w-4" /> Open WhatsApp</a></Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">WhatsApp khulega → apna community / group choose karo → send.</p>
        </div>
      </div>
    </div>
  );
}

function PCard({ p, onPoster, onShare }: { p: Product; onPoster: () => void; onShare: () => void }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[11px] font-bold uppercase text-primary">{p.brand}</p>
      <p className="font-semibold leading-tight">{p.article} <span className="font-display">{inr(p.selling_price)}</span></p>
      <p className="text-xs text-muted-foreground">Sizes {sizesOf(p).join(", ")}</p>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" variant="outline" onClick={onPoster}><Download className="h-3.5 w-3.5" /> Poster</Button>
        <Button size="sm" variant="outline" onClick={onShare}><MessageCircle className="h-3.5 w-3.5" /> Status</Button>
      </div>
    </div>
  );
}
