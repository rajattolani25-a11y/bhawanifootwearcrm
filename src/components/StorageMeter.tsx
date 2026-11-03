import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Image as ImageIcon, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  measuredPhotos,
  parsePhotoUsage,
  parseStoreUsage,
  storageBytes,
  type PhotoUsage,
} from "@/lib/storage-usage";
import { Button } from "@/components/ui/button";
import { StorageEstimates } from "./StorageEstimates";

const number = (value: number) => value.toLocaleString("en-IN");

/** Server measurements remain distinct from explicitly assumed planning estimates. */
export function StorageMeter() {
  const queryClient = useQueryClient();
  const hero = useQuery({
    queryKey: ["hero-storage-usage"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalog_hero_storage_usage");
      if (error) throw error;
      return parsePhotoUsage(data);
    },
  });
  const usage = useQuery({
    queryKey: ["store-usage"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_usage");
      if (error) throw error;
      return parseStoreUsage(data);
    },
  });
  const refreshing = usage.isFetching || hero.isFetching;
  const refresh = () => {
    void Promise.all([
      usage.refetch(),
      hero.refetch(),
      queryClient.refetchQueries({
        queryKey: ["storage-bill-line-count"],
        type: "active",
      }),
    ]);
  };
  if (usage.isPending)
    return (
      <section
        role="status"
        className="rounded-xl border bg-card p-5 text-sm text-muted-foreground"
      >
        Checking storage…
      </section>
    );
  if (usage.isError || !usage.data)
    return (
      <section role="alert" className="space-y-2 rounded-xl border bg-card p-5 text-sm">
        <p>Storage usage could not be loaded.</p>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
          Retry
        </Button>
      </section>
    );

  const data = usage.data;
  // A failed refresh must not silently include an older hero reading.
  let heroReading: PhotoUsage | null = null;
  if (hero.isSuccess && hero.data) {
    try {
      heroReading = parsePhotoUsage(hero.data);
    } catch {
      /* Shared cache may contain an older/unsupported shape. */
    }
  }
  const photos = measuredPhotos(data, heroReading);
  const checkedAt = photos.complete
    ? Math.min(usage.dataUpdatedAt, hero.dataUpdatedAt)
    : usage.dataUpdatedAt;
  const counts: [string, number][] = [
    ["Products", data.products],
    ["Sizes", data.variants],
    ["Bills", data.bills],
    ["Customers", data.customers],
    ["Suppliers", data.suppliers],
    [photos.complete ? "Photos" : "Product photos", photos.count],
  ];
  return (
    <section
      className="rounded-xl border bg-card p-5"
      aria-label="Storage measurements"
      aria-busy={refreshing}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Storage</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={refresh}
          aria-label="Refresh storage usage"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Measured shop database allocation and photo file sizes.
      </p>
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-lg border p-3" aria-label="Database allocation">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <HardDrive className="h-4 w-4" />
              Database allocation
            </span>
            <b data-no-translate>{storageBytes(data.db_bytes)}</b>
          </div>
          <p className="text-xs text-muted-foreground">
            <span data-no-translate>{number(data.db_bytes)}</span> <span>bytes</span>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Includes app tables, indexes, saved settings and allocated space that PostgreSQL can
            reuse after deletion. Reset does not make this zero.
          </p>
        </div>
        <div className="space-y-1.5 rounded-lg border p-3" aria-label="Photo file storage">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <ImageIcon className="h-4 w-4" />
              {photos.complete ? "Product & hero photos" : "Product photos"}
            </span>
            <b data-no-translate>{storageBytes(photos.bytes)}</b>
          </div>
          <p className="text-xs text-muted-foreground">
            <span data-no-translate>{number(photos.bytes)}</span> <span>bytes</span>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Includes uploaded files, including extra product angles and files awaiting cleanup.
          </p>
          {!photos.complete && (
            <p role="status" className="text-xs text-muted-foreground">
              {hero.isPending
                ? "Hero photo size is loading. Showing product photos only."
                : "Hero photo size is unavailable. Showing product photos only; refresh to retry."}
            </p>
          )}
        </div>
      </div>
      <div className="my-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {counts.map(([key, value]) => (
          <div key={key} className="min-w-0 rounded-lg border p-2 text-center">
            <p data-no-translate className="break-words font-display text-lg font-bold">
              {number(value)}
            </p>
            <p className="break-words text-[11px] text-muted-foreground">{key}</p>
          </div>
        ))}
      </div>
      <StorageEstimates
        databaseBytes={data.db_bytes}
        bills={data.bills}
        photoBytes={photos.bytes}
        photos={photos.count}
        photosComplete={photos.complete}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Hosting plan limits are not provided by these readings. Check your Cloud dashboard for total
        project usage and remaining quota.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        <span>Last checked:</span>{" "}
        <time dateTime={new Date(checkedAt).toISOString()} data-no-translate>
          {new Date(checkedAt).toLocaleTimeString("en-IN")}
        </time>
      </p>
    </section>
  );
}
