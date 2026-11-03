import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogDescriptionEditor } from "./CatalogDescriptionEditor";
const noPreview = () => {};
const noEditing = () => {};
export function ProductDetailsEditor({
  id,
  article,
  brand,
}: {
  id: string;
  article: string;
  brand: string;
}) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(article);
  const [maker, setMaker] = useState(brand);
  const [busy, setBusy] = useState(false);
  if (!isOwner) return null;
  async function save() {
    if (!name.trim() || name.trim().length > 150 || maker.trim().length > 80) {
      toast.error("Enter a product name up to 150 characters and brand up to 80 characters");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ article: name.trim(), brand: maker.trim().toUpperCase() })
        .eq("id", id)
        .eq("article", article)
        .eq("brand", brand)
        .select("id")
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["stock-all"] });
      toast.success("Product name saved");
    } catch (error) {
      toast.error(
        "Product could not be saved. Refresh if another owner edited it. " +
          (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Product details editor" className="space-y-3 rounded-lg border p-3">
      <h3 className="font-semibold">Product details</h3>
      <label className="block space-y-1 text-sm">
        Product name / article
        <Input
          aria-label="Product name / article"
          value={name}
          maxLength={150}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Brand
        <Input
          aria-label="Product brand"
          value={maker}
          maxLength={80}
          disabled={busy}
          onChange={(e) => setMaker(e.target.value)}
        />
      </label>
      <Button
        variant="outline"
        disabled={busy || (name === article && maker === brand)}
        onClick={() => void save()}
      >
        Save product name
      </Button>
      <CatalogDescriptionEditor productId={id} onPreview={noPreview} onEditing={noEditing} />
    </section>
  );
}
