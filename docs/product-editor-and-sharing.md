# Owner product controls, categories and sharing

- Public Men/Women navigation; stored legacy Gents maps to Men and Ladies/Girls to Women, following the owner's adult Girls range. Kids/Boys remain separate. No automatic product data rewrite.
- Men: Sneakers & Streetwear, Sports & Active, Formals & Occasion, Sandals & Floaters, Slides & Slippers, Other.
- Women: Sneakers & Casuals, Sports & Active, Heels & Occasion, Sandals & Flats, Slides & Slippers, Other.
- Subcategories are a dropdown; adult new-product saves require a choice. Category must be chosen explicitly on the first new product. Other is the sixth option. Existing products with no subtype remain visible under All/the main department; no guessed assignment.
- Hierarchy uses the existing category text, e.g. `Women / Sandals & Flats`; readers normalize it consistently. Export retains the stored hierarchy, and importing it needs no new field. Hero storage retains its legacy allowlist while its controls and destination show Men/Women. Category edits use existing owner RLS.
- Owner: Products → article name or Photos → Product details / Category & subcategory / Product photos / Edit sizes & stock. Brand/name and optional description can be edited. Saved invoice line names stay historical snapshots. Description reuses approved migration 0030/editor, photo replacement/deletion reuses existing compressed private-bucket workflow.
- Safe size changes require 0033. Empty unused sizes may be renamed/removed. Any stock, damaged stock, bill, purchase, order, return or movement history prevents identity removal/rename. New sizes get scan codes; quantity changes need a reason and are ledgered atomically. Expected stock prevents concurrent edits from overwriting a checkout.
- Small Share icon in the public product header opens WhatsApp's contact chooser with shop, product, price, optional selected size and a clean direct link. No outgoing message is sent automatically. Link contains only public product ID and optional size. Recipient opens the actual current catalog item; unavailable items show a notice and the collection, not private or fabricated product data. Current language formats the short message.
- Approved English share copy: `Take a look at this pair from *[Shop]*.` followed by a blank line, `*[Brand] [Product Name]*`, separate `Price:` and optional `Size:` lines, a blank line, then `View photos, available sizes and product details:` and the direct URL on its own line. Omit an unselected/blank size completely; keep shop branding dynamic and localized versions equivalent.


## Incorrect bill cancellation

Owner-only Sales History → cancel icon → reason, exact bill number and payment-settlement confirmation. Backend 0034 reverses stock/due, eligible loyalty and coupon usage atomically, then retains the invoice as a void record. It never reuses the invoice number. Normal database reads hide the void bill, its line costs, item lines and reversal entries, so Dashboard, Reports, Accounting, customer totals, khata, search, PDF and CSV cannot keep counting it. Owner-only Cancelled bills shows the audit record. Stock ledger retains the original movement and explicit VOID-RESTORE; net stock effect is zero. Hard DELETE on sales is revoked from authenticated browser roles.

Use for incorrect/duplicate entries. Real returns keep the existing Return workflow. Bills with prior returns/exchanges, later credit collections, linked online orders or spent earned rewards are blocked. Unattributable legacy reward conflicts roll the whole cancellation back and need owner review. The action does not move actual money: owner must first settle any payment and record the reversal method. Gift expiry is not silently extended. Cancelled records still occupy storage; Storage's bill-record count and owner-only stored line count include them.

## Apply and publish

Categories, metadata, existing description/photo controls and sharing need no new schema migration. Size editing requires 0033; cancellation requires 0034, after the already-provided 0032 and approved 0031. The complete copy/paste bundle is `docs/sql/owner-updates-0032-0034.sql`. It contains the exact three migration files in order. Applying it changes definitions/metadata columns/privileges only: no reset, import, stock adjustment or bill cancellation is executed. Each migration is transactional and repeat-safe. Run through SQL Editor, check the true results, then publish the matching frontend and reload open tabs. Do not overwrite the live billing function with old migration files.

The existing v2 backup/reset/restore manifest is unchanged; nullable cancellation metadata stays on sales, all provenance remains backed up, and original owner/Auth protections remain.

## Evidence

`tests/product-categories.test.mjs`: legacy aliasing, six options per adult department, hierarchy round trip, hero compatibility, short/localized/private-data-free share links.

`tests/product-categories-browser-audit.mjs`: actual screens with synthetic HTTP data; required selections/Other, owner metadata and category save/reload, staff edit hiding, safe size control, cancellation confirmation/history, mobile fit, public category filtering and selected-size product deep link. No production writes/messages.

`tests/owner-product-void-db-audit.py`: genuine isolated PostgreSQL with all migrations, owner/staff permissions, atomic/ledgered size changes, stale edit rejection, historical name preservation, cancellation/retry, stock/due/loyalty/coupon reversal, RLS exclusion from all ordinary reads, owner audit history, complex-case guards, concurrent cancellation, rollback on legacy conflicts and full backup/reset/restore round trip.

Existing photo replacement, catalog modal/pinned actions, financial PDF/CSV, maintenance and storage UI regression suites are also run. Local tests are not proof that production migrations have been applied.
