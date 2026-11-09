import { parseCategory } from "./product-categories.ts";

export const SPOTLIGHT_LABEL_LIMIT = 12;

/** Defensive public rendering also tolerates older/malformed catalog responses. */
export function spotlightLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const label = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9-]{0,11}$/.test(label) ? label : "";
}

/** Presentation only: use the saved taxonomy, never guess a style from an article name. */
export function spotlightStyle(category: string | null | undefined) {
  const { department, subcategory } = parseCategory(category);
  if (department === "Boys" || department === "Kids") {
    return { tone: "play", word: "PLAY", label: department };
  }
  const women = department === "Women";
  switch (subcategory.toLowerCase()) {
    case "sports & active":
      return {
        tone: women ? "active" : "sport",
        word: women ? "ACTIVE" : "SPORT",
        label: subcategory,
      };
    case "sneakers & streetwear":
    case "sneakers & casuals":
      return {
        tone: women ? "casual" : "street",
        word: women ? "CASUAL" : "STREET",
        label: subcategory,
      };
    case "formals & occasion":
      return { tone: "formal", word: "FORMAL", label: subcategory };
    case "heels & occasion":
      return { tone: "heels", word: "HEELS", label: subcategory };
    case "sandals & floaters":
      return { tone: "sandals", word: "SANDALS", label: subcategory };
    case "sandals & flats":
      return { tone: "flats", word: "FLATS", label: subcategory };
    case "slides & slippers":
      return { tone: "easy", word: "EASY", label: subcategory };
    default:
      return { tone: "neutral", word: "EXPLORE", label: "Discover your next pair" };
  }
}
