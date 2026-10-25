# Frontend performance pass

Local changes only; no deployment, migrations, RPC implementation or financial
formula changes. Based on the available workspace, not a live-phone profile.

- POS and Products initially mount60 product cards and offer Show more in60-card
  increments. Search still covers the complete fetched inventory. Deferred search
  keeps input updates ahead of list work. Barcode resolution still uses all products.
- The dashboard clock's1-second state updates now belong to its own component,
  so clock ticks no longer trigger rendering the dashboard parent/charts.
- Dashboard/POS/product/stock queries have a15-second freshness window for quick
  navigation. Explicit invalidation and existing realtime subscriptions still
  trigger refresh; stock polling remains enabled. No offline billing added.
- Products thumbnails load lazily with async image decoding.

600-product, five-size fixture at390px in Chromium:

| Metric | Before | After |
| --- | ---: | ---: |
| POS size buttons initially mounted |3000|300|
| POS total DOM elements |21934|2495|
| Products total DOM elements |19397|2118|

Show more reached120 POS cards, search found Article0599 (outside the first60),
and clearing the search returned to60 cards. No uncaught browser page exceptions
were reported in those checks. See evidence/performance-before.json and
performance-after.json. These are mocked network/data tests, not proof of live
latency or a percentage speed increase. Elapsed navigation samples include fixed
waits and varying dev-server readiness; do not use them as speed benchmarks.

TypeScript, production build and the five existing audit regression tests pass.
The earlier PDF/language fixes remain in place. For substantially larger stores,
frontend pagination reduces DOM work but database reads still load full inventory
and financial history. Server-side inventory search/pagination and owner aggregate
queries are the next stage, subject to review/confirmation for backend changes.
