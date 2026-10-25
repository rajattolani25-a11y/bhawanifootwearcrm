# Lovable release handoff

The latest follow-up adds owner controls for the public catalog's spotlight
gallery, category colour accents and animations. It includes the explicitly
approved migration 0021, which creates one singleton table with three booleans.
Existing sales, stock, payments, GST, coupons, customers and RPCs are unchanged.
Earlier UI/PDF/performance fixes remain included.

## Required live step

The new table is not yet available in the live REST schema: an anonymous read
returned HTTP 404 / PGRST205. This workspace has only the publishable connection,
with no migration URL or database admin access, so it has not applied live DDL.
The catalog continues using its previous defaults; the owner editor explains
that storage is unavailable instead of reporting a false successful save.

After the connected GitHub main branch syncs, give Lovable this instruction:

> Apply only the existing approved migration
> `drizzle/migrations/0021_catalog_presentation_settings.sql` through the normal
> migration workflow. Do not modify existing business tables, functions or RPCs,
> and do not generate a replacement migration. Verify the singleton row, public
> read of the three appearance flags and owner-only updates. Confirm that an
> owner can save and reload all three switches in Settings → Online catalog →
> Catalog appearance, and that staff cannot edit them. Check the public catalog
> with the switches both ON and OFF. Report the actual migration result.

Then use Publish → Update. Existing open catalog tabs need refreshing to pick
up saved settings. No new secrets, image uploads or storage buckets are needed.
Do not replay older recorded migrations solely for this follow-up.

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
