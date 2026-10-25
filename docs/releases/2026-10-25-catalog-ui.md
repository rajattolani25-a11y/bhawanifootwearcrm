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
fast-forwarded intact; this release does not author/apply any SQL or RPC changes.

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

## One requested settings extension still needs permission

Persistent owner On/Off controls for spotlight gallery, category accents and
catalog-wide motion need shared storage. Existing hero.motion controls the hero
only and is not silently reused for unrelated global flags. Proposed scope:
one singleton presentation-settings table with3 boolean flags, owner-only writes
and public reads of those non-sensitive flags. No stock, billing, GST or existing
RPC modification. The user's instruction requires confirmation before migrations.
No migration or dummy Save control has been added while that permission is pending.

## Lovable handoff

The repository is linked to Lovable on main. Source/lockfiles must reach main
before Publish can include them. Do not deploy .output separately or apply SQL
from this UI release. No new environment variables or storage buckets are needed
for the implemented presentation features. New global owner toggles are a
separate pending database permission, not a completed feature.
