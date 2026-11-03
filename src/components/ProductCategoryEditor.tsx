import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENTS, SUBCATEGORIES, parseCategory, categoryValue } from "@/lib/product-categories";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ProductCategoryEditor({ id, category }: { id: string; category: string }) {
  const { isOwner } = useAuth();
  const saved = parseCategory(category);
  const [department, setDepartment] = useState(saved.department || "Men");
  const [subcategory, setSubcategory] = useState(saved.subcategory);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  if (!isOwner) return null;
  const departments = [
    ...new Set([...DEPARTMENTS, ...(saved.department ? [saved.department] : [])]),
  ];
  const choices = [
    ...new Set([
      ...(SUBCATEGORIES[department] ?? []),
      ...(department === saved.department && saved.subcategory ? [saved.subcategory] : []),
    ]),
  ];
  const changed = department !== saved.department || subcategory !== saved.subcategory;
  async function save() {
    if (SUBCATEGORIES[department] && !subcategory) {
      toast.error("Choose a subcategory, or select Other");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ category: categoryValue(department, subcategory) })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Product was not updated. Retry.");
      await qc.invalidateQueries({ queryKey: ["stock-all"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product category saved");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="font-semibold">Category & subcategory</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <Label>Category</Label>
          <select
            aria-label="Product category"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={department}
            disabled={busy}
            onChange={(e) => {
              setDepartment(e.target.value);
              setSubcategory("");
            }}
          >
            {departments.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <Label>Subcategory</Label>
          <select
            aria-label="Product subcategory"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={subcategory}
            disabled={busy || !choices.length}
            onChange={(e) => setSubcategory(e.target.value)}
          >
            <option value="">Not assigned</option>
            {choices.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose a subcategory for Men / Women. Existing unassigned products still appear in the main
        collection.
      </p>
      <Button disabled={busy || !changed} onClick={() => void save()}>
        {busy ? "Saving…" : "Save category"}
      </Button>
    </section>
  );
}
