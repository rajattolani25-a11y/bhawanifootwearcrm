import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/retail-browser";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const product = "10000000-0000-4000-8000-000000000001",
  variant = "20000000-0000-4000-8000-000000000001",
  replacement = "20000000-0000-4000-8000-000000000002",
  saleId = "30000000-0000-4000-8000-000000000001",
  itemId = "40000000-0000-4000-8000-000000000001";
const errors = [],
  unexpected = [],
  requests = [];
let customerFailure = false,
  lostResponse = false,
  createCalls = [],
  committed = new Map(),
  positions = [{ variant_id: variant, size: "7", qty: 1 }],
  returns = [],
  imports = [],
  ordersError = false;
const settings = {
  id: 1,
  business_name: "Demo Footwear",
  business_phone: "",
  business_address: "",
  daily_target: 10000,
  bill_design: "Thermal",
  default_bill_type: "gst",
  default_gst_rate: 5,
  default_tax_mode: "exclusive",
  thermal_width: "80",
  upi_id: "",
};
const variants = [
  {
    id: variant,
    product_id: product,
    size: "7",
    stock: 5,
    min_stock: 1,
    damaged_stock: 0,
    barcode: "DEMO7",
    sku: "SKU7",
    rack: "A",
  },
  {
    id: replacement,
    product_id: product,
    size: "8",
    stock: 4,
    min_stock: 1,
    damaged_stock: 0,
    barcode: "DEMO8",
    sku: "SKU8",
    rack: "B",
  },
];
const pair = {
  id: product,
  brand: "Demo",
  article: "Audit Pair",
  category: "Sports",
  color: "Black",
  gender: "Unisex",
  selling_price: 999,
  mrp: 1200,
  status: "Active",
  created_at: "2026-01-01T00:00:00Z",
  image_url: null,
  catalog_visible: true,
  product_variants: variants,
};
const item = {
  id: itemId,
  product_name: "Audit Pair",
  size: "7",
  qty: 1,
  price: 2200,
  variant_id: variant,
};
const sale = {
  id: saleId,
  bill_no: "DEMO-001",
  sale_date: new Date().toISOString(),
  customer_name: "Demo Customer",
  payment_mode: "Cash",
  total: 2200,
  due_amount: 0,
  customers: { mobile: "9999999999" },
  sale_items: [item],
};
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/*", (s) => s.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url()),
    method = r.request().method(),
    path = u.pathname;
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (path.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!path.startsWith("/rest/v1/")) return r.abort();
  requests.push({ path, search: u.search, method });
  const body = method === "POST" ? r.request().postDataJSON() : null;
  if (path.endsWith("/rpc/operational_safety_version")) return r.fulfill({ json: 40 });
  if (path.endsWith("/rpc/retail_integrity_version")) return r.fulfill({ json: 32 });
  if (path.endsWith("/rpc/expire_catalog_bookings")) return r.fulfill({ json: 0 });
  if (path.endsWith("/rpc/sale_return_positions")) return r.fulfill({ json: positions });
  if (path.endsWith("/rpc/return_cost_reversals"))
    return r.fulfill({
      json: returns.map((r) => ({ id: r.id, cost_reversal: r.cost_reversal ?? 0 })),
    });
  if (path.endsWith("/rpc/create_sale")) {
    createCalls.push(body);
    const key = body._sale.request_id;
    if (!committed.has(key))
      committed.set(key, {
        bill_no: "RECOVERED-001",
        sale_id: saleId,
        stamp_regular: false,
        unlocked: [],
      });
    if (lostResponse) {
      lostResponse = false;
      return r.abort("failed");
    }
    return r.fulfill({ json: committed.get(key) });
  }
  if (path.endsWith("/rpc/process_sale_return")) {
    assert.equal(body._sale_item_id, itemId);
    assert(body._operation_id);
    if (body._kind === "exchange") {
      assert.equal(body._replacement_variant_id, replacement);
      positions = [{ variant_id: replacement, size: "8", qty: 1 }];
      returns.push({
        id: "return1",
        sale_id: saleId,
        sale_item_id: itemId,
        kind: "exchange",
        qty: 1,
        refund: 0,
        replacement_variant_id: replacement,
      });
    } else {
      assert.equal(body._variant_id, replacement);
      assert.equal(body._refund_mode, "UPI");
      positions = [];
      returns.push({
        id: "return2",
        sale_id: saleId,
        sale_item_id: itemId,
        kind: "return",
        qty: 1,
        refund: 2200,
        replacement_variant_id: null,
      });
    }
    return r.fulfill({
      json: {
        refund: body._kind === "exchange" ? 0 : 2200,
        payout: body._kind === "exchange" ? 0 : 2200,
        replacement_size: "8",
      },
    });
  }
  if (path.endsWith("/rpc/import_stock_csv")) {
    imports.push(body);
    return r.fulfill({
      json: {
        rows: body._rows.length,
        plan: body._rows.map((r) => ({
          brand: r.brand,
          article: r.article,
          size: r.size,
          before: 5,
          after: 7,
          delta: 2,
        })),
      },
    });
  }
  if (path.endsWith("/customers") && customerFailure)
    return r.fulfill({
      status: 500,
      json: { code: "XX000", message: "Synthetic customer lookup failure" },
    });
  if (method !== "GET" && method !== "HEAD") {
    unexpected.push(path);
    return r.abort();
  }
  let data = [],
    total = 0;
  if (path.endsWith("/user_roles")) data = [{ role: "owner" }];
  if (path.endsWith("/products")) data = [pair];
  if (path.endsWith("/product_variants")) data = variants;
  if (path.endsWith("/store_settings")) data = settings;
  if (path.endsWith("/sales")) data = [sale];
  if (path.endsWith("/sale_returns")) data = returns;
  const offset = Number(u.searchParams.get("offset") ?? 0),
    limit = Number(u.searchParams.get("limit") ?? 50);
  if (path.endsWith("/catalog_bookings")) {
    if (ordersError)
      return r.fulfill({
        status: 500,
        json: { code: "XX000", message: "Synthetic orders failure" },
      });
    assert(u.searchParams.get("status")?.includes("pending"));
    total = 101;
    data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      id: "order" + (offset + i),
      booking_no: offset + i === 100 ? "OLDEST-PENDING" : "ORDER-" + (offset + i),
      product_name: "Audit Pair",
      size: "7",
      customer_name: "Demo",
      mobile: "0000000000",
      price: 999,
      advance: 300,
      status: "pending",
      created_at: "2025-01-01T00:00:00Z",
      expires_at: "2030-01-01T00:00:00Z",
      fulfillment: "pickup",
    }));
  }
  if (path.endsWith("/stock_movements")) {
    total = 101;
    data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      id: "move" + (offset + i),
      moved_at: "2026-01-01T00:00:00Z",
      type: "CSV-ADD",
      product_name: "Movement " + (offset + i),
      qty_in: 2,
      qty_out: 0,
      note: "Audit",
      product_variants: { size: "7" },
    }));
  }
  if (path.endsWith("/coupons")) {
    total = 101;
    data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      id: "coupon" + (offset + i),
      code: "CODE" + (offset + i),
      title: "Demo",
      kind: "fixed",
      value: 100,
      min_bill: 0,
      used_count: 0,
      usage_limit: null,
      active: true,
    }));
  }
  if (!total) total = Array.isArray(data) ? data.length : 1;
  return r.fulfill({
    json: data,
    headers: {
      "access-control-expose-headers": "content-range",
      "content-range": `${offset}-${Math.max(offset, offset + (Array.isArray(data) ? data.length : 1) - 1)}/${total}`,
    },
  });
});
async function go(route) {
  await page.goto("http://127.0.0.1:3000/" + route);
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
    await supabase.auth.setSession({ access_token: token, refresh_token: "mock-refresh" });
  }, token);
  await go("pos");
  await page
    .getByRole("button", { name: "Demo Audit Pair, size 7, 5 in stock", exact: true })
    .click();
  // One stored amount with paise must be visible in billing.
  await page.getByText("₹1,048.95", { exact: true }).first().waitFor();
  customerFailure = true;
  await page.getByPlaceholder("F4 · Customer mobile").fill("9999999999");
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await page
    .getByText(/Customer lookup failed/)
    .first()
    .waitFor();
  assert.equal(createCalls.length, 0);
  customerFailure = false;
  await page.getByRole("button", { name: "Walk-in", exact: true }).click();
  lostResponse = true;
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await page.getByRole("heading", { name: "Confirm the last bill" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Confirm the last bill" }).waitFor();
  await page.getByRole("button", { name: "Retry / recover bill" }).click();
  await page.getByRole("heading", { name: "Bill saved" }).waitFor();
  assert.equal(committed.size, 1);
  assert.equal(createCalls.length, 2);
  assert.deepEqual(createCalls[0], createCalls[1]);
  await go("sales");
  await page.getByRole("button", { name: "Return / exchange", exact: true }).click();
  await page.getByLabel("Replacement size for Audit Pair size 7").selectOption(replacement);
  await page.getByRole("button", { name: "Exchange size", exact: true }).click();
  await page.getByText(/Current size 8/).waitFor();
  assert.equal(committed.size, 1);
  await page.getByRole("combobox", { name: "Actual refund method" }).selectOption("UPI");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Return (good)", exact: true }).click();
  await page.getByText("No pairs remain returnable.").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/return-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("products");
  await page
    .locator('input[type=file][accept=".csv"]')
    .setInputFiles({
      name: "stock.csv",
      mimeType: "text/csv",
      buffer: Buffer.from('brand,article,size,qty\n"ACME ""Pro""","Line one\nLine two",7,2'),
    });
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await page.getByRole("button", { name: "Confirm import" }).click();
  assert.equal(imports.length, 2);
  assert.equal(imports[0]._preview, true);
  assert.equal(imports[1]._preview, false);
  assert.equal(imports[1]._rows[0].brand, 'ACME "Pro"');
  assert.equal(imports[1]._rows[0].article, "Line one\nLine two");
  await go("bookings");
  await page.getByText("ORDER-0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("ORDER-50", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("OLDEST-PENDING", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Next", exact: true }).isDisabled());
  await go("stock-ledger");
  await page.getByText("Movement 0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Movement 50", { exact: true }).waitFor();
  await go("coupons");
  await page.getByRole("button", { name: "CODE0", exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "CODE50", exact: false }).first().waitFor();
  await page.screenshot({ path: out + "/coupons-desktop.png", fullPage: true });
  ordersError = true;
  await go("bookings");
  await page.getByText(/Orders could not be loaded/).waitFor();
  assert.equal(await page.getByText("No bookings here.", { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const result = {
    result: "PASS",
    checks: [
      "customer lookup failure stops sale",
      "paise visible in POS",
      "lost response + reload recovered same bill",
      "size swap without new sale; return selected replacement with UPI",
      "CSV escaped/multiline preview and confirmation",
      "old pending order reachable on page 3",
      "ledger and coupons pagination",
      "orders errors do not display false empty state",
    ],
    liveWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
