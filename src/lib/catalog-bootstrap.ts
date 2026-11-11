import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogData } from "./catalog.functions.ts";

export type CatalogBootstrap = {
  version: 1;
  catalog: CatalogData;
  presentation?: unknown;
  offer?: unknown;
  hero?: unknown;
  hero_unavailable?: boolean;
  bargain_ids?: unknown;
  cart_version?: unknown;
};
const unavailable = new Map<string, number>();

/** Cache only a known missing API for 60s, never its data or enabled state. */
export async function readCatalogBootstrap(
  sb: Pick<SupabaseClient, "rpc">,
  scope: string,
  now = Date.now(),
): Promise<CatalogBootstrap | null> {
  if ((unavailable.get(scope) ?? 0) > now) return null;
  const { data, error } = await sb.rpc("public_catalog_bootstrap");
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) {
      if (unavailable.size >= 2 && !unavailable.has(scope))
        unavailable.delete(unavailable.keys().next().value!);
      unavailable.set(scope, now + 60000);
      return null;
    }
    throw Error("Catalog is not available right now");
  }
  const value = data as CatalogBootstrap | null;
  if (
    !value ||
    value.version !== 1 ||
    typeof value.catalog?.enabled !== "boolean" ||
    (value.catalog.enabled && (!value.catalog.shop || !Array.isArray(value.catalog.products)))
  )
    throw Error("Catalog is not available right now");
  unavailable.delete(scope);
  return value;
}

export function bootstrapBargains(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [],
  );
}
