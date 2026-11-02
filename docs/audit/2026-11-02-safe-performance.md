# Reversible frontend performance pass — 2 November 2026

Starting code: `ef85aa8`. No schema, migration, RPC implementation, sale/tax
arithmetic, production transaction, dependency or database storage change.
Earlier untracked November audit files were preserved and excluded from this pass.
This pass optimizes current features; it does not resolve the separate audit's
CSV/accounting defects or introduce GST Centre.

## Where behaviour changed

| Screen/path | Change | Preserved behaviour |
| --- | --- | --- |
| POS, Products, stock consumers (Purchase, Barcodes, Inventory Control, Posters) | One `stock-all` query reuses a common member-visible snapshot. Compatible consumers share reads and realtime subscription. | POS filters Active products; Products/POS keep ID ordering; other stock screens retain recent ordering. Costs stay in their separate owner-only queries. All pages remain available for search/totals. |
| Product photos / owner catalog product controls | Bounded memory cache for signed product URLs, concurrent request coalescing, 100-path batches, renewal at 55 minutes for one-hour URLs. | Original photos/files stay untouched. New upload paths get fresh URLs. Missing/failed signatures are not cached and can retry. No persistent URL/file storage. |
| Inventory realtime + Dashboard | Debounce event bursts by 100ms; defer hidden-tab events and refresh on resume/reconnect. Wait for an ongoing read before applying a subsequent event refresh. | Inventory retains 30-second foreground polling, 15-second staleness and focus refresh. Dashboard calculations/query scopes are unchanged. |
| Sale, return, receipt and CSV completion | Refresh operational queries without reloading seven unchanged configuration namespaces. | All financial, stock, customer, cost, report, coupon, ledger and even unknown future business query keys are invalidated. Settings edits keep their own existing invalidation path. This is intentionally conservative rather than risking under-refreshing finances. |
| Barcode label preview | Barcode/QR libraries import on Preview, not route entry. | Exact same label dimensions, code generation, QR settings and print/PDF path. First preview loads tools with Preparing status; subsequent uses reuse imported modules. Camera decoding and PDF capture were already lazy and remain so. |
| Posters | Recent and searchable lists render 30 initially, with Show more controls; search still considers the complete loaded inventory. | Presets, full-resolution PNGs, optional fields, mobile tabs and share/download remain. POS/Products already limit initial cards to 60; that behaviour remains. |
| Login/logout/user update | Clear image and query caches on sign-out, identity change or user update. Ignore results from old in-flight signing generations. | Same-user session refresh does not unnecessarily discard URLs. Server permissions and owner route guards remain authoritative. |

Code files: `src/lib/signed-image-cache.ts`, `product-images.ts`, `stock.ts`,
`inventory-live.ts`, `refresh-operational-data.ts`, `src/routes/__root.tsx`, and
authenticated `pos`, `products`, `dashboard`, `purchase`, `sales`, `barcodes`,
`community` routes. Only the new Show more arrivals text was added to translations.

## Controlled before/after evidence

120 synthetic products, 101 distinct photo paths; client navigation
POS → Products → Posters inside the existing 15-second cache freshness window.
All backend requests are intercepted; no real shop writes.

| Count | Before | Image cache only | Final |
| --- | ---: | ---: | ---: |
| Product reads | 3 | 3 | 1 |
| Image-signing requests | 6 | 2 | 2 |
| Photo paths signed | 303 | 101 | 101 |

These are request-count improvements, **not a claim of 3× real-world speed**.
The mock returns full fixture objects, so its byte counts do not establish
production bandwidth savings. Cold POS now reads the shared snapshot including
inactive products, then filters Active locally; archive-heavy shops may need
separate cold-load profiling. No real-phone latency, large-store memory or live
network benchmark was performed. Renewed/stale snapshots appropriately fetch again.

Evidence is under [performance-2026-11-02](evidence/performance-2026-11-02/).

## Verification

- TypeScript and production build pass; targeted ESLint with the repository's
  existing formatting rule excluded passes.
- Six existing billing/data tests plus four new cache/invalidation tests pass.
- Real-hook browser fixture: one shared read/channel for two consumers, Active
  filter preserved, stock and price refresh in both views, unchanged paths not
  re-signed, hidden event bursts deferred, one resume refresh, remaining consumer
  keeps its subscription, and a change arriving during a delayed read is retained.
- Navigation fixture: one product read/two signing batches across three screens,
  complete search with Show more, label libraries absent before Preview and loaded
  on click, real barcode SVG preview, logout→different-user login in the same
  browser JS context requires fresh signing. No uncaught errors.
- Posters, owner/staff guards, label selection/count/dock, eighteen mobile route
  smoke visits plus staff redirects, ledger/thermal PDF download, mocked native
  share gesture and rejection fallback pass. No real sales/messages were sent.
- Dev HMR produced a duplicate-root/subscription failure during iteration. Tests
  were corrected for idempotent fixture roots and rerun on a clean dev server.
  Channel lifecycles also use unique names and stop disposed callbacks, avoiding
  asynchronous-unsubscribe reuse. Final clean runs pass; no failing optimization
  is knowingly shipped. This does not establish native phone/camera/printer behaviour.

## What to check in Lovable preview

1. Open POS → Products → Posters: same items/prices, no blank panels.
2. After an intentional normal stock/price/photo update, revisit POS/Products/
   Posters and check the new value/photo. Product image replacement retains its
   existing shared-photo behaviour.
3. Put the tab in the background; return and confirm current stock appears.
4. In Posters, search an item beyond the first 30, use Show more, apply a preset,
   then download. In Barcodes, select a size and open the first label preview.
5. Check a normal bill/return/purchase and the relevant ledger/report using your
   usual shop validation procedure. This audit deliberately used no live transactions.
6. Sign out and sign in as staff: owner-only screens remain inaccessible.

Publish/Update remains the owner's Lovable step after checking the preview.

## Rollback without resetting history or touching shop data

The four runtime commits, newest first:

1. `809dea3` — disposed-listener guard and regression harness finalization.
2. `e33fc33` — on-demand label tools and bounded poster lists.
3. `572f64f` — shared inventory, visible refresh and operational invalidation.
4. `b9c96d6` — signed-photo cache and auth cache reset.

To restore the previous frontend while retaining all database records, make a
normal revert commit, then push and Publish/Update:

```sh
git revert --no-commit 809dea3 e33fc33 572f64f b9c96d6
git commit -m "Revert frontend performance pass"
git push origin HEAD:main
```

Do not force-push or reset published history. This handoff/evidence is a separate
documentation commit and can remain as the historical audit record. If later
changes overlap these files, review any revert conflicts before committing.

The exact four-commit revert was verified in detached worktree
`/tmp/solestack-perf-rollback-20261102`: `git diff --exit-code ef85aa8 -- src tests`
returned 0 after reverting. The main checkout was not reverted. This verifies
source restoration, not an actual Lovable deployment rollback.
