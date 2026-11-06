import { z } from "zod";

export const PROMO_MAX_BYTES = 400 * 1024;
export const PROMO_BUCKET = "catalog-hero-images";
export const promoPathSchema = z
  .string()
  .regex(/^promotions\/(all|men|women)\/(advance|live)\/[a-f0-9-]{36}\.webp$/);
const externalImageSchema = z
  .object({
    url: z
      .string()
      .max(700)
      .regex(
        /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/[A-Za-z0-9_.,!~*'()/%:-]+$/,
      ),
    publicId: z
      .string()
      .max(240)
      .regex(/^solestack-promotions\/[a-z0-9_-]+\/(all|men|women)\/(advance|live)\/[a-f0-9-]{36}$/),
    bytes: z
      .number()
      .int()
      .positive()
      .max(700 * 1024),
    width: z.number().int().min(1).max(1600),
    height: z.number().int().min(1).max(1600),
  })
  .strict();
export const storedPromoImageSchema = z
  .object({
    storage: z.literal("shop"),
    path: promoPathSchema,
    bytes: z.number().int().positive().max(PROMO_MAX_BYTES),
    width: z.number().int().min(1).max(1600),
    height: z.number().int().min(1).max(1600),
  })
  .strict();
export const promoImageSchema = z.union([externalImageSchema, storedPromoImageSchema]);
export function promoImageSource(
  image: z.infer<typeof promoImageSchema> | null | undefined,
  urls: Record<string, string> = {},
) {
  return !image ? "" : "path" in image ? (urls[image.path] ?? "") : image.url;
}
const slotSchema = z
  .object({ layout: z.enum(["classic", "split"]), image: promoImageSchema.nullable() })
  .strict();
export const campaignSchema = z
  .object({
    audience: z.enum(["all", "men", "women"]),
    enabled: z.boolean(),
    title: z.string().trim().max(60),
    subtitle: z.string().trim().max(120),
    coupon: z.string().trim().max(30),
    productIds: z
      .array(z.string().uuid())
      .max(2)
      .refine((v) => new Set(v).size === v.length, "Choose different products."),
    advance: slotSchema,
    live: slotSchema,
    schedule: z
      .object({
        announceAt: z.string().datetime({ offset: true }),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const s = v.schedule;
    if (
      s &&
      !(
        Date.parse(s.announceAt) <= Date.parse(s.startsAt) &&
        Date.parse(s.startsAt) < Date.parse(s.endsAt)
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Promotion dates must be in order: announce, start, end.",
      });
    }
  });
export const promoConfigSchema = z
  .object({ version: z.literal(1), campaigns: z.array(campaignSchema).max(3) })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.campaigns.map((c) => c.audience)).size !== v.campaigns.length)
      ctx.addIssue({ code: "custom", message: "Use one promotion per audience." });
  });
export type PromoConfig = z.infer<typeof promoConfigSchema>;
export type PromoCampaign = z.infer<typeof campaignSchema>;
export type PromoImage = z.infer<typeof promoImageSchema>;
export type PromoSlot = "advance" | "live";
export function emptyCampaign(audience: PromoCampaign["audience"]): PromoCampaign {
  return {
    audience,
    enabled: false,
    title: "",
    subtitle: "",
    coupon: "",
    productIds: [],
    advance: { layout: "classic", image: null },
    live: { layout: "split", image: null },
    schedule: null,
  };
}
export const EMPTY_PROMOTION: PromoConfig = {
  version: 1,
  campaigns: [emptyCampaign("all"), emptyCampaign("men"), emptyCampaign("women")],
};
export function promotionPhase(config: PromoCampaign, now: number): "hidden" | "advance" | "live" {
  if (!config.enabled) return "hidden";
  const s = config.schedule;
  if (!s) return "live";
  if (now < Date.parse(s.announceAt) || now >= Date.parse(s.endsAt)) return "hidden";
  return now < Date.parse(s.startsAt) ? "advance" : "live";
}
export type PromotionPublication = {
  checked: boolean;
  now: string | null;
  audiences: string[];
  legacy: boolean;
};
/** Report the saved public state, never the owner's unsaved design preview. */
export function savedPromotionStatus(
  enabled: boolean,
  campaign: PromoCampaign | undefined,
  publication: PromotionPublication | undefined,
) {
  if (!enabled) return "Hidden: Show promotions on catalog is off.";
  if (!campaign?.enabled) return "Hidden: this audience promotion is off.";
  if (!publication?.checked || !publication.now)
    return "Public visibility could not be checked. Retry catalog status.";
  if (publication.legacy)
    return "The catalog is using the previous offer. Save this promotion to publish its design.";
  const now = Date.parse(publication.now);
  if (!Number.isFinite(now)) return "Public visibility could not be checked. Retry catalog status.";
  const phase = promotionPhase(campaign, now);
  if (phase === "hidden")
    return now < Date.parse(campaign.schedule!.announceAt)
      ? "Scheduled: hidden until the advance notice time."
      : "Hidden: this promotion has ended.";
  if (!publication.audiences.includes(campaign.audience))
    return "Not visible in the public catalog. Check catalog availability and the selected coupon's validity or usage limit.";
  return phase === "advance"
    ? "Visible now: Advance promotion. Live artwork appears when the sale starts."
    : "Visible now: Live sale. This is the artwork customers see.";
}
export function promotionCountdown(target: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ""}${String(Math.floor((seconds % 86400) / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
/** Download/import only; never promises a device notification. */
export function promotionCalendar(title: string, startsAt: string, endsAt: string, url: string) {
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const date = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  // Fold long UTF-8 lines at <=75 octets as required by RFC5545.
  const fold = (s: string) => {
    let line = "",
      size = 0,
      result = "";
    for (const c of s) {
      const bytes = new TextEncoder().encode(c).length;
      if (size + bytes > 74) {
        result += line + "\r\n ";
        line = "";
        size = 1;
      }
      line += c;
      size += bytes;
    }
    return result + line;
  };
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoleStack//Catalog Promotions//EN",
    "BEGIN:VEVENT",
    `UID:${date(startsAt)}-${encodeURIComponent(url)}@solestack`,
    `DTSTAMP:${date(new Date().toISOString())}`,
    `DTSTART:${date(startsAt)}`,
    `DTEND:${date(endsAt)}`,
    `SUMMARY:${escape(title)}`,
    `URL:${escape(url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
