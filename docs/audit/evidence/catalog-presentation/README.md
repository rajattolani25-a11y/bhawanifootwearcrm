# Catalog presentation controls — 2026-10-25

Scope approved explicitly by the user: one singleton settings table and its
owner editor/public frontend consumers. No existing business table or RPC edits.

`checks.json` records mocked 390px browser assertions. The accompanying images
show the owner controls and the real CatalogView with all three switches OFF.
All product/customer imagery and values in these fixtures are synthetic.
`permissions.json` records actual SQL permissions tests in disposable PostgreSQL
17 with no network or production connection; its has_role/auth.uid fixtures
model owner/staff identities and do not change production functions.

Reproduce from the repository root (Vite at localhost:8080 for browser tests):

```sh
npm run test:audit
npx tsc --noEmit
npm run build
node tests/presentation-policy-audit.mjs
node tests/presentation-settings-audit.mjs
node tests/catalog-features-audit.mjs
```

The SQL test requires Docker and the `postgres:17-alpine` image. Browser scripts
require Playwright and Chromium; set PLAYWRIGHT_MODULE to a module specifier
or file URL and CHROMIUM_PATH if not using their default locations.

Live status: a publishable-key read returned 404/PGRST205 for the new table.
There is no database migration/admin connection here. Migration 0021 is prepared
and tested locally, not applied to production. See docs/release-ready.md for
the precise Lovable handoff. No real sales, orders, payments or messages were
created during these tests.
