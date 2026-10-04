import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { useShop } from "@/hooks/use-shop";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/size-finder")({
  head: () => ({ meta: [{ title: "Size Finder — SoleStack POS" }, { name: "description", content: "Find in-stock footwear by size and share on WhatsApp." }, { property: "og:title", content: "Size Finder — SoleStack POS" }, { property: "og:description", content: "Find in-stock footwear by size and share on WhatsApp." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SizeFinder,
});

function SizeFinder() {
  const { t } = useLang();
  const shop = useShop();
  const [size, setSize] = useState("");
  const [cat, setCat] = useState("");
  const [mobile, setMobile] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const { data = [] } = useQuery({
    queryKey: ["size-finder"],
    queryFn: async () => (await supabase.from("product_variants").select("id,size,stock,products(brand,article,color,category,gender,selling_price,mrp,status)").gt("stock", 0).limit(20000)).data ?? [],
  });
  const sizes = [...new Set(data.map((v) => v.size))].sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
  const list = data.filter((v) => (!size || v.size === size) && (!cat || `${v.products?.category} ${v.products?.gender} ${v.products?.brand} ${v.products?.article}`.toLowerCase().includes(cat.toLowerCase())));

  function share() {
    const items = list.filter((v) => picked.includes(v.id));
    if (!items.length) return;
    const lines = items.map((v, i) => `${i + 1}. ${v.products?.brand} ${v.products?.article}${v.products?.color ? " (" + v.products.color + ")" : ""} — Size ${v.size} — ${inr(v.products?.selling_price)}`).join("\n");
    const msg = `Namaste,\n\n${shop.name} me aapke size ke ye joote available hain:\n\n${lines}\n\nStock limited hai — aaj hi visit karein.\n${shop.name}${shop.phone ? "\n" + shop.phone : ""}`;
    const n = mobile.replace(/\D/g, "").slice(-10);
    window.open(`https://wa.me/${n ? "91" + n : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div>
      <PageHeader title="Size Finder" subtitle="Pick a size, see what is in stock, and send it on WhatsApp." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant={!size ? "default" : "outline"} onClick={() => setSize("")}>All</Button>
        {sizes.map((s) => <Button key={s} size="sm" variant={size === s ? "default" : "outline"} onClick={() => setSize(s)}>{s}</Button>)}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Brand / article / Gents / Ladies / Kids" value={cat} onChange={(e) => setCat(e.target.value)} />
        <Input placeholder="Customer mobile (optional)" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        <Button disabled={!picked.length} onClick={share}>{t("Share on WhatsApp")} ({picked.length})</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.slice(0, 300).map((v) => {
          const on = picked.includes(v.id);
          return (
            <button key={v.id} onClick={() => setPicked(on ? picked.filter((x) => x !== v.id) : [...picked, v.id])} className={`rounded-lg border p-3 text-left ${on ? "border-primary bg-primary/10" : "bg-card"}`}>
              <b className="block">{v.products?.brand} {v.products?.article}</b>
              <span className="text-sm text-muted-foreground">{v.products?.color} · {v.products?.gender ?? v.products?.category}</span>
              <div className="mt-1 flex justify-between text-sm"><span>Size <b>{v.size}</b> · {v.stock} pair</span><b>{inr(v.products?.selling_price)}</b></div>
            </button>
          );
        })}
        {!list.length && <p className="text-sm text-muted-foreground">No stock in this size.</p>}
      </div>
    </div>
  );
}
