# Product profile and shop sales

Every Products card has **Edit product** for an owner (staff sees **View product**). Open it to change article name, brand, colour, MRP and selling price. Existing category, description, photos and size tools remain in the same profile.

Prices use the existing `products` columns and owner RLS. Save rejects empty/nonfinite/nonpositive selling prices, more than two decimal places, or an MRP below the selling price. A single guarded PATCH matches the original ID, article, brand, NULL-aware colour, MRP and selling price; a stale edit fails rather than replacing another owner's changes. Successful saves refresh business queries. No migration or RPC definition change is required.

Master edits apply to subsequent bills and public catalog refreshes. Past `sale_items` names/prices, costs, quantities and scan identities are unchanged. An existing POS cart keeps the existing price-change check; its operator must review changed prices before billing. Public prices/availability continue to refresh on the existing catalog schedule, with server checkout validation.

An active article with available stock also has **Record shop sale**. This opens `/pos?product=<id>` filtered to that exact article, with instructions to select sold size/quantity, select the actual payment method/amount, and explicitly complete the bill. This means a physical shop sale that has not yet been billed, not disconnected/offline operation. Opening the link, selecting a size, or choosing payment never commits a sale. **Show all products** clears the filter while preserving the POS cart. An invalid/archived ID cannot silently select another product.

Completion uses the existing `create_sale` transaction, request-ID recovery, stock/price checks and business-cache refresh. No direct stock decrement or second accounting path was added. Sales already billed at POS must not be entered again; a visible reminder says so. Existing backend behavior updates stock, financial reports and ledger together. This change does not run any sale against production.

## Verification

- `tests/product-categories-browser-audit.mjs`: article/colour/prices save and reload, invalid-price rejection before PATCH, stale-colour and stale-price conflicts, old invoice and stock unchanged by profile edits, staff cannot access owner fields, mobile layout and existing category/description/size/void flows.
- `tests/product-shop-sale-browser-audit.mjs`: exact-product shortcut, active/in-stock availability, no automatic write, size and quantity selection, explicit UPI completion through `create_sale`, refreshed mock stock, cart preservation when clearing the filter, missing-product safety, stale cart price blocking and explicit refresh, desktop/mobile screenshots and no horizontal overflow.
- Existing retail integrity and scanner audits exercise the shared POS path independently. These browser checks use intercepted synthetic services and do not prove live database deployment.

Validated: 45 unit tests, all four browser suites above, TypeScript, scoped ESLint, production build and `git diff --check` passed. Mobile screenshots were visually inspected. See `docs/audit/evidence/product-editing-2026-11-04/checks.json`.
