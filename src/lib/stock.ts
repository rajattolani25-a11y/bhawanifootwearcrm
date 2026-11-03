import { fetchAll } from "@/lib/fetch-all";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { watchInventory } from "./inventory-live";

export type Variant = {
  id: string;
  size: string;
  stock: number;
  damaged_stock: number;
  min_stock: number;
  rack: string | null;
  barcode: string | null;
  sku: string | null;
};
export type Product = {
  id: string;
  brand: string;
  article: string;
  category: string;
  color: string | null;
  gender: string | null;
  mrp: number;
  selling_price: number;
  created_at: string;
  status?: string;
  catalog_visible?: boolean;
  image_url: string | null;
  image_src?: string | null;
  product_variants: Variant[];
};

export const sizeSort = (a: string, b: string) =>
  (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b);

const byId = (rows: Product[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const activeById = (rows: Product[]) => byId(rows.filter((row) => row.status === "Active"));
export function useStock(options?: { activeOnly?: boolean; order?: "id" }) {
  const qc = useQueryClient();
  useEffect(() => watchInventory(qc), [qc]);
  return useQuery<Product[]>({
    queryKey: ["stock-all"],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    ...(options?.activeOnly
      ? { select: activeById }
      : options?.order === "id"
        ? { select: byId }
        : {}),
    queryFn: async () => {
      const data = await fetchAll((a, b) =>
        supabase
          .from("products")
          .select(
            "id,brand,article,category,color,gender,status,catalog_visible,mrp,selling_price,created_at,image_url,product_variants(id,size,stock,damaged_stock,min_stock,rack,barcode,sku)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
      const { addSignedImages } = await import("@/lib/product-images");
      return addSignedImages(data as unknown as Product[]);
    },
  });
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export { parseCsv } from "./csv";
