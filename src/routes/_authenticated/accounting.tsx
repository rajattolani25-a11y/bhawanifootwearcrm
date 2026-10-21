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
import { printHtml } from "@/lib/print";
import { useLang } from "@/lib/i18n";
import { useShop } from "@/hooks/use-shop";
import { fetchAll, one } from "@/lib/fetch-all";
import { requireOwnerRoute } from "@/lib/owner-route";

export const Route = createFileRoute("/_authenticated/accounting")({
  beforeLoad: requireOwnerRoute,
  head: () => ({ meta: [{ title: "Accounting — SoleStack POS" }, { name: "description", content: "Monthly profit, cash movements, tax and supplier balances." }, { property: "og:title", content: "Accounting — SoleStack POS" }, { property: "og:description", content: "Reconciled retail profit, cash book and tax summary." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Accounting,
});
const CATS = ["Rent", "Salary", "Electricity", "Transport", "Tea/Snacks", "Marketing", "Repair", "Other"];
const n = (x: number | null | undefined) => Number(x ?? 0);
const sum = <T,>(rows: T[], fn: (row: T) => number) => rows.reduce((a, x) => a + fn(x), 0);
function Accounting() {
  const qc = useQueryClient();
  const { t: tr } = useLang();
  const shop = useShop();
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0,7));
  const [tab, setTab] = useState<"Summary" | "Profit & Loss" | "Cash Book" | "Tax & Payables">("Summary");
  const [f, setF] = useState({ category: "Rent", note: "", amount: "", mode: "Cash" });
  const { data, error, isPending } = useQuery({ queryKey: ["acct", month], queryFn: async () => {
    const [year = 2026, mon = 1] = month.split("-").map(Number); const nextYear = mon === 12 ? year + 1 : year; const nextMonth = String(mon === 12 ? 1 : mon + 1).padStart(2,"0"); const start = `${month}-01T00:00:00+05:30`; const end = `${nextYear}-${nextMonth}-01T00:00:00+05:30`;
    const a = `${month}-01`; const b = `${nextYear}-${nextMonth}-01`;
    const all = <T,>(f:(x:number,y:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>)=>fetchAll(f);
    const [exp,sales,purchases,returns,cps,supplierPayments,allSales,allPurchases,custs,sups]=await Promise.all([
      all((x,y)=>supabase.from("expenses").select("*").gte("spent_on",a).lt("spent_on",b).order("spent_on",{ascending:false}).range(x,y)),
      all((x,y)=>supabase.from("sales").select("id,total,taxable,gst_amount,discount,payment_mode,paid_amount,due_amount,split_cash,sale_date,sale_costs(total_cost)").gte("sale_date",start).lt("sale_date",end).range(x,y)),
      all((x,y)=>supabase.from("purchases").select("total,paid_amount,gst_amount,purchase_date").gte("purchase_date",start).lt("purchase_date",end).range(x,y)),
      all((x,y)=>supabase.from("sale_returns").select("refund,kind,taxable_reversal,gst_reversal,cost_reversal,cash_refund,created_at").gte("created_at",start).lt("created_at",end).range(x,y)),
      all((x,y)=>supabase.from("credit_payments").select("sale_id,amount,payment_mode,paid_at").range(x,y)),
      all((x,y)=>supabase.from("supplier_payments").select("amount,payment_mode,paid_at").gte("paid_at",start).lt("paid_at",end).range(x,y)),
      all((x,y)=>supabase.from("sales").select("due_amount").gt("due_amount",0).range(x,y)),
      all((x,y)=>supabase.from("purchases").select("total,paid_amount").range(x,y)),
      all((x,y)=>supabase.from("customers").select("opening_balance").gt("opening_balance",0).range(x,y)),
      all((x,y)=>supabase.from("suppliers").select("opening_balance").gt("opening_balance",0).range(x,y)),
    ]);
    const s0=new Date(start).toISOString(), e0=new Date(end).toISOString();
    return { exp, sales, cost:new Map(sales.map(x=>[x.id,n(one(x.sale_costs as {total_cost:number}|{total_cost:number}[]|null)?.total_cost)])), purchases, returns, collections:cps.filter(x=>x.paid_at>=s0&&x.paid_at<e0), allCollections:cps, supplierPayments, receivable:sum(allSales,x=>n(x.due_amount))+sum(custs,x=>n(x.opening_balance)), payable:sum(allPurchases,x=>n(x.total)-n(x.paid_amount))+sum(sups,x=>n(x.opening_balance)) };
  }});
  const sales = data?.sales??[]; const returns=(data?.returns??[]).filter(x=>x.kind!=="exchange");
  const gross=sum(sales,x=>n(x.total)); const output=sum(sales,x=>n(x.gst_amount)); const returned=sum(returns,x=>n(x.refund)); const returnedTax=sum(returns,x=>n(x.gst_reversal));
  const netRevenue=gross-output-returned+returnedTax; const cogs=sum(sales,x=>data?.cost.get(x.id)??0)-sum(returns,x=>n(x.cost_reversal));
  const expense=sum(data?.exp??[],x=>n(x.amount)); const profit=netRevenue-cogs-expense;
  const later=new Map<string,number>();for(const p of data?.allCollections??[])later.set(p.sale_id,(later.get(p.sale_id)??0)+n(p.amount));
  const initPaid=(x:{id:string;paid_amount:number})=>Math.max(0,n(x.paid_amount)-(later.get(x.id)??0));
  const cashSales=sum(sales,x=>{const initiallyPaid=initPaid(x);return x.payment_mode==="Cash"?initiallyPaid:x.payment_mode==="Split"?Math.min(n(x.split_cash),initiallyPaid):0;});
  const cashCollections=sum((data?.collections??[]).filter(x=>x.payment_mode==="Cash"),x=>n(x.amount));
  const cashRefunds=sum(returns,x=>n(x.cash_refund)); const cashExpenses=sum((data?.exp??[]).filter(x=>x.mode==="Cash"),x=>n(x.amount)); const cashSuppliers=sum((data?.supplierPayments??[]).filter(x=>x.payment_mode==="Cash"),x=>n(x.amount));
  const cashNet=cashSales+cashCollections-cashRefunds-cashExpenses-cashSuppliers;
  const inputTax=sum(data?.purchases??[],x=>n(x.gst_amount)); const taxPayable=output-returnedTax-inputTax;
  const pl:[string,number][]=[["Sales (including GST)",gross],["− Output GST",-output],["− Returns (net of GST)",-(returned-returnedTax)],["− Cost of goods sold (net returns)",-cogs],["− Operating expenses",-expense]];
  const cashRows:[string,number][]=[["Cash collected at sale",cashSales],["Cash received against dues",cashCollections],["− Cash refunds",-cashRefunds],["− Cash expenses",-cashExpenses],["− Supplier cash payments",-cashSuppliers]];
  const taxRows:[string,number][]=[["Output GST on sales",output],["− GST reversed on returns",-returnedTax],["− Input GST on purchases",-inputTax]];
  async function add(){if(!Number.isFinite(Number(f.amount))||Number(f.amount)<=0){toast.error("Enter a positive amount");return;}const {error}=await supabase.from("expenses").insert({...f,amount:Number(f.amount)});if(error){toast.error(error.message);return;}setF({...f,note:"",amount:""});qc.invalidateQueries({queryKey:["acct"]});}
  async function del(id:string){const {error}=await supabase.from("expenses").delete().eq("id",id);if(error)toast.error(error.message);else qc.invalidateQueries({queryKey:["acct"]});}
  const byMode=new Map<string,number>();for(const x of sales){const paid=initPaid(x);if(x.payment_mode==="Split"){const c=Math.min(n(x.split_cash),paid);byMode.set("Cash",(byMode.get("Cash")??0)+c);byMode.set("UPI",(byMode.get("UPI")??0)+paid-c);}else byMode.set(x.payment_mode,(byMode.get(x.payment_mode)??0)+paid);}
  for(const x of data?.collections??[])byMode.set(x.payment_mode,(byMode.get(x.payment_mode)??0)+n(x.amount));
  const byCat=new Map<string,number>();for(const x of data?.exp??[])byCat.set(x.category,(byCat.get(x.category)??0)+n(x.amount));
  const margin=netRevenue>0?((netRevenue-cogs)/netRevenue)*100:0;
  const summary:[string,number][]=[["Bills",sales.length],["Average bill",sales.length?gross/sales.length:0],["Discount given",sum(sales,x=>n(x.discount))],["New udhar this month",sum(sales,x=>n(x.due_amount)+(later.get(x.id)??0))],["Purchases this month",sum(data?.purchases??[],x=>n(x.total))],...[...byMode].map(([k,v])=>[`Money received · ${k}`,v] as [string,number]),...[...byCat].map(([k,v])=>[`Expense · ${k}`,v] as [string,number])];
  const lines=tab==="Summary"?summary:tab==="Profit & Loss"?pl:tab==="Cash Book"?cashRows:taxRows;const value=tab==="Summary"||tab==="Profit & Loss"?profit:tab==="Cash Book"?cashNet:taxPayable;
  const netLabel=tab==="Summary"||tab==="Profit & Loss"?"Net profit":tab==="Cash Book"?"Net cash movement":"Net GST estimate";
  function pdf(){
    const e=(x:unknown)=>String(x??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]!);
    const tl=(k:string)=>k.replace(/^(− )?(.*?)( · .*)?$/,(_m,a,b,c)=>`${a??""}${tr(b)}${c??""}`);
    const kpis=tab==="Summary"?`<div class="g">${([["Sales",inr(gross)],["Net profit",inr(profit)],["Margin",`${margin.toFixed(1)}%`],["To receive",inr(data?.receivable??0)],["To pay",inr(data?.payable??0)],["Cash movement",inr(cashNet)]] as const).map(([k,v])=>`<div class="k"><small>${e(tr(k))}</small><b>${e(v)}</b></div>`).join("")}</div>`:"";
    const rows=lines.map(([k,v])=>`<tr><td>${e(tl(k))}</td><td class="r">${e(k==="Bills"?v:inr(v))}</td></tr>`).join("");
    const exp=(data?.exp??[]).length?`<h3>${e(tr("Expenses"))}</h3><table>${(data?.exp??[]).map(x=>`<tr><td>${e(x.spent_on)} · ${e(x.category)}${x.note?` · ${e(x.note)}`:""}</td><td class="r">${e(inr(x.amount))}</td></tr>`).join("")}</table>`:"";
    const body=`<div class="w"><h1>${e(shop.name)}</h1>${shop.phone?`<p class="m">${e(shop.phone)}</p>`:""}<h2>${e(tr(tab))} · ${e(month)}</h2>${kpis}<table>${rows}<tr class="t"><td>${e(tr(netLabel))}</td><td class="r">${e(inr(value))}</td></tr></table>${exp}<p class="m">${e(new Date().toLocaleString("en-IN"))}</p></div>`;
    printHtml(`Accounts ${tab} ${month}`,body,`.w{padding:24px;width:680px;color:#111}h1{margin:0;font-size:22px}h2{font-size:15px;margin:14px 0 8px;text-transform:uppercase;letter-spacing:1px;color:#555}h3{margin:18px 0 4px;font-size:14px}.m{color:#666;font-size:12px;margin:4px 0}table{width:100%;border-collapse:collapse;font-size:13px}td{border-bottom:1px solid #ddd;padding:7px 4px}.r{text-align:right}.t td{font-weight:bold;font-size:15px;border-top:2px solid #111}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.k{border:1px solid #ddd;border-radius:6px;padding:8px}.k small{display:block;color:#666}.k b{font-size:16px}`);
  }
  return <div><PageHeader title="Accounting" subtitle="Profit, cash movements and tax are separate views." actions={<div className="flex flex-wrap gap-2"><Input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="h-10"/><Button variant="outline" onClick={()=>downloadCsv(`accounts-${month}.csv`,[["item","amount"],...lines,[netLabel,value]])}>CSV</Button><Button variant="outline" onClick={pdf}>PDF</Button></div>}/>
  <div className="mb-4 flex gap-2 overflow-x-auto">{(["Summary","Profit & Loss","Cash Book","Tax & Payables"] as const).map(t=><Button key={t} variant={tab===t?"default":"outline"} onClick={()=>setTab(t)}>{t}</Button>)}</div>
  {error&&<p role="alert" className="text-destructive">Unable to load accounts: {error.message}</p>}{isPending&&<p>Loading accounts…</p>}
  <div className="grid gap-4 lg:grid-cols-2"><section className="border-t-2 border-primary py-4"><h2 className="mb-3 font-display text-lg font-semibold">{tab} · {month}</h2>{tab==="Summary"&&<div className="mb-3 grid grid-cols-2 gap-2">{([["Sales",inr(gross)],["Net profit",inr(profit)],["Margin",`${margin.toFixed(1)}%`],["To receive",inr(data?.receivable??0)],["To pay",inr(data?.payable??0)],["Cash movement",inr(cashNet)]] as const).map(([k,v])=><div key={k} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="font-display text-lg font-bold">{v}</p></div>)}</div>}{lines.map(([k,v])=><div key={k} className="flex justify-between gap-2 border-b py-2 text-sm"><span>{k}</span><b>{k==="Bills"?v:inr(v)}</b></div>)}<div className="flex justify-between gap-2 border-t-2 pt-3 text-lg font-bold"><span>{tab==="Summary"||tab==="Profit & Loss"?"Net profit":tab==="Cash Book"?"Net cash movement":"Net GST estimate"}</span><span>{inr(value)}</span></div>
  {tab==="Tax & Payables"&&<><p className="mt-4 text-sm">Customer receivables: <b>{inr(data?.receivable??0)}</b></p><p className="text-sm">Supplier payables: <b>{inr(data?.payable??0)}</b></p><p className="mt-2 text-xs text-muted-foreground">GST estimate from recorded bills and purchases; confirm eligibility and returns with your accountant.</p></>}
  {tab==="Profit & Loss"&&<p className="mt-3 text-xs text-muted-foreground">Historical bills with missing cost may overstate profit. Purchase stock at recorded cost for accurate future margins; old records are not silently changed.</p>}
  {tab==="Cash Book"&&<p className="mt-3 text-xs text-muted-foreground">Movement for this month, not an opening or closing cash balance. Supplier payments recorded here; older unrecorded payments are not assumed.</p>}</section>
  <section className="border-t-2 border-border py-4"><h2 className="mb-3 font-display text-lg font-semibold">Expenses</h2><div className="grid grid-cols-2 gap-2"><select value={f.category} onChange={e=>setF({...f,category:e.target.value})} className="h-10 rounded border bg-background px-2 text-sm">{CATS.map(c=><option key={c}>{c}</option>)}</select><select value={f.mode} onChange={e=>setF({...f,mode:e.target.value})} className="h-10 rounded border bg-background px-2 text-sm">{["Cash","UPI","Bank"].map(c=><option key={c}>{c}</option>)}</select><Input placeholder="Note" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/><Input placeholder="Amount ₹" inputMode="decimal" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></div><Button className="mt-2 w-full" onClick={add}>Add expense</Button><div className="mt-3 max-h-80 overflow-y-auto">{(data?.exp??[]).map(e=><div key={e.id} className="flex items-center justify-between border-t py-2 text-sm"><span>{e.spent_on} · {e.category} {e.note&&`· ${e.note}`}</span><span className="flex items-center gap-2"><b>{inr(e.amount)}</b><Button size="icon" variant="ghost" aria-label="Delete expense" onClick={()=>del(e.id)}><Trash2 className="h-4 w-4"/></Button></span></div>)}</div></section></div></div>;
}
