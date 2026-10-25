import { useQuery } from "@tanstack/react-query";
import { HardDrive, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

type Usage = { db_bytes: number; photo_bytes: number; photos: number; products: number; variants: number; bills: number; customers: number; suppliers: number; stock_entries: number };

const DB_LIMIT = 500 * 1024 * 1024;
const PHOTO_LIMIT = 1024 * 1024 * 1024;
const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
const num = (n: number) => Math.max(0, Math.floor(n)).toLocaleString("en-IN");

/** Owner-only: approximate free-plan space used by shop records and product photos. */
export function StorageMeter() {
  const { data: heroUsage } = useQuery({
    queryKey: ["hero-storage-usage"], retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalog_hero_storage_usage");
      if (error) throw error;
      return data as { photo_bytes: number; photos: number } | null;
    },
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["store-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_usage");
      if (error) throw error;
      return data as unknown as Usage;
    },
  });
  if (error) return <section role="alert" className="rounded-xl border bg-card p-5 text-sm">
    <p>Storage usage could not be loaded.</p>
    <button type="button" className="mt-2 underline" onClick={() => void refetch()}>Retry</button>
  </section>;
  if (isLoading || !data) return <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Checking storage…</section>;

  const dbPct = Math.min(100, (data.db_bytes / DB_LIMIT) * 100);
  const photoBytes = data.photo_bytes + Number(heroUsage?.photo_bytes ?? 0);
  const photos = data.photos + Number(heroUsage?.photos ?? 0);
  const phPct = Math.min(100, (photoBytes / PHOTO_LIMIT) * 100);
  const avgPhoto = photos ? photoBytes / photos : 90 * 1024;
  const photosLeft = (PHOTO_LIMIT - photoBytes) / avgPhoto;
  const billsLeft = (DB_LIMIT - data.db_bytes) / 2048;
  const worst = Math.max(dbPct, phPct);
  const status = worst < 70 ? "Safe" : worst < 90 ? "Getting full" : "Almost full";

  const counts: [string, number][] = [["Products", data.products], ["Sizes", data.variants], ["Bills", data.bills], ["Customers", data.customers], ["Suppliers", data.suppliers], ["Photos", photos]];

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Storage</h2>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${worst < 70 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}><ShieldCheck className="h-3.5 w-3.5" />{status}</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">How much free space your shop has used. Numbers are approximate.</p>

      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-1.5 font-medium"><HardDrive className="h-4 w-4" />Shop records</span><span>{mb(data.db_bytes)} MB / 500 MB</span></div>
        <Progress value={dbPct} />
        <p className="text-xs text-muted-foreground">Room for about {num(billsLeft)} more bills.</p>
      </div>
      <div className="mb-4 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm"><span className="flex items-center gap-1.5 font-medium"><ImageIcon className="h-4 w-4" />{heroUsage ? "Product & hero photos" : "Product photos"}</span><span>{mb(photoBytes)} MB / 1024 MB</span></div>
        <Progress value={phPct} />
        <p className="text-xs text-muted-foreground">Room for about {num(photosLeft)} more photos. Photos are compressed on your phone before upload.</p>
        {!heroUsage && <p className="text-xs text-muted-foreground">Hero photo usage is unavailable; check the Storage dashboard for the full total.</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {counts.map(([k, v]) => <div key={k} className="rounded-lg border p-2 text-center"><p className="font-display text-lg font-bold">{num(v)}</p><p className="text-[11px] text-muted-foreground">{k}</p></div>)}
      </div>
    </section>
  );
}
