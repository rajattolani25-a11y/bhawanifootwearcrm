# Catalog sale promotions

The owner approved the bold streetwear direction, then asked for a smaller, less insistent presentation. The final built-in presets are compact inline cards: restrained angled headline labels, muted print texture, one/two product thumbnails at the side, and a clear action row. Oversized arrows, starbursts and neon buttons are removed. Spotlight remains first. No popup, page-opening intro, autoplay sound or floating promotion is added.

## Owner workflow

Left menu → Catalog Studio → Offers & coupons → Sale promotions. Everyone / Men / Women have independent enable state, title, message, existing coupon, selected existing products (0–2), advance/live artwork and schedule. Both phases offer Street Drop and Sticker Edit. Product selection order is preserved in preview and storefront. Customer Men/Women filters show the corresponding campaign; Everyone campaigns are shared. These are promotion audiences, not new server-side coupon department restrictions.

One product gets a larger thumbnail; two products form a compact pair of thumbnails. Covers are reused without uploading duplicates. The photos remain the actual selected products. Product clicks open the exact product. Custom owner posters replace the preset artwork and retain their full original aspect ratio; no overlay lettering/cropping is applied. The original title and full conditions remain available in user-opened offer details.

## Storage

The owner rejected Lovable file storage for promotion images. Custom files upload directly to Cloudinary after browser compression: JPG/PNG/WebP input up to10MiB, WebP output up to1600px and700KiB. A too-large/unreadable/unsupported image produces an explicit error. Existing small WebP files are retained when already within limits. No binary or base64 poster enters Supabase, localStorage or a new bucket. Only bounded public image links/IDs/dimensions and design/timing metadata live in a nullable `store_settings.offer_promotion` JSON column (maximum16KiB).

Built-in assets are website files. The original SVG print is24,272bytes (compressible text); the offline Remotion decoration is101,554bytes,4sec/60FPS/720×360,H.264/YUV420p, silent. No Remotion runtime/player is an application dependency. The clip loads only in view, plays once and pauses offscreen/hidden. Owner motion OFF, reduced-motion, Data Saver and slow2G retain static artwork without loading it. Only countdown digits rerender each second; the catalog grid/photos do not. Public configuration loads after initial paint and never blocks products. Missing-function installations stop optional RPC retries until reload; transient failures retain the last usable presentation.

## Required production setup

Nothing here has been applied to the live database. Run the complete `docs/sql/catalog-promotions/install.sql` once in SQL Editor, then `verify.sql` (four true values). The install is one transaction, under200lines. It adds one nullable column and three scoped functions, with owner checks/stale-write protection and public-safe reads. It does not execute a reset, sale, file upload or delete, or replace existing checkout/financial definitions. It notifies PostgREST to reload its schema. Older backends retain the previous owner offer controls and a working public offer fallback.

Built-in presets and existing product photos do not require Cloudinary. For custom uploads, create a Cloudinary account and add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` as **server secrets** in Lovable, then publish. Never commit secrets, use VITE-prefixed secrets, or paste them into chat. Account plan/storage/delivery allowances are separate from Lovable; no unlimited/free quota is promised. Official provider pages were blocked by the environment's HTTP proxy, so current signup/pricing was not verified.

No external account/credentials were supplied, and no real provider upload/delete was attempted. The actual browser compressor/upload UI is tested against intercepted provider responses. Live Cloudinary integration remains to be checked after setup.

## Safety and lifecycle

The signer verifies a fresh Supabase session and current owner role. Provider requests receive no shop login token. Uploads use a shop/audience/phase-specific promotion prefix. A replacement saves metadata before cleaning up the old external asset. Failed saves retain staged uploaded URLs for retry; uncertain saves request reload/review rather than deleting a potentially saved image. Cleanup refuses paths outside the shop's promotion folder and currently referenced assets. Cleanup errors leave saved artwork intact and request manual Cloudinary cleanup. There is no external cleanup queue.

Existing backups already include the store_settings row, so no manifest change is needed. Reset's existing dynamic default assignments clear the nullable column, and `offer_*` fields are excluded from preserved operational settings. Custom Cloudinary binaries are **not included** in the Supabase photo backup; retain originals separately. Reset does not automatically delete Cloudinary files. Product-photo backup behavior is unchanged.

Coupon value, threshold and cap come from the selected real public coupon; checkout remains authoritative. Display dates do not create discounts or modify coupon validity. Save requires scheduled live times to fit the coupon window. Inactive/private/expired/exhausted coupons are suppressed. Future coupons are previewed only in a scheduled advance phase; no Copy/redeem action is shown there. Each successful public response anchors its configuration and server time together, using monotonic elapsed time for phase/countdown updates. Calendar actions download an importable ICS file; they do not promise device notifications. Copy success requires clipboard confirmation, with the existing manual-copy fallback.

## Validation

Local checks use intercepted synthetic catalog/owner services or an offline PostgreSQL container; no live transaction, message or database write is used:

- Unit tests: exact phase boundaries, schema limits, external links, countdown and UTF-8/escaped calendar export.
- PostgreSQL: repeatable install, owner-only RPCs, stale saves, rollback, future/limited coupons, unchanged existing financial definition.
- Public browser: held optional read does not block the collection, separate audiences, 1/2-product layouts,320/390/768/1440 widths, calendar download, device clock skew, advance/live/expiry, full custom artwork and no reduced-motion video request.
- Owner browser: independent audiences, two presets/phase, product selection, save, unconfigured-upload state, and actual browser compression with mocked external upload. No login token goes to the image host.
- Legacy offer browser: inline placement, actual minimum/caps, copy/manual fallback, offer OFF, all three languages, dark mode, motion controls and no timed popup.
- TypeScript, scoped ESLint, production build and whitespace checks.

The checked screenshots use example offers and local test product photos; no demo campaign is seeded in production. Re-render instructions are in `tools/catalog-promotion-remotion/README.md`.
