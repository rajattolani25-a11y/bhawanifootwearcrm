# Catalog offer compatibility

The inline offer presentation is now extended by the owner-approved compact promotions in [catalog-promotions.md](catalog-promotions.md). Placement remains Spotlight → promotions → collection controls/products, with no header strip, popup or floating card. The owner asked to reduce the initial poster size and visual noise; oversized graphics and neon actions were removed.

`CatalogOfferTicket` retains real coupon values, thresholds and fixed/percentage caps, clipboard-confirmed copying with manual fallback, customer-triggered details, three languages and motion controls. Blank offers remain blank and demo codes are never seeded. Checkout financial logic is unchanged.

On an older backend, missing optional promotion support falls back to the existing offer DTO and owner form. The new manual SQL adds only small presentation metadata and scoped APIs; it is not assumed installed. Built-in assets use website files, custom poster files require external hosting, and existing product covers are reused. See the main promotion document for precise setup, validation and storage limits.
