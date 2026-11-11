import { useEffect, useId, useRef, useState } from "react";
import termsUrl from "@/lib/catalog-terms.json?url&no-inline";
import type { CatalogShop } from "@/lib/catalog.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import styles from "./catalog-terms.module.css";

type TermsContent = [string, string][];
let contentRequest: Promise<TermsContent> | undefined;
/** Coalesce intent/tap loads. A failed download can be explicitly retried in-place. */
function loadTerms() {
  return (contentRequest ??= fetch(termsUrl)
    .then(async (response) => {
      if (!response.ok) throw Error("Terms unavailable");
      const data: unknown = await response.json();
      if (
        !Array.isArray(data) ||
        data.length !== 12 ||
        !data.every(
          (row) =>
            Array.isArray(row) &&
            row.length === 2 &&
            row.every((value) => typeof value === "string" && value.trim()),
        )
      )
        throw Error("Invalid terms");
      return data as TermsContent;
    })
    .catch((error) => {
      contentRequest = undefined;
      throw error;
    }));
}

export function CatalogTermsLink({ shop }: { shop: CatalogShop }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles["link"]}
        data-no-translate
        onPointerEnter={() => {
          void loadTerms().catch(() => {});
        }}
        onFocus={() => {
          void loadTerms().catch(() => {});
        }}
        onClick={() => setOpen(true)}
      >
        Terms &amp; Conditions
      </button>
      {open && <TermsDialog shop={shop} onClose={() => setOpen(false)} />}
    </>
  );
}

function TermsDialog({ shop, onClose }: { shop: CatalogShop; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<TermsContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadTerms().then(
      (value) => {
        if (active) setContent(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        ref={root}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          root.current?.focus({ preventScroll: true });
        }}
        overlayClassName={styles["overlay"]}
        className={styles["dialog"]}
        aria-describedby={undefined}
        data-catalog-terms
        data-no-translate
      >
        <DialogHeader className={styles["header"]}>
          <DialogTitle>Terms &amp; Conditions</DialogTitle>
          <p>{shop.name}</p>
        </DialogHeader>
        <div className={styles["body"]}>
          {content ? (
            <>
              <ol className={styles["sections"]}>
                {content.map(([title, copy]) => (
                  <li key={title}>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </li>
                ))}
              </ol>
              <div className={styles["contact"]}>
                <strong>{shop.name}</strong>
                {shop.address && <p>{shop.address}</p>}
                {shop.phone && <a href={`tel:${shop.phone}`}>{shop.phone}</a>}
              </div>
            </>
          ) : failed ? (
            <div role="alert">
              <p>Terms could not load. Check your connection and try again.</p>
              <button
                type="button"
                className={styles["retry"]}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          ) : (
            <p role="status">Loading terms…</p>
          )}
        </div>
        <button type="button" className={styles["done"]} onClick={onClose}>
          Back
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogTermsAgreement({
  shop,
  checked,
  onChange,
  disabled = false,
}: {
  shop: CatalogShop;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles["agreement"]} data-no-translate>
      <label htmlFor={id} className={styles["checkTarget"]}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-label="I agree to the Terms & Conditions"
        />
      </label>
      <div className={styles["agreementCopy"]}>
        <label htmlFor={id}>I agree to the </label>
        <CatalogTermsLink shop={shop} />
        <span>.</span>
      </div>
    </div>
  );
}
