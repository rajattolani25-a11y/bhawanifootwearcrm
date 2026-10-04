import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Owner controls for the public catalog and optional advance booking. */
export function CatalogSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["catalog-settings"],
    queryFn: async () => (await supabase.from("store_settings").select("business_name,catalog_enabled,booking_enabled,upi_id,advance_percent,hold_hours").eq("id", 1).single()).data,
  });
  const [f, setF] = useState({ catalog_enabled: true, booking_enabled: false, upi_id: "", advance_percent: "50", hold_hours: "24" });
  useEffect(() => { if (data) setF({ catalog_enabled: data.catalog_enabled, booking_enabled: data.booking_enabled, upi_id: data.upi_id ?? "", advance_percent: String(data.advance_percent), hold_hours: String(data.hold_hours) }); }, [data]);
  const link = typeof window !== "undefined" ? `${window.location.origin}/catalog` : "/catalog";

  async function save() {
    const upi = f.upi_id.trim();
    if (f.booking_enabled && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upi)) { toast.error("Enter a valid UPI ID to turn on booking"); return; }
    const { error } = await supabase.from("store_settings").update({
      catalog_enabled: f.catalog_enabled, booking_enabled: f.booking_enabled, upi_id: upi || null,
      advance_percent: Math.min(100, Math.max(10, Number(f.advance_percent) || 50)), hold_hours: Math.min(168, Math.max(1, Number(f.hold_hours) || 24)),
    }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["catalog-settings"] }); toast.success("Catalog settings saved");
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-1 font-semibold">Online catalog</h2>
      <p className="mb-4 text-sm text-muted-foreground">A public page with your products, prices and in-stock sizes. Cost, profit and stock counts are never shown.</p>
      <label className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-medium">Show catalog to customers</span><Switch checked={f.catalog_enabled} onCheckedChange={(v) => setF({ ...f, catalog_enabled: v })} /></label>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Catalog link copied"); }}><Copy className="h-4 w-4" /> Copy catalog link</Button>
        <Button variant="outline" size="sm" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`See our latest footwear collection at ${data?.business_name ?? "our store"}: ${link}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</a></Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Choose which products appear using the "In catalog" switch on each product in Products.</p>
      <div className="border-t pt-4">
        <label className="mb-3 flex items-center justify-between gap-3"><span><span className="block text-sm font-medium">Allow advance booking (optional)</span><span className="text-xs text-muted-foreground">Customers can reserve a pair by paying an advance on UPI.</span></span><Switch checked={f.booking_enabled} onCheckedChange={(v) => setF({ ...f, booking_enabled: v })} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Shop UPI ID</Label><Input value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value })} placeholder="9876543210@upi" /></div>
          <div className="space-y-1"><Label>Advance %</Label><Input value={f.advance_percent} inputMode="numeric" onChange={(e) => setF({ ...f, advance_percent: e.target.value })} /></div>
          <div className="space-y-1"><Label>Keep pair aside (hours)</Label><Input value={f.hold_hours} inputMode="numeric" onChange={(e) => setF({ ...f, hold_hours: e.target.value })} /></div>
        </div>
      </div>
      <Button onClick={save} className="mt-4">Save</Button>
    </section>
  );
}
