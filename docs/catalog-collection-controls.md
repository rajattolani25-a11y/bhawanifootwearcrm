# Catalog collection controls

Spotlight appears first in the collection, before the collection heading and controls, whenever the existing owner gallery setting and multiple-product condition allow it. The public dropdowns are now **Size | Sort by | Style**, in one compact 44px row below Spotlight. Brand filtering and article-name type inference remain removed. Style was explicitly re-added on request with separate Men/Women groups from saved subcategories; values include both department and style so equal labels never mix them. Search still supports brand text; owner product/category editing is unchanged. Products without a brand remain visible without creating an empty brand-filter option.

Size choices use named optgroups from actual available variants: Men, Women, Kids, Girls and Boys (only groups present in the current category are shown). Each option carries both department and exact saved size, so Men 7 never selects Women 7, and Kids 2 never selects Boys 2 while browsing All. Blank and unavailable size options are excluded. Category changes reset the size selection. Legacy Girls products still belong to the existing Women category; only their size group is labelled Girls, without changing stored taxonomy, roles or owner add-product choices. A selected size that sells out keeps a labelled disabled option and empty matching results until cleared, avoiding a blank selector or silent switch to another size.

Sort options are Default order, Price: low to high, Price: high to low, Name: A–Z, and Discount: highest first. Name ordering uses article names with case-insensitive natural comparison. Discount ordering uses the actual percentage reduction from MRP, treating a missing/zero MRP or no reduction as zero. Ties retain the original order. Filtering and sorting use the latest public snapshot in a memoized local calculation, without new requests or changes to product prices, quantities, hero settings or checkout. Changing sort alone does not remount Spotlight. English/Hindi/Hinglish copy is explicit; owner brand names and sizes remain unchanged.

About uses a flex dialog with a separately scrolling body and a non-scrolling action footer. Directions, configured Call and WhatsApp links remain visible and clickable while the map/address scroll. The existing valid-phone gate, approved address/hours, customer dark mode, focus containment and lazy map load remain. No global dialog styles, backend RPCs, migrations, or live records were changed.

## Verification

- Collection browser audit: five sort modes; department-specific available sizes including overlapping numbers; no Brand control; separate Men/Women Style groups; Spotlight before controls; exact product opening; clear behavior; refreshed prices reorder an active sort; 320/390/768/1440 aligned single-row layouts; three languages and customer dark mode; no writes.
- About browser audit: 320×568, 360×640, 390×844, 568×320, 768×1024 and 1440×1000. Each action is inside the dialog and hit-testable before scrolling, and stays fixed as the body scrolls. Existing pin, contact links, on-demand loading, gallery and language behavior remain.
- Adjacent public order-recovery and product-category browser regressions, TypeScript, scoped ESLint and production build.

These use intercepted synthetic services; they do not execute live payments, sales, messages or database writes. Latest evidence: `docs/audit/evidence/product-colours-2026-11-04/checks.json`; earlier two/four-field evidence is historical.

## Ask by photo handoff

The catalog no longer offers a photo picker or preview. Customers optionally select a section and size, use **Continue on WhatsApp**, then attach/send their photo in WhatsApp. The dialog explicitly describes this step in English/Hindi/Hinglish. There is no file input, object URL or photo upload. The existing store-number link and prefilled message remain; no message is sent automatically. The collection browser audit verifies removal, selected category/size in the message, reset on close and all three languages without opening an external message.
