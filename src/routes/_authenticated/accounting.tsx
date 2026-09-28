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
  head: () => ({ meta: [{ title: "Accounting — SoleStack POS" }, { name: "description", content: "Expenses, cash book and monthly profit & loss." }, { property: "og:title", content: "Accounting — SoleStack POS" }, { property: "og:description", content: "Expenses, cash collections and monthly profit for BHAWANI FOOTWEAR." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Accounting,
});

const CATS = ["Rent", "Salary", "Electricity", "Transport", "Tea/Snacks", "Marketing", "Repair", "Other"];

function Accounting() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [f, setF] = useState({ category: "Rent", note: "", amount: "", mode: "Cash" });
  const { data } = useQuery({
    queryKey: ["acct", month],
    queryFn: async () => {
      const a = `${month}-01`;
      const next = new Date(a); next.setMonth(next.getMonth() + 1);
      const b = next.toISOString().slice(0, 10);
       const [e, s, c, p, r, cp] = await Promise.all([
        supabase.from("expenses").select("*").gte("spent_on", a).lt("spent_on", b).order("spent_on", { ascending: false }),
        supabase.from("sales").select("id,total,gst_amount,payment_mode,due_amount,split_cash").gte("sale_date", a).lt("sale_date", b).limit(10000),
        supabase.from("sale_costs").select("sale_id,total_cost"),
        supabase.from("purchases").select("total,paid_amount").gte("purchase_date", a).lt("purchase_date", b),
        supabase.from("sale_returns").select("refund").gte("created_at", a).lt("created_at", b),
         supabase.from("credit_payments").select("amount,payment_mode").gte("paid_at", a).lt("paid_at", b),
      ]);
       return { exp: e.data ?? [], sales: s.data ?? [], cost: new Map((c.data ?? []).map((x) => [x.sale_id, Number(x.total_cost)])), purch: p.data ?? [], refunds: (r.data ?? []).reduce((t, x) => t + Number(x.refund), 0), collections: cp.data ?? [] };
    },
  });
  const sales = data?.sales ?? [];
  const revenue = sales.reduce((a, s) => a + Number(s.total), 0);
  const gst = sales.reduce((a, s) => a + Number(s.gst_amount), 0);
  const cogs = sales.reduce((a, s) => a + (data?.cost.get(s.id) ?? 0), 0);
  const expenses = (data?.exp ?? []).reduce((a, e) => a + Number(e.amount), 0);
  const refunds = data?.refunds ?? 0;
  const net = revenue - gst - cogs - expenses - refunds;
  const creditCash = (data?.collections ?? []).filter((p) => p.payment_mode === "Cash").reduce((a, p) => a + Number(p.amount), 0);
  const cash = sales.reduce((a, s) => a + (s.payment_mode === "Cash" ? Number(s.total) - Number(s.due_amount) : s.payment_mode === "Split" ? Number(s.split_cash) : 0), 0) + creditCash;
  const purchases = (data?.purch ?? []).reduce((a, p) => a + Number(p.total), 0);

  async function add() {
    if (!Number(f.amount)) { toast.error("Enter amount"); return; }
    const { error } = await supabase.from("expenses").insert({ ...f, amount: Number(f.amount) });
    if (error) { toast.error(error.message); return; }
    setF({ ...f, note: "", amount: "" });
    qc.invalidateQueries({ queryKey: ["acct"] });
  }
  async function del(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["acct"] });
  }

  const pl: [string, number][] = [["Sales (incl. GST)", revenue], ["− GST payable", -gst], ["− Cost of shoes sold", -cogs], ["− Returns refunded", -refunds], ["− Expenses", -expenses]];
  return (
    <div>
      <PageHeader title="Accounting" subtitle="Monthly profit & loss, expenses and cash book." actions={
        <div className="flex gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10" />
          <Button variant="outline" onClick={() => downloadCsv(`accounts-${month}.csv`, [["item", "amount"], ...pl, ["Net profit", net], ["Cash sales", cash], ["Purchases", purchases]])}>CSV</Button>
        </div>
      } />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 font-semibold">Profit & Loss · {month}</p>
          {pl.map(([k, v]) => <div key={k} className="flex justify-between border-t py-1.5 text-sm"><span>{k}</span><b>{inr(v)}</b></div>)}
          <div className={`mt-1 flex justify-between border-t-2 pt-2 text-lg font-bold ${net >= 0 ? "text-success" : "text-destructive"}`}><span>Net profit</span><span>{inr(net)}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
             <div className="rounded-lg bg-muted p-2">Cash received<br /><b>{inr(cash)}</b><span className="block text-xs text-muted-foreground">Includes {inr(creditCash)} due collection</span></div>
            <div className="rounded-lg bg-muted p-2">Stock purchased<br /><b>{inr(purchases)}</b></div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 font-semibold">Add expense</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-10 rounded-md border bg-background px-2 text-sm">{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className="h-10 rounded-md border bg-background px-2 text-sm">{["Cash", "UPI", "Bank"].map((c) => <option key={c}>{c}</option>)}</select>
            <Input placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <Input placeholder="Amount ₹" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
          <Button className="mt-2 w-full" onClick={add}>Add</Button>
          <div className="mt-3 max-h-80 overflow-y-auto">
            {(data?.exp ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between border-t py-1.5 text-sm">
                <span>{e.spent_on} · {e.category} {e.note && `· ${e.note}`}</span>
                <span className="flex items-center gap-2"><b>{inr(e.amount)}</b><button onClick={() => del(e.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
