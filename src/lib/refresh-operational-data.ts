import type { QueryClient } from "@tanstack/react-query";

const unchangedConfiguration = new Set([
  "settings",
  "shop-identity",
  "team",
  "catalog-settings",
  "catalog-hero-settings",
  "catalog-presentation-settings",
  "catalog-theme-settings",
]);
/** Sale/return/receipt/import cannot change these settings. Keep all business
 * caches stale (including future keys), but avoid reloading unrelated config. */
export function refreshOperationalData(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) => !unchangedConfiguration.has(String(query.queryKey[0])),
  });
}
