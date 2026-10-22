# Catalog hero rollout and rollback

Owner location: Settings → Online catalog → Hero banner. No public or staff editor.

1. Apply migration `0019_catalog_hero.sql` through the project's normal database migration workflow before enabling the hero. It creates an owner-only singleton settings table, private `catalog-hero-images` bucket, and two read-only public functions and an owner-only hero storage usage function. It changes no existing sales/stock/order/coupon RPC.
2. Deploy the application. Before migration, the existing public catalog remains available; the owner editor reports unavailable hero settings and disables saving.
3. Upload a real transparent PNG/WebP, or validate an existing product photo. Pick the offer, heading, conditions and button destination. Preview on both screen sizes, then enable and Save hero.
4. Verify the public catalog in a fresh visitor session. Refresh already-open catalog tabs after changes; the loader does not poll. Signed images last one hour; if they expire or fail, the original introduction is shown until refresh.
5. To roll back the appearance, use **Turn off public hero**. This persists only enabled=false, ignoring unsaved draft edits, and restores the original introduction on the next catalog load. No product, coupon or sale records are modified. No schema rollback or data deletion is needed.

## Images and motion

Use a clear side/three-quarter product photo. Remove the background in an editor, refine laces/sole edges, and export transparent PNG/WebP. Around 1200px, max 5 MB. PNG extensions/checkerboard-looking backgrounds do not prove transparency. The browser decodes the image, checks actual alpha, downsizes to 1200px and preserves alpha in WebP or PNG. This detects transparency, not whether the pictured product is accurate or the cutout is good.

There is no automatic background-removal service, new Python setup or AI image replacement. Existing product files are never changed. A validated existing photo is copied to the hero bucket on save, so changing the product photo later cannot silently replace the hero. Hero uploads consume Storage quota; only settings/references use database space. On replacement, the new file is uploaded and settings are saved before the previous hero copy is deleted. Original product photos are never deleted by hero replacement. Storage RLS blocks deletion of the currently saved hero, including while OFF, so an interrupted save response cannot cause cleanup to delete the active file. Failed cleanup offers Retry cleanup and may temporarily retain an old copy. Switching OFF keeps the current file for reuse. The hero editor shows saved-file bytes, total hero bucket bytes, compressed draft bytes and estimated post-replacement usage. The Settings photo meter adds hero bucket usage through an owner-only function. If that function is unavailable, it labels the result product-only; use the provider Storage dashboard for the full account total. Its 1 GiB photo allowance remains an estimate, not a live account-plan lookup.

Motion uses CSS text entry and image float, no video/WebGL or extra runtime dependency. It respects reduced-motion and pauses offscreen/background tabs. Hero text does not calculate or redeem any discount; use existing product prices/coupons for checkout. The button opens collection/category/product details or a WhatsApp draft; it never auto-sends a message.

## Access and concurrency

RLS denies staff/anon access to the settings table and write access to the bucket. Public reads expose only the enabled hero's safe display fields and selected file, and require catalog_enabled. No arbitrary URLs/HTML are accepted for the button. Owner saves compare updated_at to reject stale overwrites. A failed/lost save response must be followed by Reload saved settings; cleanup of a failed upload is subject to the storage policy that refuses deletion of the saved current image.

## Verification limits

Run the application build and TypeScript check. Local migration tests should cover owner/staff/anon RLS, public output, inactive-image restrictions and constraints. Browser tests use mocked database/storage responses and do not establish live project deployment. This workspace currently has no live database migration connection or Lovable Publish control. Do not label the feature live until the migration and app release have actually been applied and checked.
