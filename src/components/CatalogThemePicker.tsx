import { CATALOG_THEMES, type CatalogThemeId } from "@/lib/catalog-themes";
import { useLang } from "@/lib/i18n";
import styles from "./catalog-hero-preview.module.css";

export function CatalogThemePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CatalogThemeId;
  onChange: (value: CatalogThemeId) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className="my-5" role="group" aria-label={t("Catalog theme previews")}>
      <h4 className="font-semibold">{t("Catalog themes")}</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("Choose a look, then preview or save your theme.")}
      </p>
      <div className={styles["themes"]}>
        {CATALOG_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            disabled={disabled}
            style={theme.style}
            className={styles["theme"]}
            aria-pressed={value === theme.id}
            onClick={() => onChange(theme.id)}
          >
            <span className={styles["themeSwatch"]} aria-hidden="true">
              <i />
              <b />
            </span>
            <span data-no-translate>{theme.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
