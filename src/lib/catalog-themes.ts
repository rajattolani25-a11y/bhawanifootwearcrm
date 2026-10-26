import type { CSSProperties } from "react";

function palette(
  start: string,
  end: string,
  glow: string,
  ink: string,
  muted: string,
  accent: string,
  button: string,
  buttonInk: string,
) {
  return {
    "--hero-start": start,
    "--hero-end": end,
    "--hero-glow": glow,
    "--hero-ink": ink,
    "--hero-muted": muted,
    "--hero-accent": accent,
    "--hero-button": button,
    "--hero-button-ink": buttonInk,
  } as CSSProperties;
}

/** Local CSS palettes only; no image assets, network services or stored records. */
export const CATALOG_THEMES = [
  {
    id: "studio",
    name: "Charcoal Studio",
    style: palette(
      "#26352b",
      "#18251e",
      "#b2c69b38",
      "#f4f0e6",
      "#c0cabb",
      "#d8c8a6",
      "#dfd1b4",
      "#1e3024",
    ),
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    style: palette(
      "#1a3450",
      "#101c30",
      "#8ebed945",
      "#f1f3f3",
      "#c1ccdb",
      "#c5dbed",
      "#d1e2ee",
      "#172c44",
    ),
  },
  {
    id: "plum",
    name: "Plum Atelier",
    style: palette(
      "#443147",
      "#251d32",
      "#d2a5c738",
      "#faf0ed",
      "#d8c6d4",
      "#e3c5ca",
      "#edced2",
      "#422c42",
    ),
  },
  {
    id: "ivory",
    name: "Warm Ivory",
    style: palette(
      "#f0e6d3",
      "#e4dcc8",
      "#ffffff85",
      "#35372e",
      "#555b4b",
      "#4d6250",
      "#394e3c",
      "#fff8ed",
    ),
  },
  {
    id: "sage",
    name: "Sage Gallery",
    style: palette(
      "#dde9d9",
      "#c6d9cb",
      "#f7fff2a0",
      "#233e32",
      "#415e4d",
      "#315746",
      "#294e3c",
      "#f4f7ed",
    ),
  },
  {
    id: "copper",
    name: "Copper Sand",
    style: palette(
      "#e9d3bc",
      "#d8b9a2",
      "#fff0d880",
      "#472e23",
      "#614434",
      "#633e29",
      "#563824",
      "#fff7ed",
    ),
  },
  {
    id: "slate",
    name: "Slate Minimal",
    style: palette(
      "#e0e7eb",
      "#bfced6",
      "#f4fcff85",
      "#233c4b",
      "#435d6c",
      "#315368",
      "#2d4d61",
      "#f5fafb",
    ),
  },
] as const;
export type CatalogThemeId = (typeof CATALOG_THEMES)[number]["id"];
export function catalogTheme(value: unknown) {
  return CATALOG_THEMES.find((theme) => theme.id === value) ?? CATALOG_THEMES[0];
}
