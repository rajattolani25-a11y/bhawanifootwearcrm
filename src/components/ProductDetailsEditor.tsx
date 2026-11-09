import { BargainPolicyEditor } from "./catalog-commerce/BargainPolicyEditor";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { CatalogDescriptionEditor } from "./CatalogDescriptionEditor";
import { SpotlightHeadingEditor } from "./SpotlightHeadingEditor";
const noPreview = () => {};
const noEditing = () => {};
export function ProductDetailsEditor({
  id,
  article,
  brand,
  color,
  mrp,
  sellingPrice,
}: {
  id: string;
  article: string;
  brand: string;
  color: string | null;
  mrp: number;
  sellingPrice: number;
}) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(article);
  const [maker, setMaker] = useState(brand);
  const [colour, setColour] = useState(color ?? "");
  const [listPrice, setListPrice] = useState(String(mrp));
  const [price, setPrice] = useState(String(sellingPrice));
  const [busy, setBusy] = useState(false);
  if (!isOwner) return null;
  async function save() {
    if (
      !name.trim() ||
      name.trim().length > 150 ||
      maker.trim().length > 80 ||
      colour.trim().length > 80
    ) {
      toast.error(
        "Enter a product name up to 150 characters, and brand and colour up to 80 characters",
      );
      return;
    }
    const nextMrp = Number(listPrice);
    const nextPrice = Number(price);
    if (
      ![listPrice, price].every((value) => /^\d+(?:\.\d{1,2})?$/.test(value.trim())) ||
      !Number.isFinite(nextMrp) ||
      !Number.isFinite(nextPrice) ||
      nextPrice <= 0 ||
      nextMrp < nextPrice ||
      nextMrp > Number.MAX_SAFE_INTEGER / 100
    ) {
      toast.error(
        "Enter a selling price above zero and MRP at least equal to it, with up to two decimal places",
      );
      return;
    }
    setBusy(true);
    try {
      const update = supabase
        .from("products")
        .update({
          article: name.trim(),
          brand: maker.trim().toUpperCase(),
          color: colour.trim(),
          mrp: nextMrp,
          selling_price: nextPrice,
        })
        .eq("id", id)
        .eq("article", article)
        .eq("brand", brand)
        .eq("mrp", mrp)
        .eq("selling_price", sellingPrice);
      // Match the original profile and prices so a stale form cannot overwrite another owner.
      const guarded = color === null ? update.is("color", null) : update.eq("color", color);
      const { error } = await guarded.select("id").single();
      if (error) throw error;
      await refreshOperationalData(qc);
      toast.success("Product details saved");
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
      <label className="block space-y-1 text-sm">
        Colour
        <Input
          aria-label="Product colour"
          value={colour}
          maxLength={80}
          disabled={busy}
          onChange={(e) => setColour(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0 space-y-1 text-sm">
          MRP
          <Input
            aria-label="Product MRP"
            inputMode="decimal"
            value={listPrice}
            disabled={busy}
            onChange={(e) => setListPrice(e.target.value)}
          />
        </label>
        <label className="block min-w-0 space-y-1 text-sm">
          Selling price
          <Input
            aria-label="Product selling price"
            inputMode="decimal"
            value={price}
            disabled={busy}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Applies to new bills and catalog. Existing bills keep their saved prices.
      </p>
      <Button
        variant="outline"
        disabled={
          busy ||
          (name === article &&
            maker === brand &&
            colour === (color ?? "") &&
            listPrice === String(mrp) &&
            price === String(sellingPrice))
        }
        onClick={() => void save()}
      >
        Save product details
      </Button>
      <SpotlightHeadingEditor key={id} productId={id} />
      <BargainPolicyEditor productId={id} price={sellingPrice} />
      <CatalogDescriptionEditor productId={id} onPreview={noPreview} onEditing={noEditing} />
    </section>
  );
}
