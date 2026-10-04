import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { useAuth } from "@/hooks/use-auth";
import { useShop } from "@/hooks/use-shop";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/khata")({
  head: () => ({ meta: [{ title: "Khata — SoleStack POS" }, { name: "description", content: "Customer and supplier ledgers with running balance." }, { property: "og:title", content: "Khata — SoleStack POS" }, { property: "og:description", content: "Customer and supplier ledgers with running balance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: KhataPage,
});

type Entry = { date: string; text: string; debit: number; credit: number };
type Party = { id: string; name: string; mobile: string; opening: number };

function KhataPage() {
  const { isOwner } = useAuth();
  const { t } = useLang();
  const shop = useShop();
  const [kind, setKind] = useState<"customer" | "supplier">("customer");
  const [q, setQ] = useState("");
  const [id, setId] = useState<string | null>(null);

  const { data: parties = [] } = useQuery({
    queryKey: ["khata-parties", kind],
    queryFn: async (): Promise<Party[]> => {
      if (kind === "customer") {
        const { data } = await supabase.from("customers").select("id,name,mobile,opening_balance").order("name").limit(5000);
        return (data ?? []).map((c) => ({ id: c.id, name: c.name ?? "", mobile: c.mobile ?? "", opening: Number(c.opening_balance ?? 0) }));
      }
      const { data } = await supabase.from("suppliers").select("id,name,phone,opening_balance").order("name");
      return (data ?? []).map((s) => ({ id: s.id, name: s.name ?? "", mobile: s.phone ?? "", opening: Number(s.opening_balance ?? 0) }));
    },
  });

  const party = parties.find((p) => p.id === id);
  const { data: entries = [] } = useQuery({
    queryKey: ["khata-entries", kind, id],
    enabled: !!party,
    queryFn: async (): Promise<Entry[]> => {
      const list: Entry[] = [];
      if (kind === "customer") {
        const [{ data: sales }, { data: pays }] = await Promise.all([
          supabase.from("sales").select("id,bill_no,sale_date,total,due_amount").eq("customer_id", id!),
          supabase.from("credit_payments").select("sale_id,amount,payment_mode,paid_at").eq("customer_id", id!),
        ]);
        for (const s of sales ?? []) {
          const later = (pays ?? []).filter((p) => p.sale_id === s.id).reduce((a, p) => a + Number(p.amount), 0);
          const paidNow = Math.max(0, Number(s.total) - Number(s.due_amount) - later);
          list.push({ date: s.sale_date, text: `Bill ${s.bill_no ?? ""}`, debit: Number(s.total), credit: paidNow });
        }
        for (const p of pays ?? []) list.push({ date: p.paid_at, text: `Udhar payment (${p.payment_mode})`, debit: 0, credit: Number(p.amount) });
      } else {
        const [{ data: purchases }, { data: pays }] = await Promise.all([
          supabase.from("purchases").select("purchase_date,invoice_no,total,paid_amount").eq("supplier_id", id!),
          supabase.from("supplier_payments").select("amount,payment_mode,paid_at,note").eq("supplier_id", id!),
        ]);
        const paidOnBills = (purchases ?? []).reduce((a, p) => a + Number(p.paid_amount ?? 0), 0);
        const payTotal = (pays ?? []).reduce((a, p) => a + Number(p.amount), 0);
        for (const p of purchases ?? []) list.push({ date: p.purchase_date, text: `Purchase ${p.invoice_no ?? ""}`, credit: Number(p.total), debit: 0 });
        for (const p of pays ?? []) list.push({ date: p.paid_at, text: `Payment (${p.payment_mode})${p.note ? " · " + p.note : ""}`, credit: 0, debit: Number(p.amount) });
        const extra = paidOnBills - payTotal;
        const first = (purchases ?? []).map((p) => p.purchase_date).sort()[0];
        if (extra > 0.5 && first) list.push({ date: first, text: "Paid at purchase time", credit: 0, debit: extra });
      }
      return list.sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  // Customer: debit = they owe us. Supplier: credit = we owe them.
  const rows = useMemo(() => {
    let bal = party?.opening ?? 0;
    return entries.map((e) => { bal += kind === "customer" ? e.debit - e.credit : e.credit - e.debit; return { ...e, bal }; });
  }, [entries, party, kind]);
  const balance = rows.length ? rows[rows.length - 1]!.bal : party?.opening ?? 0;

  if (kind === "supplier" && !isOwner) setKind("customer");
  const filtered = parties.filter((p) => (p.name + p.mobile).toLowerCase().includes(q.toLowerCase())).slice(0, 200);

  function share() {
    if (!party) return;
    const last = rows.slice(-8).map((r) => `${r.date.slice(0, 10)} · ${r.text} · ${inr(r.debit || r.credit)}`).join("\n");
    const msg = `Namaste ${party.name},\n\n${shop.name} — Khata statement\n\n${last}\n\nCurrent balance: ${inr(balance)}\n\nThank you,\n${shop.name}${shop.phone ? "\n" + shop.phone : ""}`;
    const num = party.mobile.replace(/\D/g, "").slice(-10);
    window.open(`https://wa.me/${num ? "91" + num : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div>
      <PageHeader title="Khata" subtitle="Every entry with running balance for customers and suppliers." />
      <div className="mb-4 flex gap-2">
        <Button variant={kind === "customer" ? "default" : "outline"} onClick={() => { setKind("customer"); setId(null); }}>{t("Customer Ledger")}</Button>
        {isOwner && <Button variant={kind === "supplier" ? "default" : "outline"} onClick={() => { setKind("supplier"); setId(null); }}>{t("Supplier Ledger")}</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border bg-card p-3">
          <Input placeholder={t("Search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 max-h-[60vh] divide-y overflow-y-auto text-sm">
            {filtered.map((p) => (
              <li key={p.id}><button className={`w-full px-2 py-2 text-left ${p.id === id ? "bg-accent" : ""}`} onClick={() => setId(p.id)}><b className="block">{p.name || p.mobile}</b><span className="text-xs text-muted-foreground">{p.mobile}</span></button></li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          {!party ? <p className="text-sm text-muted-foreground">←</p> : <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-lg font-semibold">{party.name}</h2><p className="text-sm">{t("Balance")}: <b className={balance > 0 ? "text-destructive" : "text-success"}>{inr(balance)}</b></p></div>
              <Button onClick={share}>{t("Share on WhatsApp")}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">{t("Date")}</th><th>{t("Details")}</th><th className="text-right">{t("Debit")}</th><th className="text-right">{t("Credit")}</th><th className="text-right">{t("Balance")}</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2">—</td><td>{t("Opening balance")}</td><td /><td /><td className="text-right">{inr(party.opening)}</td></tr>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b"><td className="py-2 whitespace-nowrap">{r.date.slice(0, 10)}</td><td>{r.text}</td><td className="text-right">{r.debit ? inr(r.debit) : ""}</td><td className="text-right">{r.credit ? inr(r.credit) : ""}</td><td className="text-right font-medium">{inr(r.bal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
