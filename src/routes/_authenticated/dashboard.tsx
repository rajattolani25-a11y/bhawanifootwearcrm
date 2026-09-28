import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { inr } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SoleStack POS" }, { name: "description", content: "Today's sales and stock overview." }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [sales, variants, articles, customers] = await Promise.all([
        supabase.from("sales").select("total,payment_mode").gte("sale_date", start.toISOString()),
        supabase.from("product_variants").select("stock,min_stock"),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
      ]);
      const v = variants.data ?? [];
      return {
        todaySales: (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0),
        bills: sales.data?.length ?? 0,
        pairs: v.reduce((s, r) => s + r.stock, 0),
        low: v.filter((r) => r.stock > 0 && r.stock < 3).length,
        out: v.filter((r) => r.stock === 0).length,
        articles: articles.count ?? 0,
        customers: customers.count ?? 0,
      };
    },
  });

  // realtime: any stock or bill change on any device refreshes the numbers
  useEffect(() => {
    const ch = supabase
      .channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_variants" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cards = [
    { label: "Today's sales", value: inr(data?.todaySales) },
    { label: "Bills today", value: data?.bills ?? "–" },
    { label: "Pairs in stock", value: data?.pairs?.toLocaleString("en-IN") ?? "–" },
    { label: "Articles", value: data?.articles ?? "–" },
    { label: "Low stock sizes", value: data?.low ?? "–", tone: "text-warning" },
    { label: "Out of stock sizes", value: data?.out ?? "–", tone: "text-destructive" },
    { label: "Customers", value: data?.customers ?? "–" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live — updates instantly across all devices." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className={`mt-2 font-display text-2xl font-semibold ${c.tone ?? ""}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
