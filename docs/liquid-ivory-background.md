# Liquid Ivory catalog background

Owner controls stay in **Catalog Studio**, accessed from the last entry of the left menu.

1. **Appearance → Warm Ivory → Save catalog theme** selects the cream storefront and Liquid Ivory banner artwork.
2. **Design & hero → Background motion → Save hero** independently enables/disables animation of the saved banner's decorative background. The product, heading, offer, button and floor shadow remain still. Motion OFF keeps the static cream artwork.
3. **Appearance → Catalog animations** is the existing master switch. OFF overrides background motion too. The design preview observes this saved master setting.

This uses the existing `theme = ivory`, `catalog_hero_settings.motion` and `catalog_presentation_settings.motion_enabled` fields. **No migration, new setting column, RPC, upload or live data mutation is needed for this implementation.** The owner still saves their chosen theme in the Studio; publishing source does not silently overwrite their saved palette.

The background is inline SVG with two gradient folds and a CSS light plane. Only those three decorative layers animate with transforms. They pause off-screen or in hidden tabs; device reduced-motion preferences stop animation. Existing hero image validation, optimistic saves, image-failure fallback, offers and shopping actions stay intact. If the banner is disabled or its image fails, the existing introduction remains; the chosen cream storefront palette still applies. Other palettes retain their existing motion.

Warm cream colours extend to the light storefront, search, product cards and navigation. The customer's dark-mode toggle remains available. No ancestor of the fixed bottom navigation receives a transform.

Validated locally with synthetic shop data and existing local product artwork; no live writes:

- `tests/ivory-background-audit.mjs`: foreground stays fixed, exactly three decorative loops, OFF/reduced-motion stop, off-screen/hidden-tab pause, working CTA, 320/390/768/1440px layouts.
- `tests/presentation-settings-audit.mjs`: owner saves background OFF/ON and reloads, public view receives both states, master OFF overrides, staff cannot access Studio, missing settings fail safely.
- `tests/catalog-theme-audit.mjs`: all seven palettes, public cream storefront at four widths, fixed bottom navigation, dark toggle.
- `tests/hero-motion-audit.mjs`: existing non-ivory motion regression.
- TypeScript, targeted ESLint (no errors; existing `restore` effect dependency warning remains), six data/billing/presentation tests, production build.
