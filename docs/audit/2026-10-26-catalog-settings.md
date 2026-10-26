# Catalog studio styles and organised owner Settings

## Completed frontend work

- Compact side-by-side banner: actual sampled height 218px at 390px width,
  269px at 320px, and 294px at 768/1440px. Content grows for longer messages
  rather than clipping. The shoe and offer remain actual saved hero content.
- Seven local CSS palettes: Charcoal Studio, Midnight Blue, Plum Atelier,
  Warm Ivory, Sage Gallery, Copper Sand and Slate Minimal. Static gradients,
  readable text, product light/shadow and no additional image/database storage.
  The owner editor and public banner use the same real CatalogHero component.
- Theme editor is mounted only in owner Settings. Unknown theme IDs fall back
  safely; public output accepts only the fixed palette whitelist.
- Settings has six accessible sections, Catalog first, with Design/Orders/
  Offers/Visibility inside Catalog. Existing form state survives section
  switches. Existing store, printing, team, backup and delivery save handlers
  remain in place; reset is collapsed inside Data/backup.
- Guide/tour components, navigation and guide data were removed at user request.
  The legacy /guide URL redirects to Dashboard.
- Bottom navigation is fixed to the actual phone viewport, not the document's
  footer. It measured bottom=844 at scroll offsets 0, 400 and 1012 on an 844px
  viewport. Full-page screenshots previously made it appear midway down the
  long captured image. New public previews use normal viewport screenshots.

## Pending user confirmation: shared theme storage

The live appearance table currently has only three booleans. The original user
instruction prohibits migrations/backend RPC changes without confirmation.
No theme migration has been written or executed. Proposed scope:

1. Add only theme text NOT NULL DEFAULT 'studio' to the existing presentation
   singleton; constrain values to studio/midnight/plum/ivory/sage/copper/slate.
2. Grant SELECT(theme) to anon/authenticated and UPDATE(theme) to authenticated.
   Existing owner-only update RLS remains authoritative; no new RPC is needed.
3. Verify anon/staff cannot write and an owner can save/reload, then publish.

The frontend detects whether that field exists. Without it, the owner can
preview palettes but Save catalog theme is disabled with an explicit preview-
only message. With supported storage it updates only theme, verifies the
returned value, and the public loader uses the persisted palette. The three
existing switches keep their separate explicit updates. Missing storage never
breaks the public catalog.

## Checks

TypeScript, production build and the existing data/billing tests pass. Browser
checks use intercepted fixtures and no production writes. They cover all seven
distinct palettes, 320/390/768/1440px overflow, compact banner height, viewport
bottom navigation, six settings sections, drafts across tabs, direct Catalog
shortcut, owner/staff access, missing storage, legacy Guide redirect and existing
delivery/label behaviour. Supported shared-theme save/reload/public rendering
is verified against mocked responses; it is NOT a live database verification.

Evidence: docs/audit/evidence/catalog-settings/. Preview shoe/offers/products
are sample content. The real app uses existing shop content. Reproduce with
Vite on localhost:8080 and Playwright/Chromium:

```sh
node tests/catalog-theme-audit.mjs
node tests/presentation-settings-audit.mjs
node tests/label-dock-audit.mjs
```

PLAYWRIGHT_MODULE/CHROMIUM_PATH override test tool locations. PREVIEW_SHOE may
point to a local sample cutout for visual review; otherwise a synthetic SVG is
used. Do not confuse these local checks with a live publication.
