import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { sizeSort, type Variant } from "@/lib/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ProductSizesEditor({ id, variants }: { id: string; variants: Variant[] }) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [size, setSize] = useState("");
  const [stock, setStock] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isOwner) return null;
  const current = variants.find((v) => v.id === selected);
  function choose(value: string) {
    setSelected(value);
    const v = variants.find((v) => v.id === value);
    setSize(v?.size ?? "");
    setStock(String(v?.stock ?? 0));
    setReason("");
  }
  async function save(remove = false) {
    if (busy) return;
    if (!size.trim() || !/^\d+$/.test(stock)) {
      toast.error("Enter a size and a whole non-negative stock quantity");
      return;
    }
    if (remove && !window.confirm("Remove this unused, empty size? Used sizes are protected."))
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("edit_product_variant", {
        _product_id: id,
        _variant_id: selected || null,
        _size: size.trim(),
        _stock: Number(stock),
        _expected_stock: current?.stock ?? null,
        _remove: remove,
        _reason: reason.trim(),
      });
      if (error)
        throw new Error(
          error.code === "PGRST202"
            ? "Apply database update 0033_owner_variant_editor to enable safe size editing."
            : error.message,
        );
      await refreshOperationalData(qc);
      choose("");
      toast.success(remove ? "Unused size removed" : "Size and stock saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label="Size editor">
      <h3 className="font-semibold">Edit sizes & stock</h3>
      <p className="text-xs text-muted-foreground">
        Add a size or adjust stock with a reason. Sizes with stock or transaction history cannot be
        renamed or removed.
      </p>
      <select
        aria-label="Size to edit"
        className="w-full rounded-md border bg-background p-2 text-sm"
        disabled={busy}
        value={selected}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">Add new size</option>
        {[...variants]
          .sort((a, b) => sizeSort(a.size, b.size))
          .map((v) => (
            <option key={v.id} value={v.id}>
              {v.size} · {v.stock} pairs
            </option>
          ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Size
          <Input
            aria-label="Size name"
            disabled={busy}
            value={size}
            maxLength={20}
            onChange={(e) => setSize(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Stock
          <Input
            aria-label="Size stock"
            disabled={busy}
            value={stock}
            inputMode="numeric"
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
      </div>
      <Input
        aria-label="Stock adjustment reason"
        disabled={busy}
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for stock change"
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save()}>
          Save size
        </Button>
        {current && (
          <Button
            disabled={busy || current.stock !== 0 || current.damaged_stock !== 0}
            variant="outline"
            onClick={() => void save(true)}
          >
            Remove unused size
          </Button>
        )}
      </div>
    </section>
  );
}
