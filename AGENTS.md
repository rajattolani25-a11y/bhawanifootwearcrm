<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS

- Stock lives in `product_variants` (article × size); sales go only through the `create_sale` DB function so stock decrement is atomic and race-safe.
- Cost/profit are in separate owner-only tables (`product_costs`, `sale_costs`, `sale_item_costs`) because RLS can't hide columns from staff; `sale_items` SELECT is column-restricted.
- Roles stay in `user_roles`: first signup owner, later signups get no role (pending, no data access) until an owner approves via `set_team_role`; `remove_team_access` revokes. Both keep a last owner, so browser writes stay denied.
- Old JSON data imports via `legacy_id` upserts so re-imports never duplicate.
- Signed-in screens use `_authenticated`; `modules.ts` defines navigation. Inventory groups article sizes; the optional three-language tour lives in the shared shell and changes no shop data.
- Stock-in and returns go only through `receive_stock` / `process_return` DB functions so stock + ledger stay in sync; bills and labels use the in-page print preview in `src/lib/print.ts` (Thermal/A4/Premium), avoiding mobile popup blocking.
- Supplier repayments go through `record_supplier_payment` to allocate against open purchases; QR and Code 128 encode the same variant scan code so both resolve to one size at checkout.
- Credit repayments go only through `collect_credit_payment`; product photos stay in the private `product-images` bucket and are rendered with short-lived signed URLs.
- Destructive store reset stays owner-only through `reset_store_data`; UI requires a complete error-checked backup and typing RESET.
- Coupons require a customer, validate in `coupon_discount` and redeem once per customer inside `create_sale` (row lock + redemption trigger), preventing repeated discounts.
- New articles from POS/Purchase/Products go through `quick_add_product` so variants get a scan code and opening stock is ledgered; cost is saved only for owners.
- Default bill size and thermal width live in `store_settings` (bill_design, thermal_width); POS uses them instead of device storage.
- Password recovery goes through the public `/reset-password` route: the sign-in page calls `resetPasswordForEmail` with `redirectTo` origin + `/reset-password`, and the page saves via `updateUser({ password })` without `current_password` (recovery sessions are exempt).
- Customer/supplier opening balances live in an `opening_balance` column added to dues (owner-only edits for customers); all outgoing messages read the shop name from `store_settings` via `useShop`.
- App language is per-device in `src/lib/i18n.tsx`: a DOM translator swaps exact English phrases from the dictionary (`i18n-dict.ts`) on every screen, so pages need no per-string wiring and unknown text stays English. Outgoing WhatsApp/SMS/share sends are intercepted by `MessageLanguage`, which rebuilds known message lines from free offline templates in `message-templates.ts` (no AI cost).
- Khata builds running-balance statements from existing sales, credit payments, purchases and supplier payments; it never stores a separate ledger, so balances can't drift.
- Any list used for totals reads every row through `fetchAll` (`src/lib/fetch-all.ts`), because the database returns max 1000 rows per request and totals would silently go wrong.
- Public `/catalog` reads only through the `public_catalog` DB function via a publishable-key server fn (no cost/stock counts); anon may read only catalog-visible photos.
- Catalog bookings take stock out immediately (`create_catalog_booking`, BOOKING_HOLD) and return it on cancel/expiry; pickup bills go through `complete_catalog_booking`, which releases the hold and calls `create_sale` in one transaction, so stock never double-counts.
- Product photos are compressed on the device (max 1080px WebP) before upload, and the old file is deleted on replace.
- Catalog orders: pickup = advance, local/outside delivery = full payment + server-computed charge via `create_catalog_order`; public tracking only through `track_catalog_order` (order no. + mobile); status history is logged by trigger.
- Catalog festival offer settings live in `store_settings` (offer_*) and are read via `public_catalog_offer`; online-order coupons are checked/redeemed inside `create_catalog_order` (`catalog_coupon_amount`, once per mobile) so the same Rewards coupons work at POS and online.
- Catalog photo inquiry (`PhotoSearch.tsx`) does no automatic matching: it only opens WhatsApp to the store with a prefilled message, because browser-side matching was unreliable. The photo never leaves the device.
- Catalog hero controls live only in owner Settings. `catalog_hero_settings` is owner-only under RLS; public display reads `public_catalog_hero` and only the saved enabled hero image in private `catalog-hero-images`. Missing hero support/image errors fall back to the existing catalog intro. Offer text never changes checkout discounts. Validate actual image alpha, preserve transparency when compressing, and replace the hero copy only after saving; never delete original product photos or the currently saved hero (including while OFF).
- Catalog-wide gallery, category accents and motion flags live in singleton `catalog_presentation_settings` (migration 0021, explicitly approved). Only these public-safe flags are publicly readable; only owners may update them. Missing storage preserves the working catalog and blocks the owner save with a retry message. Global motion OFF also overrides hero motion; device reduced-motion preferences still apply.
