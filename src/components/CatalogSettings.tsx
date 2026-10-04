import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const COLS = "business_name,business_phone,catalog_enabled,booking_enabled,pickup_enabled,delivery_enabled,outside_enabled,local_charge,outside_charge,free_delivery_above,delivery_note,show_few_left,upi_id,advance_percent,hold_hours";
const EMPTY = { business_phone: "", catalog_enabled: true, booking_enabled: false, pickup_enabled: true, delivery_enabled: false, outside_enabled: false, local_charge: "30", outside_charge: "80", free_delivery_above: "", delivery_note: "", show_few_left: true, upi_id: "", advance_percent: "50", hold_hours: "24" };

/** Owner controls for the public catalog, store pickup booking and delivery orders. */
export function CatalogSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["catalog-settings"], queryFn: async () => (await supabase.from("store_settings").select(COLS).eq("id", 1).single()).data });
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (data) setF({ business_phone: data.business_phone ?? "", catalog_enabled: data.catalog_enabled, booking_enabled: data.booking_enabled, pickup_enabled: data.pickup_enabled, delivery_enabled: data.delivery_enabled, outside_enabled: data.outside_enabled,
      local_charge: String(data.local_charge), outside_charge: String(data.outside_charge), free_delivery_above: data.free_delivery_above == null ? "" : String(data.free_delivery_above), delivery_note: data.delivery_note ?? "", show_few_left: data.show_few_left,
      upi_id: data.upi_id ?? "", advance_percent: String(data.advance_percent), hold_hours: String(data.hold_hours) });
  }, [data]);
  const link = typeof window !== "undefined" ? `${window.location.origin}/catalog` : "/catalog";
  const set = (k: keyof typeof EMPTY, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const anyOrder = f.booking_enabled || f.delivery_enabled || f.outside_enabled;
  const num = (v: string, d: number, max = 100000) => Math.min(max, Math.max(0, Number(v) || d));

  async function save() {
    const upi = f.upi_id.trim();
    const phone = f.business_phone.replace(/\D/g, "");
    if (anyOrder && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upi)) { toast.error("Enter a valid UPI ID to take orders"); return; }
    if (phone && phone.length < 10) { toast.error("Enter a valid 10-digit mobile number"); return; }
    const { error } = await supabase.from("store_settings").update({
      business_phone: phone || null, catalog_enabled: f.catalog_enabled, booking_enabled: f.booking_enabled, pickup_enabled: true, delivery_enabled: f.delivery_enabled, outside_enabled: f.outside_enabled,
      local_charge: num(f.local_charge, 30, 1000), outside_charge: num(f.outside_charge, 80, 2000), free_delivery_above: f.free_delivery_above.trim() ? num(f.free_delivery_above, 0) : null,
      delivery_note: f.delivery_note.trim().slice(0, 80) || null, show_few_left: f.show_few_left, upi_id: upi || null,
      advance_percent: Math.min(100, Math.max(10, Number(f.advance_percent) || 50)), hold_hours: Math.min(168, Math.max(1, Number(f.hold_hours) || 24)),
    }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["catalog-settings"] }); qc.invalidateQueries({ queryKey: ["shop"] }); toast.success("Catalog settings saved");
  }
  const Row = ({ k, title, sub }: { k: keyof typeof EMPTY; title: string; sub?: string }) => (
    <label className="flex items-center justify-between gap-3 py-2"><span><span className="block text-sm font-medium">{title}</span>{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span><Switch checked={f[k] as boolean} onCheckedChange={(v) => set(k, v)} /></label>
  );

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-1 font-semibold">Online catalog</h2>
      <p className="mb-4 text-sm text-muted-foreground">A public page with your products, prices and in-stock sizes. Cost, profit and stock counts are never shown.</p>
      <Row k="catalog_enabled" title="Show catalog to customers" />
      <Row k="show_few_left" title={"Show \"Few sizes left\" tag"} sub="Shown when only 1–2 sizes are in stock." />
      <div className="my-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Catalog link copied"); }}><Copy className="h-4 w-4" /> Copy catalog link</Button>
        <Button variant="outline" size="sm" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open catalog</a></Button>
        <Button variant="outline" size="sm" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Explore the latest footwear collection at ${data?.business_name ?? "our store"}.\nSee live sizes and prices, order for delivery or visit us:\n${link}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</a></Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Choose which products appear using the "In catalog" switch on each product in Products.</p>

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-1"><Label>Shop WhatsApp number</Label><Input value={f.business_phone} inputMode="numeric" onChange={(e) => set("business_phone", e.target.value)} placeholder="9876543210" /></div>
        <div className="space-y-1"><Label>Shop UPI ID</Label><Input value={f.upi_id} onChange={(e) => set("upi_id", e.target.value)} placeholder="9876543210@upi" /></div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Customers message this number. Payments go straight to this UPI ID — no fee.</p>

      <div className="mt-4 border-t pt-2">
        <Row k="booking_enabled" title="Store pickup (advance booking)" sub="Customer pays an advance, picks up at the store." />
        {f.booking_enabled && <div className="grid gap-3 pb-2 sm:grid-cols-2">
          <div className="space-y-1"><Label>Advance %</Label><Input value={f.advance_percent} inputMode="numeric" onChange={(e) => set("advance_percent", e.target.value)} /></div>
          <div className="space-y-1"><Label>Keep pair aside (hours)</Label><Input value={f.hold_hours} inputMode="numeric" onChange={(e) => set("hold_hours", e.target.value)} /></div>
        </div>}
        <Row k="delivery_enabled" title="Local delivery" sub="Full payment, delivered within your city." />
        {f.delivery_enabled && <div className="grid gap-3 pb-2 sm:grid-cols-3">
          <div className="space-y-1"><Label>Local delivery charge (₹)</Label><Input value={f.local_charge} inputMode="numeric" onChange={(e) => set("local_charge", e.target.value)} /></div>
          <div className="space-y-1"><Label>Free delivery above (₹)</Label><Input value={f.free_delivery_above} inputMode="numeric" onChange={(e) => set("free_delivery_above", e.target.value)} placeholder="Optional" /></div>
          <div className="space-y-1"><Label>Delivery area note</Label><Input value={f.delivery_note} onChange={(e) => set("delivery_note", e.target.value)} placeholder="Within city" maxLength={80} /></div>
        </div>}
        <Row k="outside_enabled" title="Outside city delivery" sub="Full payment, sent by courier." />
        {f.outside_enabled && <div className="grid gap-3 pb-2 sm:grid-cols-3">
          <div className="space-y-1"><Label>Outside delivery charge (₹)</Label><Input value={f.outside_charge} inputMode="numeric" onChange={(e) => set("outside_charge", e.target.value)} /></div>
        </div>}
      </div>
      <Button onClick={save} className="mt-4">Save</Button>
    </section>
  );
}
