# Lovable release handoff

The latest correction restores gallery and POS row entry animations and warms
the receipt animation during billing preparation. Saving feedback starts at
the first click; success still requires the real create_sale response. It does
not wait for decoration downloads. Owner catalog controls remain available.
Existing sales, stock, payments, GST, coupons, customers and RPCs are unchanged.
Earlier UI/PDF/performance fixes remain included.

## Required live step

The previously missing table is now available: an anonymous read on October26
returned all three appearance flags ON. The public hero also has motion ON.
The user reports that Lovable applied the migration and verified owner saving.
Upstream migrations 0021/0022 were preserved intact. This correction adds no SQL.

Wait for the connected GitHub main branch to sync, then use Publish → Update.
Refresh existing app/catalog tabs. No new secrets, images or storage buckets
are needed. Do not rerun migrations for this frontend correction.

To see the effects, use the gallery's next/previous controls or swipe, add a size
at POS, open the mobile Cart, or save a bill normally. Accounting tabs animate
on selection, and the coupon ticket appears only for a validated coupon. These
are interaction effects, not continuous page-wide animation. Device reduced
motion deliberately keeps these effects static.

## Verification

- TypeScript and production build.
- Six data/billing/default-normalization tests.
- Actual migration executed in isolated PostgreSQL 17 with owner, staff and
  anonymous roles. Anonymous/staff updates denied; owner updates succeed;
  explicit false is readable; null, ID changes and deletes are denied;
  reapplying the migration preserves choices and an unrelated dummy row.
- Mocked mobile browser tests: owner save/reload, gallery OFF, neutral colours,
  master motion overriding hero, staff editor denial, missing-storage error and
  public fallback. These exercise the actual CatalogView and owner components.
- Existing gallery, coupon, receipt and reduced-motion browser regression.
- Actual frame sampling verifies gallery/desktop/mobile cart movement. A mocked
  sale with the animation download held pending confirms that success appears
  without waiting for the decoration and repeated F8 submits only once. See
  docs/audit/2026-10-26-animation-playback.md for timings and limitations.

Evidence and reproducible commands are in
`docs/audit/evidence/catalog-presentation/README.md`. These tests do not verify
production permissions, real orders or native printer/scanner behaviour.

## Rollback

Use the new switches to turn presentation effects OFF. Hero OFF still restores
the original catalog intro and keeps the saved hero image. If reverting code,
create a new revert commit; never rewrite published git history. Keep the small
additive presentation table in place when reverting the UI.

Existing scanner gaps remain outside this change: focus the product search
before scanning; codes for products outside the loaded list may be missed.
