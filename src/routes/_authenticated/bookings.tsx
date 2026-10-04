import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, MessageCircle, Package, Receipt, Truck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { computeBill, waLink } from "@/lib/pos";
import { useShop } from "@/hooks/use-shop";
import { useLang } from "@/lib/i18n";
import { statusText } from "@/lib/order-messages";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "Online Orders — SoleStack POS" }, { name: "description", content: "Catalog reservations with advance payment." }, { property: "og:title", content: "Online Orders — SoleStack POS" }, { property: "og:description", content: "Confirm, bill or cancel catalog reservations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Bookings,
});

type Booking = { id: string; booking_no: string; variant_id: string; product_name: string; size: string; customer_name: string; mobile: string; price: number; advance: number; status: string; note: string | null; expires_at: string; created_at: string; fulfillment: string; delivery_charge: number; address: string | null; area: string | null };
const TABS = [["pending", "Pending payment"], ["active", "To fulfil"], ["done", "Completed"], ["closed", "Cancelled"]] as const;
const GROUP: Record<string, string> = { pending: "pending", confirmed: "active", packed: "active", shipped: "active", picked: "done", delivered: "done", cancelled: "closed", expired: "closed", refunded: "closed" };
const TYPE_LABEL: Record<string, string> = { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" };
const STATUS_LABEL: Record<string, string> = { pending: "Order placed", confirmed: "Payment confirmed", packed: "Packed", shipped: "Out for delivery", delivered: "Delivered", picked: "Picked up", cancelled: "Cancelled", expired: "Cancelled (not paid)", refunded: "Cancelled - refund initiated" };

function Bookings() {
  const qc = useQueryClient();
  const shop = useShop();
  const { lang } = useLang();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const [billing, setBilling] = useState<Booking | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      await supabase.rpc("expire_catalog_bookings");
      const { data, error } = await supabase.from("catalog_bookings").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as Booking[];
    },
  });
  useEffect(() => {
    const ch = supabase.channel("bookings-live").on("postgres_changes", { event: "*", schema: "public", table: "catalog_bookings" }, () => qc.invalidateQueries({ queryKey: ["bookings"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const list = data.filter((b) => GROUP[b.status] === tab);
  const msg = (b: Booking, st: string) => waLink(b.mobile, statusText(lang, { booking_no: b.booking_no, product: b.product_name, size: b.size, name: b.customer_name, price: b.price, advance: b.advance, delivery_charge: b.delivery_charge, fulfillment: b.fulfillment, shop: shop.name, address: b.fulfillment === "pickup" ? null : [b.address, b.area].filter(Boolean).join(", ") }, st, `${window.location.origin}/catalog?track=${b.booking_no}`));
  async function move(b: Booking, st: "packed" | "shipped") {
    const { error } = await supabase.rpc("update_catalog_order_status", { _id: b.id, _status: st });
    if (error) { toast.error(error.message); return; }
    toast.success(STATUS_LABEL[st]); refresh();
    window.open(msg(b, st), "_blank");
  }
  const refresh = () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["pos-products"] }); };

  async function confirm(b: Booking) {
    if (!window.confirm(`${inr(b.advance)} — UPI payment received? (${b.booking_no})`)) return;
    const { error } = await supabase.rpc("confirm_catalog_booking", { _id: b.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Payment received — pair is on hold"); refresh();
    window.open(msg(b, "confirmed"), "_blank");
  }
  async function cancel(b: Booking) {
    const note = window.prompt("Reason / refund note (optional)", b.status !== "pending" ? `Refund ${inr(b.advance)} by UPI` : "");
    if (note === null) return;
    const { error } = await supabase.rpc("cancel_catalog_booking", { _id: b.id, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success("Booking cancelled — stock returned"); refresh();
    if (b.status !== "pending") window.open(msg(b, "refunded"), "_blank");
  }
  const copyLink = () => { void navigator.clipboard.writeText(`${window.location.origin}/catalog`); toast.success("Catalog link copied"); };

  return (
    <div>
      <PageHeader title="Online Orders" subtitle="Pickup bookings and delivery orders from your catalog. These pairs are already taken out of stock, so nobody else can buy them." actions={<Button variant="outline" onClick={copyLink} className="h-11"><Link2 className="h-4 w-4" /> Copy catalog link</Button>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l} ({data.filter((b) => GROUP[b.status] === k).length})</button>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((b) => (
          <div key={b.id} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between gap-2"><div><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-semibold text-primary" data-no-translate>{b.booking_no}</p><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{TYPE_LABEL[b.fulfillment] ?? b.fulfillment}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{STATUS_LABEL[b.status] ?? b.status}</span></div><p className="font-semibold" data-no-translate>{b.product_name}</p><p className="text-sm"><span>Size</span> {b.size}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">{b.fulfillment === "pickup" ? "Advance" : "Paid"}</p><p className="font-display text-lg font-bold">{inr(b.advance)}</p>{b.fulfillment === "pickup" ? <p className="text-xs text-muted-foreground"><span>of</span> {inr(b.price)}</p> : b.delivery_charge > 0 && <p className="text-xs text-muted-foreground"><span>incl. delivery</span> {inr(b.delivery_charge)}</p>}</div></div>
            <p className="mt-2 text-sm"><span data-no-translate>{b.customer_name}</span> · {b.mobile}</p>
            <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString("en-IN")}{b.status === "pending" && <> · <span>Releases at</span> {new Date(b.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}</p>
            {b.address && <p className="mt-1 rounded bg-muted p-2 text-xs" data-no-translate>{b.address}{b.area ? `, ${b.area}` : ""}</p>}
            {b.note && <p className="mt-1 text-xs italic text-muted-foreground">{b.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {b.status === "pending" && <Button size="sm" onClick={() => confirm(b)}><Check className="h-4 w-4" /> Payment received</Button>}
              {b.status === "confirmed" && <Button size="sm" variant="secondary" onClick={() => move(b, "packed")}><Package className="h-4 w-4" /> {b.fulfillment === "pickup" ? "Ready for pickup" : "Packed"}</Button>}
              {b.fulfillment !== "pickup" && (b.status === "confirmed" || b.status === "packed") && <Button size="sm" variant="secondary" onClick={() => move(b, "shipped")}><Truck className="h-4 w-4" /> Out for delivery</Button>}
              {["confirmed", "packed", "shipped"].includes(b.status) && <Button size="sm" onClick={() => setBilling(b)}><Receipt className="h-4 w-4" /> {b.fulfillment === "pickup" ? "Make bill" : "Delivered — make bill"}</Button>}
              {["pending", "confirmed", "packed", "shipped"].includes(b.status) && <>
                <Button size="sm" variant="outline" asChild><a href={msg(b, b.status)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
                <Button size="sm" variant="ghost" onClick={() => cancel(b)}><X className="h-4 w-4" /> Cancel</Button>
              </>}
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No bookings here.</p>}
      </div>
      {billing && <PickupBill b={billing} onClose={() => setBilling(null)} onDone={refresh} />}
    </div>
  );
}

function PickupBill({ b, onClose, onDone }: { b: Booking; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"Cash" | "UPI">("Cash");
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState("5");
  const prepaid = Math.min(b.price, b.advance);
  const rest = Math.max(0, b.price - prepaid);
  async function make() {
    setBusy(true);
    try {
      const cols = "id,name";
      let { data: c } = await supabase.from("customers").select(cols).eq("mobile", b.mobile).maybeSingle();
      if (!c) { const ins = await supabase.from("customers").insert({ mobile: b.mobile, name: b.customer_name }).select(cols).single(); if (ins.error) throw ins.error; c = ins.data; }
      const bill = computeBill([{ variant_id: b.variant_id, product_name: b.product_name, brand: "", size: b.size, sku: null, price: b.price, qty: 1, max: 1 }], 0, 0, { billType: Number(rate) ? "gst" : "simple", taxMode: "inclusive", rate: Number(rate) || 0 });
      const { data, error } = await supabase.rpc("complete_catalog_booking", {
        _id: b.id,
        _sale: { customer_id: c.id, customer_name: c.name, payment_mode: mode === "Cash" && rest > 0 ? "Split" : "UPI", split_cash: mode === "Cash" ? rest : 0,
          bill_type: Number(rate) ? "gst" : "simple", tax_mode: "inclusive", subtotal: bill.subtotal, discount: 0, taxable: bill.taxable, gst_rate: bill.rate, gst_amount: bill.gst,
          total: bill.total, paid_amount: bill.total, due_amount: 0, give_stamp: true },
        _items: [{ variant_id: b.variant_id, product_name: b.product_name, size: b.size, sku: null, price: b.price, qty: 1, discount: 0 }],
      });
      if (error) throw error;
      toast.success(`Bill ${(data as { bill_no: string }).bill_no} made`);
      onDone(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Make bill</DialogTitle></DialogHeader>
        <p className="text-sm"><span data-no-translate>{b.product_name}</span> · <span>Size</span> {b.size} · <span data-no-translate>{b.customer_name}</span></p>
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between"><span>Bill total</span><b>{inr(b.price)}</b></div>
          <div className="flex justify-between"><span>Advance received (UPI)</span><b>− {inr(prepaid)}</b></div>
          <div className="flex justify-between border-t pt-1 text-base"><span>Collect now</span><b>{inr(rest)}</b></div>
        </div>
        <div className="flex gap-2">{(["Cash", "UPI"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md border py-2 text-sm font-semibold ${mode === m ? "border-primary bg-primary/10 text-primary" : ""}`}>{m}</button>)}</div>
        <label className="flex items-center justify-between text-sm"><span>GST % (price includes GST)</span><Input value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-20" inputMode="numeric" /></label>
        <Button disabled={busy} onClick={make} className="h-11">{busy ? "Please wait…" : "Complete bill"}</Button>
      </DialogContent>
    </Dialog>
  );
}
