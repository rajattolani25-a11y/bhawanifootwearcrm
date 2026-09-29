export type CartItem = {
  variant_id: string;
  product_name: string;
  brand: string;
  size: string;
  sku: string | null;
  price: number;
  qty: number;
  max: number;
};

export type TaxOpts = { billType: "gst" | "simple"; taxMode: "inclusive" | "exclusive"; rate: number };

export function computeBill(items: CartItem[], billDiscount: number, reward: number, t: TaxOpts) {
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, billDiscount) + Math.max(0, reward));
  const after = subtotal - discount;
  const rate = t.billType === "gst" ? t.rate : 0;
  let taxable: number, gst: number, total: number;
  if (t.taxMode === "inclusive" || rate === 0) {
    total = after;
    taxable = rate ? after / (1 + rate / 100) : after;
    gst = total - taxable;
  } else {
    taxable = after;
    gst = (after * rate) / 100;
    total = taxable + gst;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { subtotal: r(subtotal), discount: r(discount), taxable: r(taxable), gst: r(total) - r(taxable), total: r(total), rate };
}

export function beep(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1200 : 300;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    /* ignore */
  }
}

export const REGULAR_MILESTONES = [5, 10, 20];

export function waLink(mobile: string, text: string) {
  const m = mobile.replace(/\D/g, "");
  const num = m.length === 10 ? `91${m}` : m;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
