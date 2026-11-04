import { runOperationalRequest } from "@/lib/operational-requests";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Imports the old SoleStack JSON backup (solestack-db.json) into the cloud.
// Old app stored one product row per size; here rows are grouped into one
// article with a size variant each. legacy_id keeps re-imports duplicate-free.
export async function importLegacy(db: any, log: (m: string) => void) {
  // Check BEFORE the first write: current cloud backups use a different schema.
  if (!db || typeof db !== "object" || db.format || db.store_settings || db.product_variants ||
    (!Array.isArray(db.products) || db.products.some((p: any) => !p || typeof p !== "object" || "article" in p || "selling_price" in p))) {
    throw new Error("This is not a legacy backup. Use Restore verified backup for version 2 files. Older cloud exports need a reviewed conversion; they cannot be imported as legacy data.");
  }
  log("Validating and importing the supported offline backup in one transaction…");
  const { data, error } = await runOperationalRequest("legacy-import", "import_legacy_store", { _payload: db });
  if (error) throw new Error(error.message);
  const result = data as { products: number; sizes: number; sales: number; purchases: number; replayed?: boolean };
  log(`${result.products} articles, ${result.sizes} sizes, ${result.sales} bills, ${result.purchases} purchases — ${result.replayed ? "already imported; no changes" : "committed successfully"}`);

}

// Full backup in JSON (keeps export working like the old app).
export async function exportAll() {
  const tables = ["store_settings", "products", "product_costs", "product_variants", "customers", "suppliers", "sales", "sale_items", "sale_costs", "sale_item_costs", "sale_returns", "credit_payments", "loyalty_rewards", "loyalty_events", "purchases", "supplier_payments", "stock_movements", "expenses", "coupons", "coupon_redemptions"] as const;
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const t of tables) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      if (t === "sale_items") {
        const { data, error } = await supabase.rpc("backup_sale_items", { _offset: from, _limit: 1000 });
        if (error) throw new Error(`Backup failed on ${t}: ${error.message}`);
        if (!data) throw new Error(`Backup failed on ${t}`);
        rows.push(...data);
        if (data.length < 1000) break;
        continue;
      }
      const { data, error } = await supabase.from(t).select("*").range(from, from + 999);
      if (error) throw new Error(`Backup failed on ${t}: ${error.message}`);
      if (!data) throw new Error(`Backup failed on ${t}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    out[t] = rows;
  }
  return out;
}
