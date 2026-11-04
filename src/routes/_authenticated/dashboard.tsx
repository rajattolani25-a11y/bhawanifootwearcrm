import { isDeadStock, isLowStock } from "@/lib/stock-policy";
import { withReturnCosts } from "@/lib/retail-integrity";
import {
  financialReturns,
  hasRecordedCosts,
  hasReturnCost,
  money,
  netSales,
  returnSummary,
} from "@/lib/sales-returns";
import { watchVisibleQuery } from "@/lib/inventory-live";
import { fetchAll, one } from "@/lib/fetch-all";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { UniversalSearch } from "@/components/UniversalSearch";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SoleStack POS" },
      { name: "description", content: "Retail control room: sales, stock and alerts." },
      { property: "og:title", content: "Dashboard — SoleStack POS" },
      { property: "og:description", content: "Retail control room." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function Dashboard() {
  const qc = useQueryClient();
  const { isOwner, user } = useAuth();
  const { data, error, isPending } = useQuery({
    queryKey: ["dashboard", isOwner],
    staleTime: 15_000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [
        sales,
        variants,
        moves,
        costs,
        pcosts,
        settings,
        dues,
        openingBalances,
        returns,
        returnCosts,
      ] = await Promise.all([
        fetchAll((a, b) =>
          supabase
            .from("sales")
            .select(
              "id,sale_date,total,paid_amount,due_amount,gst_amount,payment_mode,split_cash,customer_id,sale_items(qty,price,variant_id)",
            )
            .gte("sale_date", since.toISOString())
            .order("sale_date", { ascending: false })
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("product_variants")
            .select(
              "id,size,stock,min_stock,created_at,product_id,products(brand,article,category)",
            )
            .order("id")
            .range(a, b),
        ),
        supabase
          .from("stock_movements")
          .select("id,moved_at,type,product_name,qty_in,qty_out,product_variants(size)")
          .order("moved_at", { ascending: false })
          .limit(8),
        isOwner
          ? fetchAll((a, b) =>
              supabase
                .from("sales")
                .select(
                  "id,sale_date,sale_costs(profit,total_cost),sale_items(sale_item_costs(unit_cost))",
                )
                .gte("sale_date", since.toISOString())
                .order("id")
                .range(a, b),
            )
          : Promise.resolve([]),
        isOwner
          ? fetchAll((a, b) =>
              supabase
                .from("product_costs")
                .select("product_id,purchase_price")
                .order("product_id")
                .range(a, b),
            )
          : Promise.resolve([]),
        supabase.from("store_settings").select("business_name,daily_target").eq("id", 1).single(),
        fetchAll((a, b) =>
          supabase
            .from("sales")
            .select("id,due_amount")
            .gt("due_amount", 0)
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("customers")
            .select("id,opening_balance")
            .gt("opening_balance", 0)
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("sale_returns")
            .select("sale_id,variant_id,qty,refund,kind,gst_reversal,created_at,sale_items(price)")
            .gte("created_at", since.toISOString())
            .order("id")
            .range(a, b),
        ),
        isOwner
          ? fetchAll((a, b) =>
              supabase
                .from("sale_returns")
                .select(
                  "id,refund,kind,created_at,sale_items(sale_item_costs(unit_cost))",
                )
                .gte("created_at", since.toISOString())
                .order("id")
                .range(a, b),
            )
          : Promise.resolve([]),
      ]);
      if (moves.error) throw moves.error;
      if (settings.error) throw settings.error;
      return {
        sales,
        variants,
        cashFlow: isOwner ? (await supabase.rpc("owner_cash_today")).data as {cash_in:number;cash_out:number;cash_net:number;verified:boolean} | null : null,
        moves: moves.data ?? [],
        costs,
        pcosts,
        settings: settings.data,
        dues,
        openingBalances,
        returns,
        returnCosts: isOwner ? await withReturnCosts(returnCosts) : [],
      };
    },
  });

  useEffect(
    () =>
      watchVisibleQuery(qc, ["dashboard"], ["product_variants", "sales", "sale_returns", "credit_payments", "customers", "expenses", "supplier_payments", "product_costs"], "dash"),
    [qc],
  );

  const m = useMemo(() => {
    const sales = data?.sales ?? [];
    const variants = data?.variants ?? [];
    const returns = financialReturns(data?.returns ?? []);
    const today = dayKey(new Date());
    const todays = sales.filter((s) => dayKey(new Date(s.sale_date)) === today);
    const todayReturns = returns.filter((r) => dayKey(new Date(r.created_at)) === today);
    const reversed = returnSummary(todayReturns);
    const profitBySale = new Map(
      (data?.costs ?? []).map((c) => [c.id, Number(one(c.sale_costs)?.profit ?? 0)]),
    );
    const todayCosts = (data?.costs ?? []).filter((c) => dayKey(new Date(c.sale_date)) === today);
    const todayReturnCosts = financialReturns(data?.returnCosts ?? []).filter(
      (r) => dayKey(new Date(r.created_at)) === today,
    );
    const missingCosts =
      todayCosts.filter((c) => !one(c.sale_costs) || !hasRecordedCosts(c.sale_items)).length +
      todayReturnCosts.filter((r) => !hasReturnCost(r)).length;
    const returnedCost = returnSummary(todayReturnCosts).cost;
    const costByProduct = new Map(
      (data?.pcosts ?? []).map((c) => [c.product_id, Number(c.purchase_price)]),
    );
    const variantInfo = new Map(variants.map((v) => [v.id, v]));

    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const k = dayKey(d);
      return {
        label: d.toLocaleDateString("en-IN", { weekday: "short" }),
        value: netSales(
          sales
            .filter((s) => dayKey(new Date(s.sale_date)) === k)
            .reduce((a, s) => a + Number(s.total), 0),
          returns.filter((r) => dayKey(new Date(r.created_at)) === k),
        ),
      };
    });

    const pay: Record<string, number> = {};
    const cat: Record<string, number> = {};
    const sold = new Map<string, number>();
    for (const s of sales) {
      pay[s.payment_mode] = (pay[s.payment_mode] ?? 0) + Number(s.paid_amount ?? s.total);
      for (const it of s.sale_items) {
        const v = it.variant_id ? variantInfo.get(it.variant_id) : undefined;
        const c = v?.products?.category || "Other";
        cat[c] = (cat[c] ?? 0) + it.qty * Number(it.price);
        if (it.variant_id) sold.set(it.variant_id, (sold.get(it.variant_id) ?? 0) + it.qty);
      }
    }
    for (const r of returns) {
      const v = r.variant_id ? variantInfo.get(r.variant_id) : undefined;
      const category = v?.products?.category || "Other";
      cat[category] = (cat[category] ?? 0) - r.qty * Number(one(r.sale_items)?.price ?? 0);
      if (r.variant_id) sold.set(r.variant_id, (sold.get(r.variant_id) ?? 0) - r.qty);
    }
    const rows = (o: Record<string, number>) =>
      Object.entries(o)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    const brands: Record<string, number> = {};
    const sizes: Record<string, number> = {};
    for (const v of variants) {
      const b = v.products?.brand || "Other";
      brands[b] = (brands[b] ?? 0) + v.stock;
      sizes[v.size] = (sizes[v.size] ?? 0) + v.stock;
    }
    const cutoff = Date.now() - 60 * 86400000;
    const recentSales = new Set(sales.filter(s=>Date.parse(s.sale_date)>=cutoff).flatMap(s=>s.sale_items.map(i=>i.variant_id)));
    const dead = variants.filter(
      (v) => v.stock > 0 && isDeadStock(v.created_at, recentSales.has(v.id)),
    );
    const reorder = variants
      .filter((v) => v.stock === 0 || isLowStock(v.stock,v.min_stock))
      .sort((a, b) => a.stock - b.stock);

    const grossSales = todays.reduce((a, s) => a + Number(s.total), 0);
    const todaySales = netSales(grossSales, todayReturns);
    const cashIn = todays.reduce(
      (a, s) =>
        a +
        (s.payment_mode === "Cash"
          ? Number(s.paid_amount ?? s.total)
          : s.payment_mode === "Split"
            ? Number(s.split_cash)
            : 0),
      0,
    );
    const target = Number(data?.settings?.daily_target ?? 0);
    return {
      todaySales,
      grossSales,
      missingCosts,
      returned: reversed.refunded,
      bills: todays.length,
      profit: money(
        todays.reduce((a, s) => a + (profitBySale.get(s.id) ?? 0), 0) -
          reversed.refunded +
          reversed.gst +
          returnedCost,
      ),
      stockValue: variants.reduce(
        (a, v) => a + v.stock * (costByProduct.get(v.product_id) ?? 0),
        0,
      ),
      credit:
        (data?.dues ?? []).reduce((a, s) => a + Number(s.due_amount), 0) +
        (data?.openingBalances ?? []).reduce((a, c) => a + Number(c.opening_balance), 0),
      gst: money(todays.reduce((a, s) => a + Number(s.gst_amount), 0) - reversed.gst),
      cashIn: isOwner ? data?.cashFlow?.cash_in ?? null : cashIn,
      cashNet: data?.cashFlow?.verified ? data.cashFlow.cash_net : null,
      pairs: variants.reduce((a, v) => a + v.stock, 0),
      low: variants.filter((v) => isLowStock(v.stock,v.min_stock)).length,
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
  }, [data, isOwner]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = ((user?.user_metadata?.["full_name"] as string | undefined) ?? "")
    .trim()
    .split(/\s+/)[0];
  const maxTrend = Math.max(1, ...m.trend.map((t) => Math.abs(t.value)));
  const maxSize = Math.max(1, ...m.sizes.map(([, n]) => n));
  const maxBrand = Math.max(1, ...m.brands.map((b) => b.value));
  const targetPct = m.target
    ? Math.max(0, Math.min(100, Math.round((m.todaySales / m.target) * 100)))
    : 0;
  const nextAction =
    m.out > 0
      ? `${m.out} sizes are out of stock — reorder the fast movers.`
      : m.dead.length
        ? `${m.dead.length} sizes haven't sold in 60+ days — plan an offer.`
        : "Stock looks healthy. Keep billing!";
  const ticker = `Today ${inr(m.todaySales)} from ${m.bills} bills · ${m.pairs.toLocaleString("en-IN")} pairs in stock · ${m.low} low · ${m.out} out`;

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-destructive">
          Unable to load dashboard: {error.message}
        </p>
      )}
      <div className="max-w-xl">
        <UniversalSearch />
      </div>
      {/* Header */}
      <section className="relative overflow-hidden rounded-lg border bg-card p-4 text-card-foreground sm:p-6 md:p-8">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Retail Control Room · {data?.settings?.business_name}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">
              {greet}
              {name ? `, ${name}` : ""}. The counter is live.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Today’s sales, stock movement and urgent actions—updated as they happen.
            </p>
          </div>
          <div className="flex min-w-0 w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            <DashboardClock />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button asChild className="col-span-2 h-11 sm:col-span-1">
                <Link to="/pos">New Bill</Link>
              </Button>
              {isOwner && (
                <Button asChild variant="secondary" className="h-11">
                  <Link to="/purchase">Receive Stock</Link>
                </Button>
              )}
              <Button asChild variant="secondary" className="h-11">
                <Link to="/customers">Customers</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="relative mt-5 flex items-center gap-3 overflow-hidden rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 rounded bg-success px-2 py-0.5 text-xs font-bold text-success-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-foreground" />
            LIVE
          </span>
          <p className="truncate text-foreground">{ticker}</p>
        </div>
      </section>

      {/* Scoreboard */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Score
          main
          label="Today Net Sales"
          value={isPending || error ? "—" : inr(m.todaySales)}
          hint={`${m.bills} bills · target ${targetPct}%`}
          progress={targetPct}
        />
        {isOwner ? (
          <Score
            label="Profit"
            value={
              isPending || error ? "—" : m.missingCosts ? "Purchase cost missing" : inr(m.profit)
            }
            hint={
              m.missingCosts
                ? "Profit unavailable until historical costs are verified"
                : "After recorded returns today"
            }
          />
        ) : (
          <Score label="Bills Today" value={String(m.bills)} hint="Across all counters" />
        )}
        {isOwner ? (
          <Score label="Stock Value" value={inr(m.stockValue)} hint="At latest saved purchase cost; not FIFO or weighted average" />
        ) : (
          <Score label="Pairs in Stock" value={m.pairs.toLocaleString("en-IN")} hint="All sizes" />
        )}
        <Score caution label="Credit Due" value={inr(m.credit)} hint="Customer receivable" />
      </section>

      <p className="text-sm text-muted-foreground">
        <span>Gross sales</span>: {inr(m.grossSales)} · <span>Returns</span>: {inr(m.returned)} ·{" "}
        <span>Net sales</span>: {inr(m.todaySales)}
      </p>
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel eyebrow="Revenue trend" title="Last 7 Days Performance">
            <div className="flex h-48 min-w-0 items-end gap-1 sm:gap-2">
              {m.trend.map((t) => (
                <div key={t.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span
                    title={inr(t.value)}
                    className="max-w-full text-center text-[9px] text-muted-foreground sm:text-[10px]"
                  >
                    {t.value
                      ? `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(t.value)}`
                      : ""}
                  </span>
                  <div
                    className={`w-full rounded-t-md transition-all ${t.value < 0 ? "bg-destructive/80" : "bg-primary/85"}`}
                    style={{ height: `${Math.max(3, (Math.abs(t.value) / maxTrend) * 140)}px` }}
                  />
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel eyebrow="Collections before refunds" title="Payment Mix">
              <Donut rows={m.pay} />
            </Panel>
            <Panel eyebrow="Net merchandise before bill adjustments" title="Category Mix">
              <Donut rows={m.cat} />
            </Panel>
          </div>
        </div>

        <aside className="space-y-3">
          <Action
            tone="muted"
            label="Owner Morning"
            text={
              m.target
                ? `Target ${inr(m.target)} · ${targetPct}% done · ${m.low} low sizes`
                : `${m.low} low sizes to watch today`
            }
          />
          <Action
            label="Shop Closing"
            text={isOwner ? `Net cash movement ${m.cashNet == null ? "—" : inr(m.cashNet)} · GST ${inr(m.gst)} · ${m.returning} customers billed` : `Paid on cash-mode bills ${m.cashIn==null ? "—" : inr(m.cashIn)} · ${m.returning} customers billed`}
          />
          <Action tone="success" label="Next Action" text={nextAction} />
          <Panel eyebrow="Live operations" title="Control Stats">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Pairs", m.pairs.toLocaleString("en-IN")],
                ["Cash In", m.cashIn==null ? "—" : inr(m.cashIn)],
                ["GST", inr(m.gst)],
                ["Low", String(m.low)],
                ["Out", String(m.out)],
                ["Bills", String(m.bills)],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-lg bg-muted p-2 sm:p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="break-words font-display text-sm font-semibold sm:text-base">{v}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel eyebrow="Activity pulse" title="Recent Live Feed">
            <ul className="space-y-2 text-sm">
              {(data?.moves ?? []).map((mv) => (
                <li key={mv.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <b className={mv.qty_out ? "text-destructive" : "text-success"}>{mv.type}</b>{" "}
                    {mv.product_name}{" "}
                    {mv.product_variants?.size ? `· ${mv.product_variants.size}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {mv.qty_in ? `+${mv.qty_in}` : `-${mv.qty_out}`}
                  </span>
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
              <div
                key={s}
                className="rounded-md p-2 text-center"
                style={{
                  background: `color-mix(in oklch, var(--primary) ${Math.round((n / maxSize) * 80) + 8}%, transparent)`,
                }}
              >
                <p className="text-xs font-bold">{s}</p>
                <p className="text-[10px]">{n}</p>
              </div>
            ))}
            {!m.sizes.length && (
              <p className="col-span-4 text-sm text-muted-foreground">No stock yet.</p>
            )}
          </div>
        </Panel>
        <Panel eyebrow="Brands" title="Stock Summary">
          <div className="space-y-2">
            {m.brands.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{b.label}</span>
                  <span>{b.value} pairs</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-success"
                    style={{ width: `${(b.value / maxBrand) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Buying queue" title="Reorder Suggestions">
          <AlertList
            items={m.reorder.map((v) => ({
              id: v.id,
              text: `${v.products?.brand} ${v.products?.article} · size ${v.size}`,
              tag: v.stock === 0 ? "Out" : `${v.stock} left`,
              bad: v.stock === 0,
            }))}
            empty="All sizes stocked."
          />
        </Panel>
        <Panel eyebrow="Risk queue" title="Dead Stock / Alerts">
          <AlertList
            items={m.dead.map((v) => ({
              id: v.id,
              text: `${v.products?.brand} ${v.products?.article} · size ${v.size}`,
              tag: "60+ days",
              bad: false,
            }))}
            empty="No dead stock."
          />
        </Panel>
      </section>
    </div>
  );
}

function Score({
  label,
  value,
  hint,
  main,
  caution,
  progress,
}: {
  label: string;
  value: string;
  hint: string;
  main?: boolean;
  caution?: boolean;
  progress?: number;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border p-3 sm:p-5 ${main ? "bg-primary text-primary-foreground" : "bg-card"}`}
    >
      <p
        className={`text-xs uppercase tracking-wide ${main ? "opacity-80" : "text-muted-foreground"}`}
      >
        {label}
      </p>
      <p
        className={`mt-2 break-words font-display text-xl font-bold sm:text-2xl md:text-3xl ${caution ? "text-warning-foreground" : ""}`}
      >
        {value}
      </p>
      <p className={`mt-1 text-xs ${main ? "opacity-80" : "text-muted-foreground"}`}>{hint}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-primary-foreground/25">
          <div
            className="h-1.5 rounded-full bg-primary-foreground"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </article>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </article>
  );
}

function Action({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "muted" | "success";
}) {
  const cls =
    tone === "muted"
      ? "border bg-muted text-foreground"
      : tone === "success"
        ? "bg-accent text-accent-foreground"
        : "bg-card border";
  return (
    <article className={`rounded-xl p-4 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 font-medium">{text}</p>
    </article>
  );
}

function Donut({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No sales data yet.</p>;
  if (rows.some((row) => row.value < 0) || total <= 0)
    return (
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.label} className="flex justify-between gap-2">
            <span>{row.label}</span>
            <b>{inr(row.value)}</b>
          </li>
        ))}
      </ul>
    );
  let acc = 0;
  const stops = rows.map((r, i) => {
    const from = (acc / total) * 360;
    acc += r.value;
    return `${COLORS[i % COLORS.length]} ${from}deg ${(acc / total) * 360}deg`;
  });
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:gap-5">
      <div
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(",")})` }}
      >
        <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-card text-xs font-semibold">
          {inr(total)}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
            <span className="text-muted-foreground">{inr(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertList({
  items,
  empty,
}: {
  items: { id: string; text: string; tag: string; bad: boolean }[];
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-2">
          <span className="truncate">{i.text}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${i.bad ? "bg-destructive/15 text-destructive" : "bg-warning/25 text-warning-foreground"}`}
          >
            {i.tag}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DashboardClock() {
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="border-border text-left sm:border-r sm:pr-4 sm:text-right">
      <p className="font-display text-xl font-bold text-foreground">
        {clock.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {clock.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })} ·
        IST
      </p>
    </div>
  );
}
