# Lovable release handoff

This release adds owner-controlled catalog hero presentation, image compression/storage reporting and cleanup, softer POS/catalog colours, responsive workspace layouts, dashboard theme fixes and localized image guidance. No existing sale/stock/payment/coupon RPC was modified.

## In Lovable

1. Wait for the connected GitHub main branch to sync and check the preview.
2. Apply the existing `drizzle/migrations/0019_catalog_hero.sql` using the normal migration workflow. It is an additive migration; do not generate replacement migrations or rerun it as an ad-hoc SQL script after it is recorded as applied.
3. Confirm the owner can open Settings → Online catalog → Hero banner, see hero storage usage and save. The initial hero is OFF; enabling it requires a validated transparent image. Staff cannot edit it.
4. Publish → Update, then check the published app. Refresh old browser tabs after the release.

Suggested Lovable instruction:

> Sync the latest GitHub main. Apply and verify the pending existing migration 0019_catalog_hero.sql through the migration workflow, without changing sales, stock, payment or coupon functions. Verify owner-only hero settings and bucket policies, then check the preview build. Keep hero OFF until the owner selects a transparent image. Do not claim the migration is applied unless it actually succeeds.

## Verification performed before push

- TypeScript and production build pass.
- Migration executed in local PostgreSQL-compatible PGlite with owner/staff/anon role and storage-policy tests, including protection of the current saved image and stale-save rejection.
- Browser tests use mocked database/storage responses: hero upload alpha validation/compression, existing-photo reuse, save/reload/replace/OFF, multilingual guidance and public fallback/actions pass.
- Responsive review: 18 populated workspace screens at 320/390/768px; six mobile forms fit/scroll. Dashboard additionally checked in light/dark at 320/390/1440px. Premium hero font loading and layout checked at 320/390/768/1440px.
- POS regression tests preserve the original create_sale payload; barcode/label tests validate supported software paths without creating a live sale.
- Repo-wide lint has preexisting formatting failures; no mass formatting changes were made.

## Known limits, unchanged scanner behaviour

- This workspace did not apply the migration to the live database or publish the Lovable site. Local/mocked tests do not establish live deployment or hardware scan success rates.
- Before billing scans, press F2/focus the product search box. Scanning while the customer/payment field has focus can type there instead of adding a product; this is a confirmed existing gap.
- Scan lookup still uses loaded products; a valid code for an unloaded product may be missed. Direct database fallback and conflicting-code detection remain recommendations.
- Printed-label margins/density and camera behaviour need actual printer/scanner checks. Existing barcode values have not been regenerated.
- Hero text does not apply a checkout discount; prices/coupons must match advertised terms. Existing open catalog tabs need refreshing after changes.

## Rollback

Use Turn off public hero to restore the original catalog intro on new visits. The current hero image is retained for reuse. If an app rollback is required, use a new revert commit or Lovable history restoration; never force-push or rewrite published history. Keep the additive hero schema in place when reverting UI.
