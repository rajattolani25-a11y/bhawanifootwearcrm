# Storage measurements

The meter uses the existing owner-only `store_usage` and `catalog_hero_storage_usage` read RPCs. This change adds no migration, backend function, upload or data mutation.

- **Database allocation** is the existing server sum of `pg_total_relation_size` for public tables. It includes their indexes, TOAST storage and allocated pages that can be reused after deletion. It is not the sum of active bills and does not need to become zero after reset. It does not measure Auth, Storage metadata or every other project schema.
- **Photo files** sums the existing product and hero bucket metadata byte counts exactly once. Extra angles and files awaiting cleanup count while their objects remain. Hero read failures do not reuse a stale hero total or report unknown usage as zero: the meter explicitly shows product files only.
- Sizes use decimal SI units (1 MB = 1,000,000 bytes), two display decimals and an exact byte count alongside. Small files remain visible in B/KB. Counts come directly from the RPC, never from a guessed record size.
- Actual hosting-plan limits are not available from these RPCs. The Cloud dashboard remains the source for complete project usage and remaining quota; the meter does not declare Safe/full or verified free space.
- Refresh re-reads both measurements; the last-checked timestamp uses the older successful reading when combined. A failed base read shows Retry, rather than presenting invalid/old data as current. Invalid/missing/negative/fractional/unsafe values are rejected. Existing mutation invalidation still refreshes the meter after reset.

Tests: `tests/storage-usage.test.mjs` verifies units, validation, zero bills with nonzero allocation, photo sums and missing hero readings. `tests/storage-meter-browser-audit.mjs` verifies real UI with mocked read-only RPCs, failed refresh after a previously successful hero read, retry, small files, zero hero files, invalid responses, Hindi and 320/390/768/1440px layout. The existing maintenance browser test covers the meter in Settings alongside backup/reset/restore. No production requests or live reset were used.

## Optional capacity planning figures

The owner requested approximate remaining bill/photo counts alongside actual usage. A separate estimate card uses **assumed** defaults of 500 decimal MB database and 1,000 MB photo storage. Its collapsed limit editor saves only these planning capacities on the current browser/device, with blocked-storage feedback; no backend settings or migration is added.

Remaining planning space is `max(0, assumed capacity - measured allocation) × 0.9`, reserving 10% headroom. This cannot account precisely for other project schemas or future shop growth, so these are conditional ranges, not verified remaining quotas.

- Bills: one optional exact HEAD count of `sale_items.id` (no records/customer data downloaded) supplies average item lines per existing bill. The planning bytes-per-bill range is `2,000 + 800 × mean lines` through `4,000 + 2,000 × mean lines`, allowing for receipt, item, cost, indexes and stock-ledger growth. These constants are modelling assumptions, not measured row sizes. With no complete sample or a count failure, the UI explicitly uses a starter assumption of three lines per bill. It never divides all table allocation by bill count. The count reads only when there are bills, is keyed by current bill count, and refreshes with the meter/mutation invalidation.
- Photos: measured average size sets the per-file planning range from 0.75× to 1.5× the average. With no photo sample, the explicit starter model is 100–250 KB/compressed image. Missing hero readings withhold photo capacity rather than overstate available space.
- Capacity ranges floor the lower/upper counts and clamp at zero when the assumed limit is exhausted. Larger bills/photos or other data may use space faster. Existing allocation can also be reused, so the figures are guidance only.

`tests/storage-estimates.test.mjs` checks headroom/model maths, item/photo-size sensitivity, zero/full cases and limit validation. The browser audit additionally checks observed line counts, refresh, editable limits surviving reload, unavailable device storage, partial photo readings and Hindi.
