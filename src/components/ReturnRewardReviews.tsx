import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

/** Persisted exceptions: spent rewards and historical vouchers with no source link. */
export function ReturnRewardReviews() {
  const { isOwner, user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const {
    data = [],
    error,
    refetch,
  } = useQuery({
    queryKey: ["return-reward-reviews"],
    enabled: isOwner,
    queryFn: async () => {
      const events = await fetchAll((a, b) =>
        supabase
          .from("loyalty_events")
          .select("id,reward_id,customer_id,sale_id,action,note,created_at,customers(name)")
          .in("action", ["return_reward_review", "return_reward_reviewed"])
          .order("id")
          .range(a, b),
      );
      const key = (e: (typeof events)[number]) => `${e.reward_id}:${e.sale_id}`;
      const reviewed = new Set(
        events.filter((e) => e.action === "return_reward_reviewed").map(key),
      );
      return events.filter((e) => e.action === "return_reward_review" && !reviewed.has(key(e)));
    },
  });
  if (!isOwner || (!data.length && !error)) return null;
  async function review(e: (typeof data)[number]) {
    if (!user || busy) return;
    setBusy(e.id);
    try {
      const note = window.prompt(
        "Owner review note (no automatic charge or voucher change):",
        "Reviewed customer reward after return",
      );
      if (note === null) return;
      const result = await supabase
        .from("loyalty_events")
        .insert({
          reward_id: e.reward_id,
          customer_id: e.customer_id,
          sale_id: e.sale_id,
          action: "return_reward_reviewed",
          note: note.trim().slice(0, 500),
          user_id: user.id,
        });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["return-reward-reviews"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mb-4 rounded-xl border border-warning bg-warning/10 p-4">
      <h2 className="font-semibold">Rewards needing return review ({data.length})</h2>
      <p className="text-sm">
        A spent reward or historical voucher needs an owner decision. No customer charge was
        created. Open the customer profile to inspect vouchers before marking reviewed.
      </p>
      {error && (
        <p role="alert">
          Reviews could not be loaded. <Button onClick={() => void refetch()}>Retry</Button>
        </p>
      )}
      <div className="max-h-60 space-y-2 overflow-auto">
        {data.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"
          >
            <div>
              <b>{e.customers?.name ?? "Customer"}</b>
              <p>{e.note}</p>
              {e.customer_id && (
                <a
                  href={`/customers?id=${encodeURIComponent(e.customer_id)}`}
                  className="underline"
                >
                  Open customer
                </a>
              )}
            </div>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void review(e)}>
              Mark reviewed
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
