# Public catalog load recovery

The owner reported the root "This page didn't load" screen on1–2customers' phones. Live public reads confirmed the catalog enabled with19products and valid size arrays. The screenshot alone does not identify its exception, and the affected phones' logs are unavailable.

A browser fixture reproduced that exact error boundary when device storage throws `SecurityError`: shared ThemeProvider and the catalog theme preference read were unguarded. Optional theme reads/writes now fall back to system/light and a session-only selection. Cart persistence, bargaining identity and uncertain order recovery keep their existing explicit storage errors; no silent volatile cart or new financial write path is introduced.

The root retry component keeps existing telemetry and router invalidation for ordinary errors. For recognized rejected JS-module/CSS preload errors after deployment, a customer-triggered retry reloads the current document/URL, because resetting a React boundary cannot invalidate a rejected module import. There is no automatic reload, data deletion, cache purge or redirect. Catalog loader failures also have an explicit current-page retry rather than a message without an action.

Local regression checks exercise the real ThemeProvider, CatalogView and root retry component: storage blocked, normal storage, saved dark preference, product opening, theme controls, rejected-module manual reload and no reload loop. Unit checks distinguish module failures from business/storage errors. The initial blocked-storage reproduction matched the customer's boundary; this does not prove their device had the same exception. No live sale/order, database write or customer message is executed by these tests.

The separate expired promotion issue was confirmed with an anonymous live RPC read. Its manual SQL is `docs/sql/catalog-promotions/show-expired-everyone-live.sql`; it does not fix page-loading errors. Local full-schema PostgreSQL checks verify its scoped update, repeatability, OFF/future guards and invalid-coupon rollback, together with existing native-photo permissions and backup/reset/restore coverage. Live SQL application is left to the owner.
