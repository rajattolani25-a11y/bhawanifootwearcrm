import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(15000);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const v = "20000000-0000-4000-8000-000000000001",
  date = new Date().toISOString(),
  errors = [],
  completed = [],
  refunds = [],
  checks = [];
const bookings = ["outside", "pickup", "cancel"].map((kind, i) => ({
  id: `40000000-0000-4000-8000-00000000000${i + 1}`,
  booking_no: `DEMO-${kind.toUpperCase()}`,
  variant_id: v,
  product_name: "Demo Sports Pair",
  size: "7",
  customer_name: "Demo Buyer",
  mobile: "9999999999",
  price: 1000,
  advance: kind === "outside" ? 1080 : 300,
  delivery_charge: kind === "outside" ? 80 : 0,
  fulfillment: kind === "outside" ? "outside" : "pickup",
  status: kind === "outside" ? "pending" : "confirmed",
  receipt_recorded: kind !== "outside",
  created_at: date,
  expires_at: new Date(Date.now() + 1800000).toISOString(),
  address: kind === "outside" ? "Demo city delivery" : null,
  area: null,
  note: null,
}));
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/*", (s) => s.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!u.pathname.startsWith("/rest/v1/")) return r.abort();
  let data = [];
  if (u.pathname.endsWith("/user_roles")) data = [{ role: "owner" }];
  if (u.pathname.endsWith("/store_settings"))
    data = {
      id: 1,
      business_name: "Demo Store",
      gstin: null,
      default_bill_type: "simple",
      default_gst_rate: 5,
      bill_design: "Thermal",
    };
  if (u.pathname.endsWith("/rpc/expire_catalog_bookings")) data = 0;
  if (u.pathname.endsWith("/rpc/confirm_catalog_booking")) {
    const b = bookings.find((b) => b.id === r.request().postDataJSON()._id);
    b.receipt_recorded = true;
    b.status = "confirmed";
    data = null;
  }
  if (u.pathname.endsWith("/rpc/complete_catalog_booking")) {
    const body = r.request().postDataJSON();
    completed.push(body);
    const b = bookings.find((b) => b.id === body._id);
    b.status = b.fulfillment === "pickup" ? "picked" : "delivered";
    data = {
      sale_id: "50000000-0000-4000-8000-000000000001",
      bill_no: "DEMO-BILL-" + completed.length,
    };
  }
  if (u.pathname.endsWith("/rpc/cancel_catalog_booking")) {
    bookings.find((b) => b.id === r.request().postDataJSON()._id).status = "refund_pending";
    data = null;
  }
  if (u.pathname.endsWith("/rpc/record_catalog_refund")) {
    const body = r.request().postDataJSON();
    refunds.push(body);
    bookings.find((b) => b.id === body._id).status = "refunded";
    data = { refunded: 300 };
  }
  if (u.pathname.endsWith("/catalog_bookings"))
    data = bookings.filter(
      (b) =>
        u.searchParams.get("status")?.includes('"' + b.status + '"') ||
        u.searchParams.get("status")?.split(/[(),]/).includes(b.status),
    );
  // Printing is covered separately. Return a valid empty lookup to surface its
  // explicit not-found toast without ever fetching or changing a real bill.
  if (u.pathname.endsWith("/sales")) data = [];
  if (r.request().method() !== "GET" && !u.pathname.includes("/rpc/"))
    throw Error("Unexpected direct write " + u.pathname);
  return r.fulfill({
    json: data,
    headers: {
      "content-range":
        Array.isArray(data) && data.length ? `0-${data.length - 1}/${data.length}` : "*/0",
    },
  });
});
async function go() {
  await page.goto("http://127.0.0.1:3000/bookings");
}
const card = (no) =>
  page
    .locator("div.rounded-lg.border.bg-card.p-4")
    .filter({ has: page.getByText(no, { exact: true }) });
try {
  await page.goto("http://127.0.0.1:3000/auth");
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
  await go();
  page.on("dialog", (d) => d.accept("Customer requested cancellation"));
  await card("DEMO-OUTSIDE").getByRole("button", { name: "Payment received", exact: true }).click();
  await page.getByRole("button", { name: "To fulfil", exact: true }).click();
  await card("DEMO-OUTSIDE")
    .getByRole("button", { name: "Delivered — make bill", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("GST % (price includes GST)").waitFor();
  await page.waitForTimeout(100);
  assert.equal(await d.getByLabel("GST % (price includes GST)").inputValue(), "0");
  await d.getByRole("button", { name: "Complete bill", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  assert.equal(completed[0]._sale.total, 1080);
  assert.equal(completed[0]._sale.delivery_charge, 80);
  assert.equal(completed[0]._items[0].price, 1000);
  assert.equal(completed[0]._sale.bill_type, "simple");
  assert.equal(completed[0]._sale.payment_mode, "UPI");
  checks.push(
    "Outside delivery: manual receipt → no-GST default bill1080 including80delivery; original physical item1000",
  );
  await card("DEMO-PICKUP").getByRole("button", { name: "Make bill", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Complete bill", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  assert.equal(completed[1]._sale.payment_mode, "Split");
  assert.equal(completed[1]._sale.split_cash, 700);
  assert.equal(completed[1]._sale.total, 1000);
  checks.push("Pickup:300UPI prepaid plus700Cash generates one correctly split invoice");
  await card("DEMO-CANCEL").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancelled", exact: true }).click();
  await card("DEMO-CANCEL")
    .getByRole("button", { name: "Record completed refund", exact: true })
    .click();
  d = page.getByRole("dialog");
  assert(await d.getByRole("button", { name: "Record refund", exact: true }).isDisabled());
  await d.getByRole("textbox").fill("DEMO-UTR-321");
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "Record refund", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  assert.equal(refunds[0]._reference, "DEMO-UTR-321");
  assert.match(refunds[0]._request_id, /^[a-f0-9-]{36}$/i);
  checks.push(
    "Paid cancel requires refund-pending stage, owner confirmation/reference and deduplicated saved request",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", checks, productionWrites: 0, errors }));
} catch (e) {
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
