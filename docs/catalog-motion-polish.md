# Catalog motion and rendering polish

The owner requested smoother existing transitions and faster interaction, plus UI proposal visuals. The new home/detail/cart visuals are concepts only; no proposed theme, layout or cart redesign is applied in this change. No schema, financial operation, cache lifetime, network polling interval or public field is changed.

## Rendering work

Every catalog snapshot is still fetched normally. `mergeCatalogSnapshot` compares all returned product fields and exact size records, retaining existing object references only when values match. Current signed image URLs are reused only for the exact same authorized image_key, as before; changed/removed paths clear the old URL. Removed products/OFF catalogs clear products, changed price/availability/heading/unknown future fields are never skipped. Shop fields are compared too. This is client-side structural sharing after a fresh response, not a data response cache.

Unchanged snapshots retain the root/products references, so React avoids unnecessary grid work during animation. Sorted display records are memoized in a per-view WeakMap keyed by the immutable current product record. Individual cards are memoized without altering markup, lazy loading, prices, filter/sort order, callbacks or available sizes. The memo cannot retain otherwise unreachable product records.

## Interaction motion

Gallery angle selection decodes the requested photo before switching. The current photo remains visible during slow/failed loads. Only the latest tap can commit, same-URL preloads coalesce, and product/cover/retry changes invalidate pending selections. New photos crossfade over200ms with at most one outgoing main photo, then its timer removes it. Existing caption/thumbnails, cover fallback, extra-angle API and main-image priority remain. Intent warms only the requested angle, never a new API request or the entire collection. No new player/video/3D code is added. Owner motion OFF and reduced motion suppress the crossfade.

Card shadow no longer animates on every hover frame; only border/transform transitions run. Hover zoom is scoped to fine pointers, preventing sticky touch hover. Small press feedback acts immediately without delaying the click. Reduced motion and master motion OFF retain their existing precedence. Product-view entrance remains280ms and checkout/reservation/Spotlight/HOT animations and actions remain unchanged.

## Evidence

- Four snapshot unit cases cover120records, exact reference retention, changed fields/sizes/order, URL replacement/removal, OFF and shop flags.
- A React Profiler browser audit performs five newly returned identical snapshots for120products and records zero extra grid commits; a changed price still reaches both the grid and the open product. One local changed-grid commit measured7.6ms; this is not a device FPS claim.
- Gallery browser audit holds angle downloads, reverses rapid selections, fails a photo and changes products while a selection is pending. Current image retention,200ms fade, last-selection/unmount protection, coalescing and motion controls pass.
- Existing product-opening, commerce, collection sort/filters, fresh prices, HOT eligibility/startup loading and responsive320/390/768/1440 regressions pass with no live order writes.
- TypeScript, scoped lint, whitespace and production build must pass before push.120FPS depends on hardware/display and is not guaranteed by CSS timings or these local tests.
