import { supabase } from "@/integrations/supabase/client";

export type PrintDesign = "Thermal" | "A4" | "Premium";
const money = (n: number) => "Rs " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Sale = {
  bill_no: string; sale_date: string; customer_name: string | null; payment_mode: string; bill_type: string; tax_mode: string;
  subtotal: number; discount: number; taxable: number; gst_rate: number; gst_amount: number; total: number; paid_amount: number; due_amount: number;
  reward_amount: number; coupon_code: string | null; coupon_amount: number; sale_items: { product_name: string; size: string; sku: string | null; price: number; qty: number }[];
};

// Same line split as old app: discount spread by value, last line absorbs rounding.
function lines(s: Sale) {
  const items = s.sale_items;
  const sub = items.reduce((a, i) => a + i.qty * i.price, 0) || 1;
  const rate = Number(s.gst_rate);
  const gstBill = s.bill_type === "gst" && rate > 0;
  let aD = 0, aT = 0, aG = 0, aA = 0;
  return items.map((it, idx) => {
    const last = idx === items.length - 1;
    const gross = it.qty * it.price;
    const d = last ? Number(s.discount) - aD : Math.round((gross / sub) * Number(s.discount));
    aD += d;
    const net = Math.max(gross - d, 0);
    let taxable = net, gst = 0, amount = net;
    if (gstBill && s.tax_mode === "inclusive") { taxable = last ? Number(s.taxable) - aT : Math.round(net / (1 + rate / 100)); gst = amount - taxable; }
    else if (gstBill) { gst = last ? Number(s.gst_amount) - aG : Math.round((net * rate) / 100); amount = net + gst; }
    if (last) amount = Number(s.total) - aA;
    aT += taxable; aG += gst; aA += amount;
    return { it, d, taxable, gst, amount };
  });
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
.paper{margin:0 auto;padding:14px}
h1{margin:0;font-size:20px;letter-spacing:.5px}p{margin:2px 0}small{color:#555}
.ribbon{text-align:center;font-weight:700;letter-spacing:2px;border:1px dashed #111;padding:3px;margin-bottom:8px;font-size:12px}
.hdr{display:flex;justify-content:space-between;gap:10px;border-bottom:2px solid #111;padding-bottom:8px}
.badge{text-align:right;font-size:12px}.badge strong{display:block;font-size:13px}
.party{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0;font-size:12px}.party span{display:block;color:#666;font-size:10px;text-transform:uppercase}
table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}th{text-align:left;border-bottom:1px solid #111;padding:4px 2px;font-size:11px}td{padding:4px 2px;border-bottom:1px dotted #bbb;vertical-align:top}
td:not(:first-child),th:not(:first-child){text-align:right}
.t{display:flex;justify-content:space-between;font-size:13px;padding:2px 0}.t.g{font-size:18px;font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;margin:4px 0;padding:5px 0}
.foot{display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-top:10px;font-size:11px;border-top:1px dashed #111;padding-top:6px}.foot strong{display:block}
.dup{text-align:center;font-weight:700;border:2px solid #111;padding:2px;margin-bottom:6px}
.thermal{width:76mm;padding:6px}.thermal h1{font-size:16px;text-align:center}.thermal .hdr{display:block;text-align:center}.thermal .badge{text-align:center;margin-top:4px}
.thermal .party{grid-template-columns:1fr 1fr}.thermal .party div:last-child{display:none}.thermal .foot{grid-template-columns:1fr}
.a4{width:190mm}.premium{width:190mm;border:3px double #111;padding:20px}.premium h1{font-family:Georgia,serif;font-size:28px}.premium .ribbon{background:#111;color:#d4af37;border:0}
@page{margin:4mm}@media print{.noprint{display:none}}
`;

export async function printBill(billNo: string, designArg?: PrintDesign, duplicate = false) {
  const [{ data: s, error }, { data: st }] = await Promise.all([
    supabase.from("sales").select("bill_no,sale_date,customer_name,payment_mode,bill_type,tax_mode,subtotal,discount,taxable,gst_rate,gst_amount,total,paid_amount,due_amount,reward_amount,coupon_code,coupon_amount,sale_items(product_name,size,sku,price,qty)").eq("bill_no", billNo).maybeSingle(),
    supabase.from("store_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (error || !s) { throw new Error("Bill not found"); }
  const sale = s as unknown as Sale;
  const design: PrintDesign = designArg ?? ((st?.bill_design as PrintDesign) || "Thermal");
  const narrow = design === "Thermal" && st?.thermal_width === "58";
  const gstBill = sale.bill_type === "gst" && Number(sale.gst_rate) > 0;
  const rows = lines(sale).map(({ it, d, taxable, gst, amount }) => {
    const name = `<td><strong>${esc(it.product_name)}</strong><br><small>${esc(it.sku ?? "")} | Size ${esc(it.size)}${d ? ` | Disc ${money(d)}` : ""}</small></td>`;
    return gstBill
      ? `<tr>${name}<td>${it.qty}</td><td>${money(it.price)}</td>${design === "Thermal" ? "" : `<td>${money(taxable)}</td><td>${money(gst)}</td>`}<td>${money(amount)}</td></tr>`
      : `<tr>${name}<td>${it.qty}</td><td>${money(it.price)}</td><td>${money(amount)}</td></tr>`;
  }).join("");
  const head = gstBill && design !== "Thermal" ? "<th>Item</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Amount</th>" : "<th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th>";
  const change = Math.max(Number(sale.paid_amount) - Number(sale.total), 0);
  const footer = st?.bill_footer ?? "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.bill_no)}</title><style>${CSS}${narrow ? ".thermal{width:54mm;padding:3px}.thermal table,.thermal .t{font-size:11px}.thermal .t.g{font-size:15px}" : ""}${design === "Thermal" ? `@page{size:${narrow ? "58mm" : "80mm"} auto;margin:2mm}` : ""}</style></head><body>
  <section class="paper ${design.toLowerCase()}">
    ${duplicate ? '<div class="dup">DUPLICATE COPY</div>' : ""}
    <div class="ribbon">${gstBill ? "TAX INVOICE" : "CASH MEMO"}</div>
    <header class="hdr"><div><h1>${esc(st?.business_name ?? "")}</h1><p>${esc(st?.business_address)}</p><p>Phone: ${esc(st?.business_phone)}${gstBill && st?.gstin ? ` | GSTIN: ${esc(st.gstin)}` : ""}</p></div>
      <div class="badge"><strong>${esc(sale.bill_no)}</strong><small>${new Date(sale.sale_date).toLocaleString("en-IN")}</small></div></header>
    <section class="party"><div><span>Bill To</span><strong>${esc(sale.customer_name || "Walk-in Customer")}</strong></div><div><span>Payment</span><strong>${esc(sale.payment_mode)}</strong></div><div><span>Copy</span><strong>${duplicate ? "Duplicate" : "Customer Copy"}</strong></div></section>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <div class="t"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
    ${Number(sale.discount) > 0 ? `<div class="t"><span>Discount${Number(sale.reward_amount) > 0 ? " (incl. reward)" : ""}${Number(sale.coupon_amount) > 0 ? " (incl. coupon)" : ""}</span><strong>-${money(sale.discount)}</strong></div>` : ""}
    ${Number(sale.coupon_amount) > 0 ? `<div class="t"><small>Coupon ${esc(sale.coupon_code)} included above</small><small>-${money(sale.coupon_amount)}</small></div>` : ""}
    ${gstBill ? `<div class="t"><span>Taxable</span><strong>${money(sale.taxable)}</strong></div><div class="t"><span>GST ${sale.gst_rate}% ${sale.tax_mode === "inclusive" ? "(incl.)" : ""}</span><strong>${money(sale.gst_amount)}</strong></div>` : ""}
    ${gstBill ? `<div class="t"><span>CGST ${Number(sale.gst_rate) / 2}% + SGST ${Number(sale.gst_rate) / 2}%</span><strong>${money(Number(sale.gst_amount) / 2)} + ${money(Number(sale.gst_amount) / 2)}</strong></div>` : ""}
    <div class="t g"><span>Total</span><strong>${money(sale.total)}</strong></div>
    ${Number(sale.paid_amount) > 0 ? `<div class="t"><span>Received</span><strong>${money(sale.paid_amount)}</strong></div>` : ""}
    ${Number(sale.due_amount) > 0 ? `<div class="t"><span>Due</span><strong>${money(sale.due_amount)}</strong></div>` : ""}
    ${change > 0 ? `<div class="t"><span>Change</span><strong>${money(change)}</strong></div>` : ""}
    <div class="foot"><div><strong>Exchange Policy</strong><span>${esc(footer)}</span></div><div><strong>Ref</strong><code>${esc(sale.bill_no)}</code></div></div>
    <p style="text-align:center;margin-top:8px;font-size:12px">Thank you! Visit again.</p>
  </section><script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`;
  previewDocument(sale.bill_no, html);
}

export function printHtml(title: string, body: string, css = "") {
  previewDocument(title, `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;font-family:Arial,sans-serif}${css}</style></head><body>${body}</body></html>`);
}

function previewDocument(title: string, html: string) {
  document.getElementById("print-preview")?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = "print-preview";
  wrapper.setAttribute("role", "dialog");
  wrapper.setAttribute("aria-label", `${title} print preview`);
  wrapper.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--background);color:var(--foreground);display:flex;flex-direction:column";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border)";
  const heading = document.createElement("strong"); heading.textContent = title; heading.style.cssText = "margin-right:auto";
  const frame = document.createElement("iframe"); frame.title = title; frame.srcdoc = html.replace(/<script>window\.onload=function\(\)\{window\.focus\(\);window\.print\(\);\}<\/script>/, ""); frame.style.cssText = "flex:1;width:100%;border:0;background:white";
  const fileName = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document";
  const makePdf = async () => {
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error("Preview not ready");
    const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
    const node = doc.body;
    const w = Math.max(node.scrollWidth, 200), h = Math.max(node.scrollHeight, 200);
    const png = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", width: w, height: h });
    const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h], hotfixes: ["px_scaling"] });
    pdf.addImage(png, "PNG", 0, 0, w, h);
    return pdf.output("blob");
  };
  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const busy = async (b: HTMLButtonElement, label: string, fn: () => Promise<void>) => {
    b.disabled = true; b.textContent = "Preparing…";
    try { await fn(); } catch (e) { if ((e as Error)?.name !== "AbortError") alert("PDF nahi ban paya: " + ((e as Error)?.message ?? e)); }
    finally { b.disabled = false; b.textContent = label; }
  };
  const button = (label: string, action: (b: HTMLButtonElement) => void | Promise<void>) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "border:1px solid var(--border);border-radius:6px;padding:8px 12px;background:var(--card);color:var(--foreground);cursor:pointer"; b.onclick = () => { void action(b); }; return b; };
  toolbar.append(heading,
    button("Print", () => frame.contentWindow?.print()),
    button("Share PDF", (b) => busy(b, "Share PDF", async () => { const blob = await makePdf(); const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title }); else saveBlob(blob, `${fileName}.pdf`); })),
    button("Download PDF", (b) => busy(b, "Download PDF", async () => saveBlob(await makePdf(), `${fileName}.pdf`))),
    button("Close", () => wrapper.remove()));
  wrapper.append(toolbar, frame);
  document.body.append(wrapper);
  frame.focus();
}
