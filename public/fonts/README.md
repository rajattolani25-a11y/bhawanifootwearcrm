IBM Plex Sans and Libre Baskerville are self-hosted WOFF2 webfonts, retaining the existing CSS families, normal width and weights400–700. Source fonts are from the Google Fonts repository:

- https://github.com/google/fonts/tree/main/ofl/ibmplexsans
- https://github.com/google/fonts/tree/main/ofl/librebaskerville

The included OFL files apply. Fonts are split into disjoint Latin and extended Unicode subsets; the browser requests only the needed subset. Existing font families, including the separate hero/offer artwork families, are not renamed. `font-display: swap` preserves a usable system-font fallback. Hashed filenames permit safe cache invalidation. Build/runtime needs no Python or font conversion dependency.

Subset font metadata uses Storefront Sans/Storefront Serif names to respect reserved font names. Existing CSS aliases and glyph designs are retained. Copyright/license records remain included.
