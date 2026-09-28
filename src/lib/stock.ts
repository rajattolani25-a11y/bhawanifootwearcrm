import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Variant = { id: string; size: string; stock: number; damaged_stock: number; min_stock: number; rack: string | null; barcode: string | null; sku: string | null };
export type Product = { id: string; brand: string; article: string; category: string; color: string | null; gender: string | null; mrp: number; selling_price: number; created_at: string; product_variants: Variant[] };

export const sizeSort = (a: string, b: string) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b);

export function useStock() {
  return useQuery({
    queryKey: ["stock-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,article,category,color,gender,mrp,selling_price,created_at,product_variants(id,size,stock,damaged_stock,min_stock,rack,barcode,sku)")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as unknown as Product[];
    },
  });
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0] ?? "").map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}
