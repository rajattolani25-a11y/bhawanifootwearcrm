import { catalogSizeValue, type CatalogSizeGroup } from "@/lib/catalog-size-options";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import styles from "@/routes/catalog.module.css";

export type CatalogSort = "default" | "price-asc" | "price-desc" | "name" | "discount";
const COPY = {
  english: {
    title: "Filters & sort",
    size: "Size",
    anySize: "Any size",
    sort: "Sort by",
    default: "Default order",
    "price-asc": "Price: low to high",
    "price-desc": "Price: high to low",
    name: "Name: A–Z",
    discount: "Discount: highest first",
    clear: "Clear filters",
  },
  hindi: {
    title: "फ़िल्टर और क्रम",
    size: "साइज़",
    anySize: "कोई भी साइज़",
    sort: "क्रम चुनें",
    default: "सामान्य क्रम",
    "price-asc": "कीमत: कम से ज़्यादा",
    "price-desc": "कीमत: ज़्यादा से कम",
    name: "नाम: A–Z",
    discount: "छूट: सबसे ज़्यादा पहले",
    clear: "फ़िल्टर हटाएँ",
  },
  hinglish: {
    title: "Filters & sort",
    size: "Size",
    anySize: "Koi bhi size",
    sort: "Sort by",
    default: "Default order",
    "price-asc": "Price: kam se zyada",
    "price-desc": "Price: zyada se kam",
    name: "Naam: A–Z",
    discount: "Discount: sabse zyada pehle",
    clear: "Filters hatayein",
  },
};

export function CatalogCollectionFilters({
  groups,
  size,
  setSize,
  sort,
  setSort,
  onClear,
}: {
  groups: CatalogSizeGroup[];
  size: string;
  setSize: (value: string) => void;
  sort: CatalogSort;
  setSort: (value: CatalogSort) => void;
  onClear: () => void;
}) {
  const { lang, t } = useLang();
  const copy = COPY[lang];
  const refined = size !== "All" || sort !== "default";
  const selected = groups.flatMap((group) =>
    group.sizes.map((value) => catalogSizeValue(group.department, value)),
  );
  let unavailable = "";
  if (size !== "All" && !selected.includes(size)) {
    try {
      const [department, value] = JSON.parse(size) as [string, string];
      unavailable = `${t(department)} · ${value}`;
    } catch {
      unavailable = size;
    }
  }
  return (
    <section className={styles["filterPanel"]} aria-label={copy.title} data-no-translate>
      <div className={styles["filters"]}>
        <label className={styles["filter"]}>
          <span>{copy.size}</span>
          <select
            aria-label={copy.size}
            value={size}
            disabled={!groups.length && size === "All"}
            onChange={(event) => setSize(event.target.value)}
          >
            <option value="All">{copy.anySize}</option>
            {unavailable && (
              <option value={size} disabled>
                {unavailable}
              </option>
            )}
            {groups.map((group) => (
              <optgroup key={group.department} label={t(group.department)}>
                {group.sizes.map((value) => (
                  <option key={value} value={catalogSizeValue(group.department, value)}>
                    {t(group.department)} · {value}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={styles["filter"]}>
          <span>{copy.sort}</span>
          <select
            aria-label={copy.sort}
            value={sort}
            title={copy[sort]}
            onChange={(event) => setSort(event.target.value as CatalogSort)}
          >
            {(["default", "price-asc", "price-desc", "name", "discount"] as const).map((value) => (
              <option key={value} value={value}>
                {copy[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {refined && (
        <button
          onClick={onClear}
          className={styles["clear"]}
          aria-label={copy.clear}
          title={copy.clear}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
