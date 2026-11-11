import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { clearSignedImageCache } from "@/lib/signed-image-cache";

/** Loaded for app/auth routes only; retains the original auth invalidation rules. */
export default function AppAuthObserver({
  queryClient,
  router,
}: {
  queryClient: QueryClient;
  router: AnyRouter;
}) {
  useEffect(() => {
    let identity: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        (identity !== undefined && identity !== next)
      ) {
        clearSignedImageCache();
        queryClient.clear();
      }
      identity = next;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
