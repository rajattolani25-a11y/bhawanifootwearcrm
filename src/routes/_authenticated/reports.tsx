import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { downloadCsv } from "@/lib/stock";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — SoleStack POS" }, { name: "description", content: "Sales, GST, profit, brand and size reports." }, { property: "og:title", content: "Reports — SoleStack POS" }, { property: "og:description", content: "Sales, tax and footwear performance reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Reports,
});

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function Reports() {
  const [from, setFrom] = useState(day(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(day(new Date()));
  const { data } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const a = new Date(from + "T00:00:00+05:30").toISOString();
      const b = new Date(to + "T23:59:59+05:30").toISOString();
      const [s, c, r] = await Promise.all([
        supabase.from("sales").select("id,sale_date,payment_mode,total,taxable,gst_amount,gst_rate,discount,due_amount,sale_items(product_name,size,qty,price)").gte("sale_date", a).lte("sale_date", b).limit(10000),
        supabase.from("sale_costs").select("sale_id,profit,total_cost"),
        supabase.from("sale_returns").select("refund,created_at").gte("created_at", a).lte("created_at", b),
      ]);
      return { sales: s.data ?? [], costs: new Map((c.data ?? []).map((x) => [x.sale_id, x])), refunds: (r.data ?? []).reduce((t, x) => t + Number(x.refund), 0) };
    },
  });
  const sales = data?.sales ?? [];
  const tot = sales.reduce((a, s) => a + Number(s.total), 0);
  const gst = sales.reduce((a, s) => a + Number(s.gst_amount), 0);
  const profit = sales.reduce((a, s) => a + Number(data?.costs.get(s.id)?.profit ?? 0), 0);
  const pairs = sales.reduce((a, s) => a + s.sale_items.reduce((b, i) => b + i.qty, 0), 0);
  const group = (f: (s: (typeof sales)[number]) => string) => Object.entries(sales.reduce<Record<string, number>>((m, s) => ({ ...m, [f(s)]: (m[f(s)] ?? 0) + Number(s.total) }), {})).sort((a, b) => b[1] - a[1]);
  const byDay = group((s) => day(new Date(s.sale_date))).sort((a, b) => a[0].localeCompare(b[0]));
  const byPay = group((s) => s.payment_mode);
  const items = sales.flatMap((s) => s.sale_items);
  const top = Object.entries(items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.product_name]: (m[i.product_name] ?? 0) + i.qty }), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const bySize = Object.entries(items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.size]: (m[i.size] ?? 0) + i.qty }), {})).sort((a, b) => Number(a[0]) - Number(b[0]));
  const gstBy = Object.entries(sales.filter((s) => Number(s.gst_rate) > 0).reduce<Record<string, [number, number]>>((m, s) => { const k = `${s.gst_rate}%`; const v = m[k] ?? [0, 0]; return { ...m, [k]: [v[0] + Number(s.taxable), v[1] + Number(s.gst_amount)] }; }, {}));
  const max = Math.max(1, ...byDay.map((d) => d[1]));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Pick dates — everything updates." actions={
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
          <Button variant="outline" onClick={() => downloadCsv(`sales-${from}-${to}.csv`, [["date", "mode", "total", "taxable", "gst", "discount", "due", "profit"], ...sales.map((s) => [s.sale_date, s.payment_mode, s.total, s.taxable, s.gst_amount, s.discount, s.due_amount, data?.costs.get(s.id)?.profit ?? 0])])}>CSV</Button>
        </div>
      } />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Sales", inr(tot)], ["Bills", sales.length], ["Pairs", pairs], ["Profit", inr(profit)], ["GST collected", inr(gst)], ["Refunds", inr(data?.refunds ?? 0)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="font-display text-xl font-bold">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border bg-card p-4">
        <p className="mb-2 font-semibold">Daily sales</p>
        <div className="flex h-40 items-end gap-1">{byDay.map(([d, v]) => <div key={d} title={`${d}: ${inr(v)}`} className="flex-1 rounded-t bg-primary" style={{ height: `${(v / max) * 100}%` }} />)}</div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Box title="Payment mode" rows={byPay.map(([k, v]) => [k, inr(v)])} />
        <Box title="Top articles (pairs)" rows={top.map(([k, v]) => [k, String(v)])} />
        <Box title="Size-wise pairs" rows={bySize.map(([k, v]) => [`Size ${k}`, String(v)])} />
        <Box title="GST summary (taxable / tax)" rows={gstBy.map(([k, [t, g]]) => [k, `${inr(t)} / ${inr(g)}`])} />
      </div>
    </div>
  );
}

function Box({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-2 font-semibold">{title}</p>
      {rows.map(([k, v]) => <div key={k} className="flex justify-between border-t py-1 text-sm"><span className="truncate">{k}</span><b>{v}</b></div>)}
      {!rows.length && <p className="text-sm text-muted-foreground">No data</p>}
    </div>
  );
}
