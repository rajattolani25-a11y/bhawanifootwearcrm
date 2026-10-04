import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NAMES = { english: "simple polite English", hindi: "Hindi in Devanagari script", hinglish: "Hinglish (Hindi written in Roman/English letters, as Indian shopkeepers type on WhatsApp)" };

export const translateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(4000), lang: z.enum(["english", "hindi", "hinglish"]) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: `Translate the customer message into ${NAMES[data.lang]}. Keep it professional and warm. Keep names, shop name, numbers, ₹ amounts, bill numbers, codes, links, phone numbers, line breaks and *bold* markers exactly. Return only the translated message.`,
        input: data.text,
      }),
    });
    if (res.status === 429) throw new Error("Thodi der baad try karo");
    if (res.status === 402) throw new Error("Translation credits khatam — original message bhejo");
    if (!res.ok) throw new Error("Translation nahi ho paya");
    const j = (await res.json()) as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = j.output_text ?? j.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    return { text: text?.trim() || data.text };
  });
