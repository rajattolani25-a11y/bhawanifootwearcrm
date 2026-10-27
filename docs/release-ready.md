# Lovable release handoff

## Latest hero motion refinement

The compact hero adds a shoe entrance, staggered copy/CTA entry, breathing floor
shadow, drifting spotlight and a quiet light sweep. Loops use transform/opacity
on static gradients and the existing product image. Existing hero/master Motion
OFF, reduced-motion and offscreen/background pause behaviour remain effective.
No new library, upload, database field or RPC change is required. Publish the
synced frontend in Lovable. Preview: docs/previews/hero-motion.mp4 (sample shoe).

Actual browser checks cover moving photo/light, OFF/reduced motion, offscreen
pause, a simulated document-hidden handler, working CTA and four viewport
widths. Existing seven-palette layout checks pass. These tests do not establish
real-phone frame rate. Optional reproduction: tests/hero-motion-audit.mjs,
using Playwright/Chromium with its recording FFmpeg installed; PREVIEW_SHOE
can point to a local cutout, otherwise the fixture uses a synthetic shoe SVG.

## Latest: sidebar-only Studio and dedicated Appearance editing

The owner's latest preference supersedes the shortcut placement below: Catalog
Studio is now linked only from the left sidebar/mobile drawer, last below Stock
Ledger. Top-right/mobile-header and Settings Studio links have been removed.
Settings has five sections and defaults to Store.

Studio opens directly to Appearance. It groups seven theme presets with their
existing saved-theme action and the gallery/category-colour/motion switches.
Preview selected theme opens Design & hero with the same draft palette; saved
appearance values are applied on the next public catalog load. No schema or
RPC changes for this follow-up. Sync main and Publish → Update.

## October 27: direct owner Catalog Studio

New owner-only /catalog-studio route with a mobile top-bar shortcut, desktop/
menu entry last, after Stock Ledger, and a direct link from Settings. The page
reuses the existing banner/theme/offer/delivery controls; Settings now defaults
to Store and links to Studio instead of mounting duplicate catalog forms.
Products & visibility includes product search, listing preview, existing cover
photo upload and immediate visibility saves. Price, stock, sizes and GST are
read-only in this editor. Photos remain shared with Products/POS.

This UI patch has no new migration/RPC changes. Latest upstream migration 0024
was preserved. Sync GitHub main and Publish → Update. Do not replay migrations
that Lovable already recorded as applied; the older theme handoff below is
historical. Studio remains compatible with missing optional theme storage.

The requested full product-content/gallery/collections/draft-publish editor is
not yet implemented against live storage. Its interactive design preview and
the exact proposed catalog-only backend are in docs/catalog-studio-editor-storage.md.
That extra backend needs the user's migration/RPC confirmation before work.

## October 26 catalog and Settings follow-up

The catalog now has a compact studio banner, soft CSS backgrounds and seven
owner theme previews. Settings opens to Catalog and separates Store, Billing,
Appearance, Team and Data/backup. Catalog has Design, Orders, Offers and
Visibility sections; drafts survive section switches. Guide navigation, the
floating tour and the guide content have been removed. Old /guide links
redirect to Dashboard.

The user explicitly approved the shared-theme migration by requesting it.
`drizzle/migrations/0023_catalog_theme.sql` is now prepared and locally tested.
It adds only theme text to catalog_presentation_settings, defaults to studio,
limits values to the seven known palettes and grants public read/owner-policy
protected updates. Existing switches, RLS policies, business tables and RPCs
are untouched. Reapplying the migration preserves the saved theme.

The frontend keeps shared theme saving disabled until this field is available.
After migration 0023 is applied, the existing Save catalog theme action and
public loader use it without further code changes. Live application has not
been performed here: the workspace has no database migration/admin connection.

Details/previews: docs/audit/2026-10-26-catalog-settings.md.

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
Upstream migrations 0021/0022 were preserved intact. Theme saving additionally
needs the approved new migration 0023 before publishing.

Wait for GitHub main to sync, then give Lovable this instruction:

> Apply only the pending existing migration
> `drizzle/migrations/0023_catalog_theme.sql` through the normal migration
> workflow. Do not create a replacement migration, replay earlier migrations,
> or modify business tables/RPCs. Verify the default studio value, all seven
> allowed theme IDs, public theme read and owner-only save. In the owner
> preview, save a different theme and verify it survives reload and appears
> on the public catalog. Report the actual migration result.

Then Publish → Update and refresh existing tabs. Owner control:
Settings → Catalog → Design & hero → Save catalog theme. No new environment
variables, images or storage buckets are required.

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
- Migration 0023 additionally tests all seven frontend palette IDs, rejected
  unknown/null values, anonymous/staff theme write denial, public saved-theme
  read, unchanged existing switches/RLS and saved theme preservation on rerun.
  Results: docs/audit/evidence/catalog-settings/theme-migration-checks.json.
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
