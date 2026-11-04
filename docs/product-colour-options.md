# Article colours, photos and stock

Owner flow: **Products → Edit product → Colours & photos → Add colour**. Brand, article, category, MRP, selling price and size identities are seeded from the selected article. Brand/article/category stay fixed during colour creation; the owner supplies a different colour, may review prices, selects that colour's sizes, and can upload up to eight photos through the existing compression/gallery pipeline. Parent photos, quantities, costs and past bills are never copied or rewritten.

New colours start with **zero stock**. Quantity inputs are intentionally absent from this mode. The existing `quick_add_product` call receives zero quantities and no purchase cost. An uncertain response/retry therefore cannot increment opening stock; an already saved colour is blocked by the preflight lookup and should be opened instead. Existing backend matching/locking remains authoritative for concurrent creation. After save the new colour profile opens: use the guarded **Sizes & stock** editor for opening quantities/corrections, or **Receive stock** for purchases so supplier dues and costs are recorded. The existing stock editor remounts between colour IDs so an old size selection cannot affect another colour.

The owner profile lists sibling colours with their own cover previews; selecting one opens its existing details, photos and size editor. **Show this colour in catalog** controls that colour's existing catalog visibility flag. New colours retain the existing unpublished default until explicitly enabled. Each uses its own private `product-images/<product-id>/` directory, replace/delete/cover behavior and gallery limit. No images or quantities are shared between colours.

This reuses the existing Brand × Article × Colour product records and size-variant UUIDs. Navigation families are inferred from normalized brand, article and canonical category; they are not a new shared product table. Editing one colour's price/name does not update the other records. Later changes to family identity can separate its navigation group. Existing ambiguous duplicate colour identities disable the public switcher rather than guessing a stock row.

Public product details offer colour thumbnails only from catalog-visible matching articles. Selecting a colour changes the actual product ID, gallery, price, available sizes and share link; it clears the previous URL size selection. Checkout reserves the selected colour's existing variant UUID through the unchanged backend. Inquiry/share/payment-proof messages include the chosen colour. POS cards/cart display colour and new invoice item-name snapshots include it. Old held bills remain compatible and saved invoices are untouched. Online Orders reads only the existing variant→product colour relation for fulfilment display, messages and future invoice labels; accounting amounts and payment/return logic are unchanged.

## Collection controls

As requested after the earlier simplification, **Size | Sort by | Style** are now three equal-width fields on one 44px row below Spotlight, including mobile. Brand filtering stays removed. Style optgroups separate Men and Women, use only subcategories actually saved for public products, and carry both department and style so Men's Sports never includes Women's Sports. Selecting a new style resets size; changing department resets both. There is no article-name guessing or database taxonomy change. A disappeared selection stays labelled until cleared, rather than displaying a blank option.

## Validation

- Owner colour browser audit: seeded/read-only identity and copied prices; zero quantity/no cost inheritance; separate compressed-photo folder and cover; guarded White stock setup; owner publication; Black stock unchanged; White-only POS deduction; duplicate prevention and staff Add colour hidden.
- Public colour audit: correct photo gallery, prices/sizes and variant UUID on order; old size reset; colour in inquiry/share; other brands/articles/departments excluded; ambiguous duplicates fail closed.
- Collection audit: three aligned controls at320/390/768/1440, separate Men/Women style values, category sizes, sorting/live price refresh, three languages and photo-inquiry handoff.
- Existing scanner, owner category/profile, retail integrity, order fulfilment and order-recovery browser audits;45 unit tests; TypeScript, scoped ESLint and production build.

All browser services are synthetic interceptions. No live sale, inventory write, payment or WhatsApp message was performed. No migration, backend function definition, bucket policy or dependency was changed. Current evidence: `docs/audit/evidence/product-colours-2026-11-04/checks.json`.
