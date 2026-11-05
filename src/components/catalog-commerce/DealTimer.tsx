import { useDealSeconds } from "@/lib/use-deal-seconds";
import { useEffect } from "react";
import { Clock3 } from "lucide-react";
import { type CatalogDeal } from "@/lib/catalog-bargain";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import styles from "./commerce.module.css";
export function DealTimer({ deal, onExpired }: { deal: CatalogDeal; onExpired?: () => void }) {
  const { t } = useLang();
  const seconds = useDealSeconds(deal);
  useEffect(() => {
    if (seconds === 0) onExpired?.();
  }, [seconds, onExpired]);
  if (seconds === 0) return null;
  return (
    <div className={styles["timer"]} data-urgent={seconds > 0 && seconds <= 30} data-no-translate>
      <Clock3 aria-hidden="true" size={18} />
      <div>
        <strong>{t("Place your order to keep this price")}</strong>
        <span>
          {inr(deal.price)} · {t("Cart does not reserve stock")}
        </span>
      </div>
      <time aria-label={t("Time remaining")} dateTime={`PT${seconds}S`}>
        {Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0")}
        :{(seconds % 60).toString().padStart(2, "0")}
      </time>
    </div>
  );
}
