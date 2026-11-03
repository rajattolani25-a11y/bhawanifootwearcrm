import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  capacityRange,
  DEFAULT_ESTIMATE_LIMITS,
  ESTIMATE_LIMITS_KEY,
  estimateBillCapacity,
  estimateLimits,
  estimatePhotoCapacity,
} from "@/lib/storage-estimates";
import { storageBytes } from "@/lib/storage-usage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function StorageEstimates({
  databaseBytes,
  bills,
  photoBytes,
  photos,
  photosComplete,
}: {
  databaseBytes: number;
  bills: number;
  photoBytes: number;
  photos: number;
  photosComplete: boolean;
}) {
  const [limits, setLimits] = useState(DEFAULT_ESTIMATE_LIMITS);
  const [draft, setDraft] = useState({ databaseMB: "500", photosMB: "1000" });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ESTIMATE_LIMITS_KEY);
      const saved = raw ? estimateLimits(JSON.parse(raw)) : null;
      if (saved) {
        setLimits(saved);
        setDraft({ databaseMB: String(saved.databaseMB), photosMB: String(saved.photosMB) });
      }
    } catch {
      /* Use explicitly labelled defaults when device storage is unavailable. */
    }
    setReady(true);
  }, []);
  const lines = useQuery({
    queryKey: ["storage-bill-line-count", bills],
    enabled: bills > 0,
    retry: false,
    staleTime: 60000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sale_items")
        .select("id", { head: true, count: "exact" });
      if (error) throw error;
      if (count === null || !Number.isSafeInteger(count) || count < 0)
        throw Error("Bill item count unavailable");
      return count;
    },
  });
  const bill = estimateBillCapacity(
    databaseBytes,
    limits.databaseMB,
    bills,
    lines.isSuccess ? lines.data : null,
  );
  const photo = photosComplete ? estimatePhotoCapacity(photoBytes, limits.photosMB, photos) : null;
  function save() {
    const next = estimateLimits({
      databaseMB: Number(draft.databaseMB),
      photosMB: Number(draft.photosMB),
    });
    if (!next) {
      setMessage("Enter capacities between 1 and 1,000,000 MB.");
      return;
    }
    setLimits(next);
    try {
      localStorage.setItem(ESTIMATE_LIMITS_KEY, JSON.stringify(next));
      setMessage("Estimate limits saved on this device.");
    } catch {
      setMessage("Limits applied for this visit. Device storage is unavailable.");
    }
  }
  return (
    <section
      className="my-4 space-y-3 rounded-lg border bg-muted/40 p-3"
      aria-label="Estimated remaining capacity"
    >
      <h3 className="break-words text-sm font-semibold">Estimated remaining capacity</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span>Assumed limits:</span>{" "}
        <b data-no-translate>{storageBytes(Math.round(limits.databaseMB * 1_000_000))}</b>{" "}
        <span>database</span> ·{" "}
        <b data-no-translate>{storageBytes(Math.round(limits.photosMB * 1_000_000))}</b>{" "}
        <span>photos</span>
      </p>
      {!ready ? (
        <p role="status" className="text-xs">
          Loading estimates…
        </p>
      ) : (
        <>
          <div aria-label="Bill capacity estimate">
            <p className="break-words text-sm font-semibold">
              <span>About</span> <span data-no-translate>{capacityRange(bill)}</span>{" "}
              <span>more bills</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {bill.sampled ? (
                <>
                  <span>Based on your average:</span>{" "}
                  <span data-no-translate>
                    {bill.average.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                  </span>{" "}
                  <span>item lines per bill. Storage per bill is a planning allowance.</span>
                </>
              ) : (
                "Starter model: 3 item lines per bill; no complete bill sample is available yet."
              )}
            </p>
          </div>
          <div aria-label="Photo capacity estimate">
            {photo ? (
              <>
                <p className="break-words text-sm font-semibold">
                  <span>About</span> <span data-no-translate>{capacityRange(photo)}</span>{" "}
                  <span>more photos</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {photo.sampled ? (
                    <>
                      <span>Based on current average photo size:</span>{" "}
                      <span data-no-translate>{storageBytes(Math.round(photo.average))}</span>
                    </>
                  ) : (
                    "Starter photo model: 100–250 KB per compressed image."
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Photo estimate needs complete product and hero readings.
              </p>
            )}
          </div>
        </>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Planning ranges include 10% headroom. Longer bills, other records and larger photos can
        reduce capacity. These are not guaranteed limits.
      </p>
      <details className="border-t pt-2">
        <summary className="cursor-pointer text-xs font-medium">Change assumed limits</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Use your Cloud plan capacities. These values are saved only on this device.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="estimate-database-mb" className="text-xs">
              Database limit (MB)
            </Label>
            <Input
              id="estimate-database-mb"
              inputMode="decimal"
              value={draft.databaseMB}
              onChange={(e) => setDraft({ ...draft, databaseMB: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="estimate-photos-mb" className="text-xs">
              Photo limit (MB)
            </Label>
            <Input
              id="estimate-photos-mb"
              inputMode="decimal"
              value={draft.photosMB}
              onChange={(e) => setDraft({ ...draft, photosMB: e.target.value })}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={save}>
          Apply estimate limits
        </Button>
        {message && (
          <p role="status" className="mt-2 text-xs">
            {message}
          </p>
        )}
      </details>
    </section>
  );
}
