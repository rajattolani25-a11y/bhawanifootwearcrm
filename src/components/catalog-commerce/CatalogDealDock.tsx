import type { CatalogDeal } from "@/lib/catalog-bargain";
import { useLang } from "@/lib/i18n";
import { DealTimer } from "./DealTimer";
import { useDealSeconds } from "@/lib/use-deal-seconds";
import styles from "./commerce.module.css";
export function CatalogDealDock({
  deal,
  onReview,
  onDismiss,
}: {
  deal: CatalogDeal;
  onReview: () => void;
  onDismiss: () => void;
}) {
  const seconds = useDealSeconds(deal);
  const { t } = useLang();
  if (!seconds) return null;
  return (
    <aside className={styles["dock"]} aria-label={t("Your bargain price")}>
      <DealTimer deal={deal} />
      <div className={styles["dockActions"]}>
        <button onClick={onDismiss}>{t("Dismiss")}</button>
        <button onClick={onReview}>{t("Review offer")}</button>
      </div>
    </aside>
  );
}
