import { supabase } from "@/integrations/supabase/client";

export function integrityError(error: { message: string; code?: string }): Error {
  return new Error(
    ["PGRST202", "42703", "42883"].includes(error.code ?? "")
      ? "Apply database update 0032_retail_integrity, then reload. This action is blocked until its safety checks are available."
      : error.message,
  );
}
let support: Promise<void> | undefined;
export function requireRetailIntegrity() {
  return (support ??= (async () => {
    const { data, error } = await supabase.rpc("retail_integrity_version");
    if (error) throw integrityError(error);
    if (data !== 32)
      throw new Error("Database safety update 0032 is required. Reload after applying it.");
  })().catch((error) => {
    support = undefined;
    throw error;
  }));
}
/** Private financial fields are read only through an owner-authorized RPC. */
export async function withReturnCosts<T extends { id: string }>(
  rows: T[],
): Promise<(T & { cost_reversal: number })[]> {
  const costs = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await supabase.rpc("return_cost_reversals", {
      _ids: rows.slice(i, i + 1000).map((r) => r.id),
    });
    if (error) throw integrityError(error);
    for (const r of data ?? []) costs.set(r.id, Number(r.cost_reversal));
  }
  return rows.map((r) => {
    if (!costs.has(r.id))
      throw new Error(
        "Return costs could not be verified. Refresh before exporting financial reports.",
      );
    return { ...r, cost_reversal: costs.get(r.id)! };
  });
}
