import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const watchers = new WeakMap<QueryClient, { users: number; stop: () => void }>();
/** One realtime listener per query client, even when multiple panels share stock. */
export function watchInventory(client: QueryClient) {
  const current = watchers.get(client);
  if (current) {
    current.users++;
    return () => release();
  }
  const stop = watchVisibleQuery(
    client,
    ["stock-all"],
    ["products", "product_variants"],
    "inventory-shared",
  );
  watchers.set(client, { users: 1, stop });
  return () => release();
  function release() {
    const entry = watchers.get(client);
    if (entry && --entry.users === 0) {
      entry.stop();
      watchers.delete(client);
    }
  }
}

export function watchVisibleQuery(
  client: QueryClient,
  queryKey: readonly unknown[],
  tables: string[],
  name: string,
) {
  let dirty = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    subscribed = false;
  const flush = () => {
    timer = undefined;
    if (document.hidden) {
      dirty = true;
      return;
    }
    // A stock event may arrive after an in-flight read took its snapshot.
    // Follow that request with a fresh read instead of losing the event.
    if (client.isFetching({ queryKey })) {
      timer = setTimeout(flush, 100);
      return;
    }
    dirty = false;
    // A focus refresh may already be in flight. Do not cancel/restart it.
    void client.invalidateQueries({ queryKey }, { cancelRefetch: false });
  };
  const changed = () => {
    dirty = true;
    if (!document.hidden && !timer) timer = setTimeout(flush, 100);
  };
  const onVisible = () => {
    if (document.hidden) return;
    const last = Math.max(
      0,
      ...client
        .getQueryCache()
        .findAll({ queryKey })
        .map((query) => query.state.dataUpdatedAt),
    );
    if (dirty || Date.now() - last >= 15_000) changed();
  };
  // Unsubscribe is asynchronous. A fast remount must not reuse the old joining
  // channel and attempt to attach new handlers after it has subscribed.
  let channel = supabase.channel(`${name}-${crypto.randomUUID()}`);
  for (const table of tables)
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      if (subscribed) changed();
      subscribed = true;
    }
  });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    void supabase.removeChannel(channel);
  };
}
