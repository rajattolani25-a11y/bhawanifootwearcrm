# Catalog and counter presentation release

## Implemented

- Category/type-driven muted colour accents, including Formal and Sports, on
  the existing catalog filters. No new category records, stock fields or prices.
- Spotlight gallery of actual filtered products. Previous/next, touch swipe,
  keyboard-accessible controls, real View pair action and at most3 photo nodes.
  Broken/missing images have a placeholder. No autoplay, 3D asset or external API.
- Coupon ticket in catalog checkout and POS only after server validation.
  Invalid coupons never show Applied; changed mobile/size/code invalidates a
  pending result; stale responses are ignored. Existing server coupon redemption
  and sale/order payloads remain authoritative.
- Sticky selected-label dock in Barcodes, with article/size/label counts, selected
  article checkboxes, Clear, and the existing real label print preview. Selection
  survives filtering; counts and actual print copies share the same0–500 clamp.
- Richer original Lottie receipt: outline, details, filled check and final hold.
  Mounted only for saved-bill confirmation; no transaction wait, external media,
  continuous loop or database storage. Static reduced-motion/loading fallback.
- Owner-only Settings catalog section grouped into orders/delivery, offers,
  hero/animation and product visibility links. Load failures cannot overwrite
  catalog defaults; saves are guarded; zero local-delivery charge is retained.
- Calmer scoped owner-workspace palette; public catalog and bill calculations
  keep their separate existing presentation/financial paths.

Earlier PDF, language, pagination, search, image signing and responsiveness fixes
are included in the same local release. See the dated audit documents for their
scope and known remaining issues. The latest upstream hero migrations/types were
fast-forwarded intact. The initial UI release did not author/apply SQL or RPC
changes. The separately approved settings follow-up below adds one table only.

## Checks

Production build, TypeScript and5 data/billing tests pass. The mocked390px route
smoke covers18 authenticated screens plus2 staff owner-route redirects. New
focused browser checks cover palette changes, gallery navigation, valid/invalid
coupon UI, checkout total729 for the synthetic799−100+30 case, mobile changes,
stale requests, completed receipt SVG, reduced-motion fallback and overflow.

Label/Settings tests cover selections across searches, a dock visible on a long
mobile list, clearing, count clamping, an actual two-label iframe preview, owner
save of a zero delivery charge, and staff denial of Settings. All writes are
intercepted test fixtures; no real sale, order, payment or message is created.
Evidence/screenshots: docs/audit/evidence/catalog-release/.

These tests do not verify production DB/RLS state, native phone share/printing,
real inventory hardware or live-device performance. Synthetic preview imagery
is used only by test fixtures; storefront code uses actual catalog product data.

## Approved persistent owner controls

After explicit user approval, migration 0021 and the owner editor now implement
three persistent switches: spotlight gallery, category colour accents and
catalog animations. All default to ON, preserving the prior release. Explicit
OFF values survive save/reload. Category accents OFF uses the neutral palette;
motion OFF disables the intro/gallery/hero/category transitions, including an
otherwise-enabled hero. Device reduced-motion preferences remain authoritative.

The singleton table contains only its fixed ID and those three booleans.
Anonymous visitors and staff can read these public-safe flags; only owners can
update them. Browser roles cannot insert/delete rows or change the ID. There is
no new RPC, image storage, stock, GST, billing, coupon or ledger change. The owner
editor has English, Hindi and Hinglish copy, error/retry handling and discard.
Missing storage uses existing public defaults and prevents a false successful
owner save.

Local PostgreSQL 17 tests execute the actual migration and exercise anonymous,
staff and owner permissions, explicit false, NOT NULL, fixed-ID protection and
idempotent reapplication without resetting saved choices. A dummy business row
is unchanged. Browser tests use intercepted responses and the actual public
CatalogView; they verify owner save/reload, public gallery/colour/motion OFF,
staff denial and missing-storage fallback. No production writes occur.
Evidence: docs/audit/evidence/catalog-presentation/.

Live anonymous read returned HTTP 404 / PGRST205: the table is not yet present
in the exposed production schema. No database migration URL or admin connection
is available in this workspace, so migration 0021 has NOT been applied live.
Local permission tests are not a production RLS verification.

## Lovable handoff

The repository is linked to Lovable on main. Source/lockfiles must reach main
before Publish can include them. Apply only the approved migration
`drizzle/migrations/0021_catalog_presentation_settings.sql` using Lovable's
migration workflow, verify the owner controls in preview, then Publish/Update.
No new environment variables or storage buckets are needed. Do not rewrite
existing tables or RPCs. The source is implemented; production activation is
pending that migration and publication. See docs/release-ready.md for the prompt.
