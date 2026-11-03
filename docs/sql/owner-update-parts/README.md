# SQL Editor: five complete parts below 200 lines

These are an alternative way to apply the existing approved updates 0032–0034, not additional migrations. Prerequisite: approved loyalty update 0031.

1. `part-1-billing-and-access.sql` — 75 lines.
2. `part-2-returns-and-exchange.sql` — 113 lines.
3. `part-3-stock-import.sql` — 72 lines.
4. `part-4-sizes.sql` — 46 lines.
5. `part-5-cancel-bills.sql` — 104 lines.

Clear the SQL Editor between runs and paste one complete file at a time. Run in order. Each part has its own BEGIN/COMMIT; never depend on a transaction remaining open between editor runs, and never split a function or DO block. Check true/success results before continuing. If any part errors, stop and inspect that error. Publish the matching frontend only after all five complete, then reload cashier tabs.

The scripts are repeat-safe even when the original full updates were already applied. They do not reset the store, create a bill, execute an import or cancel any existing sale. Do not create duplicate journal markers to run them manually.

Verification: `python tests/owner-product-void-db-audit.py --split-sql` applies every part through a separate real PostgreSQL connection, exercises stock/loyalty/coupon/void/RLS guards and backup/reset/restore, reapplies all five over existing records and verifies the business snapshot is unchanged. All five passed in an isolated PostgreSQL17 database. No production connection was used.
