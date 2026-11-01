import {
  DEFAULT_POSTER_TYPOGRAPHY,
  DEFAULT_POSTER_VISIBILITY,
  POSTER_THEMES,
  type PosterTheme,
  type PosterTypography,
  type PosterVisibility,
} from "./poster";

export type PosterCampaign = {
  id: string;
  name: string;
  theme: PosterTheme;
  tag: string;
  offer: string;
  visible: PosterVisibility;
  typography: PosterTypography;
};
export const CAMPAIGN_KEY = "solestack-poster-campaigns-v1";
export const CAMPAIGN_STARTERS: PosterCampaign[] = [
  {
    id: "new",
    name: "New Arrival",
    theme: "luxury",
    tag: "NEW ARRIVAL",
    offer: "",
    visible: { ...DEFAULT_POSTER_VISIBILITY },
    typography: { ...DEFAULT_POSTER_TYPOGRAPHY },
  },
  {
    id: "festival",
    name: "Festival Sale",
    theme: "sale",
    tag: "FESTIVAL EDIT",
    offer: "",
    visible: { ...DEFAULT_POSTER_VISIBILITY },
    typography: { ...DEFAULT_POSTER_TYPOGRAPHY, line1: "FESTIVAL", line2: "FAVOURITES." },
  },
  {
    id: "wedding",
    name: "Wedding Collection",
    theme: "collection",
    tag: "THE OCCASION EDIT",
    offer: "",
    visible: { ...DEFAULT_POSTER_VISIBILITY },
    typography: { ...DEFAULT_POSTER_TYPOGRAPHY, line1: "WEDDING", line2: "COLLECTION." },
  },
];

/** Only bounded design data is restored. Never persist product/photo/price/customer data. */
export function parseCampaigns(raw: string | null): PosterCampaign[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return [];
    return data
      .slice(0, 20)
      .filter((x): x is PosterCampaign => {
        if (!x || typeof x !== "object") return false;
        const t = x.typography;
        return (
          typeof x.id === "string" &&
          x.id.startsWith("local-") &&
          x.id.length <= 80 &&
          typeof x.name === "string" &&
          x.name.trim().length > 0 &&
          x.name.length <= 40 &&
          POSTER_THEMES.some((theme) => theme.id === x.theme) &&
          typeof x.tag === "string" &&
          x.tag.length <= 60 &&
          typeof x.offer === "string" &&
          x.offer.length <= 60 &&
          x.visible &&
          Object.keys(DEFAULT_POSTER_VISIBILITY).every(
            (key) => typeof x.visible[key] === "boolean",
          ) &&
          t &&
          [t.line1, t.line2].every(
            (line) => line === null || (typeof line === "string" && line.length <= 80),
          ) &&
          Number.isFinite(t.size) &&
          t.size >= 60 &&
          t.size <= 100 &&
          ["theme", "left", "center", "right"].includes(t.align)
        );
      })
      .map((x) => ({
        id: x.id,
        name: x.name,
        theme: x.theme,
        tag: x.tag,
        offer: x.offer,
        visible: Object.fromEntries(
          Object.keys(DEFAULT_POSTER_VISIBILITY).map((key) => [
            key,
            x.visible[key as keyof PosterVisibility],
          ]),
        ) as PosterVisibility,
        typography: {
          line1: x.typography.line1,
          line2: x.typography.line2,
          size: x.typography.size,
          align: x.typography.align,
        },
      }));
  } catch {
    return [];
  }
}
