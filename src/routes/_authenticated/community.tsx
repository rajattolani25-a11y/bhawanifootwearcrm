import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, MessageCircle, Share2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { sizeSort, useStock, type Product } from "@/lib/stock";
import { arrivalMessage } from "@/lib/messages";
import { printHtml } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({ meta: [{ title: "WhatsApp & Posters — SoleStack POS" }, { name: "description", content: "New stock messages for WhatsApp community and status posters." }, { property: "og:title", content: "WhatsApp & Posters — SoleStack POS" }, { property: "og:description", content: "Create professional new-stock campaigns and posters." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Community,
});

const sizesOf = (p: Product) => p.product_variants.filter((v) => v.stock > 0).map((v) => v.size).sort(sizeSort);

async function drawPoster(p: Product, shop: string, phone: string, tag: string) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1920;
  const g = c.getContext("2d");
  if (!g) throw new Error("Poster canvas unavailable");
  g.fillStyle = "#f5f3ef"; g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = "#171717"; g.fillRect(0, 0, 1080, 330); g.fillRect(0, 1640, 1080, 280);
  g.fillStyle = "#d96838"; g.fillRect(0, 0, 1080, 18); g.fillRect(80, 170, 130, 8);
  g.textAlign = "center";
  g.fillStyle = "#fff"; g.font = "bold 56px sans-serif"; g.fillText(shop.toUpperCase(), 540, 110, 940);
  g.fillStyle = "#d96838"; g.font = "bold 76px sans-serif"; g.fillText(tag.toUpperCase(), 540, 277, 950);
  g.fillStyle = "#e9e5de"; g.fillRect(60, 355, 960, 740);
  if (p.image_src) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = reject; img.src = p.image_src ?? ""; });
    const scale = Math.min(900 / image.width, 690 / image.height);
    g.drawImage(image, 540 - image.width * scale / 2, 725 - image.height * scale / 2, image.width * scale, image.height * scale);
  } else {
    g.fillStyle = "#666"; g.font = "42px sans-serif"; g.fillText("PRODUCT PHOTO", 540, 740);
  }
  g.fillStyle = "#d96838"; g.font = "bold 48px sans-serif"; g.fillText(p.brand.toUpperCase(), 540, 1190, 940);
  g.fillStyle = "#171717"; g.font = "bold 84px sans-serif"; g.fillText(p.article, 540, 1295, 960);
  g.fillStyle = "#555"; g.font = "38px sans-serif"; g.fillText([p.category, p.color].filter(Boolean).join(" · "), 540, 1365, 950);
  g.fillStyle = "#171717"; g.font = "bold 118px sans-serif"; g.fillText(inr(p.selling_price), 540, 1535);
  g.fillStyle = "#fff"; g.font = "bold 36px sans-serif"; g.fillText(`AVAILABLE SIZES  ${sizesOf(p).join("  /  ")}`, 540, 1730, 940);
  g.fillStyle = "#d96838"; g.font = "40px sans-serif"; g.fillText(phone ? `WhatsApp / Call ${phone}` : "Visit the store today", 540, 1825, 940);
  return c;
}

function Community() {
  const { data = [] } = useStock();
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState("NEW ARRIVAL");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterName, setPosterName] = useState("");
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

  useEffect(() => {
    const p = selected ?? fresh[0];
    if (p) setMessage(arrivalMessage(shop, p, sizesOf(p), st?.business_phone));
  }, [selected, fresh[0]?.id, shop, st?.business_phone]);

  async function poster(p: Product) {
    try { const c = await drawPoster(p, shop, st?.business_phone ?? "", tag); setPosterUrl(c.toDataURL("image/png")); setPosterName(`${p.brand}-${p.article}-poster.png`); }
    catch { toast.error("Could not render photo. Try uploading this product photo again."); }
  }
  async function sharePoster(p: Product) {
    try { const c = await drawPoster(p, shop, st?.business_phone ?? "", tag);
    c.toBlob(async (b) => {
      if (!b) return;
      const file = new File([b], "poster.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${p.brand} ${p.article} ${inr(p.selling_price)}` }).catch(() => {});
       else { poster(p); toast.info("Poster preview is ready — download it and attach in WhatsApp status"); }
    });
    } catch { toast.error("Could not share this photo. Try uploading it again."); }
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
            {fresh.map((p) => <PCard key={p.id} p={p} selected={selected?.id === p.id} onSelect={() => setSelected(p)} onPoster={() => poster(p)} onShare={() => sharePoster(p)} />)}
          </div>
          <h3 className="mb-2 mt-5 font-semibold">Poster for any stock</h3>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article" className="mb-2 h-9 w-64" />
          <div className="grid gap-2 sm:grid-cols-2">{all.map((p) => <PCard key={p.id} p={p} selected={selected?.id === p.id} onSelect={() => setSelected(p)} onPoster={() => poster(p)} onShare={() => sharePoster(p)} />)}</div>
        </div>
        <div className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-4">
          {posterUrl && <div className="mb-5"><p className="mb-2 font-semibold">Poster preview</p><img src={posterUrl} alt="Selected product poster" className="mx-auto max-h-96 w-auto max-w-full border object-contain" /><div className="mt-2 flex gap-2"><Button variant="outline" asChild><a href={posterUrl} download={posterName}><Download className="h-4 w-4" /> Download</a></Button><Button variant="outline" onClick={() => printHtml("Poster", `<img src="${posterUrl}" alt="Poster" style="width:100%;max-width:190mm;height:auto;display:block;margin:auto">`, "@page{size:A4;margin:5mm}")}><Printer className="h-4 w-4" /> Print</Button></div></div>}
          <p className="mb-2 font-semibold">Community message</p>
           <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="h-72 w-full rounded-lg border bg-muted/50 p-3 text-sm" />
          <div className="mt-2 grid grid-cols-2 gap-2">
             <Button variant="outline" onClick={() => { navigator.clipboard.writeText(message); toast.success("Message copied"); }}><Copy className="h-4 w-4" /> Copy</Button>
             <Button asChild><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
             <Button variant="outline" className="col-span-2" onClick={() => navigator.share?.({ title: tag, text: message }).catch(() => {})}><Share2 className="h-4 w-4" /> Share to another app</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">WhatsApp khulega → apna community / group choose karo → send.</p>
        </div>
      </div>
    </div>
  );
}

function PCard({ p, selected, onSelect, onPoster, onShare }: { p: Product; selected: boolean; onSelect: () => void; onPoster: () => void; onShare: () => void }) {
  return (
    <div className={`rounded-lg border p-2.5 ${selected ? "border-primary bg-accent/40" : ""}`} onClick={onSelect}>
      <div className="mb-2 h-28 overflow-hidden rounded-md bg-muted">{p.image_src ? <img src={p.image_src} alt={`${p.brand} ${p.article}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Add photo in Products</div>}</div>
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
