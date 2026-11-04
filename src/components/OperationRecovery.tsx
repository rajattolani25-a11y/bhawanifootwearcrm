import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  OPERATION_EVENT,
  operationActive,
  pendingOperations,
  runOperationalRequest,
  removeResolvedOperation,
} from "@/lib/operational-requests";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { Button } from "./ui/button";
import { toast } from "sonner";
export function OperationRecovery() {
  const { user, isOwner } = useAuth();
  const qc = useQueryClient();
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const changed = () => tick((n) => n + 1);
    window.addEventListener(OPERATION_EVENT, changed);
    return () => window.removeEventListener(OPERATION_EVENT, changed);
  }, []);
  let entries: ReturnType<typeof pendingOperations> = {};
  try {
    entries = pendingOperations();
  } catch {
    return (
      <p role="alert">
        Pending requests could not be read. Check transaction history before proceeding.
      </p>
    );
  }
  const pending = Object.entries(entries).filter(([scope]) => !operationActive(scope));
  if (!pending.length) return null;
  return (
    <div
      role="alert"
      className="mb-4 space-y-2 rounded-xl border border-warning bg-warning/10 p-3 text-sm"
    >
      <p>
        A transaction response was not confirmed. Retry the saved request to recover its result
        safely.
      </p>
      {pending.map(([scope, item]) => (
        <div key={scope} className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {item.user === user?.id
              ? "Saved transaction awaiting confirmation"
              : "A previous cashier has an unresolved transaction"}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || item.user !== user?.id}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await runOperationalRequest(scope, item.rpc);
                if (r.error) toast.error(r.error.message);
                else {
                  toast.success(
                    "Saved transaction confirmed. Check its history before making another entry.",
                  );
                  await refreshOperationalData(qc);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            Retry saved request
          </Button>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  let response = await supabase.rpc("resolve_pending_operation", {
                    _request_id: item.request,
                  });
                  if (response.error) throw response.error;
                  let result = response.data as { state: string };
                  if (result.state === "not_recorded") {
                    const typed = window.prompt(
                      "No committed transaction was found. Type ABANDON to close this request and block any late retry.",
                    );
                    if (typed !== "ABANDON") return;
                    response = await supabase.rpc("resolve_pending_operation", {
                      _request_id: item.request,
                      _abandon: true,
                      _confirmation: typed,
                    });
                    if (response.error) throw response.error;
                    result = response.data as { state: string };
                  }
                  if (["committed", "abandoned"].includes(result.state)) {
                    removeResolvedOperation(scope, item.request);
                    await refreshOperationalData(qc);
                    toast.success(
                      result.state === "committed"
                        ? "Transaction already recorded. No duplicate was created."
                        : "Unrecorded request closed; late retries are blocked.",
                    );
                  }
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Owner review
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
