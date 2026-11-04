import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/sales-financial";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const errors = [],
  writes = [],
  blocked = [];
page.on("pageerror", (e) => errors.push(e.message));
let known = true,
  refunded = 0,
  isReturn = false,
  pairQty = 1,
  saleDay = null;
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const saleId = "10000000-0000-4000-8000-000000000001",
  itemId = "20000000-0000-4000-8000-000000000001",
  customerId = "30000000-0000-4000-8000-000000000001",
  variantId = "40000000-0000-4000-8000-000000000001";
function records() {
  const item = {
    id: itemId,
    sale_id: saleId,
    product_name: "Demo Sports Pair",
    size: "7",
    qty: pairQty,
    price: 2200 / pairQty,
    discount: 0,
    variant_id: variantId,
    sale_item_costs: known ? { unit_cost: 1400 / pairQty } : null,
  };
  const sale = {
    id: saleId,
    bill_no: "DEMO-001",
    sale_date: saleDay ?? new Date().toISOString(),
    total: 2200,
    subtotal: 2200,
    paid_amount: 2200,
    due_amount: 0,
    taxable: 2200,
    gst_amount: 0,
    gst_rate: 0,
    discount: 0,
    payment_mode: "Cash",
    split_cash: 0,
    customer_id: customerId,
    customer_name: "Demo Customer",
    customers: { mobile: "9999999999" },
    sale_items: [item],
    sale_costs: { total_cost: known ? 1400 : 0, profit: known ? 800 : 2200 },
  };
  return {
    sale,
    returns: isReturn
      ? [
          {
            id: "return1",
            sale_id: saleId,
            sale_item_id: itemId,
            variant_id: variantId,
            product_name: item.product_name,
            size: "7",
            qty: refunded === 2200 ? pairQty : 1,
            refund: refunded,
            kind: "return",
            cash_refund: refunded,
            taxable_reversal: refunded,
            gst_reversal: 0,
            cost_reversal: known ? (refunded * 1400) / 2200 : 0,
            created_at: new Date().toISOString(),
            sale_items: item,
            sales: sale,
          },
        ]
      : [],
  };
}
await page.routeWebSocket("**/*", (socket) => socket.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url()),
    method = r.request().method();
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    const { sale, returns } = records();
    let data = [];
    if (u.pathname.endsWith("/rpc/owner_cash_today")) return r.fulfill({ json: {cash_in:2200,cash_out:refunded,cash_net:2200-refunded,verified:true} });
    if (u.pathname.endsWith("/rpc/operational_safety_version")) return r.fulfill({ json: 40 });
    if (u.pathname.endsWith("/rpc/retail_integrity_version")) return r.fulfill({ json: 32 });
    if (u.pathname.endsWith("/rpc/return_cost_reversals")) return r.fulfill({ json: returns.map((x) => ({ id: x.id, cost_reversal: x.cost_reversal })) });
    if (u.pathname.endsWith("/rpc/sale_return_positions")) return r.fulfill({ json: isReturn ? [] : [{ variant_id: variantId, size: "7", qty: pairQty }] });
    if (u.pathname.endsWith("/rpc/process_sale_return")) {
      assert.equal(method, "POST");
      assert.equal(r.request().postDataJSON()._kind, "return");
      isReturn = true;
      refunded = 2200;
      writes.push("mock return");
      return r.fulfill({ json: { refund: 2200, payout: 2200 } });
    }
    if (method !== "GET" && method !== "HEAD") {
      blocked.push(u.pathname);
      return r.abort();
    }
    if (u.pathname.endsWith("/user_roles")) data = [{ role: "owner" }];
    if (u.pathname.endsWith("/sales"))
      data =
        u.searchParams.get("due_amount") === "gt.0"
          ? []
          : r.request().headers().accept?.includes("object")
            ? sale
            : [sale];
    if (u.pathname.endsWith("/sale_returns")) data = returns;
    if (Array.isArray(data) && u.pathname.endsWith("/sales")) {
      for (const value of u.searchParams.getAll("sale_date")) {
        const dot = value.indexOf("."),
          op = value.slice(0, dot),
          date = Date.parse(value.slice(dot + 1));
        data = data.filter((s) =>
          op === "gte"
            ? Date.parse(s.sale_date) >= date
            : op === "lt"
              ? Date.parse(s.sale_date) < date
              : true,
        );
      }
    }
    if (u.pathname.endsWith("/product_variants"))
      data = [
        {
          id: variantId,
          size: "7",
          stock: isReturn ? 1 : 0,
          min_stock: 1,
          created_at: "2026-01-01T00:00:00Z",
          product_id: "product1",
          products: { brand: "Demo", article: "Sports Pair", category: "Gents" },
        },
      ];
    if (u.pathname.endsWith("/product_costs"))
      data = known ? [{ product_id: "product1", purchase_price: 1400 }] : [];
    if (u.pathname.endsWith("/customers")) {
      const customer = {
        id: customerId,
        name: "Demo Customer",
        mobile: "9999999999",
        opening_balance: 0,
        created_at: "2026-01-01",
        regular_stamps: 0,
        premium_stamps: 0,
        regular_visits: 0,
        premium_visits: 0,
        is_premium: false,
      };
      data = u.searchParams.has("opening_balance")
        ? []
        : r.request().headers().accept?.includes("object")
          ? customer
          : [customer];
    }
    if (u.pathname.endsWith("/store_settings"))
      data = {
        id: 1,
        business_name: "Demo Footwear",
        business_phone: "",
        business_address: "",
        daily_target: 10000,
        bill_design: "Thermal",
        thermal_width: "80",
        upi_id: "",
      };
    return r.fulfill({
      json: data,
      headers: {
        "content-range": `0-${data.length ? data.length - 1 : 0}/${Array.isArray(data) ? data.length : 1}`,
      },
    });
  }
  if (u.hostname.endsWith("googleapis.com") || u.hostname.endsWith("gstatic.com")) return r.abort();
  blocked.push(u.pathname);
  return r.abort();
});
const card = (label) =>
  page
    .locator("article,div.rounded-xl,div.rounded-lg")
    .filter({ has: page.locator("p").filter({ hasText: new RegExp("^" + label + "$") }) })
    .last();
