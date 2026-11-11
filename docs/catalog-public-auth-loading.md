# Public catalog startup: avoid loading the app authentication SDK

The cancelled full catalog redesign was completely restored to commit `7a46066` before this performance update. No catalog markup, CSS, theme, promotion artwork/editor, product/gallery/Spotlight motion or ordering stages change here. No new poster concept is installed. No migration is added or executed.

## Loading change

Previously the global server-function token attacher and eagerly imported app guards pulled Supabase authentication/storage/realtime code into the public initial JavaScript graph. The global middleware also waited for the owner's persisted session on anonymous catalog requests, even though those server handlers create their own anonymous publicClient.

`attach-app-auth.ts` exempts only the compiler-generated exact function identities of eleven existing public handlers: catalog, snapshot, photos, public promotion, bargain read/bid, booking, coupon check, tracking, cart coupon and cart order. These retain their existing server validation, anonymous client, DB roles/RLS, request deduplication and pricing/payment/stock guards. The exemption is not based on the URL page, a caller flag, function-name substring or HTTP method. Missing/unknown metadata takes the ordinary auth path. Every other function dynamically imports the same generated Supabase client and attaches the same current Bearer token as before; generated integration files remain unchanged. CSRF and server authentication middleware remain installed and unchanged.

App route and owner guards import the same client when called and retain their session/owner checks. Root auth invalidation moves to a lazy AppAuthObserver. It starts when a document first visits any route other than `/catalog` (trailing slash included). Once started it remains mounted during later catalog visits, preserving identity changes, sign-out cache clearing and router/query invalidation. Fresh public-only visits do not start it. This is code splitting, not an authorization change or a cache of catalog data.

## Evidence

The production catalog static JavaScript import graph decreased from 1,184,666 to 968,326 bytes (216,340 bytes removed); the sum of per-asset gzip sizes decreased from 354,192 to 300,104 bytes (54,088 removed). Supabase auth implementation is absent from that public static graph and remains available through the app/auth dynamic chunks. These are build measurements, not a guaranteed reduction in phone load time. Root router/React, translations, catalog UI, images and normal network latency still contribute.

An anonymous read-only backend check on 2026-11-11 confirmed public_catalog_bootstrap version1 is installed, catalog enabled and40public products. No SQL is needed for this update. No live order, sale, payment, reset or message was executed. Production frontend benefits require publishing the matching commit.

Validation:

- `tests/public-function-auth.test.mjs` checks exact function identities and unknown/missing metadata fallback.
- `tests/catalog-auth-boundary-browser-audit.mjs` exercises the real global middleware and root observer with a mocked auth client: all11public calls avoid SDK import; private calls attach current token; app-to-catalog navigation retains one observer; sign-out clears private queries; staff fails owner guard; an absent session fails authenticated route.
- 22 units across public function matching, fresh catalog reads and snapshot sharing pass.
- Existing catalog startup and commerce browser audits pass: eager/lazy priorities, fonts, cancelled chunk loading, HOT eligibility/transparency/motion,320/390/768/1440layouts, bargain and cart ordering. All browser backend operations are mocked.
- TypeScript, scoped ESLint, production build and diff checks pass.
