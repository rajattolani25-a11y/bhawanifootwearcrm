# SoleStack software audit — 24 October 2026

This audit covers frontend source, shared data reads, translation, document export,
image delivery, navigation/access guards, and a mobile-width smoke pass over all
18 authenticated modules. Fixes are local. Nothing was pushed or deployed.
No database migration, backend RPC implementation, GST/stock deduction formula,
production sale, order, payment, customer or outgoing message was changed.

## Fixed in this pass

| Area | Actual problem | Correction |
| --- | --- | --- |
| PDF sharing | PDF capture/import work occurred after tapping Share; transient browser activation could expire before `navigator.share` | Prepare/cache the PDF before enabling Share; call native share directly from the click |
| Share fallback | A supported file share could still reject without a useful fallback | Download fallback for rejection/unsupported sharing; cancellation remains cancellation |
| Long PDFs | One enormous raster canvas/custom PDF page risks mobile memory and document-size limits | Bounded raster tiles, A4 report pages, ordinary table rows kept together; last document line retained |
| Bills/labels | Generic viewport width can distort thermal paper/roll output | Actual thermal element width; one physical roll label per PDF page; keep in-page preview/Print |
| PDF loading | Actions could run before preview/fonts/images were ready | Wait for iframe load, fonts and image decode; disabled actions until ready, status, retry and Print fallback |
| English/Hinglish | Some hardcoded Hinglish phrases lacked English entries; translated English aliases were not recognized consistently | Add known missing phrases (ledger, coupons, stock entry, placeholders, PDF states); canonical English aliases; explicit dynamic POS error translation |
| Translation opt-out | Attribute translation ignored `data-no-translate` | Respect opt-out for placeholders, titles and ARIA labels too |
| Dashboard | Sales/variants/costs silently stopped at the DB row limit; unpaid zero could be replaced by total due to `||`; outstanding amounts ignored older bills/opening balances | Paginated reads with deterministic order, `??` for actual zero, separate all-age dues/opening-balance reads, visible load errors |
| POS/products | `.limit(2000)` does not bypass the database response cap; products outside the first returned page become unavailable to local search | Read products in pages, stable ID order |
| Supplier balances | Purchases/supplier payments/suppliers could truncate at the row cap and present incomplete dues/PDFs | Read all pages, surface load failures and disable export until data is ready |
| Return history | First response page alone used for returned quantities | Paginated return reads; do not open return UI when return history failed/is loading |
| Search | Slow old global-search request could overwrite a newer result | Ignore responses after that effect is superseded |
| Images/performance | One signing request per product photo, including duplicate paths | Unique paths in batches of100, map results to original row order |
| POS recovery/scanner | Malformed stored held-bill JSON could crash initial load; scan beeps left AudioContexts open | Safe initial JSON fallback and close each AudioContext on oscillator completion |
| Shared pagination | Safety cap returned partial totals without warning; invalid page size could loop | Fail explicitly at the cap; require a positive integer page size |
| Reports date range | Inclusive end at23:59:59 missed fractional seconds in the final second | Exclusive next-midnight end for sales/returns, with stable pagination ordering |

Existing sales pagination remains zero-indexed: initial page0, `.range(0,49)`
for the first50. The database returns fewer rows naturally when total count<50.
No search join/backend rewrite was made.

## Verification actually completed

- Production build and TypeScript checks pass (see local command records).
- Five data/billing regression tests pass:2501-row pagination, empty/partial/full
  pages, explicit errors, safety cap, inclusive/exclusive GST and discount cap.
  Billing arithmetic is tested, not modified.
- Chromium390×844:100-row ledger downloaded as a4-page PDF; actual last-page
  raster inspected, including `END OF LEDGER`. No giant custom report page.
- Thermal PDF download received; two-label roll export produced two pages,
  approximately50×38mm each. Final label/page images were inspected.
- Share test stub records `navigator.userActivation.isActive === true`, correct
  filename and non-empty file. Simulated `NotAllowedError` produces a download.
  This checks the browser invocation/fallback, not a real WhatsApp recipient.
- English→Hindi→Hinglish→English round-trip passes for formerly mixed ledger/
  coupon copy. No runtime page exceptions in this harness.
