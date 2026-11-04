import styles from "./order-success-mark.module.css";

/** Non-blocking decoration: mount only after the order has been saved. */
export function OrderSuccessMark({ motionEnabled = true }: { motionEnabled?: boolean }) {
  return (
    <span
      className={styles["mark"]}
      data-order-success
      data-motion={motionEnabled}
      aria-hidden="true"
    >
      <span className={styles["halo"]} />
      <svg className={styles["parcel"]} viewBox="0 0 64 64" fill="none">
        <path className={styles["box"]} d="m12 23 20-11 20 11v21L32 55 12 44V23Z" />
        <path className={styles["fold"]} d="m12 23 20 11 20-11M32 34v21M22 17.5l20 11v8" />
      </svg>
      <svg className={styles["seal"]} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="13" />
        <path className={styles["tick"]} d="m8 14 4 4 8-8" />
      </svg>
      <span className={styles["spark"]} data-position="one" />
      <span className={styles["spark"]} data-position="two" />
      <span className={styles["spark"]} data-position="three" />
    </span>
  );
}
