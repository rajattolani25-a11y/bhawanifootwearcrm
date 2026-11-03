# Product photos and safe removal

## Owner access

- **Products → Quick add:** select up to eight JPG, PNG or WebP files, up to 5 MB each. The first file becomes the cover. Remove selected files before saving if needed.
- **Products → Photos** (or click the article name): add more angles, select a cover, replace an individual file, or delete it. Deleting the cover selects another available photo; deleting the last photo clears the cover.
- **Catalog Studio → Products → Edit product:** the same photo manager. No new Settings section.
- **Product profile → Archive / Delete:** archive keeps stock and history, hiding the product from POS and catalog. Restore makes it available in POS again; catalog visibility stays off until explicitly enabled. Permanent deletion requires confirmation and existing foreign keys block products linked to transactions. Photo files are removed only after the row deletion succeeds. Failed file cleanup produces a warning; it does not falsely report that storage was freed.

Photos use the existing private `product-images` bucket and existing on-device compression. Extra angles consume file storage, not a new application table. The existing usage meter, v2 backup asset manifest, reset cleanup and restore include the whole bucket already. Legacy cover paths remain supported. Reusing the same photo as cover creates no duplicate upload.

Extra angles load only when a product is opened. Product grids and POS still load a single cover per product.

## Public catalog activation

Migration 0026 is the already applied safe-reset marker. Preserve its file, journal entry and snapshot; the gallery now uses 0027 to avoid reusing an applied migration number.

Customer view: open a product, select its thumbnails, then choose a size and continue through the existing order flow.

**Live SQL has not been applied by Codex.** Public gallery reads need [`0027_catalog_product_photos.sql`](../drizzle/migrations/0027_catalog_product_photos.sql). It is a short, standalone SQL update; it can be applied without migration 0025. Do not re-run earlier migrations or ask Lovable to reconstruct the SQL.

The update adds the read-only `public_catalog_photos(uuid)` function and extends the existing catalog image visibility predicate. It returns at most eight file paths, cover first, only for an enabled catalog, a visible Active product, and available stock. Image signing allows only visible Active products' cover/direct gallery files. The bucket remains private; customer, cost, stock quantities and billing RPCs are unchanged. No records or files are deleted by the migration.

Apply only after the owner's confirmation using authorized SQL access, then publish the frontend through Lovable. Without the update, owner photo management works and public products retain their cover with a retryable gallery fallback.

Gallery membership uses the existing product-id storage folder. It is intentionally shared between Products and Studio; there is no separate draft/publish layer or independent photo ordering. Cover selection controls the first image. Owner dialogs serialize uploads; the eight-photo client limit is not a cross-device storage quota.

## Validation

- `tests/product-photos-browser-audit.mjs`: real UI/compression with mocked HTTP and Storage; multi-upload, cover changes, successful/failed replacement, cover deletion, blocked product deletion retaining files, archive/restore, mobile overflow, Quick add with two photos, unused product deletion followed by file cleanup.
- `tests/catalog-product-gallery-audit.mjs`: three selectable views, 320/390/768/1440 px layouts, missing support retains cover; mocked public reads, zero live writes.
- `tests/store-maintenance-db-audit.py`: disposable network-isolated PostgreSQL with every checked-in migration. Includes gallery ordering/limit, anonymous function access, hidden/archived denial, staff deletion denial and atomic foreign-key protection, plus existing reset/restore/ownership checks.
- TypeScript, targeted ESLint (pre-existing route formatting excluded), 14 data/cache/backup tests, navigation performance regression and production build.

These checks do not claim a live Supabase end-to-end gallery test. No production product, stock or photo was created/deleted during testing.
