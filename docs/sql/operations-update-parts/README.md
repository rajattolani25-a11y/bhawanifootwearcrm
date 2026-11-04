# SQL Editor update: operations safety (0035–0040)

These eight files are an alternative packaging of the **new** repository migrations0035–0040. They do not reset the shop, receive stock, create a bill, import a backup, send a message or issue a refund. Existing invoices, stock quantities, owners, earned vouchers and printed scan codes are preserved. Coupon usage counters are reconciled from recorded redemptions and live reservations; historical payments are never invented.

The original0031–0034 updates must already be applied. Part01 checks their required functions and fixed reward amounts and stops on a mismatch. Do not replay old migrations or create duplicate marker/journal migrations. Repo journal presence alone does not prove a live update was applied.

Before starting, save and verify a fresh business/photo backup. Apply during a brief quiet counter window: the safe new transaction RPCs replace the old write paths, so old open cashier tabs must be closed/reloaded when the matching frontend is published. Finish the complete update before taking new sales/orders. No Lovable chat credits are needed if you have access to the Cloud SQL Editor itself.

Clear the SQL Editor and paste **one whole file at a time**, in this order:

1. [part01: stock, colour identity and label aliases](part-01-0035.sql) —117lines.
2. [part02: receipts and repayment safety](part-02-0036.sql) —159lines.
3. [part03: stock receiving and retry safety](part-03-0036.sql) —39lines.
4. [part04: catalog quotes, coupons and payment receipts](part-04-0037.sql) —177lines.
5. [part05: recorded refunds and order invoices](part-05-0037.sql) —58lines.
6. [part06: bill validation and cash movement](part-06-0038.sql) —95lines.
7. [part07: atomic legacy import](part-07-0039.sql) —121lines.
8. [part08: defaults, request recovery and write permissions](part-08-0040.sql) —32lines.

Every part has its own BEGIN/COMMIT and a `part_XX_applied=true` result. Never split a function or depend on one editor run keeping a transaction open for the next. If a part fails, stop and keep the exact error; do not bypass permissions, modify production data or improvise a marker migration. Successfully applied parts are repeat-safe.

Finally run [verify.sql](verify.sql). `ready_for_matching_frontend` must be true. The separate scheduler result indicates whether the provider has installed optional pg_cron; false does not block active-screen expiry but idle automatic expiry requires that provider capability. Do not enable paid services or pretend a scheduler exists from a local test.

Publish the matching frontend, reload cashier tabs, and check that Catalog, Products, POS, Khata and Orders load. Test with a deliberately identified test pair only when ready; UPI confirmation/refund recording remains manual and does not transfer money. Check a compact label on the real printer/scanner before mass printing.

Local verification: `python3 tests/operations-safety-db-audit.py --split-sql` uses a disposable PostgreSQL17 container, separate connections for every part, genuine owner/staff/anonymous roles, concurrent orders, receipt retries, and a verified backup/reset/restore roundtrip. It reapplies all eight over populated test data and checks the snapshot is unchanged. This is not evidence that production SQL has run.

The source and part hashes are in [manifest.json](manifest.json); regenerate with `python3 tests/generate-operations-sql.py`. Use either these parts or the repository migrations through your existing migration runner, not two independent journal histories. Do not publish an old frontend alone after installing this backend: rollback must keep the frontend/RPC permissions compatible. No production changes were made by preparing these files.
