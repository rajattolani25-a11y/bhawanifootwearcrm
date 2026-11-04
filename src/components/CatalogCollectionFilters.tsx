import { SlidersHorizontal } from "lucide-react";
import { useLang } from "@/lib/i18n";
import styles from "@/routes/catalog.module.css";

export type CatalogSort = "default" | "price-asc" | "price-desc" | "name" | "discount";
const COPY = {
  english: {
    title: "Refine your selection",
    style: "Style",
    type: "Type",
    brand: "Brand",
    size: "Size",
    allStyles: "All styles",
    allBrands: "All brands",
    anySize: "Any size",
    sort: "Sort by",
    default: "Default order",
    "price-asc": "Price: low to high",
    "price-desc": "Price: high to low",
    name: "Name: A–Z",
    discount: "Discount: highest first",
    clear: "Clear filters",
    styleAria: "Subcategory",
  },
  hindi: {
    title: "अपनी पसंद चुनें",
    style: "स्टाइल",
    type: "प्रकार",
    brand: "ब्रांड",
    size: "साइज़",
    allStyles: "सभी स्टाइल",
    allBrands: "सभी ब्रांड",
    anySize: "कोई भी साइज़",
    sort: "क्रम चुनें",
    default: "सामान्य क्रम",
    "price-asc": "कीमत: कम से ज़्यादा",
    "price-desc": "कीमत: ज़्यादा से कम",
    name: "नाम: A–Z",
    discount: "छूट: सबसे ज़्यादा पहले",
    clear: "फ़िल्टर हटाएँ",
    styleAria: "उपश्रेणी",
  },
  hinglish: {
    title: "Apni pasand chunein",
    style: "Style",
    type: "Type",
    brand: "Brand",
    size: "Size",
    allStyles: "Saare styles",
    allBrands: "Saare brands",
    anySize: "Koi bhi size",
    sort: "Sort by",
    default: "Default order",
    "price-asc": "Price: kam se zyada",
    "price-desc": "Price: zyada se kam",
    name: "Naam: A–Z",
    discount: "Discount: sabse zyada pehle",
    clear: "Filters hatayein",
    styleAria: "Subcategory",
  },
};

export function CatalogCollectionFilters({
  styleLabel,
  types,
  ptype,
  setPtype,
  brands,
  brand,
  setBrand,
  sizes,
  size,
  setSize,
  sort,
  setSort,
  onClear,
}: {
  styleLabel: "Subcategory" | "Type";
  types: string[];
  ptype: string;
  setPtype: (value: string) => void;
  brands: string[];
  brand: string;
  setBrand: (value: string) => void;
  sizes: string[];
  size: string;
  setSize: (value: string) => void;
  sort: CatalogSort;
  setSort: (value: CatalogSort) => void;
  onClear: () => void;
}) {
  const { lang, t } = useLang();
  const copy = COPY[lang];
  const fields = [
    {
      label: styleLabel === "Type" ? copy.type : copy.style,
      aria: styleLabel === "Type" ? copy.type : copy.styleAria,
      options: types,
      value: ptype,
      change: setPtype,
      placeholder: copy.allStyles,
      translate: true,
    },
    {
      label: copy.brand,
      aria: copy.brand,
      options: brands,
      value: brand,
      change: setBrand,
      placeholder: copy.allBrands,
      translate: false,
    },
    {
      label: copy.size,
      aria: copy.size,
      options: sizes,
      value: size,
      change: setSize,
      placeholder: copy.anySize,
      translate: false,
    },
  ];
  const refined = ptype !== "All" || brand !== "All" || size !== "All" || sort !== "default";
  return (
    <section className={styles["filterPanel"]} aria-label={copy.title} data-no-translate>
      <div className={styles["filterHeading"]}>
        <p>
          <SlidersHorizontal aria-hidden="true" />
          {copy.title}
        </p>
        {refined && (
          <button onClick={onClear} className={styles["clear"]}>
            {copy.clear}
          </button>
        )}
      </div>
      <div className={styles["filters"]}>
        {fields.map((field) => (
          <label key={field.aria} className={styles["filter"]}>
            <span>{field.label}</span>
            <select
              aria-label={field.aria}
              value={field.value}
              disabled={field.options.length <= 1}
              onChange={(event) => field.change(event.target.value)}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? field.placeholder : field.translate ? t(option) : option}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className={styles["filter"]}>
          <span>{copy.sort}</span>
          <select
            aria-label={copy.sort}
            value={sort}
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
    </section>
  );
}
