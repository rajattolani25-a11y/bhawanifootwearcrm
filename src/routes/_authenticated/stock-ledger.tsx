import { useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/stock-ledger")({
  head: () => ({ meta: [{ title: "Stock Ledger — SoleStack POS" }, { name: "description", content: "Every stock movement in and out." }, { property: "og:title", content: "Stock Ledger — SoleStack POS" }, { property: "og:description", content: "Complete footwear stock movement history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Ledger,
});

function Ledger() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const pageSize=50;
  const { data: result, error, isPending, refetch } = useQuery({
    queryKey: ["ledger",page,search],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("id,moved_at,type,product_name,qty_in,qty_out,note,product_variants(size)",{ count: "exact" })
        .order("moved_at", { ascending: false })
        .order("id");
      if (search) q=q.ilike("product_name", `%${search.replace(/[\\%_]/g,"\\$&")}%`);
      const { data, error, count } = await q.range(page*pageSize,(page+1)*pageSize-1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const data=result?.rows ?? [];
  return (
    <div>
      <PageHeader title="Stock Ledger" subtitle="Complete stock movement history. Search and browse older movements." />
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); setPage(0); }}><Input aria-label="Search stock movements" placeholder="Search product" value={query} onChange={(e) => setQuery(e.target.value)} /><Button type="submit">Search</Button></form>
      {error && <p role="alert">Stock history could not be loaded: {error.message} <Button onClick={() => void refetch()}>Retry</Button></p>}
      {isPending && <p role="status">Loading movements…</p>}
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
                <td className="p-3 text-muted-foreground">{m.type === "CSV-IMPORT" ? "CSV import completed" : m.note}</td>
              </tr>
            ))}
            {!isPending && !error && data.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No movements yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <ListPagination page={page} pageSize={pageSize} total={result?.count ?? 0} busy={isPending} onPage={setPage} />
    </div>
  );
}
