import { Printer, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import styles from "./label-selection-dock.module.css";
export function LabelSelectionDock({
  articles,
  sizes,
  labels,
  busy,
  onPrint,
  onClear,
}: {
  articles: number;
  sizes: number;
  labels: number;
  busy: boolean;
  onPrint: () => void;
  onClear: () => void;
}) {
  const { t } = useLang();
  if (!labels) return null;
  return (
    <aside className={styles["dock"]} aria-label={t("Selected label actions")}>
      <div role="status" className={styles["count"]}>
        <strong>
          {articles} {t(articles === 1 ? "article selected" : "articles selected")}
        </strong>
        <span>
          {sizes} {t("sizes")} · {labels} {t("labels")}
        </span>
      </div>
      <button type="button" onClick={onPrint} disabled={busy} className={styles["print"]}>
        <Printer aria-hidden="true" />
        {t(busy ? "Preparing…" : "Print selected labels")}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className={styles["clear"]}
        aria-label={t("Clear selection")}
      >
        <X aria-hidden="true" />
        <span>{t("Clear selection")}</span>
      </button>
    </aside>
  );
}
