import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listProductPhotos, readProductCover, removeProductFiles } from "@/lib/product-images";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { Button } from "./ui/button";

export function ProductLifecycle({
  id,
  name,
  archived,
  onDeleted,
}: {
  id: string;
  name: string;
  archived: boolean;
  onDeleted: () => void;
}) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  if (!isOwner) return null;
  async function change(remove: boolean) {
    if (lock.current || !isOwner) return;
    if (
      !window.confirm(
        remove
          ? `Permanently delete ${name}, its sizes and stock? Products linked to bills, purchases or orders cannot be deleted. Use Archive to keep history.`
          : `${archived ? "Restore" : "Archive"} ${name}? ${archived ? "It will return to POS. Catalog visibility can be enabled separately." : "It will be hidden from POS and catalog. Stock and history will be kept."}`,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      if (remove) {
        // Read the manifest before deleting the row; never remove photos first.
        const files = await listProductPhotos(id, await readProductCover(id));
        const { data, error } = await supabase
          .from("products")
          .delete()
          .eq("id", id)
          .select("id")
          .single();
        if (error)
          throw new Error(
            error.code === "23503"
              ? "This product has transaction history. Use Archive instead; bills, purchases and orders must be kept."
              : error.message,
          );
        if (!data) throw new Error("Product deletion was not confirmed.");
        toast.success("Product deleted");
        try {
          await removeProductFiles(files);
        } catch {
          toast.warning(
            "Product deleted, but some photo files could not be removed. They still use storage; contact support for cleanup.",
          );
        }
        onDeleted();
      } else {
        const { error } = await supabase
          .from("products")
          .update({
            status: archived ? "Active" : "inactive",
            ...(!archived ? { catalog_visible: false } : {}),
          })
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        toast.success(archived ? "Product restored" : "Product archived; stock and history kept");
      }
      refreshOperationalData(qc);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        Archive keeps stock and bill history. Permanent deletion is blocked for products used in
        transactions.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void change(false)}>
          {archived ? "Restore product" : "Archive product"}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void change(true)}>
          {busy ? "Saving…" : "Delete product"}
        </Button>
      </div>
    </div>
  );
}
