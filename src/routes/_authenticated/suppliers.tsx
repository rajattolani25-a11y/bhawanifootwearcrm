import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, MessageCircle, Trash2 } from "lucide-react";
import { printHtml } from "@/lib/print";
import { PDF_CSS } from "./customers";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { waLink } from "@/lib/pos";
import { useShop } from "@/hooks/use-shop";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — SoleStack POS" }, { name: "description", content: "Supplier list, dues and WhatsApp rate-list requests." }, { property: "og:title", content: "Suppliers — SoleStack POS" }, { property: "og:description", content: "Supplier balances and professional rate-list requests." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Suppliers,
});

function Suppliers() {
  const qc = useQueryClient();
  const shop = useShop();
  const { isOwner } = useAuth();
  const [f, setF] = useState({ name: "", phone: "", gstin: "", address: "", opening_balance: "" });
  const [ob, setOb] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payment, setPayment] = useState({ amount: "", mode: "Cash", note: "" });
  const { data = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [] });
  const { data: purchases = [] } = useQuery({ queryKey: ["purchases-sum"], queryFn: async () => (await supabase.from("purchases").select("id,supplier_id,purchase_date,invoice_no,quantity,purchase_price,total,paid_amount").order("purchase_date",{ascending:false})).data ?? [] });
  const { data: payments = [] } = useQuery({ queryKey: ["supplier-payments"], queryFn: async () => (await supabase.from("supplier_payments").select("id,supplier_id,amount,payment_mode,paid_at,note").order("paid_at",{ascending:false})).data ?? [] });
  const openingOf = (id: string) => Number(data.find((s) => s.id === id)?.opening_balance ?? 0);
  const sum = (id: string) => purchases.filter((p) => p.supplier_id === id).reduce<[number, number]>((a, p) => [a[0] + Number(p.total), a[1] + Number(p.paid_amount ?? 0)], [openingOf(id), 0]);

  async function add() {
    if (!f.name.trim()) { toast.error("Name required"); return; }
    const { error } = await supabase.from("suppliers").insert({ ...f, opening_balance: Math.max(0, Number(f.opening_balance) || 0) });
    if (error) { toast.error(error.message); return; }
    setF({ name: "", phone: "", gstin: "", address: "", opening_balance: "" });
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  async function del(id: string) {
    if (!confirm("Delete supplier?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { toast.error("Has purchases — cannot delete"); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  async function recordPayment() {
    if (!selected || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) { toast.error("Enter a positive amount"); return; }
    const { error } = await supabase.rpc("record_supplier_payment", { _supplier_id: selected, _amount: Number(payment.amount), _mode: payment.mode, _note: payment.note });
    if (error) { toast.error(error.message); return; }
    toast.success("Supplier payment saved"); setPayment({ amount: "", mode: "Cash", note: "" }); qc.invalidateQueries({ queryKey: ["purchases-sum"] }); qc.invalidateQueries({ queryKey: ["supplier-payments"] }); qc.invalidateQueries({ queryKey: ["acct"] });
  }
  const current = data.find((s) => s.id === selected);
  function exportPdf() {
    const e = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    let T = 0, P = 0;
    const rows = data.map((s, i) => {
      const [tot, paid] = sum(s.id); T += tot; P += paid;
      const ps = purchases.filter((p) => p.supplier_id === s.id);
      const last = ps[0];
      const pairs = ps.reduce((a, p) => a + Number(p.quantity ?? 0), 0);
      return `<tr><td>${i + 1}</td><td><b>${e(s.name)}</b><br/><span class="m">${e(s.address || "")}</span></td><td>${e(s.phone || "—")}<br/><span class="m">${e(s.gstin || "")}</span></td><td class="r">${pairs}</td><td>${last ? `${e(new Date(last.purchase_date).toLocaleDateString("en-IN"))}<br/><span class="m">${e(last.invoice_no || "")}</span>` : "—"}</td><td class="r">${e(inr(tot))}</td><td class="r">${e(inr(paid))}</td><td class="r"><b>${e(inr(tot - paid))}</b></td></tr>`;
    }).join("");
    const body = `<div class="w"><h1>${e(shop.name)}</h1>${shop.phone ? `<p class="m">${e(shop.phone)}</p>` : ""}<h2>Supplier Summary</h2><p class="m">Date: ${e(new Date().toLocaleDateString("en-IN"))} · Suppliers: ${data.length}</p>
<table><thead><tr><th>#</th><th>Party</th><th>Phone / GSTIN</th><th class="r">Pairs</th><th>Last purchase</th><th class="r">Purchased</th><th class="r">Paid</th><th class="r">Pending</th></tr></thead><tbody>${rows}
<tr class="t"><td></td><td colspan="4">Total</td><td class="r">${e(inr(T))}</td><td class="r">${e(inr(P))}</td><td class="r">${e(inr(T - P))}</td></tr></tbody></table>
<p class="b">Total to pay: ${e(inr(T - P))}</p></div>`;
    printHtml("Supplier Summary", body, PDF_CSS);
  }
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Who you buy from, how much is pending." actions={<Button variant="outline" className="h-11" onClick={exportPdf}><FileText className="h-4 w-4" /> Export PDF</Button>} />
      <div className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-6">
        <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
        <Input placeholder="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Input type="number" min="0" placeholder="Opening balance ₹" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} />
        <Button onClick={add}>Add supplier</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((s) => {
          const [tot, paid] = sum(s.id);
          return (
            <div key={s.id} className="rounded-xl border bg-card p-4">
               <div className="flex justify-between"><Button variant="link" className="h-auto p-0 text-left font-semibold" onClick={() => setSelected(s.id)}>{s.name}</Button><Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => del(s.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></div>
              <p className="text-xs text-muted-foreground">{s.phone} {s.gstin && `· ${s.gstin}`}</p>
              <p className="mt-2 text-sm">Purchased {inr(tot)} · <span className="text-destructive">Pending {inr(tot - paid)}</span></p>
              {s.phone && (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <a target="_blank" rel="noreferrer" href={waLink(s.phone, `Hello ${s.name},\n\nThis is ${shop.name}. Please share your latest footwear rate list / catalogue and delivery time.\nThank you.${shop.phone ? `\n${shop.phone}` : ""}`)}><MessageCircle className="h-3.5 w-3.5" /> Ask rate list</a>
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{current?.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{current?.phone} · {current?.gstin} · {current?.address}</p>
        <div className="grid grid-cols-3 gap-2 border-y py-3 text-sm"><div>Purchased<br /><b>{inr(current ? sum(current.id)[0] : 0)}</b></div><div>Paid<br /><b>{inr(current ? sum(current.id)[1] : 0)}</b></div><div>Due<br /><b>{inr(current ? sum(current.id)[0]-sum(current.id)[1] : 0)}</b></div></div>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span>Opening balance (included above): <b>{inr(current ? openingOf(current.id) : 0)}</b></span>{isOwner && (ob === null ? <Button size="sm" variant="outline" onClick={() => setOb(String(current ? openingOf(current.id) : 0))}>Edit</Button> : <><Input className="h-8 w-28" type="number" min="0" value={ob} onChange={(e) => setOb(e.target.value)} /><Button size="sm" onClick={async () => { const { error } = await supabase.from("suppliers").update({ opening_balance: Math.max(0, Number(ob) || 0) }).eq("id", selected!); if (error) return void toast.error(error.message); setOb(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Opening balance saved"); }}>Save</Button></>)}</div>
        <h3 className="font-semibold">Record payment</h3><div className="flex flex-wrap gap-2"><Input className="min-w-28 flex-1" type="number" min="0.01" step="0.01" placeholder="Amount ₹" value={payment.amount} onChange={(e) => setPayment({...payment,amount:e.target.value})}/><select aria-label="Payment mode" className="rounded border bg-background px-2" value={payment.mode} onChange={(e) => setPayment({...payment,mode:e.target.value})}>{["Cash","UPI","Card","Bank"].map((m)=><option key={m}>{m}</option>)}</select><Button onClick={recordPayment}>Save</Button></div><Input placeholder="Note (optional)" value={payment.note} onChange={(e) => setPayment({...payment,note:e.target.value})}/>
        <h3 className="font-semibold">Purchase history</h3><div className="max-h-44 overflow-y-auto text-sm">{purchases.filter((p)=>p.supplier_id===selected).map((p)=><div key={p.id} className="flex justify-between border-t py-2"><span>{new Date(p.purchase_date).toLocaleDateString("en-IN")} · {p.invoice_no || "No invoice"} · {p.quantity} pairs</span><span>{inr(p.total)} · Due {inr(Number(p.total)-Number(p.paid_amount || 0))}</span></div>)}</div>
        <h3 className="font-semibold">Payment history</h3><div className="max-h-36 overflow-y-auto text-sm">{payments.filter((p)=>p.supplier_id===selected).map((p)=><div key={p.id} className="flex justify-between border-t py-2"><span>{new Date(p.paid_at).toLocaleDateString("en-IN")} · {p.payment_mode} {p.note}</span><b>{inr(p.amount)}</b></div>)}</div>
      </DialogContent></Dialog>
    </div>
  );
}
