# Optional product descriptions

Owner access: left sidebar → Catalog Studio → Products & visibility → select a
product → Edit product on mobile. The description editor supports up to 1,000
characters, live preview, save/discard feedback and saved-value verification.
Empty or whitespace-only content saves as null and hides both public description
areas. Descriptions are optional; product creation and checkout do not require them.

The public product card shows at most two lines below the article name. Opening
the product shows the full description below the photo/price, before sizes.
Owner-entered text is rendered as plain text, preserves line breaks and language,
and is excluded from automatic UI translation. Editor instructions support
English, Hindi and Hinglish. Existing photo, visibility, pricing and order flows
are kept intact.

## Setup: manually apply the approved migration

The user explicitly approved this limited SQL update. Apply the entire file
`drizzle/migrations/0030_catalog_product_description.sql` in Lovable Cloud SQL Editor.
Do not replay old migrations. The file runs in one transaction, is safe to repeat,
and finishes with three read-only checks that should all be true. It adds:

- Add nullable `products.catalog_description`, default null, with a 1,000-character
  database constraint. Existing owner-only product write policies remain in force.
- Add only the public-safe `description` property to each product emitted by
  `public_catalog()`. Preserve its existing visibility, availability, delivery,
  pricing and size logic. No billing, stock, GST, reset or checkout RPC changes.

Production application has not been performed or verified from this workspace.
After applying SQL, Publish → Update in Lovable. The frontend treats a missing column as
unavailable storage: only description editing/save is disabled, with a retry
message. Existing product photos/visibility and the public catalog continue to
work. It must not be described as a working live feature before that SQL is
applied and the frontend deployed.

## Validation

`npx tsc --noEmit` and `npm run build` pass. The browser audit uses real components
and synthetic HTTP data; it does not contact or write to the live database:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/catalog-description-audit.mjs
```

It checks owner edit/save/reload, failed-save draft retention, discard/switch
protection, blank removal, safe text rendering, mobile layout, size selection,
missing-column fallback and staff route protection. The separate `python tests/catalog-description-db-audit.py` runs actual migrations
and owner/staff/anon RLS checks on an offline disposable PostgreSQL 17 container.
It verifies optional null defaults, blank hiding, Unicode, limits, public output,
visibility, repeat application, unchanged business functions/data, and v2 backup
compatibility. Neither audit writes to the live database.
