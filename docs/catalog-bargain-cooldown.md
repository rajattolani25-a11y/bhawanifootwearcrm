# Price-side offer action and repeat bargaining

Current approved flow: the Make an offer pill is beside the selling price (Option1). The customer has four distinct valid bids in each negotiation. Responses1–3 are ordinary counters; response4 is final unless an acceptable bid closes the deal earlier. Repeated amounts do not consume a chance or refresh a price deadline. Unused bids remain available after an earlier quote expires. Size changes do not reset the product/colour budget.

Every issued price keeps its original three-minute server deadline. After the fourth/final or already-accepted price expires, there is a 30-minute cooldown before the customer may explicitly start a new negotiation with four fresh bids. Example: final price12:00 → expires12:03 → new negotiation available12:33. There is **no daily round cap**. Idle record cleanup remains the existing24-hour resource cleanup, not a24-hour bargaining lock.

The product view/catalog/cart show no30-minute countdown. The offer screen keeps the static explanatory note; when the same product is reopened during cooldown, show its actual remaining cooldown timer inside that sheet only. It replaces the expired price timer, rather than adding a second ticking timer. The original three-minute price timer stays while its price is valid. A different product can be bargained on immediately, even by the same device capability. Start a new bargain is disabled during cooldown and enables when the shared internal clock reaches the server deadline. Reopening, refresh or closing the browser cannot shorten cooldown. Every new negotiation resets its base to the current `products.selling_price` (listed price), clears the old bids/counter, and calculates a fresh first counter from the new customer bid. It never treats the previous discounted/coupon price as its base. A new counter is not guaranteed to beat an old expired counter and always respects the owner's current private limits. Existing agreed orders are never repriced; a quote already linked to an order cannot start another negotiation.

## Source and activation

The owner reported successful whole-cart coupon verification earlier; that is user-reported, not live tool verification. This cooldown/four-bid update is separate. **No live SQL has been run for this update.**

Apply the complete `docs/sql/catalog-bargaining/cooldown-update/support.sql` in SQL Editor once, then run `verify.sql` in that folder. All four columns should be true. Then publish the matching frontend through Lovable Publish → Update. No Lovable AI task, migration journal marker, old migration replay or store reset is needed.

The SQL checks the exact existing attempts constraint, accepting only the known0–2/0–3/0–4 range. It widens that one CHECK to0–4 and adds three scoped functions: private catalog_bargain_result_v2, public catalog_bargain_state_v2 and public catalog_bargain_bid_v2. Installation is atomic/repeatable, makes no business-data edits and does not call an order, payment or reset. There are no new tables, columns, uploads or maintenance/reset-manifest changes. **Billing, receipts, coupon and reset RPC definitions remain byte-identical.** The optional first-bid update below adds only a guarded minimum check to the two bid APIs.

Older clients retain their original2-bid RPC. The matching frontend reads new bid_limit metadata; when the new RPC is missing, it falls back only for a known missing-function error and follows the old2-bid response. Cooldown restart is never simulated locally on an older backend. Backend activation is required for four bids and repeat negotiations.

A restart is explicit and serialized on the existing device capability lock. It resets only the expired unplaced negotiation's attempts/bids/quote, invalidates old quote IDs and begins a new three-minute offer after a new valid bid. Concurrent retries of the same first bid return the committed quote. Existing order-request recovery still runs before current expiry checks and cannot reserve stock twice. Private owner limits remain private. Anonymous identity does not identify one human across cleared browser data/incognito/devices.

## Local verification

- `python3 tests/catalog-bargain-db-audit.py --cooldown --short-parts --cloud-reset-format`: disposable network-disabled PostgreSQL17, new SQL applied twice; all unrelated function definitions compared byte-for-byte, exact first-bid guard insertion checked, fourth bid final budget, unused bids after first-price expiry, expiry+30-minute restart, early restart blocked, size/GET/duplicate behavior, concurrent restart, repeated negotiations with no daily cap, obsolete quote rejection and committed-order retry, original backup/reset/restore flow.
- `python3 tests/catalog-cart-order-db-audit.py --whole-coupon --cooldown --short-parts --split-sql`: combined cart/coupon/payment/refund regression with new quote metadata.
- `tests/catalog-bargain-cooldown-browser-audit.mjs`: real components with synthetic blocked-network services; price-side action at320/390/768/1440, size prompt, fourth counter final, product-specific cooldown timer only inside the reopened offer sheet, expired quote/cooldown gating, reopen persistence and a new four-bid negotiation.
- Existing commerce browser regression, unit suite, TypeScript, scoped ESLint and production build accompany the change. Local tests do not establish live installation or real customer transactions.

## Revert

Revert the UI through a new Git commit if the placement is unsatisfactory; retain compatible recovery for unresolved orders. New SQL definitions can remain for existing deals. Do not shrink the CHECK back to2 while records may contain three/four attempts, drop session data or run reset to undo a visual change. Existing bookkeeping and paid orders are unchanged.

Product footer Add to cart is a proper outlined cart-icon button beside the price/size summary, above WhatsApp and Get this pair. It remains visible while product content scrolls, prompts for size before saving and preserves exact local cart identity. Existing checkout/stock logic is unchanged; the cart-button presentation needs no new SQL. Mobile checks include320×568 and320×640.

Expired three-minute DealTimer bars now disappear at zero in product/checkout/cart. The expiry callback still fires; accepted expired prices retain an explicit listed-price review action, so hiding the timer never silently reprices or makes an expired quote valid. Reopening Make an offer during cooldown cannot reintroduce the old00:00 bar on product details. Close/back buttons use catalog-scoped black/opaque light styling and light dark styling; owner/global dialog styles are untouched. No SQL is required for this display fix.

## First-offer minimum:75percent

The first distinct offer in every new/restarted negotiation must be at least75% of the current listed selling price, rounded up to the next whole rupee. Examples:2200→1650;1599→1200. This is a starting-offer threshold, not an automatic25% discount and not the owner's private floor. Existing owner discount limits still control every counter. Later bids retain the existing meaningful-increase/held-counter logic and consume the finite four-bid budget; a rupee increase below the configured rounding step does not automatically reduce the counter.

UI shows the public minimum only before the first bid, disables too-low submission and reapplies it after cooldown restart. Server validation covers both the legacy3-argument catalog_bargain_bid and current catalog_bargain_bid_v2, so the legacy API cannot bypass it. Invalid first offers roll back without consuming a bid, replacing the prior quote or moving the cooldown. Existing issued quotes/orders are not retroactively repriced.

If cooldown support is already installed, apply only `docs/sql/catalog-bargaining/cooldown-update/first-bid-minimum.sql`, then run `verify-first-bid.sql`: both columns must be true. The18-line script is a transactional, repeatable definition patch with a single guarded insertion in each bid function. It runs no business operation and changes no tables/migrations/payment functions. If this is a fresh setup, the full `support.sql` now includes the same patch. Do not rerun unrelated coupon/reset migrations. This update has not been applied to the live backend by Codex; publish the matching frontend after manual installation.

The disposable DB audit tests exact75% acceptance, below-minimum rejection through both APIs, no attempt on rejection, repeat first-minimum enforcement after cooldown, per-rupee held counters/four-bid cap, full-install/small-patch equivalence and unchanged unrelated RPC definitions. Browser checks cover the displayed minimum, disabled low offers and the new-round form. Pure tests cover whole-rupee rounding.
