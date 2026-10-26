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

## Approved shared theme migration

The original user instruction prohibited migrations/backend RPC changes without
confirmation. The user subsequently requested the migration explicitly.
Migration `0023_catalog_theme.sql` is prepared with this narrow scope:

1. Add only theme text NOT NULL DEFAULT 'studio' to the existing presentation
   singleton; constrain values to studio/midnight/plum/ivory/sage/copper/slate.
2. Grant SELECT(theme) to anon/authenticated and UPDATE(theme) to authenticated.
   Existing owner-only update RLS remains authoritative; no new RPC is needed.
3. Notify PostgREST to reload its schema cache after migration commit.

The actual migration was executed in isolated PostgreSQL 17 after the existing
0021/0022 migrations. Tests use the seven real frontend theme IDs, verify owner
updates and public reads, reject staff/anonymous writes and invalid/null themes,
and confirm that saved flags, RLS policy definitions and an unrelated dummy
business row remain unchanged. Reapplying 0023 preserves the selected theme.
No production writes occurred. No database admin/migration connection is
available here, so live application remains a Lovable migration step.

The frontend detects whether that field exists. Without it, the owner can
preview palettes but Save catalog theme is disabled with an explicit preview-
only message. With supported storage it updates only theme, verifies the
returned value, and the public loader uses the persisted palette. The three
existing switches keep their separate explicit updates. Missing storage never
breaks the public catalog.

After Lovable applies 0023, select the palette in Settings → Catalog → Design &
hero and use Save catalog theme. Refresh the public catalog to see the saved
theme. Do not replay older migrations for this change.

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
