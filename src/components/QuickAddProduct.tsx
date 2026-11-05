import { BargainPolicyFields } from "./catalog-commerce/BargainPolicyEditor";
import { ownerBargainRpc, saveBargainPolicy } from "@/lib/catalog-bargain-owner";
import { DEFAULT_BARGAIN_POLICY, policyError } from "@/lib/catalog-bargain";
import { DEPARTMENTS, SUBCATEGORIES, categoryValue, parseCategory } from "@/lib/product-categories";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { addProductPhoto, MAX_PRODUCT_PHOTOS, validateProductPhoto } from "@/lib/product-images";
import { sizeSort } from "@/lib/stock";

export type QuickAddResult = {
  product_id: string;
  variants: { id: string; size: string }[];
  cost: number;
  qty: Record<string, number>;
  name: string;
};

/** Expand "6-10" or "6,7,8" or "S M L" into a size list. */
function parseSizes(text: string) {
  const out: string[] = [];
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]),
        b = Number(m[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 40; i++) out.push(String(i));
    } else out.push(part.toUpperCase());
  }
  return [...new Set(out)].sort(sizeSort);
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

/** Indian footwear size chart per category: all sizes + quick 1-tap sets. */
type Chart = { all: string[]; sets: [string, string[], string][] };
const SIZE_CHART: Record<"Men" | "Women" | "Boys" | "Kids", Chart> = {
  Men: {
    all: range(6, 12),
    sets: [
      ["6-10", range(6, 10), "Regular"],
      ["11-12", range(11, 12), "Large sizes"],
    ],
  },
  Women: {
    all: range(5, 12),
    sets: [
      ["5-9", range(5, 9), "Regular"],
      ["10-12", range(10, 12), "Plus size"],
    ],
  },
  Boys: { all: range(1, 5), sets: [["1-5", range(1, 5), "Full set"]] },
  Kids: {
    all: range(1, 13),
    sets: [
      ["1-5", range(1, 5), "Small"],
      ["6-10", range(6, 10), "Medium"],
      ["11-13", range(11, 13), "Large"],
      ["All", range(1, 13), "1-13"],
    ],
  },
};

