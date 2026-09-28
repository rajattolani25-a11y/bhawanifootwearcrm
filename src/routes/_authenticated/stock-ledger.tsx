import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/stock-ledger")({
  head: () => ({ meta: [{ title: "Stock Ledger — SoleStack POS" }, { name: "description", content: "Every stock movement in and out." }] }),
  component: Ledger,
});

function Ledger() {
  const { data = [] } = useQuery({
    queryKey: ["ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,moved_at,type,product_name,qty_in,qty_out,note,product_variants(size)")
        .order("moved_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
  return (
    <div>
      <PageHeader title="Stock Ledger" subtitle="Latest 300 movements." />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Product</th><th className="p-3">Size</th><th className="p-3 text-right">In</th><th className="p-3 text-right">Out</th><th className="p-3">Note</th></tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3">{new Date(m.moved_at).toLocaleString("en-IN")}</td>
                <td className="p-3 font-medium">{m.type}</td>
                <td className="p-3">{m.product_name}</td>
                <td className="p-3">{m.product_variants?.size ?? "–"}</td>
                <td className="p-3 text-right text-success">{m.qty_in || ""}</td>
                <td className="p-3 text-right text-destructive">{m.qty_out || ""}</td>
                <td className="p-3 text-muted-foreground">{m.note}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
