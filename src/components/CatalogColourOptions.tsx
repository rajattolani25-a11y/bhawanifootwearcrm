import type { CatalogProduct } from "@/lib/catalog.functions";
import { catalogColourOptions } from "@/lib/product-colours";
import { useLang } from "@/lib/i18n";

export function CatalogColourOptions({
  product,
  products,
  onPick,
}: {
  product: CatalogProduct;
  products: CatalogProduct[];
  onPick: (product: CatalogProduct) => void;
}) {
  const { t } = useLang();
  const colours = catalogColourOptions(products, product);
  if (colours.length < 2)
    return product.color?.trim() ? (
      <p className="text-sm">
        <span>{t("Colour")}</span>: <span data-no-translate>{product.color}</span>
      </p>
    ) : null;
  return (
    <section aria-label={t("Choose colour")} className="space-y-2">
      <p className="text-sm font-semibold">{t("Choose colour")}</p>
      <div className="flex flex-wrap gap-2">
        {colours.map((colour) => (
          <button
            key={colour.id}
            type="button"
            aria-pressed={colour.id === product.id}
            aria-label={`${t("Colour")}: ${colour.color?.trim() || t("Original colour")}`}
            onClick={() => {
              if (colour.id === product.id) return;
              const url = new URL(window.location.href);
              url.searchParams.set("product", colour.id);
              url.searchParams.delete("size");
              window.history.replaceState(window.history.state, "", url);
              onPick(colour);
            }}
            className={`flex min-h-12 items-center gap-2 rounded-lg border p-2 text-sm ${colour.id === product.id ? "border-primary bg-primary/10" : "bg-card"}`}
          >
            {colour.image && (
              <img
                src={colour.image}
                alt=""
                loading="lazy"
                className="h-10 w-10 rounded object-contain"
              />
            )}
            <span data-no-translate>{colour.color?.trim() || t("Original colour")}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
