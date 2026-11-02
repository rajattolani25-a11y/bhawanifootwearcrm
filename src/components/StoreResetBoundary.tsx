import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { clearSignedImageCache } from "@/lib/signed-image-cache";
import { clearStoreDrafts } from "@/lib/store-backup-format";
import { maintenanceBusy, readResetState } from "@/lib/store-maintenance";

/** Clears old device drafts before mounting POS; active devices also detect remote resets. */
export function StoreResetBoundary({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const [readyFor, setReadyFor] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let checking = false;
    let seen: string | null = null;
    let opened = false;
    async function check() {
      if (checking || maintenanceBusy || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const state = await readResetState();
        if (stopped || maintenanceBusy) return;
        const key = `solestack-reset-generation:${state.installation_id}`;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(key);
        } catch {
          /* restricted storage */
        }
        const previous = seen ?? saved;
        const changed = previous !== null && previous !== state.generation;
        const needsClear = changed || (previous === null && state.reset_at !== null);
        if (needsClear) {
          try {
            clearStoreDrafts(localStorage, sessionStorage);
          } catch {
            /* POS storage is also guarded */
          }
          clearSignedImageCache();
          qc.clear();
        }
        seen = state.generation;
        try {
          localStorage.setItem(key, state.generation);
        } catch {
          /* memory comparison still works */
        }
        if (needsClear && opened) {
          window.location.reload();
          return;
        }
      } catch {
        /* An older backend or offline device must keep working; destructive UI fails closed. */
      } finally {
        checking = false;
        if (!stopped) {
          opened = true;
          setReadyFor(userId ?? null);
        }
      }
    }
    void check();
    const interval = window.setInterval(() => void check(), 30000);
    const resume = () => void check();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [userId, qc]);
  if (loading || (user && readyFor !== user.id))
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Checking store session…
      </p>
    );
  return children;
}
