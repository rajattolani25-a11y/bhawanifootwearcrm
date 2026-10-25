import { Check, Tag, X } from "lucide-react";
import { inr } from "@/lib/modules";
import { useLang } from "@/lib/i18n";
import styles from "./coupon-ticket.module.css";

/** Render only an existing, server-validated coupon; never calculate a discount here. */
export function CouponTicket({
  code,
  amount,
  title,
  pending = false,
  onRemove,
}: {
  code: string;
  amount: number;
  title?: string;
  pending?: boolean;
  onRemove?: () => void;
}) {
  const { t } = useLang();
  return (
    <div className={styles["ticket"]} role="status" aria-live="polite" data-pending={pending}>
      <Tag className={styles["icon"]} aria-hidden="true" />
      <div className={styles["copy"]}>
        <span className={styles["eyebrow"]}>{t("Coupon")}</span>
        <strong data-no-translate>{code}</strong>
        {title && (
          <span data-no-translate className={styles["title"]}>
            {title}
          </span>
        )}
        <span className={styles["saving"]}>
          {t("You save")} <b>{inr(amount)}</b>
        </span>
      </div>
      <span className={styles["badge"]}>
        {!pending && <Check aria-hidden="true" />} {t(pending ? "Checking…" : "Applied")}
      </span>
      {onRemove && (
        <button
          type="button"
          className={styles["remove"]}
          disabled={pending}
          onClick={onRemove}
          aria-label={t("Remove coupon")}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
