import { useAuth } from "@/hooks/use-auth";
import { runOperationalRequest } from "@/lib/operational-requests";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { ListPagination } from "@/components/ListPagination";
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
import { printBill } from "@/lib/print";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "Online Orders — SoleStack POS" }, { name: "description", content: "Catalog reservations with advance payment." }, { property: "og:title", content: "Online Orders — SoleStack POS" }, { property: "og:description", content: "Confirm, bill or cancel catalog reservations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Bookings,
});

type Booking = { id: string; booking_no: string; variant_id: string; product_name: string; size: string; customer_name: string; mobile: string; price: number; advance: number; status: string; receipt_recorded?: boolean | null; refund_paid_at?: string | null; refund_reference?: string | null; note: string | null; expires_at: string; created_at: string; fulfillment: string; delivery_charge: number; address: string | null; area: string | null };
const TABS = [["pending", "Pending payment"], ["active", "To fulfil"], ["done", "Completed"], ["closed", "Cancelled"]] as const;
const GROUP: Record<string, string> = { pending: "pending", confirmed: "active", packed: "active", shipped: "active", picked: "done", delivered: "done", cancelled: "closed", expired: "closed", refund_pending: "closed", refunded: "closed" };
const TYPE_LABEL: Record<string, string> = { pickup: "Store pickup", local: "Local delivery", outside: "Outside Jabalpur delivery" };
const STATUS_LABEL: Record<string, string> = { pending: "Order placed", confirmed: "Payment confirmed", packed: "Packed", shipped: "Out for delivery", delivered: "Delivered", picked: "Picked up", cancelled: "Cancelled", expired: "Cancelled (not paid)", refund_pending: "Cancelled — refund pending", refunded: "Refund sent (recorded)" };

