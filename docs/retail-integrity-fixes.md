# Retail integrity fixes — 3 November 2026

## Deploy order

1. Confirm approved migration 0031 was applied (Regular ₹100 / Premium ₹200 every fifth eligible visit).
2. In the SQL Editor, run **only** `drizzle/migrations/0032_retail_integrity.sql` in full. Do not replay the old migration folder or add a journal-marker migration. Its transaction is repeat-safe and the final query should show four `true` values.
3. Publish the matching frontend through Lovable and reload open cashier tabs. Older clients cannot execute unlinked exchanges or refunds without a method after this update.

The SQL changes definitions, column privileges and adds nullable metadata fields/indexes. Applying it never executes reset, import, return, bill creation, stock conversion or reward cancellation. An unexpected billing definition fails atomically rather than overwriting a customized live implementation. It does not require Lovable AI credits when run directly in the SQL Editor. Production application and deployment are not performed by local tests.

## Changes

- **Staff privacy:** `sale_returns.cost_reversal` is no longer directly selectable by authenticated users. Operational columns stay readable. Owner financial screens retrieve costs through an explicitly owner-checked RPC. Missing support/read failure blocks financial exports instead of inventing profit.
- **Size exchange:** choose the actual replacement size inside Sales History. One transaction returns the old size, deducts the new size and records linked movements. No new sale, extra payment or replacement invoice is created. Original invoice amounts and line content stay intact; reprints show the size exchange separately. Returnable positions follow replacement sizes, including repeated/partial exchanges. A replacement can be returned only once.
- **Refunds:** operator selects Cash/UPI/Card/Bank and confirms the payout method. Outstanding due is adjusted first. Accounting subtracts only confirmed Cash refunds from cash closing; historical unknown methods remain labelled unknown. Separately returning multiple pairs uses cumulative rounding to avoid a one-paisa over-refund. Good and damaged returns remain distinct.
- **Loyalty:** when retained bill value falls below the original stamp card's threshold (Regular ₹299, Premium ₹999), its stamp is reversed once and the 20-stamp counter/lifetime visits are adjusted. This does not create a new stamp on a different card. Newly tracked unspent rewards above the remaining visit entitlement are cancelled without repricing them. Already-used rewards produce an owner-review event and no automatic charge. Historical vouchers without a purchase/visit link are flagged rather than guessed. Owner sees persistent exceptions in Rewards & Coupons, can open the customer profile to inspect/cancel eligible vouchers, and records a review note. Staff cannot acknowledge these owner exceptions.
- **POS customer errors:** a failed lookup/save or incomplete typed mobile blocks billing. Explicit Walk-in remains available. Customer history cannot silently detach after a persistence error.
- **Retry safety:** POS freezes the submitted payload and request UUID. Database serialization and a unique request key return the original result on concurrent/lost-response retries. A changed payload with the same key is rejected. A tab-local recovery record survives reload. Returns and CSV imports also carry operation identifiers; replays do not repeat stock effects. Recovery records clear after verified success or a definitive database failure, and the existing store-reset cleanup clears them.
- **CSV stock import:** choose Add or Replace, validate, inspect before/after quantities, then confirm. Omitted or blank barcode/SKU/rack preserve current values. New variants receive scan codes; damaged quantities are never imported implicitly. SKU is included in stock export. All rows are atomic and every quantity difference is ledgered. Execution rejects a stale preview if stock changed after validation. Existing product prices stay unchanged; an explicitly supplied cost changes the latest saved product cost. Importing stock does not create a supplier invoice/payable. Files are limited to 2 MB / 2,000 size rows and duplicate article-size rows, invalid/NaN numbers and ambiguous existing article keys are rejected. The CSV parser supports embedded newlines, escaped quotes, commas, CRLF and BOM, and rejects malformed rows before mutation.
- **Money/date displays:** UI retains paise, whole rupees remain uncluttered. Accounting collections compare timestamp instants with inclusive month start/exclusive month end.
- **History:** Orders query the selected status on the database before pagination; older pending orders remain reachable. Orders, coupons, loyalty rewards and Stock Ledger paginate with exact counts and deterministic ordering. Loading/errors are visible and are not labelled empty lists. Stock Ledger has product search.
- **Costing clarity:** dashboard identifies stock valuation as latest saved purchase cost. No historical accounting model or purchase-cost history is silently converted to weighted average/FIFO.

## Historical data and rollback

Existing unlinked exchanges cannot identify which replacement was given; this update does not fabricate that link or rewrite their invoices. Previously recorded refunds have no reliable payment method, and old rewards may lack provenance. They require owner review where relevant; new data is linked/typed from this update onward.

The existing v2 backup/reset/restore table manifest is unchanged: all new fields belong to already-backed-up tables, are nullable for older backups, and use existing table relationships. Reset still preserves the caller owner and follows the previously approved preservation options. A full fresh backup should be taken before an owner later chooses to reset; applying 0032 does not reset anything.

If a frontend rollback is needed, preserve the backend protections. Do not re-enable the old unlinked exchange RPC or staff cost access to make an old client work. Fix-forward or disable the affected action until matching code is restored. A full schema downgrade can discard new provenance and should not be performed casually.

## Verification

- `tests/retail-integrity-db-audit.py`: genuine offline PostgreSQL 17, all checked-in migrations and RLS; existing data preservation, serial/concurrent billing deduplication, payload mismatch, atomic exchange/replacement returns, staff cost denial and operational access, owner review acknowledgement guard, CSV preview/add/replace/atomic rollback/retry/stale preview, NaN rejection, loyalty full/partial/20-stamp/used/legacy cases, cumulative paise refunds, damaged stock and genuine backup/reset/restore of non-null new fields.
- `tests/retail-integrity-browser-audit.mjs`: real screens with synthetic API data; customer failure blocks sale, POS paise, lost-response/reload recovery, exchange and UPI return, CSV preview/confirmation, old pending order page 3, ledger/coupon pagination and explicit load errors.
- `tests/sales-financial-browser-audit.mjs`: existing financial regression updated for the linked return API and owner cost RPC; dashboard/report/accounting net totals, CSV, customer spend, missing costs, negative return-only periods, WhatsApp text, Thermal/A4/Premium reprint summaries, actual A4 PDF download and khata CSV/PDF.
- Existing maintenance database audit, targeted unit tests, TypeScript and production build are run separately. All test records are synthetic; no live business transaction or outgoing message is made.

Commands:

```sh
python tests/retail-integrity-db-audit.py
python tests/store-maintenance-db-audit.py
node --experimental-strip-types --test tests/data-audit.test.mjs tests/sales-returns.test.mjs tests/loyalty-schedule.test.mjs tests/retail-integrity.test.mjs
# Start npm run dev on port 3000 first; Playwright must be installed.
node tests/retail-integrity-browser-audit.mjs
node tests/sales-financial-browser-audit.mjs
npx tsc --noEmit
npm run build
```
