import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { downloadCsv } from "@/lib/stock";
import { fetchAll } from "@/lib/fetch-all";
import { useAuth } from "@/hooks/use-auth";
import { useShop } from "@/hooks/use-shop";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/khata")({
  head: () => ({ meta: [{ title: "Khatabook — SoleStack POS" }, { name: "description", content: "Customer and supplier khatabook with running balance." }, { property: "og:title", content: "Khatabook — SoleStack POS" }, { property: "og:description", content: "Customer and supplier khatabook with running balance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: KhataPage,
});

type Entry = { date: string; text: string; debit: number; credit: number };
type Party = { id: string; name: string; mobile: string; opening: number; balance: number; last: string };
const n = (x: unknown) => Number(x ?? 0);

function KhataPage() {
  const { isOwner } = useAuth();
  const { t } = useLang();
  const shop = useShop();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"customer" | "supplier">("customer");
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [id, setId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [pay, setPay] = useState({ amount: "", mode: "Cash" });
  const [busy, setBusy] = useState(false);
  const k = kind === "supplier" && !isOwner ? "customer" : kind;

  const { data: parties = [], isPending } = useQuery({
    queryKey: ["khata-parties", k],
    queryFn: async (): Promise<Party[]> => {
      if (k === "customer") {
        const [cs, sales] = await Promise.all([
          fetchAll((a, b) => supabase.from("customers").select("id,name,mobile,opening_balance").order("name").range(a, b)),
          fetchAll((a, b) => supabase.from("sales").select("customer_id,due_amount,sale_date").not("customer_id", "is", null).range(a, b)),
        ]);
        const due = new Map<string, number>(); const last = new Map<string, string>();
        for (const s of sales) { due.set(s.customer_id!, (due.get(s.customer_id!) ?? 0) + n(s.due_amount)); if ((last.get(s.customer_id!) ?? "") < s.sale_date) last.set(s.customer_id!, s.sale_date); }
        return cs.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile, opening: n(c.opening_balance), balance: n(c.opening_balance) + (due.get(c.id) ?? 0), last: last.get(c.id) ?? "" }));
      }
      const [ss, ps] = await Promise.all([
        fetchAll((a, b) => supabase.from("suppliers").select("id,name,phone,opening_balance").order("name").range(a, b)),
        fetchAll((a, b) => supabase.from("purchases").select("supplier_id,total,paid_amount,purchase_date").not("supplier_id", "is", null).range(a, b)),
      ]);
      const due = new Map<string, number>(); const last = new Map<string, string>();
      for (const p of ps) { due.set(p.supplier_id!, (due.get(p.supplier_id!) ?? 0) + n(p.total) - n(p.paid_amount)); if ((last.get(p.supplier_id!) ?? "") < p.purchase_date) last.set(p.supplier_id!, p.purchase_date); }
      return ss.map((s) => ({ id: s.id, name: s.name, mobile: s.phone ?? "", opening: n(s.opening_balance), balance: n(s.opening_balance) + (due.get(s.id) ?? 0), last: last.get(s.id) ?? "" }));
    },
  });

  const party = parties.find((p) => p.id === id);
  const { data: entries = [] } = useQuery({
    queryKey: ["khata-entries", k, id],
    enabled: !!party,
    queryFn: async (): Promise<Entry[]> => {
      const list: Entry[] = [];
      if (k === "customer") {
        const [sales, pays] = await Promise.all([
          fetchAll((a, b) => supabase.from("sales").select("id,bill_no,sale_date,total,due_amount").eq("customer_id", id!).range(a, b)),
          fetchAll((a, b) => supabase.from("credit_payments").select("sale_id,amount,payment_mode,paid_at").eq("customer_id", id!).range(a, b)),
        ]);
        for (const s of sales) {
          const later = pays.filter((p) => p.sale_id === s.id).reduce((a, p) => a + n(p.amount), 0);
          list.push({ date: s.sale_date, text: `Bill ${s.bill_no}`, debit: n(s.total), credit: Math.max(0, n(s.total) - n(s.due_amount) - later) });
        }
        for (const p of pays) list.push({ date: p.paid_at, text: `Credit received (${p.payment_mode})`, debit: 0, credit: n(p.amount) });
      } else {
        const [purchases, pays] = await Promise.all([
          fetchAll((a, b) => supabase.from("purchases").select("purchase_date,invoice_no,total,paid_amount").eq("supplier_id", id!).range(a, b)),
          fetchAll((a, b) => supabase.from("supplier_payments").select("amount,payment_mode,paid_at,note").eq("supplier_id", id!).range(a, b)),
        ]);
        // Group purchase lines of one invoice into a single khata entry.
        const inv = new Map<string, Entry>();
        for (const p of purchases) {
          const key = `${p.invoice_no ?? ""}|${p.purchase_date.slice(0, 10)}`;
          const e = inv.get(key) ?? { date: p.purchase_date, text: `Goods received${p.invoice_no ? " · Inv " + p.invoice_no : ""}`, debit: 0, credit: 0 };
          e.credit += n(p.total); inv.set(key, e);
        }
        list.push(...inv.values());
        for (const p of pays) list.push({ date: p.paid_at, text: `Payment made (${p.payment_mode})${p.note ? " · " + p.note : ""}`, credit: 0, debit: n(p.amount) });
        const extra = purchases.reduce((a, p) => a + n(p.paid_amount), 0) - pays.reduce((a, p) => a + n(p.amount), 0);
        const first = purchases.map((p) => p.purchase_date).sort()[0];
        if (extra > 0.5 && first) list.push({ date: first, text: "Paid at billing", credit: 0, debit: extra });
      }
      return list.sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  // Customer: debit = woh dega. Supplier: credit = hum denge.
  const rows = useMemo(() => {
    let bal = party?.opening ?? 0;
    return entries.map((e) => { bal += k === "customer" ? e.debit - e.credit : e.credit - e.debit; return { ...e, bal }; });
  }, [entries, party, k]);
  const balance = party?.balance ?? 0;
  const before = from ? rows.filter((r) => r.date.slice(0, 10) < from) : [];
  const shown = from ? rows.filter((r) => r.date.slice(0, 10) >= from) : rows;
  const openingShown = before.length ? before[before.length - 1]!.bal : party?.opening ?? 0;
  const totDebit = shown.reduce((a, r) => a + r.debit, 0), totCredit = shown.reduce((a, r) => a + r.credit, 0);

  const total = parties.reduce((a, p) => a + Math.max(0, p.balance), 0);
  const dueCount = parties.filter((p) => p.balance > 0.5).length;
  const filtered = parties
    .filter((p) => (!onlyDue || Math.abs(p.balance) > 0.5) && (p.name + p.mobile).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.balance - a.balance).slice(0, 300);
  const daysOld = (d: string) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null);

  function share() {
    if (!party) return;
    const last = shown.slice(-10).map((r) => `${r.date.slice(0, 10)} · ${label(r.text)} · ${inr(r.debit || r.credit)}`).join("\n");
    const tail = k === "customer" ? (balance > 0 ? `Your balance due: *${inr(balance)}*\nKindly clear it at the earliest.` : "You have no pending balance. Thank you!") : `Balance payable by us: *${inr(balance)}*`;
    const msg = `Dear ${party.name},\n\n*${shop.name} — Account statement*\n\n${last || "No entries"}\n\n${tail}\n\n${shop.name}${shop.phone ? "\n" + shop.phone : ""}`;
    const num = party.mobile.replace(/\D/g, "").slice(-10);
    window.open(`https://wa.me/${num ? "91" + num : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function receive() {
    const amt = Number(pay.amount);
    if (!party || !(amt > 0)) return void toast.error(t("Enter a valid amount"));
    if (amt > balance + 0.5) return void toast.error(`${t("Balance is only")} ${inr(balance)}`);
    setBusy(true);
    try {
      if (k === "supplier") {
        const { error } = await supabase.rpc("record_supplier_payment", { _supplier_id: party.id, _amount: amt, _mode: pay.mode, _note: "Khatabook" });
        if (error) throw error;
      } else {
        // Oldest due bills are cleared first; opening balance is reduced only after all bills.
        const { data: dues, error } = await supabase.from("sales").select("id,due_amount").eq("customer_id", party.id).gt("due_amount", 0).order("sale_date");
        if (error) throw error;
        let left = amt;
        for (const s of dues ?? []) {
          if (left <= 0) break;
          const part = Math.min(left, n(s.due_amount));
          const r = await supabase.rpc("collect_credit_payment", { _sale_id: s.id, _amount: part, _mode: pay.mode, _note: "Khatabook" });
          if (r.error) throw r.error;
          left -= part;
        }
        if (left > 0.5) {
          if (!isOwner) throw new Error(`${inr(left)} — ${t("only the Owner can reduce the opening balance")}`);
          const r = await supabase.from("customers").update({ opening_balance: Math.max(0, party.opening - left) }).eq("id", party.id);
          if (r.error) throw r.error;
        }
      }
      toast.success(t("Payment added to the account"));
      setPay({ ...pay, amount: "" });
      ["khata-parties", "khata-entries", "acct", "purchases-sum", "supplier-payments"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Khatabook" subtitle="Every entry with running balance for customers and suppliers." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={k === "customer" ? "default" : "outline"} onClick={() => { setKind("customer"); setId(null); }}>{t("Customer Ledger")}</Button>
        {isOwner && <Button variant={k === "supplier" ? "default" : "outline"} onClick={() => { setKind("supplier"); setId(null); }}>{t("Supplier Ledger")}</Button>}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{k === "customer" ? "Total to receive (from customers)" : "Total to pay (to suppliers)"}</p><p className={`font-display text-2xl font-bold ${k === "customer" ? "text-destructive" : ""}`}>{inr(total)}</p></div>
        <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Accounts with balance</p><p className="font-display text-2xl font-bold">{dueCount}</p></div>
        <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Total accounts</p><p className="font-display text-2xl font-bold">{parties.length}</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-xl border bg-card p-3">
          <Input placeholder={t("Search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only with balance</label>
          {isPending && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
          <ul className="mt-2 max-h-[60vh] divide-y overflow-y-auto text-sm">
            {filtered.map((p) => { const d = daysOld(p.last); return (
              <li key={p.id}><button className={`flex w-full items-center justify-between gap-2 px-2 py-2 text-left ${p.id === id ? "bg-accent" : ""}`} onClick={() => setId(p.id)}>
                <span className="min-w-0"><b className="block truncate">{p.name || p.mobile}</b><span className="text-xs text-muted-foreground">{p.mobile}{d !== null && p.balance > 0.5 ? ` · ${d} ${t("days")}` : ""}</span></span>
                <b className={p.balance > 0.5 ? (k === "customer" ? "text-destructive" : "") : "text-success"}>{inr(p.balance)}</b>
              </button></li>); })}
            {!isPending && !filtered.length && <li className="py-3 text-muted-foreground">No accounts</li>}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          {!party ? <p className="text-sm text-muted-foreground">Select an account from the list.</p> : <>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="text-lg font-semibold">{party.name}</h2><p className="text-xs text-muted-foreground">{party.mobile}</p>
                <p className="mt-1 text-sm">{k === "customer" ? "To receive" : "To pay"}: <b className={balance > 0.5 ? "text-destructive" : "text-success"}>{inr(balance)}</b></p></div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={share}>{t("Share on WhatsApp")}</Button>
                <Button variant="outline" onClick={() => downloadCsv(`khata-${party.name}.csv`, [["date", "details", "debit", "credit", "balance"], ["", "Opening", "", "", openingShown], ...shown.map((r) => [r.date.slice(0, 10), r.text, r.debit, r.credit, r.bal])])}>CSV</Button>
              </div>
            </div>
            {balance > 0.5 && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <span className="text-sm font-medium">{k === "customer" ? "Money received" : "Money paid"}</span>
              <Input className="h-9 w-28" inputMode="decimal" placeholder="₹" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <select className="h-9 rounded border bg-background px-2 text-sm" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{["Cash", "UPI", "Bank"].map((m) => <option key={m}>{m}</option>)}</select>
              <Button size="sm" disabled={busy} onClick={receive}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setPay({ ...pay, amount: String(Math.round(balance)) })}>Full</Button>
            </div>}
            <div className="mb-2 flex items-center gap-2 text-sm"><span>From date</span><Input type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />{from && <Button size="sm" variant="ghost" onClick={() => setFrom("")}>Clear</Button>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">{t("Date")}</th><th>{t("Details")}</th><th className="text-right">{k === "customer" ? "Credit given" : "Paid"}</th><th className="text-right">{k === "customer" ? "Received" : "Goods"}</th><th className="text-right">{t("Balance")}</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2">—</td><td>{from ? "Previous balance" : t("Opening balance")}</td><td /><td /><td className="text-right">{inr(openingShown)}</td></tr>
                  {shown.map((r, i) => (
                    <tr key={i} className="border-b"><td className="whitespace-nowrap py-2">{r.date.slice(0, 10)}</td><td>{label(r.text)}</td><td className="text-right">{r.debit ? inr(r.debit) : ""}</td><td className="text-right">{r.credit ? inr(r.credit) : ""}</td><td className="text-right font-medium">{inr(r.bal)}</td></tr>
                  ))}
                  <tr className="font-semibold"><td className="py-2" /><td>Total</td><td className="text-right">{inr(totDebit)}</td><td className="text-right">{inr(totCredit)}</td><td className="text-right">{inr(balance)}</td></tr>
                </tbody>
              </table>
            </div>
            {rows.length > 0 && Math.abs(rows[rows.length - 1]!.bal - balance) > 1 && <p className="mt-2 text-xs text-muted-foreground">Note: older imported bills may cause a small gap between entries and the final balance; the final balance is correct.</p>}
          </>}
        </div>
      </div>
    </div>
  );
}
