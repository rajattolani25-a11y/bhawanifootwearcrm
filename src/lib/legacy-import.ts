import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Imports the old SoleStack JSON backup (solestack-db.json) into the cloud.
// Old app stored one product row per size; here rows are grouped into one
// article with a size variant each. legacy_id keeps re-imports duplicate-free.
export async function importLegacy(db: any, log: (m: string) => void) {
  const s = db.settings ?? {};
  await supabase.from("store_settings").update({
    business_name: s.businessName, business_phone: s.businessPhone, business_address: s.businessAddress,
    gstin: s.gstin, bill_footer: s.billFooter, daily_target: Number(s.dailyTarget) || 0,
  }).eq("id", 1);
  log("Settings imported");

  const variantByLegacy = new Map<string, string>();
  const groups = new Map<string, any[]>();
  for (const p of db.products ?? []) {
    const key = [p.brand, p.name, p.color, p.category].join("|").toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const rows of groups.values()) {
    const p0 = rows[0];
    const { data: prod, error } = await supabase.from("products").upsert({
      legacy_id: p0.id, brand: p0.brand ?? "", article: p0.name ?? "Item", category: p0.category ?? "",
      gender: p0.gender, color: p0.color, season: p0.season, status: p0.status ?? "Active",
      mrp: Number(p0.mrp) || 0, selling_price: Number(p0.sellingPrice) || 0, created_at: p0.createdAt,
    }, { onConflict: "legacy_id" }).select("id").single();
    if (error) throw error;
    await supabase.from("product_costs").upsert({ product_id: prod.id, purchase_price: Number(p0.purchasePrice) || 0 });
    for (const r of rows) {
      const { data: v, error: ve } = await supabase.from("product_variants").upsert({
        legacy_id: r.id, product_id: prod.id, size: String(r.size ?? "NA"), sku: r.sku, barcode: r.barcode || r.sku,
        stock: Math.max(0, Number(r.stock) || 0), min_stock: Number(r.minStock) || 3, rack: r.shelf ?? "",
      }, { onConflict: "legacy_id" }).select("id").single();
      if (ve) throw ve;
      variantByLegacy.set(r.id, v.id);
    }
  }
  log(`${groups.size} articles, ${variantByLegacy.size} size variants imported`);

  const custByLegacy = new Map<string, string>();
  for (const c of db.customers ?? []) {
    const { data, error } = await supabase.from("customers").upsert({
      legacy_id: c.id, mobile: c.phone || c.id, name: c.name ?? "", shoe_size: c.sizePreference ?? "",
      brand_preference: c.brandPreference ?? "", created_at: c.createdAt,
    }, { onConflict: "mobile" }).select("id").single();
    if (error) throw error;
    custByLegacy.set(c.id, data.id);
  }
  log(`${custByLegacy.size} customers imported`);

  const supByLegacy = new Map<string, string>();
  for (const x of db.suppliers ?? []) {
    const { data, error } = await supabase.from("suppliers").upsert({
      legacy_id: x.id, name: x.name, phone: x.phone ?? "", address: x.address ?? "", created_at: x.createdAt,
    }, { onConflict: "legacy_id" }).select("id").single();
    if (error) throw error;
    supByLegacy.set(x.id, data.id);
  }
  log(`${supByLegacy.size} suppliers imported`);

  for (const b of db.sales ?? []) {
    const { data: sale, error } = await supabase.from("sales").upsert({
      legacy_id: b.id, bill_no: b.billNo, sale_date: b.date, customer_id: custByLegacy.get(b.customerId) ?? null,
      customer_name: b.customerName ?? "Walk-in", payment_mode: b.paymentMode ?? "Cash", split_cash: b.splitCash ?? 0,
      bill_type: b.billType ?? "gst", tax_mode: b.taxMode ?? "inclusive", subtotal: b.subtotal ?? 0, discount: b.discount ?? 0,
      taxable: b.taxable ?? 0, gst_rate: b.gstRate ?? 0, gst_amount: b.gstAmount ?? 0, total: b.total ?? 0,
      paid_amount: b.paidAmount ?? 0, due_amount: b.dueAmount ?? 0,
    }, { onConflict: "legacy_id" }).select("id").single();
    if (error) throw error;
    await supabase.from("sale_items").delete().eq("sale_id", sale.id);
    const items = b.items ?? [];
    await supabase.from("sale_items").insert(items.map((i: any) => ({
      sale_id: sale.id, variant_id: variantByLegacy.get(i.productId) ?? null, product_name: i.name ?? "", size: String(i.size ?? ""),
      sku: i.sku, price: Number(i.price) || 0, qty: Number(i.qty) || 1, discount: Number(i.discount) || 0,
    })));
    const cost = items.reduce((s: number, i: any) => s + (Number(i.cost) || 0) * (Number(i.qty) || 1), 0);
    await supabase.from("sale_costs").upsert({ sale_id: sale.id, total_cost: cost, profit: Number(b.profit) || 0 });
  }
  log(`${db.sales?.length ?? 0} bills imported`);

  for (const x of db.purchases ?? []) {
    await supabase.from("purchases").upsert({
      legacy_id: x.id, purchase_date: x.date, supplier_id: supByLegacy.get(x.supplierId) ?? null, supplier_name: x.supplierName,
      invoice_no: x.invoiceNo, status: x.status, variant_id: variantByLegacy.get(x.productId) ?? null, quantity: x.quantity ?? 0,
      purchase_price: x.purchasePrice ?? 0, gst_rate: x.gstRate ?? 0, gst_amount: x.gstAmount ?? 0, total: x.total ?? 0, paid_amount: x.paidAmount ?? 0,
    }, { onConflict: "legacy_id" });
  }
  log(`${db.purchases?.length ?? 0} purchases imported`);

  const moves = (db.movements ?? []).map((m: any) => ({
    legacy_id: m.id, moved_at: m.date, type: m.type, variant_id: variantByLegacy.get(m.productId) ?? null,
    product_name: m.productName ?? "", qty_in: Number(m.qtyIn) || 0, qty_out: Number(m.qtyOut) || 0, note: m.note ?? "",
  }));
  if (moves.length) await supabase.from("stock_movements").upsert(moves, { onConflict: "legacy_id" });
  log(`${moves.length} stock movements imported`);
}

// Full backup in JSON (keeps export working like the old app).
export async function exportAll() {
  const tables = ["store_settings", "products", "product_costs", "product_variants", "customers", "suppliers", "sales", "sale_items", "sale_costs", "sale_returns", "credit_payments", "loyalty_rewards", "loyalty_events", "purchases", "stock_movements", "expenses"] as const;
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const t of tables) out[t] = (await supabase.from(t).select("*").limit(50000)).data;
  return out;
}
