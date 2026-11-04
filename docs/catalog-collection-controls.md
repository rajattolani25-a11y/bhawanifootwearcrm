# Catalog collection controls

The collection heading no longer displays its design count. `CatalogCollectionFilters` presents Style, Brand, Size and Sort by with specific default labels (All styles, All brands, Any size). The compact Filters & sort panel uses four equal desktop/tablet columns and two equal mobile columns. Floating field captions remove the separate label row, with 44px field height and reduced heading/padding so products appear sooner. Clear filters restores the secondary selections and default sorting; the department tabs and search remain available independently.

Sort options are Default order, Price: low to high, Price: high to low, Name: A–Z, and Discount: highest first. Name ordering uses article names with case-insensitive natural comparison. Discount ordering uses the actual percentage reduction from MRP, treating a missing/zero MRP or no reduction as zero. Ties retain the original order. Filtering and sorting use the latest public snapshot in a memoized local calculation, without new requests or changes to product prices, quantities, hero settings or checkout. Changing sort alone does not remount Spotlight. English/Hindi/Hinglish copy is explicit; owner brand names and sizes remain unchanged.

About uses a flex dialog with a separately scrolling body and a non-scrolling action footer. Directions, configured Call and WhatsApp links remain visible and clickable while the map/address scroll. The existing valid-phone gate, approved address/hours, customer dark mode, focus containment and lazy map load remain. No global dialog styles, backend RPCs, migrations, or live records were changed.

## Verification

- Collection browser audit: five sort modes; category/style/brand/available-size combinations; exact product opening; clear behavior; refreshed prices reorder an active sort; 320/390/768/1440 aligned layouts; three languages and customer dark mode; no writes.
- About browser audit: 320×568, 360×640, 390×844, 568×320, 768×1024 and 1440×1000. Each action is inside the dialog and hit-testable before scrolling, and stays fixed as the body scrolls. Existing pin, contact links, on-demand loading, gallery and language behavior remain.
- Adjacent public order-recovery and product-category browser regressions, TypeScript, scoped ESLint and production build.

These use intercepted synthetic services; they do not execute live payments, sales, messages or database writes. Evidence: `docs/audit/evidence/catalog-collection-2026-11-04/checks.json`.
