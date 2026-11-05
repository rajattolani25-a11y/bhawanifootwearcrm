# Combined catalog cart checkout

Status: source, disposable PostgreSQL verification and mocked-browser verification only. **The new cart SQL has not been applied to the live backend.** The owner’s reported six true values concerned the separate bargaining installation. The valid first-time ₹10–₹250 bargaining save was fixed in frontend commit71f53fd and needs only Publish → Update, not this SQL.

## Customer behavior

The cart is in bottom navigation immediately after Shop and Orders. It is also accessible on desktop. The count includes saved pairs, each identified by exact colour/product and size IDs. The same browser/device preserves the cart through closing and reopening. Clearing browser data or leaving incognito removes that guarantee. Storage failures are shown rather than reporting a false successful save.

Select the pairs you want, press **Order**, choose pickup/local/outside delivery, and enter contact details once. A single request validates every selected pair and commits all holds together. If any pair fails validation, none are reserved. Maximum30 distinct variant IDs, one pair of each size/colour per cart entry. Quantity editing and duplicate entries are not introduced.

The delivery charge and pickup advance use the combined net amount. A coupon may apply to **one selected normal-price pair**, explicitly chosen in checkout; its existing redemption/cancellation rules remain intact. Bargain pairs cannot also receive a coupon. A stale or expired bargain requires explicit listed-price acceptance or deselection. The original three-minute server deadline never extends when a cart is reopened.

On success, show the actual committed CT reference, pair list, aggregate money and PAYMENT PENDING, with one UPI payment and the WhatsApp screenshot action in the visible footer. Customer tracking supports the combined reference plus mobile number. Only successfully ordered IDs are removed from the cart; unselected pairs remain.

Cart creation does not verify a bank transfer. The customer still sends payment proof in WhatsApp and the store manually verifies it. No screenshot chooser/upload, automatic WhatsApp send, external payment gateway or startup intro was added.

## Atomic records and payment verification

Existing `catalog_bookings` has one variant per row. Keep that model: one CT reference groups up to30 existing booking rows, with deterministic request IDs, a shared unpaid reservation deadline and an exactly allocated portion of delivery/advance. The sum of the stored portions equals the combined amount. There is no new table, column, automatic migration or reset-manifest extension.

Online Orders shows a group payment summary fetched independently of the current list page/filter. The store explicitly confirms the full UPI amount once; the new group wrapper locks all relevant rows and calls the unchanged existing payment-confirmation function for each. Exact retries do not duplicate receipts. Closed/conflicting items reject the transaction. The existing per-pair completion, invoice, cancellation and refund flows remain. **This does not create one consolidated invoice.**

After cart support is installed, new single-product checkouts also use the new writer with one line, allowing the active-order limit to count cart groups consistently. Previously persisted single-product requests retain their saved original RPC route. Original create_sale/create_catalog_order/create_catalog_bargain_order/confirm_catalog_booking/complete_catalog_booking definitions are unchanged.

## Interrupted requests and local privacy

Before submitting, save the exact UUID/payload in `solestack-catalog-checkout-pending-v1`. This local record temporarily includes the entered name/mobile/address and public prices so an uncertain response can be recovered even after a full browser restart. It contains no photo binaries or owner limits. Pending requests block another new order. Retry the exact original request; server recovery precedes current stock, price and bargain-expiry validation.

Successful resolution clears the pending contact data. A proven SQL rejection permits correction; an uncertain transport error retains the payload. Never silently clear an uncertain request or generate a replacement UUID. Reset clears this key together with other business drafts. Cross-device cart sync and verified-human bargain identity are not implemented.

## SQL Editor activation

No Lovable AI task/credit is needed merely to paste SQL into its SQL Editor. The user previously required confirmation before live backend changes, so these are review files, not a live installation claim.

1. Confirm the existing operations update returns version40 and the bargaining installation is complete.
2. Clear the SQL Editor and run the complete `docs/sql/catalog-cart/short-parts/part-01.sql` (about11KB, under100lines). Wait for success.
3. Clear it and run complete `part-02.sql` (about4KB, under60lines). This installs tracking/group confirmation and publishes availability last.
4. Run `docs/sql/catalog-cart/verify.sql`; all six columns must be true.
5. Publish → Update in Lovable to serve the matching frontend. Reload the catalog.

Alternatively, `support.sql` is the same extension in one transaction. Choose the full file or both short parts, not unrelated older migrations. Scripts are repeatable definitions only: they execute no sample order, sale, receipt, deletion or reset. No journal/marker migration is needed. Part1 alone does not activate combined checkout. Before support is available, saved cart entries remain visible, checkout explains unavailable support, and ordinary product ordering remains available.

The six new functions are catalog_cart_result (private), create_catalog_cart_order, track_catalog_cart_order, catalog_cart_payment_summary (member-only), confirm_catalog_cart_payment (member-only), catalog_cart_version. No existing RPC function is replaced.

## Local checks

- `python3 tests/catalog-cart-order-db-audit.py --short-parts --split-sql`: disposable network-disabled PostgreSQL17; short SQL applied twice, original RPC definitions byte-identical, atomic failure/holds, concurrent deduplication, coupon rollback/no bargain stacking, exact combined charge, three active cart groups, mobile-scoped tracking, full payment verification/retry, existing invoice completion and tiny-money allocation.
- `PLAYWRIGHT_MODULE=/workspace/.cloud-tools/node_modules/playwright/index.mjs node tests/catalog-cart-batch-browser-audit.mjs`: synthetic products, external requests blocked; two selected/one unselected, one contact/payment flow, interrupted committed response, real browser-process restart, exact request recovery, expired-deal explicit fallback.
- `tests/catalog-commerce-browser-audit.mjs`:320/390/768/1440px navigation, bargain and checkout regression.
- `tests/catalog-cart-owner-browser-audit.mjs`: explicit group receipt confirmation, repeat disabled, failed confirmation does not open a success WhatsApp prompt.
- Unit tests, TypeScript, scoped ESLint and production build accompany the commit.

Local checks cannot establish live installation, real bank receipt status or real-customer network behavior. No live write/message was used for testing.

## Rollback

For an unsatisfactory layout, revert the frontend commit through a new Git commit; never rewrite pushed history. Preserve the pending-request recovery and CT tracking route if there are unresolved/new cart orders. Keep SQL definitions available for existing group tracking/payment/fulfilment; do not drop functions or cancel real reservations to undo a visual change. The original financial functions and data remain in place.
