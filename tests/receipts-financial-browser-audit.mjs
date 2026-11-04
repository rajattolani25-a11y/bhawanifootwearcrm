import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AUDIT_OUT || "/tmp/solestack-audit/receipts-financial";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(15000);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const cid = "30000000-0000-4000-8000-000000000001",
  sid = "40000000-0000-4000-8000-000000000001";
const date = new Date().toISOString(),
  old = "2020-01-01T12:00:00Z";
let scenario = "current";
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const item = {
  product_name: "Demo Pair",
  size: "7",
  qty: 1,
  price: 1000,
  sku: null,
  sale_item_costs: { unit_cost: 400 },
};
const sales = [
  {
    id: "pickup",
    bill_no: "PICKUP",
    sale_date: date,
    total: 1000,
    taxable: 1000,
    gst_amount: 0,
    discount: 0,
    payment_mode: "Split",
    split_cash: 700,
    paid_amount: 1000,
    due_amount: 0,
    customer_id: cid,
    sale_costs: { total_cost: 400 },
    sale_items: [item],
  },
  {
    id: "delivery",
    delivery_charge: 80,
    bill_type: "simple",
    tax_mode: "inclusive",
    gst_rate: 0,
    subtotal: 1080,
    customer_name: "Demo buyer",
    bill_no: "DELIVERY",
    sale_date: date,
    total: 1080,
    taxable: 1080,
    gst_amount: 0,
    discount: 0,
    payment_mode: "UPI",
    split_cash: 0,
    paid_amount: 1080,
    due_amount: 0,
    customer_id: cid,
    sale_costs: { total_cost: 400 },
    sale_items: [item],
  },
];
function payments() {
  return [
    {
      sale_id: null,
      customer_id: cid,
      amount: 500,
      payment_mode: "Cash",
      paid_at: date,
      entry_kind: "opening",
    },
    {
      sale_id: "pickup",
      customer_id: cid,
      booking_id: "pickup",
      amount: 300,
      payment_mode: "UPI",
      paid_at: scenario === "previous" ? old : date,
      entry_kind: "catalog_advance",
    },
    {
      sale_id: "delivery",
      customer_id: cid,
      booking_id: "delivery",
      amount: 1080,
      payment_mode: "UPI",
      paid_at: date,
      entry_kind: "catalog_advance",
    },
    {
      sale_id: null,
      customer_id: cid,
      booking_id: "cancelled",
      amount: 300,
      payment_mode: "UPI",
      paid_at: date,
      entry_kind: "catalog_advance",
    },
    {
      sale_id: null,
      customer_id: cid,
      booking_id: "cancelled",
      amount: 300,
      payment_mode: "UPI",
      paid_at: date,
      entry_kind: "catalog_refund",
    },
  ];
}
await page.routeWebSocket("**/*", (s) => s.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!u.pathname.startsWith("/rest/v1/")) return r.abort();
  assert.equal(r.request().method(), "GET", "No financial writes are expected");
  let data = [];
  if (u.pathname.endsWith("/user_roles")) data = [{ role: "owner" }];
  if (u.pathname.endsWith("/store_settings"))
    data = { id: 1, business_name: "Demo", daily_target: 10000 };
  if (u.pathname.endsWith("/customers"))
    data = [
      {
        id: cid,
        name: "Opening Customer",
        mobile: "9999999999",
        opening_balance: 500,
        opening_initial: 1000,
      },
    ];
  if (u.pathname.endsWith("/suppliers"))
    data = [
      {
        id: sid,
        name: "Opening Supplier",
        phone: "9999999998",
        opening_balance: 500,
        opening_initial: 1000,
      },
    ];
  if (u.pathname.endsWith("/sales")) data = u.searchParams.has("due_amount") ? [] : sales;
  if (u.pathname.endsWith("/sales") && r.request().headers().accept?.includes("object"))
    data = sales[1];
  if (u.pathname.endsWith("/sales") && u.searchParams.has("bill_no")) data = [sales[1]];
  if (u.pathname.endsWith("/credit_payments")) data = payments();
  if (u.pathname.endsWith("/purchases"))
    data = [
      {
        supplier_id: sid,
        total: 500,
        paid_amount: 500,
        invoice_no: "INITIAL",
        purchase_date: date,
        gst_amount: 0,
      },
    ];
  if (u.pathname.endsWith("/supplier_payments"))
    data = [
      {
        supplier_id: sid,
        amount: 500,
        opening_amount: 500,
        payment_mode: "Cash",
        paid_at: date,
        note: "Opening paid",
      },
    ];
  return r.fulfill({
    json: data,
    headers: {
      "content-range":
        Array.isArray(data) && data.length ? `0-${data.length - 1}/${data.length}` : "*/0",
    },
  });
});
async function row(label, expected) {
  const el = page.locator("div.flex.justify-between").filter({
    has: page
      .locator("span")
      .filter({ hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }),
  });
  await el.first().waitFor();
  await page.waitForFunction(
    ({ label, expected }) =>
      Array.from(document.querySelectorAll("span")).some(
        (e) => e.textContent === label && e.parentElement.textContent.includes(expected),
      ),
    { label, expected },
  );
  assert.ok(
    (await el.first().innerText()).includes(expected),
    label + ": " + (await el.first().innerText()),
  );
}
async function go(path) {
  await page.goto("http://127.0.0.1:3000/" + path);
}
try {
  await go("auth");
  const token =
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 86400,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url") +
    ".mock";
  await page.evaluate(async (token) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.setSession({ access_token: token, refresh_token: "mock" });
  }, token);
  await go("accounting");
  await row("Gross sales", "2,080");
  await row("Money received · Cash", "1,200");
  await row("Money received · UPI", "1,680");
  await row("Refund paid · UPI", "300");
  checks.push(
    "current month: two invoices2080; cash1200 includes opening500; UPI1680 contains advance once; refund300 separately",
  );
  scenario = "previous";
  await page.reload();
  await row("Money received · UPI", "1,380");
  await row("Money received · Cash", "1,200");
  await page.getByRole("button", { name: "Cash Book", exact: true }).click();
  await row("Cash collected at sale", "700");
  await row("Cash received against dues / order advances", "500");
  await row("− Supplier cash payments", "500");
  checks.push(
    "previous-month pickup advance stays out of this month; pickup700Cash preserved; actual CashBook receipts and supplier repayment",
  );
  await go("khata");
  await page.getByRole("button", { name: /Opening Customer/ }).click();
  await page.getByText("Bill PICKUP", { exact: true }).waitFor();
  const table = page.locator("table");
  assert.ok((await table.innerText()).includes("500"));
  assert.equal(
    await page.getByText("Credit received (UPI)", { exact: true }).count(),
    2,
    "Unbilled/cancelled advances and order refunds must not alter customer debt",
  );
  await page.getByRole("button", { name: "Supplier Ledger", exact: true }).click();
  await page.getByRole("button", { name: /Opening Supplier/ }).click();
  await page.getByText("Paid at billing", { exact: true }).waitFor();
  const last = page.locator("tbody tr").nth(3);
  assert.ok((await last.innerText()).includes("500"), await last.innerText());
  checks.push(
    "customer Khata excludes unbilled cancelled/refund records; supplier initial purchase payment plus opening-only repayment reconcile to500",
  );
  await page.screenshot({ path: out + "/supplier-statement.png", fullPage: true });
  for (const design of ["Thermal", "A4", "Premium"]) {
    await page.evaluate(async (design) => {
      const { printBill } = await import("/src/lib/print.ts");
      await printBill("DELIVERY", design);
    }, design);
    const frame = page.frameLocator("iframe");
    await frame.getByText("Delivery charge", { exact: true }).waitFor();
    const rows = await frame.locator("tbody tr").allInnerTexts();
    assert.equal(rows.length, 2);
    assert(rows[0].includes("1,000"));
    assert(rows[1].includes("80"));
    assert((await frame.locator("body").innerText()).includes("1,080"));
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  checks.push(
    "Thermal/A4/Premium invoices render product1000 plus delivery80 as two lines; total1080",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", checks, productionWrites: 0, errors }));
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  await fs.writeFile(out + "/failure.txt", await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