export function QuickAddProduct({
  open,
  onClose,
  onAdded,
  mode = "stock",
  initialArticle = "",
  colourOf,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (r: QuickAddResult) => void;
  mode?: "stock" | "purchase";
  initialArticle?: string;
  colourOf?: {
    id: string;
    brand: string;
    article: string;
    category: string;
    color: string | null;
    mrp: number;
    selling_price: number;
    sizes: string[];
  };
}) {
  const qc = useQueryClient();
  const { t } = useLang();
  const { isOwner } = useAuth();
  const [f, setF] = useState({
    brand: "",
    article: "",
    category: "",
    subcategory: "",
    color: "",
    mrp: "",
    selling_price: "",
    cost: "",
    rack: "",
  });
  const [picked, setPicked] = useState<string[]>(range(6, 10));
  const [extraSizes, setExtraSizes] = useState("");
  const [defQty, setDefQty] = useState(mode === "purchase" ? "0" : "1");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [bargainPolicy, setBargainPolicy] = useState({ ...DEFAULT_BARGAIN_POLICY });
  const [bargainReady, setBargainReady] = useState(false);
  useEffect(() => {
    if (open) setBargainPolicy({ ...DEFAULT_BARGAIN_POLICY });
  }, [open, colourOf?.id]);
  useEffect(() => {
    let live = true;
    if (open && isOwner)
      ownerBargainRpc("owner_catalog_bargain_policy", { _product_id: null })
        .then(({ error }) => {
          if (live) setBargainReady(!error);
        })
        .catch(() => {
          if (live) setBargainReady(false);
        });
    return () => {
      live = false;
    };
  }, [open, isOwner]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [photoProgress, setPhotoProgress] = useState("");
  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);
  useEffect(() => {
    if (!open) setPhotos([]);
  }, [open]);
  useEffect(() => {
    if (open) setF((x) => ({ ...x, article: initialArticle || x.article }));
  }, [open, initialArticle]);
  useEffect(() => {
    if (!open || !colourOf) return;
    const category = parseCategory(colourOf.category);
    setF({
      brand: colourOf.brand,
      article: colourOf.article,
      category: category.department,
      subcategory: category.subcategory,
      color: "",
      mrp: String(colourOf.mrp),
      selling_price: String(colourOf.selling_price),
      cost: "",
      rack: "",
    });
    setPicked(colourOf.sizes);
    setExtraSizes("");
    setQty({});
    setDefQty("0");
  }, [open, colourOf]);
  const chart: Chart = SIZE_CHART[f.category as keyof typeof SIZE_CHART] ?? SIZE_CHART.Men;
  const sizes = [...new Set([...picked, ...parseSizes(extraSizes)])].sort(sizeSort);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const pickCategory = (c: string) => {
    setF({ ...f, category: c, subcategory: "" });
    setExtraSizes("");
    setPicked(SIZE_CHART[c as keyof typeof SIZE_CHART].sets[0]?.[1] ?? []);
  };
  const toggleSet = (list: string[]) =>
    setPicked((p) =>
      list.every((s) => p.includes(s))
        ? p.filter((s) => !list.includes(s))
        : [...new Set([...p, ...list])],
    );
  const toggleSize = (s: string) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  async function save() {
    if (saving.current) return;
    const sp = Number(f.selling_price);
    if (
      colourOf &&
      (!isOwner ||
        !f.color.trim() ||
        f.color.trim().length > 80 ||
        f.color.trim().toLowerCase() === (colourOf.color ?? "").trim().toLowerCase())
    ) {
      toast.error(t("Enter a different colour name"));
      return;
    }
    if (!f.article.trim()) {
      toast.error(t("Enter an article name"));
      return;
    }
    if (!f.category) {
      toast.error(t("Choose a product category"));
      return;
    }
    if (
      !colourOf &&
      SUBCATEGORIES[f.category] &&
      !SUBCATEGORIES[f.category]!.includes(f.subcategory)
    ) {
      toast.error(t("Choose a subcategory, or select Other"));
      return;
    }
    if (!(sp > 0)) {
      toast.error(t("Enter a selling price"));
      return;
    }
    if (!sizes.length) {
      toast.error(t("Select at least one size"));
      return;
    }
    const rows = sizes.map((s) => ({
      size: s,
      qty:
        mode === "purchase" || colourOf
          ? 0
          : Math.max(0, Math.floor(Number(qty[s] ?? defQty) || 0)),
    }));
    const bargainError = policyError(sp, bargainPolicy);
    if (isOwner && bargainReady && bargainError) {
      toast.error(t(bargainError));
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      if (colourOf) {
        // A saved colour must be edited, never topped up by submitting Add colour again.
        const { data: existing, error: lookupError } = await supabase
          .from("products")
          .select("id,color")
          .eq("brand", colourOf.brand)
          .eq("article", colourOf.article);
        if (lookupError) throw lookupError;
        if (
          existing?.some(
            (product) =>
              (product.color ?? "").trim().toLowerCase() === f.color.trim().toLowerCase(),
          )
        )
          throw new Error(t("This colour already exists. Open it to edit photos or stock."));
      }
      const { data, error } = await supabase.rpc("quick_add_product", {
        _product: {
          brand: f.brand.trim(),
          article: f.article.trim(),
          category: colourOf?.category ?? categoryValue(f.category, f.subcategory),
          color: f.color.trim(),
          mrp: Number(f.mrp) || sp,
          selling_price: sp,
          rack: f.rack.trim(),
        },
        _sizes: rows,
        _cost: isOwner && Number(f.cost) > 0 ? Number(f.cost) : (null as unknown as number),
      });
      if (error) throw error;
      const r = data as { product_id: string; variants: { id: string; size: string }[] };
      if (isOwner && bargainReady && bargainPolicy.enabled) {
        try {
          await saveBargainPolicy(r.product_id, bargainPolicy);
        } catch {
          toast.error(
            t(
              "Product saved. Bargaining settings were not saved. Open Edit product to retry; do not create the product again.",
            ),
          );
        }
      }
      if (isOwner && photos.length) {
        for (let i = 0; i < photos.length; i++) {
          setPhotoProgress(`Uploading photo ${i + 1}/${photos.length}…`);
          try {
            await addProductPhoto(r.product_id, photos[i]!);
          } catch (photoError) {
            toast.error(
              `Product saved. Photo ${i + 1} failed: ${(photoError as Error).message}. Open Products → Photos to add the remaining photos. Do not create the product again.`,
            );
            break;
          }
        }
      }
      if (colourOf) toast.success(t("Colour saved. Add its quantities in Sizes & stock."));
      else
        toast.success(
          `${f.brand.toUpperCase()} ${f.article} ready — ${rows.reduce((a, x) => a + x.qty, 0)} pairs added`,
        );
      [
        "products",
        "stock-all",
        "pos-products",
        "dashboard",
        "ledger",
        "catalog-studio-products",
        "hero-product-choices",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onAdded?.({
        ...r,
        name: `${f.brand.trim().toUpperCase()} ${f.article.trim()}`.trim(),
        cost: Number(f.cost) || 0,
        qty: Object.fromEntries(rows.map((x) => [x.size, x.qty])),
      });
      setF({
        brand: f.brand,
        article: "",
        category: f.category,
        subcategory: f.subcategory,
        color: "",
        mrp: "",
        selling_price: "",
        cost: "",
        rack: f.rack,
      });
      setQty({});
      setExtraSizes("");
      setPhotos([]);
      setBargainPolicy({ ...DEFAULT_BARGAIN_POLICY });
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
      setPhotoProgress("");
    }
  }

  const fields = [
    ["brand", "Brand"],
    ["article", "Article *"],
    ["color", "Colour"],
    ["selling_price", "Selling price *"],
    ["mrp", "MRP"],
    ...(isOwner && !colourOf ? [["cost", "Purchase cost"]] : []),
    ["rack", "Rack"],
  ] as [keyof typeof f, string][];
  const chip = (on: boolean) =>
    `rounded-md border font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{colourOf ? "Add colour" : "Quick add product"}</DialogTitle>
          <DialogDescription>
            {colourOf
              ? "Details and prices are copied. New colours start at zero stock; add actual quantities in Sizes & stock after saving."
              : mode === "purchase"
                ? "Create a new article, then sizes will appear in the purchase list."
                : "Article and sizes immediately in stock — scan code will be generated automatically."}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="contents">
          <div className="grid grid-cols-2 gap-2.5">
            {fields.map(([k, l]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`quick-product-${mode}-${k}`} className="text-xs">
                  {l}
                </Label>
                <Input
                  id={`quick-product-${mode}-${k}`}
                  value={f[k]}
                  readOnly={!!colourOf && ["brand", "article"].includes(k)}
                  onChange={set(k)}
                  autoFocus={colourOf ? k === "color" : k === "article"}
                  inputMode={["mrp", "selling_price", "cost"].includes(k) ? "decimal" : undefined}
                  className="h-9"
                />
              </div>
            ))}
          </div>
          {isOwner && bargainReady && (
            <BargainPolicyFields
              value={bargainPolicy}
              onChange={setBargainPolicy}
              price={Number(f.selling_price)}
              disabled={busy}
            />
          )}
          <Label className="text-xs">Category (required)</Label>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Product category">
            {DEPARTMENTS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!!colourOf}
                onClick={() => pickCategory(c)}
                className={`${chip(f.category === c)} px-1 py-2 text-xs`}
              >
                {c}
              </button>
            ))}
          </div>
          {!!SUBCATEGORIES[f.category]?.length && (
            <div className="space-y-1">
              <Label htmlFor="quick-add-subcategory" className="text-xs">
                Subcategory (required)
              </Label>
              <select
                id="quick-add-subcategory"
                required
                disabled={!!colourOf}
                value={f.subcategory}
                onChange={(e) => setF({ ...f, subcategory: e.target.value })}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  Choose subcategory
                </option>
                {SUBCATEGORIES[f.category]!.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Quick set</Label>
            <div className="flex gap-1.5">
              {chart.sets.map(([g, list, hint]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleSet(list)}
                  className={`${chip(list.every((s) => picked.includes(s)))} flex-1 px-2 py-1.5 text-sm`}
                >
                  {g}
                  <span className="block text-[10px] font-normal leading-tight opacity-80">
                    {t(hint)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {colourOf ? "Select sizes for this colour" : "Select only the sizes received"}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(colourOf ? [...new Set([...chart.all, ...picked])].sort(sizeSort) : chart.all).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSize(s)}
                    className={`${chip(picked.includes(s))} h-9 min-w-9 px-2 text-sm`}
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className={`grid ${colourOf ? "grid-cols-1" : "grid-cols-[1fr_90px]"} gap-2.5`}>
            <div className="space-y-1">
              <Label className="text-xs">Extra size (optional)</Label>
              <Input
                value={extraSizes}
                onChange={(e) => setExtraSizes(e.target.value)}
                className="h-9"
                placeholder={t("For example: 13 or 4")}
              />
            </div>
            {mode !== "purchase" && !colourOf && (
              <div className="space-y-1">
                <Label className="text-xs">Pairs / size</Label>
                <Input
                  value={defQty}
                  onChange={(e) => setDefQty(e.target.value)}
                  inputMode="numeric"
                  className="h-9"
                />
              </div>
            )}
          </div>
          {mode !== "purchase" && !colourOf && sizes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs font-semibold"
                >
                  {s}
                  <input
                    value={qty[s] ?? defQty}
                    onChange={(e) => setQty({ ...qty, [s]: e.target.value })}
                    inputMode="numeric"
                    aria-label={`Pairs for size ${s}`}
                    className="w-9 rounded border bg-background px-1 text-center"
                  />
                </label>
              ))}
            </div>
          )}

          {mode !== "purchase" && !colourOf && isOwner && !(Number(f.cost) > 0) && (
            <p className="text-xs text-warning-foreground">
              {t('Cost is empty — "cost missing" will appear in the profit report.')}
            </p>
          )}
          {isOwner && (
            <div className="space-y-2">
              <Label htmlFor="new-product-photos">
                Product photos (optional, up to {MAX_PRODUCT_PHOTOS})
              </Label>
              <Input
                id="new-product-photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  try {
                    if (photos.length + chosen.length > MAX_PRODUCT_PHOTOS)
                      throw new Error(`Maximum ${MAX_PRODUCT_PHOTOS} photos`);
                    chosen.forEach(validateProductPhoto);
                    setPhotos((current) => [...current, ...chosen]);
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                First photo becomes the cover. JPG, PNG or WebP, up to 5 MB each; photos are
                compressed automatically. You can change the cover later.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <div key={`${photo.name}-${i}`} className="min-w-0 rounded border p-1">
                    <img
                      src={previews[i]}
                      alt={`Selected photo ${i + 1}`}
                      className="aspect-square w-full object-contain"
                    />
                    <p className="truncate text-xs">
                      {i === 0 ? "Cover · " : ""}
                      {photo.name}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPhotos((current) => current.filter((_, index) => index !== i))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </fieldset>
        {photoProgress && (
          <p role="status" className="text-sm">
            {photoProgress}
          </p>
        )}
        <Button onClick={save} disabled={busy} className="h-11">
          {busy ? "Saving…" : colourOf ? "Save colour" : "Save & add"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
