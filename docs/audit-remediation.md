# Whole-app audit remediation

Baseline: eb962f5 plus approved order-success/WhatsApp frontend work. User authorised fixing the reported gaps, including the necessary database definitions. All work was performed locally with synthetic browser data and disposable PostgreSQL17 containers. Production SQL, transactions, storage, reset, outbound messages and deploy have not been performed. Git publication is tracked separately; the evidence below captures the pre-push verification state.

## What changed

| Audit finding | Implemented repair | Main validation |
|---|---|---|
|F01 stale absolute inventory|Atomic owner RPC, expected stock/damaged counts, reason, ledger; stale form discard|Real stale/RLS checks; cross-screen browser|
|F02 opening customer repayment|Dated receipt, original versus remaining opening balance, atomic multi-bill allocation|PG receipt/retry/rollback; Khata and Accounting browser|
|F03 supplier opening debt|Allocate purchase dues then opening debt; preserve original amount and opening allocation|PG repayments/retry; supplier running ledger|
|F04 negative received|Client stops invalid money before submission|Actual POS browser and PG|
|F05 trusted client totals|Server recomputes items, discounts, tax, paid/due/split; checks current prices and active size|Forged/negative/NaN/invalid-mode requests rejected; legitimate billing/recovery|
|F06 stale customer response|Request version and selected-mobile match guard|Delayed Alpha response cannot replace Beta|
|F07 merged colours|Brand+Article+Colour identity under lock; ambiguous/archive/price mismatch rejection|Different colours; simultaneous identical identity|
|F08 missing delivery fee|Linked order fee in final invoice and presentation line; proper prepaid/remainder split|PG1080 reconciliation; invoice previews|
|F09 online money history|Dated advance receipt; paid cancel→refund_pending→owner-recorded external refund|Retry one receipt; one refund; actual dated cash; historical alert|
|F10 cancelled coupon quota|Canonical redemption/reservation capacity; release cancellation/expiry|Real cancellation and concurrent quota1|
|F11 cross-channel coupon reuse|Same mobile/customer checked against online and POS history|Genuine online→POS rejection|
|F12 wrong delivery quote|Use post-coupon net for threshold and compare displayed price/net/charge/advance server-side|Discount800 + charge30 =830; wrong quote rejected|
|F13 archived order|Require Active and public visibility under variant lock|Cached archived variant ID denied|
|F14 silent damaged clear|Reasoned supplier-return/write-off stock events, no fabricated credit|Damaged bucket and disposition ledger|
|F15 uncertain receipts/payments|Saved UUID+original payload, server dedup, global recovery, owner resolution with late-retry tombstone|Lost-response/reload receiving test; changed retry denied; staff mixed payment rollback|
|F16 dense labels|Compact12-character stable scan alias, Code128 quiet margins; old codes retained|Label preview/selection; stable alias. Hardware still requires acceptance|
|F17 unguarded owner URLs|Owner guards for Purchase, Suppliers and Inventory plus Reports/Accounting|Staff direct URLs redirect to POS|
|F18 stale open catalog|Visible30s/focus refresh of safe metadata; reuse signed unchanged photos; update open product|Price/stock refresh; sold-out checkout blocked; no repeated signing|
|F19 inconsistent stock rules|Inclusive minimum threshold with zero separate; common60-day ageing and sold window|Boundary tests; shared screens; dead-stock read errors explicit|
|F20 capped reads/import|Full reads for supplier/cost aggregates, paged purchase history, atomic empty-store legacy import, errors surfaced|Browser pagination; real legacy malformed rollback/replay/no-overwrite|

Additional integration fixes: stock/financial cache invalidation; current cart price review; original-opening edit labels; no-GST default unless configured; invoice defaults within the existing Billing section; unsaved-settings warning; pending-operation draft cleanup after store reset; English/Hindi/Hinglish copy for new workflows. No new Settings section or Guide was added.

The approved catalog order animation displays the saved order immediately, then settles in under one second. Motion OFF/reduced-motion are honoured. Payment proof has one direct shop WhatsApp action with professional prefilled order details; customers attach screenshots inside WhatsApp. There is no screenshot picker, storage upload, automatic message sending or bank verification.

## Verification

- TypeScript and production build completed locally.
- All39 unit tests pass, including common stock boundaries and reset draft isolation.
- Real PostgreSQL tests exercise all migrations, money validation, owner/staff/anon permissions, concurrent last-pair orders and coupon limits, receipts/retries, opening debt, delivery, pickup split, refund lifecycle, owner request recovery and abandoned late requests.
- All new nullable columns survive a genuine verified backup→reset→restore in the disposable database; both full definitions and the separately applied SQL Editor parts are reapplied safely over test records.
- Existing returns/exchanges/loyalty/CSV audit runs against the latest backend. Existing owner product/void audit also runs against all migrations, including cancellation guards, retained history and backup/restore.
- Browser coverage includes photos/compression, catalog actions/gallery/themes/motion, posters, Settings/reset UI, labels, language/PDF, storage meter, POS response recovery, online orders, return-aware financial pages and the new cross-screen/receipt/recovery workflows. Synthetic HTTP responses are clearly distinguished from genuine PostgreSQL checks.
- New receipts browser checks current versus prior-month advances, opening receipts, refunds, supplier opening and initial purchase payments; invoice delivery lines are checked in Thermal/A4/Premium previews.

Compact machine-readable evidence is in `docs/audit/evidence/2026-11-04-remediation/checks.json`; full local logs are under `/workspace/review/remediation`. Browser tests intercept all external app writes; no live bill/order/WhatsApp/refund was produced.

## Deployment and limits

Apply0035→0040 before publishing the matching frontend. For a200-line editor use the eight complete files linked in [SQL Editor instructions](sql/operations-update-parts/README.md); no Lovable chat prompt/credits are required to paste SQL into an accessible editor. A brief quiet counter window is necessary because old transaction RPC permissions are replaced. Do not replay0031–0034, infer live state from the journal, or create another marker migration.

Older records with lost opening receipts, missing costs or unknown refund methods cannot be reconstructed safely. Existing invoice prices, earned vouchers and history were not retrospectively changed. These cases remain explicitly unknown or require owner reconciliation. Payment received/refund sent are manual records; no gateway/bank integration is claimed. Optional idle expiry scheduling depends on provider pg_cron availability; active catalog/stock reads also expire holds. Public Lovable site access from this environment is blocked, so hosted behavior, real printer/scanner performance and actual WhatsApp delivery remain unverified.

The legacy importer supports the specified original offline schema in an empty store only. Unsupported payment/financial collections or inconsistent totals fail atomically; do not rename an unknown backup into a supported format. Hardware and provider quota assumptions remain labelled estimates. A passing finite test set is not a guarantee of zero bugs in every device/data combination.

Reproduce locally:

```sh
npx tsc --noEmit
npm run build
node --experimental-strip-types --test tests/*.test.mjs
python3 tests/operations-safety-db-audit.py
python3 tests/operations-safety-db-audit.py --split-sql
python3 tests/retail-integrity-db-audit.py --latest
python3 tests/owner-product-void-db-audit.py
```

For the17 browser suites, start Vite on127.0.0.1:3000, install Playwright/Chromium in the test environment, then run `python3 tests/run-remediation-browser-audits.py`. `PLAYWRIGHT_MODULE` may point to an existing Playwright ESM installation. These suites intercept backend responses and external writes; they do not perform real bank or WhatsApp operations. The checked source also passed semantic ESLint with the formatting rule disabled, with only the existing i18n Fast Refresh warning.
