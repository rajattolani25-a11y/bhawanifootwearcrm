import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/category-browser";
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
const profileWrites = [];
const categoryWrites = [],
  addedProducts = [];
let wasVoided = false;
let currentRole = "owner";
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
  category: "Ladies",
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
  if (path.startsWith("/storage/v1/object/list/")) return r.fulfill({ json: [] });
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
  if (path.endsWith("/products") && method === "PATCH") {
    const patch = r.request().postDataJSON();
    assert(
      Object.keys(patch).every((k) =>
        [
          "category",
          "article",
          "brand",
          "color",
          "catalog_description",
          "mrp",
          "selling_price",
        ].includes(k),
      ),
    );
    if ("color" in patch) {
      const expected = pair.color === null ? "is.null" : "eq." + pair.color;
      profileWrites.push(patch);
      if (
        u.searchParams.get("color") !== expected ||
        u.searchParams.get("mrp") !== "eq." + pair.mrp ||
        u.searchParams.get("selling_price") !== "eq." + pair.selling_price
      )
        return r.fulfill({
          status: 406,
          json: { code: "PGRST116", message: "Product changed since opening" },
        });
    }
    Object.assign(pair, patch);
    if (patch.category) categoryWrites.push(pair.category);
    return r.fulfill({ json: pair });
  }
  if (path.endsWith("/rpc/edit_product_variant")) {
    assert.equal(body._product_id, product);
    assert.equal(body._size, "10");
    assert.equal(body._stock, 2);
    assert.equal(body._reason, "Opening size");
    variants.push({
      id: "new-size-10",
      product_id: product,
      size: "10",
      stock: 2,
      damaged_stock: 0,
      min_stock: 3,
      barcode: "NEW10",
      sku: null,
      rack: "",
    });
    return r.fulfill({ json: { id: "new-size-10", size: "10", stock: 2 } });
  }
  if (path.endsWith("/rpc/void_sale")) {
    assert.equal(body._confirmation, "DEMO-001");
    assert.equal(body._payment_settled, true);
    wasVoided = true;
    return r.fulfill({ json: { voided: true } });
  }
  if (path.endsWith("/rpc/list_void_sales"))
    return r.fulfill({
      json: {
        rows: wasVoided
          ? [
              {
                id: saleId,
                bill_no: "DEMO-001",
                total: 2200,
                voided_at: new Date().toISOString(),
                void_reason: "Duplicate entry",
              },
            ]
          : [],
        count: wasVoided ? 1 : 0,
      },
    });
  if (path.endsWith("/rpc/quick_add_product")) {
    addedProducts.push(body);
    return r.fulfill({
      json: {
        product_id: product,
        variants: body._sizes.map((s) => ({ id: variant, size: s.size })),
      },
    });
  }
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
  if (path.endsWith("/user_roles")) data = [{ role: currentRole }];
  if (path.endsWith("/products"))
    data = r.request().headers().accept?.includes("object") ? pair : [pair];
  if (path.endsWith("/product_variants")) data = variants;
  if (path.endsWith("/store_settings")) data = settings;
  if (path.endsWith("/sales")) data = wasVoided ? [] : [sale];
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
  await go("products");
  await page.getByRole("button", { name: "Quick add", exact: false }).first().click();
  const inputs = page.getByRole("dialog").locator("input");
  await inputs.nth(0).fill("Demo");
  await inputs.nth(1).fill("New Pair");
  await inputs.nth(3).fill("999");
  await page.getByRole("button", { name: "Save & add", exact: true }).click();
  await page.getByText("Choose a product category", { exact: true }).waitFor();
  assert.equal(addedProducts.length, 0);
  await page.getByRole("dialog").getByRole("button", { name: "Women", exact: true }).click();
  const sub = page.getByLabel("Subcategory (required)", { exact: true });
  assert.equal(await sub.locator("option").count(), 7);
  assert.equal(await sub.locator("option").last().textContent(), "Other");
  await page.getByRole("button", { name: "Save & add", exact: true }).click();
  await page.getByText("Choose a subcategory, or select Other", { exact: true }).first().waitFor();
  assert.equal(addedProducts.length, 0);
  await sub.selectOption("Other");
  await page.getByRole("button", { name: "Save & add", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(addedProducts[0]._product.category, "Women / Other");
  await page.getByRole("button", { name: "Photos", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Product category", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Product category", exact: true }).inputValue(),
    "Women",
  );
  await page
    .getByRole("combobox", { name: "Product subcategory", exact: true })
    .selectOption("Heels & Occasion");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await page.getByText("Product category saved", { exact: true }).waitFor();
  assert.equal(categoryWrites.at(-1), "Women / Heels & Occasion");
  await page.reload();
  await page.getByRole("button", { name: "Photos", exact: true }).first().click();
  assert.equal(
    await page.getByRole("combobox", { name: "Product subcategory", exact: true }).inputValue(),
    "Heels & Occasion",
  );
  await page
    .getByRole("textbox", { name: "Product name / article", exact: true })
    .fill("Edited Pair");
  await page.getByRole("textbox", { name: "Product colour", exact: true }).fill("Olive / Black");
  await page.getByRole("button", { name: "Save product details", exact: true }).click();
  await page.getByText("Product details saved", { exact: true }).waitFor();
  assert.equal(pair.article, "Edited Pair");
  assert.equal(pair.color, "Olive / Black");
  await page.reload();
  await page.getByRole("button", { name: "Photos", exact: true }).first().click();
  assert.equal(
    await page.getByRole("textbox", { name: "Product colour", exact: true }).inputValue(),
    "Olive / Black",
  );
  pair.color = "Updated elsewhere";
  await page.getByRole("textbox", { name: "Product colour", exact: true }).fill("Red");
  await page.getByRole("button", { name: "Save product details", exact: true }).click();
  await page
    .getByText(
      "Product could not be saved. Refresh if another owner edited it. Product changed since opening",
      { exact: true },
    )
    .waitFor();
  assert.equal(pair.color, "Updated elsewhere");
  await page.reload();
  await page.getByRole("button", { name: "Photos", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Product colour", exact: true }).fill("");
  await page.getByRole("button", { name: "Save product details", exact: true }).click();
  await page.getByText("Product details saved", { exact: true }).waitFor();
  assert.equal(pair.color, "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("dialog").evaluate((dialog) => {
    dialog.scrollTop = 0;
  });
  await page.screenshot({ path: out + "/owner-profile-prices-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const beforePrices = profileWrites.length;
  const price = page.getByRole("textbox", { name: "Product selling price", exact: true });
  const mrp = page.getByRole("textbox", { name: "Product MRP", exact: true });
  for (const invalid of ["", "-1", "0", "1200.01", "999.123", "Infinity", "1e3"]) {
    await price.fill(invalid);
    await page.getByRole("button", { name: "Save product details", exact: true }).click();
    await page
      .getByText(
        "Enter a selling price above zero and MRP at least equal to it, with up to two decimal places",
        { exact: true },
      )
      .first()
      .waitFor();
    assert.equal(profileWrites.length, beforePrices, "Invalid price must not reach the database");
  }
  await mrp.fill("1499");
  await price.fill("1099.50");
  await page.getByRole("button", { name: "Save product details", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Product selling price"]')?.value === "1099.5",
  );
  assert.equal(pair.mrp, 1499);
  assert.equal(pair.selling_price, 1099.5);
  assert.equal(item.price, 2200, "Old invoice prices must remain unchanged");
  assert.equal(variants[0].stock, 5, "Changing a profile must not change stock");
  await page.reload();
  await page.getByRole("button", { name: "Edit product", exact: true }).first().click();
  assert.equal(await price.inputValue(), "1099.5");
  assert.equal(await mrp.inputValue(), "1499");
  assert.equal(
    await page.getByRole("textbox", { name: "Product name / article", exact: true }).inputValue(),
    "Edited Pair",
  );
  pair.selling_price = 1150;
  await price.fill("1100");
  await page.getByRole("button", { name: "Save product details", exact: true }).click();
  await page
    .getByText(
      "Product could not be saved. Refresh if another owner edited it. Product changed since opening",
      { exact: true },
    )
    .first()
    .waitFor();
  assert.equal(pair.selling_price, 1150, "Stale editor cannot overwrite a newer price");
  await page.reload();
  await page.getByRole("button", { name: "Edit product", exact: true }).first().click();

  await page
    .getByRole("textbox", { name: "Product description", exact: true })
    .fill("Soft cushioning for everyday comfort.");
  await page.getByRole("button", { name: "Save description", exact: true }).click();
  await page.getByText("Product description saved", { exact: true }).waitFor();
  assert.equal(pair.catalog_description, "Soft cushioning for everyday comfort.");
  await page.getByRole("textbox", { name: "Size name", exact: true }).fill("10");
  await page.getByRole("textbox", { name: "Size stock", exact: true }).fill("2");
  await page
    .getByRole("textbox", { name: "Stock adjustment reason", exact: true })
    .fill("Opening size");
  await page.getByRole("button", { name: "Save size", exact: true }).click();
  await page.getByText("Size and stock saved", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/owner-category-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.keyboard.press("Escape");
  await go("sales");
  await page.getByRole("button", { name: "Cancel incorrect bill DEMO-001", exact: true }).click();
  assert(
    await page.getByRole("button", { name: "Confirm cancellation", exact: true }).isDisabled(),
  );
  await page
    .getByRole("textbox", { name: "Cancellation reason", exact: true })
    .fill("Duplicate entry");
  await page.getByRole("textbox", { name: "Confirm bill number", exact: true }).fill("DEMO-001");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await page.getByText("No bills.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancelled bills", exact: true }).click();
  await page
    .getByRole("heading", { name: "Cancelled bills · owner history", exact: true })
    .waitFor();
  await page.getByText("Duplicate entry", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await go("products");
  currentRole = "staff";
  await page.reload();
  await page.getByRole("button", { name: "Photos", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Product category", exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("textbox", { name: "Product colour", exact: true }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "Product MRP", exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("textbox", { name: "Product selling price", exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("button", { name: "Edit product", exact: true }).count(), 0);
  // Public catalog: real CatalogView, synthetic products, no backend requests or mutations.
  const cp = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  cp.on("pageerror", (e) => errors.push(e.message));
  const publicProducts = [
    ["Legacy Women", "Ladies"],
    ["Legacy Girls", "Girls"],
    ["Women Heels", "Women / Heels & Occasion"],
    ["Women Other", "Women / Other"],
    ["Men Sports", "Men / Sports & Active"],
    ["Legacy Men", "Gents"],
    ["Men Other", "Men / Other"],
  ].map(([article, category], i) => ({
    id: "p" + i,
    article,
    category,
    brand: "Demo",
    gender: null,
    color: null,
    price: 999,
    mrp: 999,
    image: null,
    sizes: [{ id: "v" + i, size: "7", available: true }],
  }));
  await cp.addInitScript(() => {
    window.__vite_plugin_react_preamble_installed__ = true;
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (t) => t;
  });
  await cp.route("**/*", async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.includes("/src/lib/catalog.functions.ts"))
      return r.fulfill({
        contentType: "application/javascript",
        body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop: { name: "Demo Footwear", phone: null, booking: false, local: false, outside: false }, products: publicProducts, hero: null, presentation: { gallery_enabled: false, category_accents: true, motion_enabled: false } })});export const getCatalogPhotos=async()=>({images:[],available:false});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>null;`,
      });
    if (u.pathname === "/categories.html")
      return r.fulfill({
        contentType: "text/html",
        body: await fs.readFile(
          new URL("./fixtures/presentation-catalog.html", import.meta.url),
          "utf8",
        ),
      });
    if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
    return r.abort();
  });
  await cp.goto("http://127.0.0.1:3000/categories.html");
  await cp.getByRole("button", { name: "Women", exact: true }).click();
  assert.equal(await cp.getByRole("button", { name: "Demo Legacy Women", exact: true }).count(), 1);
  assert.equal(await cp.getByRole("button", { name: "Demo Legacy Girls", exact: true }).count(), 1);
  assert.equal(await cp.getByRole("button", { name: "Demo Men Sports", exact: true }).count(), 0);
  assert.equal(await cp.getByRole("combobox", { name: "Subcategory", exact: true }).count(), 0);
  assert.equal(await cp.getByRole("combobox", { name: "Brand", exact: true }).count(), 0);
  const filter = cp.getByRole("combobox", { name: "Size", exact: true });
  assert.deepEqual(
    await filter.locator("optgroup").evaluateAll((groups) => groups.map((group) => group.label)),
    ["Women", "Girls"],
  );
  await filter.selectOption(JSON.stringify(["Women", "7"]));
  assert.equal(await cp.getByRole("button", { name: "Demo Women Heels", exact: true }).count(), 1);
  assert.equal(await cp.getByRole("button", { name: "Demo Legacy Girls", exact: true }).count(), 0);
  await cp.getByRole("button", { name: "Men", exact: true }).click();
  assert.equal(await filter.inputValue(), "All");
  assert.deepEqual(
    await filter.locator("optgroup").evaluateAll((groups) => groups.map((group) => group.label)),
    ["Men"],
  );
  assert.equal(await cp.getByRole("button", { name: "Demo Legacy Men", exact: true }).count(), 1);
  await filter.selectOption(JSON.stringify(["Men", "7"]));
  assert.equal(await cp.getByRole("button", { name: "Demo Men Other", exact: true }).count(), 1);
  await cp.screenshot({ path: out + "/catalog-subcategory-mobile.png", fullPage: true });
  assert.equal(
    await cp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await cp.goto("http://127.0.0.1:3000/categories.html?product=p2&size=7");
  await cp.getByRole("dialog").waitFor();
  assert.equal(
    await cp
      .getByRole("dialog")
      .getByRole("button", { name: "7", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const share = cp.getByRole("link", { name: "Share product on WhatsApp", exact: true });
  await share.waitFor();
  const wa = new URL(await share.getAttribute("href"));
  assert.equal(wa.hostname, "wa.me");
  assert.equal(wa.pathname, "/");
  const message = wa.searchParams.get("text");
  assert(message.includes("Demo Footwear"));
  assert(message.includes("Women Heels"));
  assert(message.includes("₹999"));
  const url = message.match(/https?:\/\/[^\s]+/)[0];
  assert.equal(new URL(url).searchParams.get("product"), "p2");
  assert.equal(new URL(url).searchParams.get("size"), "7");
  assert(!message.includes("0000000000"));
  assert(message.length < 300);
  await cp.screenshot({ path: out + "/product-share-mobile.png", fullPage: true });
  await cp.goto("http://127.0.0.1:3000/categories.html?product=not-public");
  await cp
    .getByText(
      "This shared product is currently unavailable. Please browse the collection or contact the store.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await cp.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const result = {
    result: "PASS",
    checks: [
      "category required on new product",
      "subcategory required for Men/Women",
      "sixth Other saved with department",
      "owner category edit and reload persistence",
      "staff category edit hidden",
      "legacy Ladies/Girls in Women and Gents in Men",
      "owner subcategory dropdowns retained; public Brand filter removed",
      "category-specific grouped sizes; Women and legacy Girls labelled separately; size resets between departments",
      "mobile owner and catalog layout",
      "owner article/colour/MRP/selling-price edits persist; invalid amounts blocked and stale colour/price conflicts rejected",
      "master profile edits preserve historical invoice prices and stock; staff price fields hidden",
      "description and size editing",
      "owner cancellation confirmation and separate audit history",
      "professional WhatsApp share link and selected-size deep link",
      "unavailable shared product falls back safely",
    ],
    productionWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