function Bookings() {
  const { isOwner } = useAuth();
  const [update, setUpdate] = useState<{ booking: Booking; status: string } | null>(null);
  const [refunding, setRefunding] = useState<Booking | null>(null);
  const qc = useQueryClient();
  const shop = useShop();
  const { lang } = useLang();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const [billing, setBilling] = useState<Booking | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const { data: result, error, isPending, refetch } = useQuery({
    queryKey: ["bookings",tab,page],
    queryFn: async () => {
      const expired = await supabase.rpc("expire_catalog_bookings");
      if (expired.error) throw expired.error;
      const statuses = Object.keys(GROUP).filter((status) => GROUP[status] === tab);
      const { data, error, count } = await supabase.from("catalog_bookings").select("*", { count: "exact" }).in("status", statuses).order("created_at", { ascending: false }).order("id").range(page * pageSize,(page + 1) * pageSize - 1);
      if (error) throw error;
      return { rows: data as Booking[], count: count ?? 0 };
    },
  });
  useEffect(() => {
    const ch = supabase.channel("bookings-live").on("postgres_changes", { event: "*", schema: "public", table: "catalog_bookings" }, () => qc.invalidateQueries({ queryKey: ["bookings"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const list = result?.rows ?? [];
  const msg = (b: Booking, st: string) => waLink(b.mobile, statusText(lang, { booking_no: b.booking_no, product: b.product_name, size: b.size, name: b.customer_name, price: b.price, advance: ["picked", "delivered"].includes(st) ? Number(b.price) + Number(b.delivery_charge || 0) : b.advance, delivery_charge: b.delivery_charge, fulfillment: b.fulfillment, shop: shop.name, address: b.fulfillment === "pickup" ? null : [b.address, b.area].filter(Boolean).join(", ") }, st, `${window.location.origin}/catalog?track=${b.booking_no}`));
  async function move(b: Booking, st: "packed" | "shipped") {
    const { error } = await supabase.rpc("update_catalog_order_status", { _id: b.id, _status: st });
    if (error) { toast.error(error.message); return; }
    toast.success(STATUS_LABEL[st]); refresh();
    setUpdate({ booking: b, status: st });

  }
  const refresh = () => { void refreshOperationalData(qc); };

  async function confirm(b: Booking) {
    if (!window.confirm(`${inr(b.advance)} — UPI payment received? (${b.booking_no})`)) return;
    const { error } = await supabase.rpc("confirm_catalog_booking", { _id: b.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Payment received — pair is on hold"); refresh();
    setUpdate({ booking: b, status: "confirmed" });

  }
  async function cancel(b: Booking) {
    const note = window.prompt("Cancellation reason (refund is recorded separately)", "");
    if (!note?.trim()) return;
    const { error } = await supabase.rpc("cancel_catalog_booking", { _id: b.id, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success("Booking cancelled — stock returned"); refresh();
    setUpdate({ booking: b, status: b.status === "pending" ? "cancelled" : "refund_pending" });
    if (b.status !== "pending") toast.info("Refund is pending. Send it outside the app, then record the payment reference.");
  }
  const copyLink = () => { void navigator.clipboard.writeText(`${window.location.origin}/catalog`); toast.success("Catalog link copied"); };

  return (
    <div>
      <PageHeader title="Online Orders" subtitle="Pickup bookings and delivery orders from your catalog. These pairs are already taken out of stock, so nobody else can buy them." actions={<Button variant="outline" onClick={copyLink} className="h-11"><Link2 className="h-4 w-4" /> Copy catalog link</Button>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setPage(0); }} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l}{k===tab && result ? ` (${result.count})` : ""}</button>)}
      </div>
      {error && <div role="alert" className="mb-3 text-destructive">Orders could not be loaded: {error.message} <Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>}
      {isPending && <p role="status">Loading orders…</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((b) => (
          <div key={b.id} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between gap-2"><div><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-semibold text-primary" data-no-translate>{b.booking_no}</p><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{TYPE_LABEL[b.fulfillment] ?? b.fulfillment}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{STATUS_LABEL[b.status] ?? b.status}</span></div><p className="font-semibold" data-no-translate>{b.product_name}</p><p className="text-sm"><span>Size</span> {b.size}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">{b.fulfillment === "pickup" ? "Advance" : "Paid"}</p><p className="font-display text-lg font-bold">{inr(b.advance)}</p>{b.fulfillment === "pickup" ? <p className="text-xs text-muted-foreground"><span>of</span> {inr(b.price)}</p> : b.delivery_charge > 0 && <p className="text-xs text-muted-foreground"><span>incl. delivery</span> {inr(b.delivery_charge)}</p>}</div></div>
            <p className="mt-2 text-sm"><span data-no-translate>{b.customer_name}</span> · {b.mobile}</p>
            <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString("en-IN")}{b.status === "pending" && <> · <span>Releases at</span> {new Date(b.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}</p>
            {b.address && <p className="mt-1 rounded bg-muted p-2 text-xs" data-no-translate>{b.address}{b.area ? `, ${b.area}` : ""}</p>}
            {b.note && <p className="mt-1 text-xs italic text-muted-foreground">{b.note}</p>}
            {["picked","delivered","refunded"].includes(b.status) && !b.receipt_recorded && <p role="alert" className="mt-2 text-xs text-warning-foreground">Historical payment receipt needs owner reconciliation; the original invoice is unchanged.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {(b.status === "pending" || (["confirmed","packed","shipped","refund_pending"].includes(b.status) && !b.receipt_recorded)) && <Button size="sm" onClick={() => confirm(b)}><Check className="h-4 w-4" /> {b.status === "pending" ? "Payment received" : "Verify original payment receipt"}</Button>}
              {b.status === "confirmed" && <Button size="sm" variant="secondary" onClick={() => move(b, "packed")}><Package className="h-4 w-4" /> {b.fulfillment === "pickup" ? "Ready for pickup" : "Packed"}</Button>}
              {b.fulfillment !== "pickup" && (b.status === "confirmed" || b.status === "packed") && <Button size="sm" variant="secondary" onClick={() => move(b, "shipped")}><Truck className="h-4 w-4" /> Out for delivery</Button>}
              {b.receipt_recorded && ["confirmed", "packed", "shipped"].includes(b.status) && <Button size="sm" onClick={() => setBilling(b)}><Receipt className="h-4 w-4" /> {b.fulfillment === "pickup" ? "Make bill" : "Delivered — make bill"}</Button>}
              <Button size="sm" variant="outline" asChild><a href={msg(b, b.status)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp update</a></Button>
              {["pending", "confirmed", "packed", "shipped"].includes(b.status) &&
                <Button size="sm" variant="ghost" onClick={() => cancel(b)}><X className="h-4 w-4" /> Cancel</Button>}
              {b.status === "refund_pending" && b.receipt_recorded && isOwner && <Button size="sm" onClick={() => setRefunding(b)}>Record completed refund</Button>}
              {b.refund_reference && <p className="text-xs" data-no-translate>{b.refund_reference}</p>}
            </div>
          </div>
        ))}
        {!isPending && !error && list.length === 0 && <p className="text-sm text-muted-foreground">No bookings here.</p>}
      </div>
      <ListPagination page={page} pageSize={pageSize} total={result?.count ?? 0} busy={isPending} onPage={setPage} />
      {update && <OrderUpdatePrompt url={msg(update.booking, update.status)} bookingNo={update.booking.booking_no} onClose={() => setUpdate(null)} />}
      {refunding && <RefundOrder b={refunding} onClose={() => setRefunding(null)} onDone={() => { refresh(); setUpdate({ booking: refunding, status: "refunded" }); }} />}
      {billing && <PickupBill b={billing} onClose={() => setBilling(null)} onDone={() => { refresh(); setUpdate({ booking: billing, status: billing.fulfillment === "pickup" ? "picked" : "delivered" }); }} />}
    </div>
  );
}

function PickupBill({ b, onClose, onDone }: { b: Booking; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"Cash" | "UPI">("Cash");
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState("0");
  const [rateEdited, setRateEdited] = useState(false);
  const {data: invoiceDefaults, error: defaultsError, isPending: defaultsPending}=useQuery({queryKey:["settings"],queryFn:async()=>{const r=await supabase.from("store_settings").select("*").eq("id",1).single();if(r.error)throw r.error;return r.data;}});
  useEffect(()=>{
    if(!invoiceDefaults || rateEdited)return;
    const gst=invoiceDefaults.default_bill_type==="gst" || (!invoiceDefaults.default_bill_type && !!invoiceDefaults.gstin?.trim());
    setRate(gst ? String(invoiceDefaults.default_gst_rate??5) : "0");
  },[invoiceDefaults,rateEdited]);
  const invoiceTotal = Number(b.price) + Number(b.delivery_charge || 0);
  const prepaid = Math.min(invoiceTotal, Number(b.advance));
  const rest = Math.max(0, invoiceTotal - prepaid);
  async function make() {
    setBusy(true);
    try {
      const bill = computeBill([{ variant_id: b.variant_id, product_name: b.product_name, brand: "", size: b.size, sku: null, price: invoiceTotal, qty: 1, max: 1 }], 0, 0, { billType: Number(rate) ? "gst" : "simple", taxMode: "inclusive", rate: Number(rate) || 0 });
      const { data, error } = await supabase.rpc("complete_catalog_booking", {
        _id: b.id,
        _sale: { payment_mode: mode === "Cash" && rest > 0 ? "Split" : "UPI", split_cash: mode === "Cash" ? rest : 0,
          bill_type: Number(rate) ? "gst" : "simple", tax_mode: "inclusive", subtotal: bill.subtotal, discount: 0, taxable: bill.taxable, gst_rate: bill.rate, gst_amount: bill.gst,
          total: bill.total, paid_amount: bill.total, due_amount: 0, give_stamp: true, delivery_charge: Number(b.delivery_charge || 0) },
        _items: [{ variant_id: b.variant_id, product_name: b.product_name, size: b.size, sku: null, price: b.price, qty: 1, discount: 0 }],
      });
      if (error) throw error;
      const billNo = (data as { bill_no: string }).bill_no;
      toast.success(`Bill ${billNo} made`);
      printBill(billNo).catch((e) => toast.error((e as Error).message));
      onDone(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Make bill</DialogTitle></DialogHeader>
        <p className="text-sm"><span data-no-translate>{b.product_name}</span> · <span>Size</span> {b.size} · <span data-no-translate>{b.customer_name}</span></p>
        <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between"><span>Bill total (including delivery)</span><b>{inr(invoiceTotal)}</b></div>
          <div className="flex justify-between"><span>Advance received (UPI)</span><b>− {inr(prepaid)}</b></div>
          <div className="flex justify-between border-t pt-1 text-base"><span>Collect now</span><b>{inr(rest)}</b></div>
        </div>
        <div className="flex gap-2">{(["Cash", "UPI"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md border py-2 text-sm font-semibold ${mode === m ? "border-primary bg-primary/10 text-primary" : ""}`}>{m}</button>)}</div>
        <label className="flex items-center justify-between text-sm"><span>GST % (price includes GST)</span><Input value={rate} onChange={(e) => {setRateEdited(true);setRate(e.target.value);}} className="h-9 w-20" inputMode="numeric" /></label>
        {defaultsError && <p role="alert">Invoice settings could not be loaded. Reopen this bill to retry.</p>}
        <Button disabled={busy || defaultsPending || !!defaultsError} onClick={make} className="h-11">{busy ? "Please wait…" : "Complete bill"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function RefundOrder({ b, onClose, onDone }: { b: Booking; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState("UPI");
  const [reference, setReference] = useState("");
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Record completed refund</DialogTitle></DialogHeader>
    <p>{b.booking_no} · {inr(b.advance)}</p><p className="text-sm text-muted-foreground">Send the refund using your bank/payment app first. This form records it; it does not transfer money.</p>
    <label>Refund method<select value={mode} onChange={e=>setMode(e.target.value)} className="h-11 w-full rounded border bg-background px-3">{["Cash","UPI","Card","Bank"].map(m=><option key={m}>{m}</option>)}</select></label>
    <label>Payment reference / receipt note<Input value={reference} maxLength={150} onChange={e=>setReference(e.target.value)} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={settled} onChange={e=>setSettled(e.target.checked)} />I have sent the refund and verified the amount.</label>
    <Button disabled={busy || !settled || reference.trim().length<3} onClick={async()=>{
      setBusy(true);
      try {const r=await runOperationalRequest(`order-refund:${b.id}`,"record_catalog_refund",{_id:b.id,_mode:mode,_reference:reference.trim()});if(r.error)throw r.error;toast.success("Refund recorded");onDone();onClose();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
    }}>{busy ? "Saving…" : "Record refund"}</Button>
  </DialogContent></Dialog>;
}

/** Saved status only. The owner explicitly opens WhatsApp and taps Send there. */
function OrderUpdatePrompt({ url, bookingNo, onClose }: { url: string; bookingNo: string; onClose: () => void }) {
  const { lang } = useLang();
  const copy = {
    english: { title: "Send customer an order update", saved: "Status saved. Send this update to the customer on WhatsApp.", send: "Send on WhatsApp", later: "Not now", note: "WhatsApp opens with this message. Tap Send there to deliver it." },
    hindi: { title: "ग्राहक को ऑर्डर की जानकारी भेजें", saved: "स्थिति सेव हो गई है। ग्राहक को WhatsApp पर यह जानकारी भेजें।", send: "WhatsApp पर भेजें", later: "अभी नहीं", note: "यह संदेश WhatsApp में खुलेगा। वहाँ भेजें दबाएँ।" },
    hinglish: { title: "Customer ko order update bhejein", saved: "Status save ho gaya. Customer ko WhatsApp par yeh update bhejein.", send: "WhatsApp par bhejein", later: "Abhi nahi", note: "WhatsApp mein yeh message khulega. Wahan Send dabayein." },
  }[lang];
  const message = new URL(url).searchParams.get("text") ?? "";
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent data-order-update-prompt data-no-translate>
    <DialogHeader><DialogTitle>{copy.title}</DialogTitle></DialogHeader>
    <p className="text-sm">{copy.saved}</p>
    <p className="text-xs font-semibold">{bookingNo}</p>
    <pre className="max-h-[35dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 font-sans text-sm">{message}</pre>
    <p className="text-xs text-muted-foreground">{copy.note}</p>
    <Button asChild className="h-auto min-h-11 whitespace-normal"><a href={url} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 shrink-0" />{copy.send}</a></Button>
    <Button variant="ghost" onClick={onClose}>{copy.later}</Button>
  </DialogContent></Dialog>;
}
