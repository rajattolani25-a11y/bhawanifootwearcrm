# UI and motion implementation

1. **Motion** — lazy features, cart row feedback and total emphasis; no transition waits in billing.
2. **Motion Primitives** — controlled adaptation of AnimatedBackground for Accounting report selection. Source: https://github.com/ibelick/motion-primitives/blob/main/components/core/animated-background.tsx . MIT copyright2024 ibelick; full licence in licenses/motion-primitives.txt.
3. **Magic UI** — adapted BlurFade reveal for catalog heading/intro. Source: https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/blur-fade.tsx . MIT copyright Magic UI; full licence in licenses/magic-ui.txt. We use a short opacity/translation reveal and a static-gradient spotlight rather than animated blur. The existing owner motion toggle remains effective for the saved hero.
4. **shadcn/ui** — refine the existing component system: scoped workspace table styles, PageHeader surface, calmer dialog/sheet overlay, dialog corners, reduced-motion popup support. No new duplicate UI framework.
5. **Lottie Web** — original receipt/check animation,36 frames at30fps, no loop. JSON is a local static asset, loaded with the light SVG player only when the saved-bill confirmation mounts. Persistent static tick handles loading/failure/reduced motion; pause in background; destroy on unmount.

Three Fiber/3D is excluded. Existing records, offers, booking flow, calculations,
stock RPCs, permissions, original brand assets and database schema are unchanged.
No external animation/CDN/API calls, no new database storage. Motion Primitives
and Magic UI are adapted source components sharing Motion, not extra runtime
packages. Motion and lottie-web licences ship with installed packages.

Motion respects the user's reduced-motion preference. Lottie is not a blocking
loading screen and never delays creating a bill. Shared owner styling is scoped
to workspace content, not the public catalog or printable iframe documents.
All earlier audit/performance fixes remain local alongside this work.

## Verification

Production build and TypeScript pass; five data/billing audit tests pass.
All18 authenticated pages were smoke-tested with mocked owner data at390px,
with no uncaught page exceptions or document-width overflow; both staff owner
route checks still redirect to POS. No real sale/order was submitted.

UI harness: report tab selection updates, Lottie actually produces SVG paths,
hero CTA still calls its handler,390px layout fits, and switching the OS motion
preference destroys Lottie and retains the static tick. Actual harness images
and browser results are in docs/audit/evidence/ui-motion. Preview shoe and bill
are synthetic fixtures. POS was separately checked with600 synthetic products:
Show more, last-article search and size7 add-to-cart work; screenshot retained.
These are browser checks, not a live-phone speed or production-DB validation.

Build output separates the Lottie SVG player (~47.5KB gzip), original animation
(~0.47KB gzip), and Motion features (~32.5KB gzip). These are individual chunks,
not the total added payload. Motion provider is restricted to authenticated
workspace/catalog routes, so the sign-in screen does not load these effects.
Bun lockfile updated and validated frozen; no duplicate package lock introduced.
Tests: optional `PLAYWRIGHT_MODULE=... node tests/ui-motion-audit.mjs` with the
dev server on localhost:8080. Original mocked-route and data tests remain.
