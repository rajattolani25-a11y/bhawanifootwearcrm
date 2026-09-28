import { inr } from "@/lib/modules";

type BillMessage = {
  shop: string; name?: string; billNo: string; total: number; paid?: number; due?: number;
  stamp?: boolean; rewards?: { amount: number }[]; exchangePolicy?: string;
};

export function billMessage(x: BillMessage) {
  const lines = [
    `Dear ${x.name?.trim() || "Customer"},`,
    "",
    `Thank you for shopping at ${x.shop}.`,
    `Bill: ${x.billNo}`,
    `Total: ${inr(x.total)}`,
  ];
  if (x.paid !== undefined) lines.push(`Paid: ${inr(x.paid)}`);
  if (x.due) lines.push(`Balance due: ${inr(x.due)}`);
  if (x.stamp) lines.push("Your loyalty stamp has been added.");
  if (x.rewards?.length) lines.push(`Reward unlocked: ${x.rewards.map((r) => `${inr(r.amount)} off`).join(" + ")} on your next bill.`);
  lines.push("", x.exchangePolicy || "Size exchange is available within 7 days with this bill.", "We look forward to serving you again.");
  return lines.join("\n");
}

export function arrivalMessage(shop: string, p: { brand: string; article: string; color?: string | null; selling_price: number }, sizes: string[], phone?: string | null) {
  return [
    `NEW ARRIVAL | ${shop}`,
    "",
    `${p.brand.toUpperCase()} ${p.article}`,
    p.color ? `Colour: ${p.color}` : "",
    `Price: ${inr(p.selling_price)}`,
    `Available sizes: ${sizes.join(", ")}`,
    "",
    "Reply with your required size to reserve your pair.",
    phone ? `Call / WhatsApp: ${phone}` : "",
    "Limited stock available.",
  ].filter(Boolean).join("\n");
}

export function dueMessage(shop: string, name: string, billNo: string, due: number) {
  return `Dear ${name || "Customer"},\n\nThis is a gentle payment reminder from ${shop}.\nBill: ${billNo}\nOutstanding balance: ${inr(due)}\n\nPlease ignore this message if payment has already been made. Thank you.`;
}

export function smsLink(mobile: string, text: string) {
  const number = mobile.replace(/\D/g, "");
  return `sms:${number}?body=${encodeURIComponent(text)}`;
}

export async function shareText(title: string, text: string) {
  if (navigator.share) return navigator.share({ title, text });
  await navigator.clipboard.writeText(text);
}