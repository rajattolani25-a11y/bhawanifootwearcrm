# Bhawani Showcase

Owner: **Catalog Studio → Showcase** (owner sidebar/menu). Customer: select **Men** or **Women**, then the Poster Stack entry appears below Spotlight, before promotions/collection. All/Kids/Boys do not mount it. Existing hero placement, Spotlight animation, offers, product filters and checkout are unchanged.

The six requested initial artworks are included as compressed app assets: Lakhani FLYO Wood-1, TRV Yorker-1, Boldfit SG26, Tradition in Every Step, Desi Drip and HETRO Eden-1. Four known single-article campaigns link to their exact public product IDs; the two collection artworks open the same selected collection. Artwork never changes selling prices, coupon eligibility or discounts; check poster claims against current prices before enabling an offer. Included images are app assets, not private photo-bucket usage.

## Enable owner editing

1. Run the complete [Showcase SQL](sql/catalog-showcase.sql) in the existing project's SQL Editor. The final two values should be true. The file is also downloadable/copyable from the owner editor when setup is missing.
2. Publish the matching frontend in Lovable, then open Catalog Studio → Showcase → Reload saved settings.
3. The owner can switch the entire Showcase or each poster ON/OFF, edit titles, link an existing catalog product or collection, reorder, add, replace and remove posters. **Save Showcase** commits the draft. Up to 12 posters; removing all stays empty after reload. OFF preserves saved photos.

This is manual SQL, outside automatic migrations. Local audits do not install production SQL or publish Lovable. Missing Showcase RPCs use the six included assets for the public preview; owner changes remain disabled until SQL is installed. A transient API failure never masquerades as a missing installer or overwrites an owner draft.

## Files, storage and recovery

- Upload JPG/PNG/WebP under 10 MB. The browser preserves aspect ratio, compresses to WebP at at most 1600 pixels / 400 KiB, and creates a separate preview at at most 320 pixels / 40 KiB. Text is not cropped or overlaid. The preview compression does not replace the full artwork.
- Custom files use the existing private `catalog-hero-images` bucket under `showcase/<UUID>.webp` plus `-thumb.webp`. No new bucket, table, external account, base64 database field or binary localStorage value.
- Bounded design metadata lives in nullable `store_settings.offer_showcase`. The `offer_` prefix follows the existing verified reset's marketing-data convention; operational settings preservation must not retain removed poster references. The existing settings/bucket backup manifest already covers both metadata and files. No financial/maintenance function is patched.
- Owner saves take the existing maintenance lock, compare the prior config, validate actual uploaded object MIME/bytes, and return the same config on a retry after a lost successful response. New file names are unique, `upsert:false`, and immutable. Failed saves keep the draft and staged upload paths for safe retry. Reload saved settings is explicit.
- Saved full/preview images stay protected from deletion even while OFF. Public signing permits only catalog-enabled, Showcase-enabled, poster-enabled native images. Previously downloaded images/signed URLs are not remotely revoked by hiding a poster.
- Replaced/removed uploads are deleted through the Storage API only after confirmed config save. Failed cleanup has Retry unused-photo cleanup. A scoped storage scan rediscovers abandoned unreferenced files after one-hour recovery grace; it never scans/deletes other hero or promotion prefixes. No cleanup-reason/financial/reset schema is widened.
- The existing `catalog_hero_storage_usage` measures the entire shared private bucket. Storage Meter includes full files, previews, OFF files and pending cleanup exactly once, alongside product photos. Save/cleanup/partial-upload failures invalidate both `hero-storage-usage` and `store-usage`; uploaded bytes count even if settings were not committed. Included app assets are excluded. No provider-quota guarantees or fake zero-storage claim.

## Customer loading and scope

The entry module and optional public API load only after Men/Women selection. Only two small previews load on entry. Gallery code and full posters wait for the click; module failure has a cancellable in-place retry. Signed URLs may be reused only after a fresh allowed config read. No price/stock response cache or new startup read. Current department, search, size and cart stay intact. The same public function middleware exact-ID allowlist includes this anonymous read; owner APIs retain token and owner checks.

Gallery artwork is contained at its original ratio. Tapping the poster opens it full screen in the same dialog, with Back to Showcase/close/Escape and retained gallery scroll. There is no separate View poster link or external tab. The separate View pair action opens the linked product (from the current public product list); unlinked/unavailable targets fall back to the current collection without inventing stock or selecting a different item. Scoped cream/dark colours, visible close control, keyboard focus, reduced-motion/master-motion handling and 320/390/768/1440-pixel layouts are retained. No looping video, 3D runtime or new navigation tab.

## Verification

- `tests/catalog-showcase-db-audit.py`: offline PostgreSQL full schema; repeatable install, owner/staff/anon, public audience/OFF gates, object validation, immutable/saved-file policies, stale writes/lost responses, cleanup grace, meter bytes and existing backup/reset/restore. Existing financial/promotion/maintenance definitions hashed unchanged.
- `tests/catalog-showcase-browser-audit.mjs`: actual CatalogView with mocked reads; All has zero Showcase photo requests, Men/Women membership, two preview-only downloads, gallery on tap, exact product, OFF/empty persistence, layout sizes.
- `tests/catalog-showcase-owner-browser-audit.mjs`: actual compressor/editor/StorageMeter with mocked storage; six assets, installer fallback, switches, remove/reload, new Women poster, full/preview size limits, lost upload/save retry, cleanup after save/failure, actual meter updates, mobile layout.
- Existing auth boundary, startup-speed and StorageMeter browser audits; TypeScript, scoped ESLint, production build and diff check. No production database writes or customer messages.
