# Catalog Studio: professional editor storage review

The direct /catalog-studio owner screen and all existing banner/theme/offer/
delivery controls are implemented. Its Products & visibility tab has searchable
products, a listing preview, current cover-photo replacement and immediate
visibility updates. Photos reuse the existing compressed upload flow and are
shared with Products/POS. Price, stock, sizes and GST are read-only here.

New title overrides, descriptions, galleries, badges, ordering, collections and
draft/publish are NOT persisted or published by this release. An interactive
design prototype is in previews/catalog-editor.html; it uses sample data only.
Its Save demo draft is browser-local. The actual app does not mount that demo.

## Proposed independent catalog backend — confirmation required

The user's instruction prohibits migrations/RPC edits without confirmation.
No migration or backend function for the full editor has been written/applied.
Request one approval for this complete scope before implementing it:

1. **catalog_editor_drafts:** owner-only rows for product/storefront documents,
   product identity, validated content JSON, revision and update timestamp.
2. **catalog_editor_published:** separate public-safe documents/revisions for
   published listings and storefront configuration. Drafts are never public.
   Only catalog-visible products may expose listing documents. Public fields
   contain no cost, stock count, customer info or private editor identity.
3. **catalog-gallery:** private bucket with owner upload, device compression,
   validated image types/sizes and per-product paths. Public signing/read only
   for photos referenced by an available published listing. Reuse existing
   cover photos, never remove original product images. Cleanup must refuse
   deletion of images still referenced by drafts/published content.
4. **New catalog_publish RPC:** owner-only atomic publishing of selected product
   documents/storefront revision, rejecting stale revisions and invalid fields.
   Keep existing sales, stock, pricing, GST, booking and coupon functions intact.
   Drafts cannot change financial/inventory records or checkout prices.

## Document fields to support

Product: catalog title, description, highlights, material, fit/care, image refs
and order, cover selection, crop/zoom/background, card style/details/button,
badges, featured/spotlight priority, collection IDs, display order, visibility
and sold-out presentation, tags/occasion/style, ordered detail sections,
owner-entered size guidance and matching product IDs. Validate product refs,
text limits, allowed tags/styles and allowed gallery paths. Existing live
availability/price is always sourced from product inventory/billing data.

Storefront: named collections (including price-filtered collections), ordered
sections/visibility, grid density, corners, font presets, palette/spacing and
search/filter visibility. Keep multilingual content explicit and preserve
reduced-motion/device performance controls.

## Publish/edit behaviour

Searchable product list → listing/card/detail preview → property panels.
Mobile uses Products/Preview/Edit tabs. Save draft and Publish are separate;
show dirty state and prevent loss during product/navigation changes. Bulk
visibility/tags/collections publish only the selected products. Undo/redo is
for unsaved draft changes. Apply all selected documents atomically. Failures
preserve the current live catalog; no false Published notification.

Next checks after approval: actual PostgreSQL RLS/validation/atomicity and stale
revision tests, upload/cleanup reference safety, mocked browser editing/reload,
public content after publish and unchanged checkout/sale payloads. Provide
migration files for Lovable to apply; production admin access is unavailable
in this workspace. Extra gallery images consume photo storage; no uploads are
introduced by merely opening the editor.
