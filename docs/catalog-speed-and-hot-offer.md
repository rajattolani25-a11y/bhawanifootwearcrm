# Catalog startup speed and HOT highlight

This update preserves catalog styling, category palettes, exact product opening, photos and fresh pricing/availability. It adds the owner's requested HOT highlight only inside the existing eligible Make an offer button. It does not enable bargaining on any product or change bids, coupons, cart persistence, order recovery, receipts or financial RPCs.

## Frontend

- Cart and bargaining UI modules are loaded on interaction, rather than imported on entry. Pointer/focus/touch intent warms the matching module. A cancellable dialog keeps immediate feedback while a cold chunk loads; closing it does not reopen after the import resolves. Product details/gallery stay eager, so opening a pair never waits for these commerce modules. Reservation/payment actions stay immediately available through the existing implementation.
- The centered Spotlight photograph has high fetch priority; its adjacent previews are low priority. Initial unshuffled hidden frames no longer request images before the visit order is initialized. The bounded retained three-photo pool and decode-before-switch behavior remain.
- Below-the-fold grid photos are native lazy/low-priority. The relocated hero is lazy/low-priority when Spotlight is first; an actual first-position hero keeps eager/high priority. No photos or existing detail are discarded or recompressed.
- Existing IBM Plex Sans/Libre Baskerville families are self-hosted WOFF2 with included OFL licenses, normal width and400–700 weights. Latin/extended coverage is split by disjoint Unicode ranges; font-display stays swap. Root preloads local Latin faces and removes the render-blocking external Google stylesheet/connection chain. Separate hero/offer artwork fonts remain intact.

## Fresh bundled read: manual0042

Run `drizzle/migrations/0042_public_catalog_bootstrap.sql` in SQL Editor and verify `catalog_fast_read_ready=true`, then publish matching code. The new public-only function first calls the existing public_catalog gate. OFF returns immediately with no optional metadata. Otherwise it returns the same public product/shop payload plus only the four existing safe presentation flags, existing offer/hero results, eligible bargain IDs and cart version. It changes no existing function definitions/ACLs or financial rules and creates no table/column. Optional absent/failing APIs retain existing defaults; primary errors propagate.

Supported initial loading replaces six metadata round trips with one; cold photo signing still occurs as necessary, and only current authorized URL strings are cached. Snapshot refresh also uses one fresh read with no signing. No product/price/stock/catalog-enabled response cache is added. Older backends retain the original path: only PGRST202/42883 records a missing endpoint for60seconds, isolated by backend+public key in a bounded two-entry map. Transport/malformed/primary errors fail closed; they do not return stale data. Live SQL application and public deployment are pending until the owner applies/publishes.

## HOT

Original transparent SVG/CSS artwork uses yellow/orange flame, orange/pink pill and white outline/text. Only the artwork says HOT; the existing Make an offer action label stays visible. The badge is a child of the original eligibility condition (bargain_enabled AND ordering available AND in-stock sizes). No label appears on disabled or sold-out products. No licensed/watermarked reference asset, video, canvas, Lottie, new hosting account or uploaded binary is required. Four small transform/opacity animations produce flame movement and a periodic shine sweep; hidden/offscreen, owner motion OFF and reduced-motion stop playback. Accessible action name, size requirement, hit target and existing negotiation remain unchanged.

## Evidence and limits

Twenty unit checks cover the fresh gate, price/size changes, cached URL restrictions, known-missing capability fallback, invalid/transport failures and supported bundle. Offline PostgreSQL through0042 verifies repeat installation, unchanged existing function definitions, anon visibility, updated price/stock/heading, four-field presentation whitelist, optional defaults and primary failure. Browser checks cover absent entry commerce chunks, lazy hero/no entry request, high/low photo priority, actual local fonts, cancelled lazy dialog, HOT-only artwork/transparency/eligible-only display, size-required action, animation properties/reduced motion and320/390/768/1440 layouts. Existing cart/restart, bargain/cooldown, reservation/checkout, product opening, hero image stability, About/languages/dark mode and promotions regressions are retained.

Anonymous baseline environment reads returned40products and took3847/1235/759ms over three observations, with network variance. No live post-SQL speed percentage or fixed phone FPS/load-time guarantee is claimed. The backend trip reduction requires the manual SQL; frontend scheduling and local-font changes work without it.
