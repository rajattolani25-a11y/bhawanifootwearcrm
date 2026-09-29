import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { downloadCsv } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({ meta: [{ title: "Accounting — SoleStack POS" }, { name: "description", content: "Monthly profit, cash movements, tax and supplier balances." }, { property: "og:title", content: "Accounting — SoleStack POS" }, { property: "og:description", content: "Reconciled retail profit, cash book and tax summary." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Accounting,
});
const CATS = ["Rent", "Salary", "Electricity", "Transport", "Tea/Snacks", "Marketing", "Repair", "Other"];
const n = (x: number | null | undefined) => Number(x ?? 0);
const sum = <T,>(rows: T[], fn: (row: T) => number) => rows.reduce((a, x) => a + fn(x), 0);
function Accounting() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0,7));
  const [tab, setTab] = useState<"Profit & Loss" | "Cash Book" | "Tax & Payables">("Profit & Loss");
  const [f, setF] = useState({ category: "Rent", note: "", amount: "", mode: "Cash" });
  const { data, error, isPending } = useQuery({ queryKey: ["acct", month], queryFn: async () => {
    const [year, mon] = month.split("-").map(Number); const start = `${month}-01T00:00:00+05:30`; const end = `${year}-${String(mon+1>12?1:mon+1).padStart(2,"0")}-01T00:00:00+05:30`.replace(String(year)+"-01-01", String(year+1)+"-01-01");
    const a = `${month}-01`; const b = `${mon===12?year+1:year}-${String(mon===12?1:mon+1).padStart(2,"0")}-01`;
    const [e,s,c,p,r,cp,sp,allSales,allPurchases] = await Promise.all([
      supabase.from("expenses").select("*").gte("spent_on",a).lt("spent_on",b).order("spent_on",{ascending:false}),
      supabase.from("sales").select("id,total,taxable,gst_amount,payment_mode,paid_amount,due_amount,split_cash,sale_date").gte("sale_date",start).lt("sale_date",end).limit(10000),
      supabase.from("sale_costs").select("sale_id,total_cost").limit(10000),
      supabase.from("purchases").select("total,paid_amount,gst_amount,purchase_date").gte("purchase_date",start).lt("purchase_date",end).limit(10000),
      supabase.from("sale_returns").select("refund,kind,taxable_reversal,gst_reversal,cost_reversal,cash_refund,created_at").gte("created_at",start).lt("created_at",end).limit(10000),
      supabase.from("credit_payments").select("amount,payment_mode,paid_at").gte("paid_at",start).lt("paid_at",end).limit(10000),
      supabase.from("supplier_payments").select("amount,payment_mode,paid_at").gte("paid_at",start).lt("paid_at",end).limit(10000),
      supabase.from("sales").select("due_amount").limit(10000),supabase.from("purchases").select("total,paid_amount").limit(10000),
    ]);
    for(const result of [e,s,c,p,r,cp,sp,allSales,allPurchases]) if(result.error) throw result.error;
    return { exp:e.data??[], sales:s.data??[], cost:new Map((c.data??[]).map(x=>[x.sale_id,n(x.total_cost)])), purchases:p.data??[], returns:r.data??[], collections:cp.data??[], supplierPayments:sp.data??[], receivable:sum(allSales.data??[],x=>n(x.due_amount)), payable:sum(allPurchases.data??[],x=>n(x.total)-n(x.paid_amount)) };
  }});
  const sales = data?.sales??[]; const returns=(data?.returns??[]).filter(x=>x.kind!=="exchange");
  const gross=sum(sales,x=>n(x.total)); const output=sum(sales,x=>n(x.gst_amount)); const returned=sum(returns,x=>n(x.refund)); const returnedTax=sum(returns,x=>n(x.gst_reversal));
  const netRevenue=gross-output-returned+returnedTax; const cogs=sum(sales,x=>data?.cost.get(x.id)??0)-sum(returns,x=>n(x.cost_reversal));
  const expense=sum(data?.exp??[],x=>n(x.amount)); const profit=netRevenue-cogs-expense;
  const cashSales=sum(sales,x=>x.payment_mode==="Cash"?n(x.paid_amount):x.payment_mode==="Split"?Math.min(n(x.split_cash),n(x.paid_amount)):0);
  const cashCollections=sum((data?.collections??[]).filter(x=>x.payment_mode==="Cash"),x=>n(x.amount));
  const cashRefunds=sum(returns,x=>n(x.cash_refund)); const cashExpenses=sum((data?.exp??[]).filter(x=>x.mode==="Cash"),x=>n(x.amount)); const cashSuppliers=sum((data?.supplierPayments??[]).filter(x=>x.payment_mode==="Cash"),x=>n(x.amount));
  const cashNet=cashSales+cashCollections-cashRefunds-cashExpenses-cashSuppliers;
  const inputTax=sum(data?.purchases??[],x=>n(x.gst_amount)); const taxPayable=output-returnedTax-inputTax;
  const pl:[string,number][]=[["Sales (including GST)",gross],["− Output GST",-output],["− Returns (net of GST)",-(returned-returnedTax)],["− Cost of goods sold (net returns)",-cogs],["− Operating expenses",-expense]];
  const cashRows:[string,number][]=[["Cash collected at sale",cashSales],["Cash received against dues",cashCollections],["− Cash refunds",-cashRefunds],["− Cash expenses",-cashExpenses],["− Supplier cash payments",-cashSuppliers]];
  const taxRows:[string,number][]=[["Output GST on sales",output],["− GST reversed on returns",-returnedTax],["− Input GST on purchases",-inputTax]];
  async function add(){if(!Number.isFinite(Number(f.amount))||Number(f.amount)<=0){toast.error("Enter a positive amount");return;}const {error}=await supabase.from("expenses").insert({...f,amount:Number(f.amount)});if(error){toast.error(error.message);return;}setF({...f,note:"",amount:""});qc.invalidateQueries({queryKey:["acct"]});}
  async function del(id:string){const {error}=await supabase.from("expenses").delete().eq("id",id);if(error)toast.error(error.message);else qc.invalidateQueries({queryKey:["acct"]});}
  const lines=tab==="Profit & Loss"?pl:tab==="Cash Book"?cashRows:taxRows;const value=tab==="Profit & Loss"?profit:tab==="Cash Book"?cashNet:taxPayable;
  return <div><PageHeader title="Accounting" subtitle="Profit, cash movements and tax are separate views." actions={<div className="flex gap-2"><Input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-10"/><Button variant="outline" onClick={()=>downloadCsv(`accounts-${month}.csv`,[["item","amount"],...lines,[tab==="Profit & Loss"?"Net profit":tab==="Cash Book"?"Net cash movement":"Net GST estimate",value]])}>CSV</Button></div>}/>
  <div className="mb-4 flex gap-2 overflow-x-auto">{(["Profit & Loss","Cash Book","Tax & Payables"] as const).map(t=><Button key={t} variant={tab===t?"default":"outline"} onClick={()=>setTab(t)}>{t}</Button>)}</div>
  {error&&<p role="alert" className="text-destructive">Unable to load accounts: {error.message}</p>}{isPending&&<p>Loading accounts…</p>}
  <div className="grid gap-4 lg:grid-cols-2"><section className="border-t-2 border-primary py-4"><h2 className="mb-3 font-display text-lg font-semibold">{tab} · {month}</h2>{lines.map(([k,v])=><div key={k} className="flex justify-between gap-2 border-b py-2 text-sm"><span>{k}</span><b>{inr(v)}</b></div>)}<div className="flex justify-between gap-2 border-t-2 pt-3 text-lg font-bold"><span>{tab==="Profit & Loss"?"Net profit":tab==="Cash Book"?"Net cash movement":"Net GST estimate"}</span><span>{inr(value)}</span></div>
  {tab==="Tax & Payables"&&<><p className="mt-4 text-sm">Customer receivables: <b>{inr(data?.receivable??0)}</b></p><p className="text-sm">Supplier payables: <b>{inr(data?.payable??0)}</b></p><p className="mt-2 text-xs text-muted-foreground">GST estimate from recorded bills and purchases; confirm eligibility and returns with your accountant.</p></>}
  {tab==="Profit & Loss"&&<p className="mt-3 text-xs text-muted-foreground">Historical bills with missing cost may overstate profit. Purchase stock at recorded cost for accurate future margins; old records are not silently changed.</p>}
  {tab==="Cash Book"&&<p className="mt-3 text-xs text-muted-foreground">Movement for this month, not an opening or closing cash balance. Supplier payments recorded here; older unrecorded payments are not assumed.</p>}</section>
  <section className="border-t-2 border-border py-4"><h2 className="mb-3 font-display text-lg font-semibold">Expenses</h2><div className="grid grid-cols-2 gap-2"><select value={f.category} onChange={e=>setF({...f,category:e.target.value})} className="h-10 rounded border bg-background px-2 text-sm">{CATS.map(c=><option key={c}>{c}</option>)}</select><select value={f.mode} onChange={e=>setF({...f,mode:e.target.value})} className="h-10 rounded border bg-background px-2 text-sm">{["Cash","UPI","Bank"].map(c=><option key={c}>{c}</option>)}</select><Input placeholder="Note" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/><Input placeholder="Amount ₹" inputMode="decimal" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></div><Button className="mt-2 w-full" onClick={add}>Add expense</Button><div className="mt-3 max-h-80 overflow-y-auto">{(data?.exp??[]).map(e=><div key={e.id} className="flex items-center justify-between border-t py-2 text-sm"><span>{e.spent_on} · {e.category} {e.note&&`· ${e.note}`}</span><span className="flex items-center gap-2"><b>{inr(e.amount)}</b><Button size="icon" variant="ghost" aria-label="Delete expense" onClick={()=>del(e.id)}><Trash2 className="h-4 w-4"/></Button></span></div>)}</div></section></div></div>;
}
