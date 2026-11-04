import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const OPERATION_KEY = "solestack-pending-operations-v1";
export const OPERATION_EVENT = "solestack-operation-recovery";
const allowed = [
  "receive_stock_v2",
  "receive_customer_payment",
  "collect_credit_payment_v2",
  "record_supplier_payment_v2",
  "record_catalog_refund",
  "import_legacy_store",
] as const;
type OperationName = (typeof allowed)[number];
type Pending = { user: string; rpc: OperationName; args: Record<string, Json>; request: string };
const active = new Set<string>();
export function pendingOperations(): Record<string, Pending> {
  if (typeof window === "undefined") return {};
  const value: unknown = JSON.parse(sessionStorage.getItem(OPERATION_KEY) ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Pending requests could not be read. Check transaction history before proceeding.",
    );
  for (const item of Object.values(value)) {
    if (
      !item ||
      typeof item !== "object" ||
      !allowed.includes(item.rpc) ||
      typeof item.user !== "string" ||
      typeof item.request !== "string" ||
      !item.args ||
      typeof item.args !== "object"
    )
      throw new Error("Pending request is invalid. Check transaction history before proceeding.");
  }
  return value as Record<string, Pending>;
}
export const operationActive = (scope: string) => active.has(scope);
function save(value: Record<string, Pending>) {
  sessionStorage.setItem(OPERATION_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(OPERATION_EVENT));
}
/** Keeps the exact original payload on an uncertain response, including after reload. */
export async function runOperationalRequest(
  scope: string,
  rpc: OperationName,
  args?: Record<string, Json>,
) {
  try {
    const { data: auth } = await supabase.auth.getSession();
    const user = auth.session?.user.id;
    if (!user) throw new Error("Sign in before recording a transaction.");
    const all = pendingOperations();
    let record = all[scope];
    if (record && (record.user !== user || record.rpc !== rpc))
      throw new Error(
        "A previous cashier has an unresolved transaction. Recover it before continuing.",
      );
    if (record && args && JSON.stringify(record.args) !== JSON.stringify(args))
      throw new Error(
        "A previous request is unresolved. Use Retry saved request before starting another transaction.",
      );
    if (!record) {
      if (!args) throw new Error("No pending transaction found.");
      record = { user, rpc, args, request: crypto.randomUUID() };
      all[scope] = record;
      save(all); // If storage is blocked, do not submit an unrecoverable write.
    }
    active.add(scope);
    const result = await supabase.rpc(record.rpc, {
      ...record.args,
      _request_id: record.request,
    } as never);
    if (
      !result.error ||
      (/^[0-9A-Z]{5}$/.test(result.error.code ?? "") && !result.error.code.startsWith("PGRST"))
    ) {
      const current = pendingOperations();
      delete current[scope];
      save(current);
    }
    return result;
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  } finally {
    active.delete(scope);
    window.dispatchEvent(new Event(OPERATION_EVENT));
  }
}

/** Call only after the backend proves the request committed or tombstones it. */
export function removeResolvedOperation(scope: string, request: string) {
  const all = pendingOperations();
  if (all[scope]?.request === request) {
    delete all[scope];
    save(all);
  }
}
