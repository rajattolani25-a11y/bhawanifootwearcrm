# Reported dependency fixes — 12 November 2026

The repeated scan had a newer date but the committed Bun lock still contained the same vulnerable transitive versions. Refreshing the scanner does not update dependencies. The local npm install was newer than that lock, so local package inspection alone was insufficient.

| Dependency                 | Previous committed version | Fixed resolution |
| -------------------------- | -------------------------- | ---------------- |
| DOMPurify (jsPDF)          | 3.4.16                     | 3.4.17           |
| source-map-js (Tailwind)   | 1.2.1                      | 1.2.2            |
| Seroval (TanStack)         | 1.6.8                      | 1.8.1            |
| js-yaml (TanStack tooling) | 4.3.0                      | 4.3.2            |
| Zod                        | root 3.25.76, nested 4.6.5 | 4.6.7 throughout |

Exact overrides and a regenerated Bun lock align fresh installs. Zod's public entry point moves to v4; validation and browser regressions passed with that installed version. TanStack, React, jsPDF and layout versions are otherwise retained. Additional compatible tool fixes pin shell-quote1.12.0, launch-editor2.14.2, nanoid3.3.20 and Vite8.1.7. No database migration or manual SQL is required.

Registry bulk-advisory checks on the five resolved versions returned an empty result. This addresses the eight distinct advisories in the supplied dependency report; repeated parent entries referred to shared transitive packages. It is not a claim that the whole project is free of security findings.

The broader resolved-lock scan now has no critical package advisories. Three separate development/tooling packages remain flagged: brace-expansion (1.x/5.x), esbuild0.18.20 inside the legacy Drizzle loader, and minimatch10.2.6. These need parent/version-specific compatibility work; a global major-version override would break legacy consumers. Do not label the full dependency tree clean. Application access-control findings are separate from package advisories.

Verification included typecheck, production build, pure unit tests, public auth boundary, cart/recovery, consent, product gallery, promotions/Showcase and actual downloaded label PDF QR/Code128 decoding. Scoped lint has no errors; the pre-existing shared useLang fast-refresh warning remains.

After syncing the commit, publish/update and rerun the dependency review against the newly installed lock. The hosted scanner's result and production deployment have not been independently verified. No live order, signup, reset or customer coupon was exercised.
