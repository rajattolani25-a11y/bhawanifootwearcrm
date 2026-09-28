import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { inr } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales History — SoleStack POS" }, { name: "description", content: "All bills with items." }] }),
  component: Sales,
});

function Sales() {
  const { data = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,bill_no,sale_date,customer_name,payment_mode,total,sale_items(product_name,size,qty,price)")
        .order("sale_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
  return (
    <div>
      <PageHeader title="Sales History" subtitle="Latest 200 bills." />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Bill</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th></tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-mono text-xs">{s.bill_no}</td>
                <td className="p-3">{new Date(s.sale_date).toLocaleString("en-IN")}</td>
                <td className="p-3">{s.customer_name}</td>
                <td className="p-3">{s.sale_items.map((i) => `${i.product_name} (${i.size}) ×${i.qty}`).join(", ")}</td>
                <td className="p-3">{s.payment_mode}</td>
                <td className="p-3 text-right font-semibold">{inr(s.total)}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No bills yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
