import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SoleStack POS" }, { name: "description", content: "Retail control room: sales, stock and alerts." }, { property: "og:title", content: "Dashboard — SoleStack POS" }, { property: "og:description", content: "Retail control room for BHAWANI FOOTWEAR." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const dayKey = (d: Date) => d.toLocaleDateString("en-CA");

function Dashboard() {
  const qc = useQueryClient();
  const { isOwner, user } = useAuth();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data } = useQuery({
    queryKey: ["dashboard", isOwner],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [sales, variants, moves, costs, pcosts, settings] = await Promise.all([
        supabase.from("sales").select("id,sale_date,total,paid_amount,due_amount,gst_amount,payment_mode,split_cash,customer_id,sale_items(qty,price,variant_id)").gte("sale_date", since.toISOString()).order("sale_date", { ascending: false }),
        supabase.from("product_variants").select("id,size,stock,min_stock,created_at,product_id,products(brand,article,category)"),
        supabase.from("stock_movements").select("id,moved_at,type,product_name,qty_in,qty_out,product_variants(size)").order("moved_at", { ascending: false }).limit(8),
        isOwner ? supabase.from("sale_costs").select("sale_id,profit") : Promise.resolve({ data: [] as { sale_id: string; profit: number }[] }),
        isOwner ? supabase.from("product_costs").select("product_id,purchase_price") : Promise.resolve({ data: [] as { product_id: string; purchase_price: number }[] }),
        supabase.from("store_settings").select("business_name,daily_target").eq("id", 1).single(),
      ]);
      return { sales: sales.data ?? [], variants: variants.data ?? [], moves: moves.data ?? [], costs: costs.data ?? [], pcosts: pcosts.data ?? [], settings: settings.data };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const m = useMemo(() => {
    const sales = data?.sales ?? [];
    const variants = data?.variants ?? [];
    const today = dayKey(new Date());
    const todays = sales.filter((s) => dayKey(new Date(s.sale_date)) === today);
    const profitBySale = new Map((data?.costs ?? []).map((c) => [c.sale_id, Number(c.profit)]));
    const costByProduct = new Map((data?.pcosts ?? []).map((c) => [c.product_id, Number(c.purchase_price)]));
    const variantInfo = new Map(variants.map((v) => [v.id, v]));

    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const k = dayKey(d);
      return { label: d.toLocaleDateString("en-IN", { weekday: "short" }), value: sales.filter((s) => dayKey(new Date(s.sale_date)) === k).reduce((a, s) => a + Number(s.total), 0) };
    });

    const pay: Record<string, number> = {};
    const cat: Record<string, number> = {};
    const sold = new Map<string, number>();
    for (const s of sales) {
      pay[s.payment_mode] = (pay[s.payment_mode] ?? 0) + Number(s.paid_amount || s.total);
      for (const it of s.sale_items) {
        const v = it.variant_id ? variantInfo.get(it.variant_id) : undefined;
        const c = v?.products?.category || "Other";
        cat[c] = (cat[c] ?? 0) + it.qty * Number(it.price);
        if (it.variant_id) sold.set(it.variant_id, (sold.get(it.variant_id) ?? 0) + it.qty);
      }
    }
    const rows = (o: Record<string, number>) => Object.entries(o).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);

    const brands: Record<string, number> = {};
    const sizes: Record<string, number> = {};
    for (const v of variants) {
      const b = v.products?.brand || "Other";
      brands[b] = (brands[b] ?? 0) + v.stock;
      sizes[v.size] = (sizes[v.size] ?? 0) + v.stock;
    }
    const cutoff = Date.now() - 60 * 86400000;
    const dead = variants.filter((v) => v.stock > 0 && !sold.has(v.id) && new Date(v.created_at).getTime() < cutoff);
    const reorder = variants.filter((v) => v.stock < Math.max(3, v.min_stock)).sort((a, b) => a.stock - b.stock);

    const todaySales = todays.reduce((a, s) => a + Number(s.total), 0);
    const cashIn = todays.reduce((a, s) => a + (s.payment_mode === "Cash" ? Number(s.paid_amount || s.total) : s.payment_mode === "Split" ? Number(s.split_cash) : 0), 0);
    const target = Number(data?.settings?.daily_target ?? 0);
    return {
      todaySales,
      bills: todays.length,
      profit: todays.reduce((a, s) => a + (profitBySale.get(s.id) ?? 0), 0),
      stockValue: variants.reduce((a, v) => a + v.stock * (costByProduct.get(v.product_id) ?? 0), 0),
      credit: sales.reduce((a, s) => a + Number(s.due_amount), 0),
      gst: todays.reduce((a, s) => a + Number(s.gst_amount), 0),
      cashIn,
      pairs: variants.reduce((a, v) => a + v.stock, 0),
      low: variants.filter((v) => v.stock > 0 && v.stock < 3).length,
      out: variants.filter((v) => v.stock === 0).length,
      target,
      trend,
      pay: rows(pay),
      cat: rows(cat),
      brands: rows(brands),
      sizes: Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0])),
      dead: dead.slice(0, 5),
      reorder: reorder.slice(0, 5),
      returning: new Set(todays.map((s) => s.customer_id).filter(Boolean)).size,
    };
  }, [data]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (user?.user_metadata?.["full_name"] as string | undefined) ?? "";
  const maxTrend = Math.max(1, ...m.trend.map((t) => t.value));
  const maxSize = Math.max(1, ...m.sizes.map(([, n]) => n));
  const maxBrand = Math.max(1, ...m.brands.map((b) => b.value));
  const targetPct = m.target ? Math.min(100, Math.round((m.todaySales / m.target) * 100)) : 0;
  const nextAction = m.out > 0 ? `${m.out} sizes are out of stock — reorder the fast movers.` : m.dead.length ? `${m.dead.length} sizes haven't sold in 60+ days — plan an offer.` : "Stock looks healthy. Keep billing!";
  const ticker = `Today ${inr(m.todaySales)} from ${m.bills} bills · ${m.pairs.toLocaleString("en-IN")} pairs in stock · ${m.low} low · ${m.out} out`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-lg bg-sidebar p-6 text-sidebar-foreground md:p-8">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary">Retail Control Room · {data?.settings?.business_name}</p>
            <h1 className="mt-2 text-2xl font-bold text-sidebar-accent-foreground md:text-3xl">{greet}{name ? `, ${name}` : ""}. Your shop pulse is ready.</h1>
            <p className="mt-1 text-sm text-sidebar-foreground/70">Sales, stock and alerts in one focused view.</p>
          </div>
           <div className="flex items-center gap-4">
             <div className="border-r border-sidebar-border pr-4 text-right"><p className="font-display text-xl font-bold text-sidebar-accent-foreground">{clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p><p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">{clock.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })} · IST</p></div>
           <div className="flex flex-wrap gap-2">
            <Button asChild className="h-11"><Link to="/pos">New Bill</Link></Button>
            {isOwner && <Button asChild variant="secondary" className="h-11"><Link to="/purchase">Receive Stock</Link></Button>}
            <Button asChild variant="secondary" className="h-11"><Link to="/customers">Customers</Link></Button>
          </div>
           </div>
        </div>
        <div className="relative mt-5 flex items-center gap-3 overflow-hidden rounded-lg bg-sidebar-accent px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 rounded bg-success px-2 py-0.5 text-xs font-bold text-success-foreground"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-foreground" />LIVE</span>
          <p className="truncate text-sidebar-accent-foreground">{ticker}</p>
        </div>
      </section>

      {/* Scoreboard */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Score main label="Today Sales" value={inr(m.todaySales)} hint={`${m.bills} bills · target ${targetPct}%`} progress={targetPct} />
        {isOwner ? <Score label="Profit" value={inr(m.profit)} hint="Gross estimate today" /> : <Score label="Bills Today" value={String(m.bills)} hint="Across all counters" />}
        {isOwner ? <Score label="Stock Value" value={inr(m.stockValue)} hint="Inventory at cost" /> : <Score label="Pairs in Stock" value={m.pairs.toLocaleString("en-IN")} hint="All sizes" />}
        <Score caution label="Credit Due" value={inr(m.credit)} hint="Customer receivable" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel eyebrow="Revenue trend" title="Last 7 Days Performance">
            <div className="flex h-48 items-end gap-2">
              {m.trend.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{t.value ? inr(t.value) : ""}</span>
                  <div className="w-full rounded-t-md bg-primary/85 transition-all" style={{ height: `${Math.max(3, (t.value / maxTrend) * 140)}px` }} />
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel eyebrow="Collections" title="Payment Mix"><Donut rows={m.pay} /></Panel>
            <Panel eyebrow="Merchandise" title="Category Mix"><Donut rows={m.cat} /></Panel>
          </div>
        </div>

        <aside className="space-y-3">
          <Action tone="dark" label="Owner Morning" text={m.target ? `Target ${inr(m.target)} · ${targetPct}% done · ${m.low} low sizes` : `${m.low} low sizes to watch today`} />
          <Action label="Shop Closing" text={`Cash in ${inr(m.cashIn)} · GST ${inr(m.gst)} · ${m.returning} customers billed`} />
          <Action tone="success" label="Next Action" text={nextAction} />
          <Panel eyebrow="Live operations" title="Control Stats">
            <div className="grid grid-cols-3 gap-2">
              {[["Pairs", m.pairs.toLocaleString("en-IN")], ["Cash In", inr(m.cashIn)], ["GST", inr(m.gst)], ["Low", String(m.low)], ["Out", String(m.out)], ["Bills", String(m.bills)]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="font-display font-semibold">{v}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel eyebrow="Activity pulse" title="Recent Live Feed">
            <ul className="space-y-2 text-sm">
              {(data?.moves ?? []).map((mv) => (
                <li key={mv.id} className="flex items-center justify-between gap-2">
                  <span className="truncate"><b className={mv.qty_out ? "text-destructive" : "text-success"}>{mv.type}</b> {mv.product_name} {mv.product_variants?.size ? `· ${mv.product_variants.size}` : ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{mv.qty_in ? `+${mv.qty_in}` : `-${mv.qty_out}`}</span>
                </li>
              ))}
              {!data?.moves.length && <li className="text-muted-foreground">No activity yet.</li>}
            </ul>
          </Panel>
        </aside>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Panel eyebrow="Demand map" title="Size Heatmap">
          <div className="grid grid-cols-4 gap-1.5">
            {m.sizes.map(([s, n]) => (
              <div key={s} className="rounded-md p-2 text-center" style={{ background: `color-mix(in oklch, var(--primary) ${Math.round((n / maxSize) * 80) + 8}%, transparent)` }}>
                <p className="text-xs font-bold">{s}</p>
                <p className="text-[10px]">{n}</p>
              </div>
            ))}
            {!m.sizes.length && <p className="col-span-4 text-sm text-muted-foreground">No stock yet.</p>}
          </div>
        </Panel>
        <Panel eyebrow="Brands" title="Stock Summary">
          <div className="space-y-2">
            {m.brands.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-xs"><span className="font-medium">{b.label}</span><span>{b.value} pairs</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-success" style={{ width: `${(b.value / maxBrand) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Buying queue" title="Reorder Suggestions">
          <AlertList items={m.reorder.map((v) => ({ id: v.id, text: `${v.products?.brand} ${v.products?.article} · size ${v.size}`, tag: v.stock === 0 ? "Out" : `${v.stock} left`, bad: v.stock === 0 }))} empty="All sizes stocked." />
        </Panel>
        <Panel eyebrow="Risk queue" title="Dead Stock / Alerts">
          <AlertList items={m.dead.map((v) => ({ id: v.id, text: `${v.products?.brand} ${v.products?.article} · size ${v.size}`, tag: "60+ days", bad: false }))} empty="No dead stock." />
        </Panel>
      </section>
    </div>
  );
}

function Score({ label, value, hint, main, caution, progress }: { label: string; value: string; hint: string; main?: boolean; caution?: boolean; progress?: number }) {
  return (
    <article className={`rounded-xl border p-5 ${main ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <p className={`text-xs uppercase tracking-wide ${main ? "opacity-80" : "text-muted-foreground"}`}>{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold md:text-3xl ${caution ? "text-warning-foreground" : ""}`}>{value}</p>
      <p className={`mt-1 text-xs ${main ? "opacity-80" : "text-muted-foreground"}`}>{hint}</p>
      {progress !== undefined && <div className="mt-3 h-1.5 rounded-full bg-primary-foreground/25"><div className="h-1.5 rounded-full bg-primary-foreground" style={{ width: `${progress}%` }} /></div>}
    </article>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </article>
  );
}

function Action({ label, text, tone }: { label: string; text: string; tone?: "dark" | "success" }) {
  const cls = tone === "dark" ? "bg-sidebar text-sidebar-accent-foreground" : tone === "success" ? "bg-accent text-accent-foreground" : "bg-card border";
  return (
    <article className={`rounded-xl p-4 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 font-medium">{text}</p>
    </article>
  );
}

function Donut({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <p className="text-sm text-muted-foreground">No sales data yet.</p>;
  let acc = 0;
  const stops = rows.map((r, i) => {
    const from = (acc / total) * 360;
    acc += r.value;
    return `${COLORS[i % COLORS.length]} ${from}deg ${(acc / total) * 360}deg`;
  });
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-card text-xs font-semibold">{inr(total)}</div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 truncate font-medium">{r.label}</span>
            <span className="text-muted-foreground">{inr(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertList({ items, empty }: { items: { id: string; text: string; tag: string; bad: boolean }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-2">
          <span className="truncate">{i.text}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${i.bad ? "bg-destructive/15 text-destructive" : "bg-warning/25 text-warning-foreground"}`}>{i.tag}</span>
        </li>
      ))}
    </ul>
  );
}
