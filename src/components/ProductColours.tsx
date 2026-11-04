import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { Switch } from "./ui/switch";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { articleColours } from "@/lib/product-colours";
import type { Product } from "@/lib/stock";
import { Button } from "./ui/button";

export function ProductColours({
  product,
  products,
  onSelect,
  onAdd,
}: {
  product: Product;
  products: Product[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const colours = articleColours(products, product);
  return (
    <section aria-label="Article colours" className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Colours & photos</h3>
        {isOwner && product.status === "Active" && (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add colour
          </Button>
        )}
      </div>
      {isOwner && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Show this colour in catalog
          <Switch
            aria-label="Show this colour in catalog"
            disabled={publishing}
            checked={!!product.catalog_visible}
            onCheckedChange={async (visible) => {
              if (publishing) return;
              setPublishing(true);
              try {
                const { error } = await supabase
                  .from("products")
                  .update({ catalog_visible: visible })
                  .eq("id", product.id)
                  .select("id")
                  .single();
                if (error) throw error;
                await refreshOperationalData(qc);
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setPublishing(false);
              }
            }}
          />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        Each colour has its own photos, sizes and stock. Open a colour to edit it.
      </p>
      <div className="flex flex-wrap gap-2">
        {colours.map((colour) => (
          <button
            key={colour.id}
            aria-pressed={colour.id === product.id}
            onClick={() => onSelect(colour.id)}
            className={`flex min-h-12 items-center gap-2 rounded-lg border p-2 text-sm ${colour.id === product.id ? "border-primary bg-primary/10" : "bg-background"}`}
          >
            {colour.image_src && (
              <img src={colour.image_src} alt="" className="h-10 w-10 rounded object-contain" />
            )}
            <span data-no-translate>{colour.color?.trim() || "—"}</span>
            {colour.status !== "Active" && (
              <span className="text-xs text-muted-foreground">Archived</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
