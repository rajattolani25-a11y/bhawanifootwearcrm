import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, MessageCircle, Receipt, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { computeBill, waLink } from "@/lib/pos";
import { useShop } from "@/hooks/use-shop";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "Online Bookings — SoleStack POS" }, { name: "description", content: "Catalog reservations with advance payment." }, { property: "og:title", content: "Online Bookings — SoleStack POS" }, { property: "og:description", content: "Confirm, bill or cancel catalog reservations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Bookings,
});

type Booking = { id: string; booking_no: string; variant_id: string; product_name: string; size: string; customer_name: string; mobile: string; price: number; advance: number; status: string; note: string | null; expires_at: string; created_at: string };
const TABS = [["pending", "Pending payment"], ["confirmed", "Confirmed"], ["picked", "Picked up"], ["closed", "Cancelled"]] as const;

function Bookings() {
  const qc = useQueryClient();
  const shop = useShop();
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
  const list = data.filter((b) => (tab === "closed" ? b.status === "cancelled" || b.status === "expired" : b.status === tab));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["pos-products"] }); };

  async function confirm(b: Booking) {
    if (!window.confirm(`Did you receive ${inr(b.advance)} on UPI for ${b.booking_no}?`)) return;
    const { error } = await supabase.rpc("confirm_catalog_booking", { _id: b.id });
    if (error) return toast.error(error.message);
    toast.success("Payment received — pair is on hold"); refresh();
  }
  async function cancel(b: Booking) {
    const note = window.prompt("Reason / refund note (optional)", b.status === "confirmed" ? `Refund ${inr(b.advance)} by UPI` : "");
    if (note === null) return;
    const { error } = await supabase.rpc("cancel_catalog_booking", { _id: b.id, _note: note });
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled — stock returned"); refresh();
  }
  const copyLink = () => { void navigator.clipboard.writeText(`${window.location.origin}/catalog`); toast.success("Catalog link copied"); };

  return (
    <div>
      <PageHeader title="Online Bookings" subtitle="Pairs reserved from your catalog. Reserved pairs are already taken out of stock, so nobody else can buy them." actions={<Button variant="outline" onClick={copyLink} className="h-11"><Link2 className="h-4 w-4" /> Copy catalog link</Button>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l} ({data.filter((b) => (k === "closed" ? b.status === "cancelled" || b.status === "expired" : b.status === k)).length})</button>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((b) => (
          <div key={b.id} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between gap-2"><div><p className="text-xs font-semibold text-primary" data-no-translate>{b.booking_no}</p><p className="font-semibold" data-no-translate>{b.product_name}</p><p className="text-sm"><span>Size</span> {b.size}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Advance</p><p className="font-display text-lg font-bold">{inr(b.advance)}</p><p className="text-xs text-muted-foreground">of {inr(b.price)}</p></div></div>
            <p className="mt-2 text-sm"><span data-no-translate>{b.customer_name}</span> · {b.mobile}</p>
            <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString("en-IN")}{b.status === "pending" && <> · <span>Releases at</span> {new Date(b.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}</p>
            {b.note && <p className="mt-1 text-xs italic text-muted-foreground">{b.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {b.status === "pending" && <Button size="sm" onClick={() => confirm(b)}><Check className="h-4 w-4" /> Payment received</Button>}
              {b.status === "confirmed" && <Button size="sm" onClick={() => setBilling(b)}><Receipt className="h-4 w-4" /> Make bill</Button>}
              {(b.status === "pending" || b.status === "confirmed") && <>
                <Button size="sm" variant="outline" asChild><a href={waLink(b.mobile, b.status === "pending" ? `Dear ${b.customer_name},\n\nYour booking ${b.booking_no} for ${b.product_name} (size ${b.size}) is waiting for the advance of ${inr(b.advance)}.\n\nThank you,\n${shop.name}` : `Dear ${b.customer_name},\n\nWe received your advance of ${inr(b.advance)}. Your ${b.product_name} (size ${b.size}) is kept aside for you. Balance at store: ${inr(b.price - b.advance)}.\n\nBooking: ${b.booking_no}\n\nThank you,\n${shop.name}`)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>
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
  const rest = Math.max(0, b.price - b.advance);
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
          <div className="flex justify-between"><span>Advance received (UPI)</span><b>− {inr(b.advance)}</b></div>
          <div className="flex justify-between border-t pt-1 text-base"><span>Collect now</span><b>{inr(rest)}</b></div>
        </div>
        <div className="flex gap-2">{(["Cash", "UPI"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md border py-2 text-sm font-semibold ${mode === m ? "border-primary bg-primary/10 text-primary" : ""}`}>{m}</button>)}</div>
        <label className="flex items-center justify-between text-sm"><span>GST % (price includes GST)</span><Input value={rate} onChange={(e) => setRate(e.target.value)} className="h-9 w-20" inputMode="numeric" /></label>
        <Button disabled={busy} onClick={make} className="h-11">{busy ? "Please wait…" : "Complete bill"}</Button>
      </DialogContent>
    </Dialog>
  );
}