- All18 authenticated routes tested at390px with mocked empty-shop owner data:
  no uncaught page errors or document-width overflow detected. Staff navigation
  to `/reports` and `/accounting` redirects to `/pos` in the mock guard tests.
- Photo signing:201 rows with101 unique paths plus one missing photo use two
  requests of100 and1 paths; original mapping and null fallback pass.
- Targeted ESLint runs with the repository-wide Prettier rule disabled: no
  errors; existing React Fast Refresh export warning remains in i18n.tsx.
  This is not a claim that the entire repository passes full `npm run lint`.

Evidence: [browser results](evidence/browser-results.json),
[route results](evidence/routes-results.json), [photo batching](evidence/photo-batch.json),
[data tests](evidence/data-tests.txt), [mobile PDF preview](evidence/pdf-mobile.png),
[last ledger page](evidence/ledger-final.png), [second label](evidence/label-final.png).
All test customer/shop/product content is synthetic.

## Confirmed remaining issues / recommended next work

1. **CSV import parser (priority1 before complex imports).** `src/lib/stock.ts`
   removes escaped quotes and splits quoted multiline cells into extra records.
   A reproduced demo transforms `ACME "Pro"` into `ACME Pro`; a multiline brand
   becomes a second row. [Reproduction](evidence/csv-findings.json). Use a proper
   CSV parser and a validation/preview stage before importing inventory. Bulk
   stock-import behavior was deliberately not rewritten during the PDF fix.
2. **Old online-order visibility (priority2).** Bookings query limits to300,
   coupon list to500 and rewards to300. Some are intentional recent lists, but
   there is no historical pagination for finding older entries. Add server-side
   search/date/status filters and pagination; do not just remove the limits.
3. **Large-store speed (priority2).** Correct paginated reads avoid false totals
   but still load inventory/history into the browser. Next step: virtualized
   product lists and scoped queries; reviewed owner aggregate endpoints for
   dashboard totals. Any new DB/RPC work requires confirmation first.
4. **Image lifecycle (priority2).** Signed URLs expire after1 hour; long-running
   views that re-request an expired image need renewal. A photo upload whose DB
   save fails can leave an orphan file. Add measured renewal and a reviewed
   cleanup workflow; no storage objects were deleted in this audit.
5. **Financial labels/reconciliation (priority2).** Dashboard profit is an
   estimate from saved sale costs, while Accounting includes returns/expenses.
   They should state their distinct periods/meaning clearly and have fixture
   reconciliation for returns, credit collections, split payments and delivery.
   Accounting/stock/RPC financial logic was not changed.
6. **Translation architecture (priority2).** Exact-match DOM translation still
   misses arbitrary dynamic sentence combinations and risks matching user data
   that happens to equal a dictionary phrase. Gradually move to explicit `t()`
   keys with parameters; mark customer names, article names and codes as data.
   This pass fixes identified phrases, not every possible database message.
7. **Storage meter limits (priority2).**500MB/1GB are hardcoded assumed plan
   allowances; they are not live billing-plan discovery. Label them as assumed
   limits or configure them per actual plan before selling another installation.
8. **Export polish (priority3).** Current PDFs preserve Hindi via raster capture
   but text is not selectable/searchable, and large reports lack repeated table
   headings/page numbers. A proper text/table PDF renderer is the next upgrade.
   Spreadsheet exports also need formula escaping for untrusted string fields.

## Practical limits

The test shop/auth/data are mocked. Live DB RLS, deployed migration state,
concurrent stock operations, actual tax return eligibility, camera/barcode label
hardware, Android/iOS native share sheets and outgoing WhatsApp delivery have
not been verified. No claim of a bug-free application or live production fix is
made. Existing owner-only guards and server-side RPC boundaries remain in place;
frontend navigation tests do not prove database authorization.

## Re-run locally

```sh
npm run test:audit
npx tsc --noEmit
npm run build
npm run dev
```

Browser harnesses are in `tests/browser-audit.mjs` and
`tests/mock-route-audit.mjs`. They need Chromium and an optional separately
installed Playwright. Set `PLAYWRIGHT_MODULE` to its index.mjs path and
`CHROMIUM_PATH` if necessary. They expect the dev server at localhost:8080,
intercept the harness HTML, and write synthetic evidence under
`/tmp/solestack-audit`. Route tests intercept external browser requests; they
must not be repurposed into a live transaction test without an isolated test DB.