async function go(route) {
  await page.goto("http://127.0.0.1:3000/" + route);
}
async function checkValue(label, value) {
  const p = page
    .locator("p")
    .filter({ hasText: new RegExp("^" + label + "$") })
    .first();
  await p.waitFor();
  await page.waitForFunction(
    ({ label, value }) =>
      Array.from(document.querySelectorAll("p"))
        .find((p) => p.textContent === label)
        ?.parentElement?.textContent?.includes(value),
    { label, value },
  );
}
try {
  await go("auth");
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") +
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
    const r = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "mock-refresh",
    });
    if (r.error) throw r.error;
  }, token);
  await go("dashboard");
  await checkValue("Today Net Sales", "₹2,200");
  await checkValue("Profit", "₹800");
  await go("sales");
  await page.getByText("DEMO-001", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Return / exchange", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Return (good)", exact: true }).click();
  await page.getByText("Return saved. ₹2,200 reversed · ₹2,200 refunded.", { exact: true }).first().waitFor();
  await page.keyboard.press("Escape");
  const bill = page.locator("tr").filter({ hasText: "DEMO-001" });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("tbody tr")].some(
      (r) => r.textContent.includes("Returned amount") && r.textContent.includes("₹0"),
    ),
  );
  assert((await bill.innerText()).includes("Bill amount"));
  await page.screenshot({ path: out + "/sales-return.png" });
  await go("dashboard");
  await checkValue("Today Net Sales", "₹0");
  await checkValue("Profit", "₹0");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: out + "/dashboard-return-mobile.png", fullPage: true });
  await go("reports");
  await checkValue("Net sales", "₹0");
  await checkValue("Gross profit after returns", "₹0");
  await checkValue("Refunds", "₹2,200");
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csv = await csvEvent;
  const csvText = await fs.readFile(await csv.path(), "utf8");
  assert(csvText.includes("net_sales"));
  assert(csvText.includes("return"));
  assert(csvText.includes("-2200"));
  await fs.writeFile(out + "/reports.csv", csvText);
  await go("accounting");
  await checkValue("Net sales", "₹0");
  await checkValue("Net profit", "₹0");

  await go("sales");
  for (const design of ["Thermal", "A4", "Premium"]) {
    await page.evaluate(async (design) => {
      const { printBill } = await import("/src/lib/print.ts");
      await printBill("DEMO-001", design);
    }, design);
    const frame = page.frameLocator("iframe");
    await frame.getByText("Net after returns", { exact: true }).waitFor();
    assert((await frame.locator("body").innerText()).includes("Rs 0"));
    if (design === "A4") {
      await page.getByRole("button", { name: "Download PDF", exact: true }).waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent === "Download PDF" && !b.disabled,
        ),
      );
      const event = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download PDF", exact: true }).click();
      const download = await event;
      const bytes = await fs.readFile(await download.path());
      assert(bytes.subarray(0, 5).toString() === "%PDF-");
      await fs.writeFile(out + "/bill-return-A4.pdf", bytes);
    }
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  const message = await page.evaluate(async () => {
    const { billMessage } = await import("/src/lib/messages.ts");
    const { translateLocal } = await import("/src/lib/message-templates.ts");
    const text = billMessage({ shop: "Demo", billNo: "DEMO-001", total: 2200, returned: 2200 });
    return [text, translateLocal(text, "hindi")];
  });
  assert(message[0].includes("Net after returns: ₹0"));
  assert(message[1].includes("वापसी के बाद कुल: ₹0"));
  await go("khata");
  await page.getByRole("checkbox", { name: "Only with balance", exact: true }).uncheck();
  await page.getByRole("button", { name: /Demo Customer/ }).click();
  await page.getByText("Returned goods · DEMO-001", { exact: true }).waitFor();
  await page.getByText("Refund paid · DEMO-001", { exact: true }).waitFor();
  const ledgerEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const ledger = await ledgerEvent;
  const ledgerText = await fs.readFile(await ledger.path(), "utf8");
  assert(ledgerText.includes("Returned goods"));
  assert(ledgerText.includes("Refund paid"));
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page
    .frameLocator("iframe")
    .getByText("Returned goods · DEMO-001", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await go("customers");
  const customer = page.locator("tr").filter({ hasText: "Demo Customer" });
  await customer.waitFor();
  assert((await customer.innerText()).includes("₹0"));
  await customer.click();
  await page.getByRole("dialog").waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("p")].some(
      (p) => p.textContent === "Total spend" && p.parentElement.textContent.includes("₹0"),
    ),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await page.frameLocator("iframe").getByText("Customer Directory", { exact: true }).waitFor();
  const customerPdf = await page.frameLocator("iframe").locator("body").innerText();
  assert(customerPdf.includes("₹0"));
  await page.getByRole("button", { name: "Close", exact: true }).click();
  isReturn = false;
  refunded = 0;
  known = false;
  await go("dashboard");
  await checkValue("Today Net Sales", "₹2,200");
  await checkValue("Profit", "Purchase cost missing");
  await page.screenshot({ path: out + "/dashboard-missing-cost-mobile.png", fullPage: true });
  await go("reports");
  await checkValue("Net sales", "₹2,200");
  await checkValue("Gross profit after returns", "Purchase cost missing");
  await checkValue("Margin", "Purchase cost missing");
  await go("accounting");
  await checkValue("Net sales", "₹2,200");
  await checkValue("Net profit", "Purchase cost missing");
  const pdfButton = page.getByRole("button", { name: "PDF", exact: true });
  await pdfButton.click();
  await page.getByRole("dialog").waitFor();
  await page
    .frameLocator("iframe")
    .getByText("Purchase cost missing", { exact: true })
    .first()
    .waitFor();
  await page.keyboard.press("Escape");
  known = true;
  isReturn = true;
  pairQty = 2;
  refunded = 1100;
  await go("dashboard");
  await checkValue("Today Net Sales", "₹1,100");
  await checkValue("Profit", "₹400");
  await go("reports");
  await checkValue("Net sales", "₹1,100");
  await checkValue("Gross profit after returns", "₹400");
  saleDay = new Date(Date.now() - 91 * 86400000).toISOString();
  pairQty = 1;
  refunded = 2200;
  await go("dashboard");
  await checkValue("Today Net Sales", "₹-2,200");
  await checkValue("Profit", "₹-800");
  await go("reports");
  await checkValue("Net sales", "₹-2,200");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  assert.equal(writes.length, 1);
  const result = {
    result: "PASS",
    scope: "Synthetic HTTP data, real screens; no live database access",
    checks: [
      "2200 sale / 1400 cost = 800 profit",
      "return via Sales History -> net zero / profit zero",
      "Reports and Accounting net zero",
      "CSV includes negative return transaction",
      "customer lifetime spend excludes returns",
      "missing cost does not show revenue as profit",
      "accounting PDF carries missing-cost status",
      "partial 1100 return -> net 1100 / profit 400",
      "mobile dashboard overflow",
      "bill reprint return summary in Thermal / A4 / Premium",
      "downloaded A4 PDF is valid",
      "khata return/refund rows in CSV and PDF",
      "customer directory PDF uses net spend",
      "WhatsApp return lines retain Hindi translation",
      "old bill returned today yields negative current-period sales",
    ],
    errors,
    liveWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-5000));
  throw e;
} finally {
  await browser.close();
}
