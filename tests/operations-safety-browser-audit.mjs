import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AUDIT_OUT || "/tmp/solestack-audit/operations-safety";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01",
};
const products = [],
  moves = [],
  purchases = [],
  added = [],
  errors = [],
  saleCalls = [],
  receiptCalls = [];
const seenReceipts = new Map();
let ownerAccess = true;
let loseReceipt = false,
  delayAlpha = false,
  releaseAlpha = null,
  alphaStarted = false;
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/*", (s) => s.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!u.pathname.startsWith("/rest/v1/")) return r.abort();
  let data = [];
  const method = r.request().method();
  if (u.pathname.endsWith("/rpc/retail_integrity_version")) data = 32;
  if (u.pathname.endsWith("/rpc/operational_safety_version")) data = 40;
  if (u.pathname.endsWith("/customers") && u.searchParams.get("mobile")) {
    const mobile = u.searchParams.get("mobile").replace("eq.", "");
    if (mobile === "9999999991" && delayAlpha) {
      alphaStarted = true;
      await new Promise((resolve) => (releaseAlpha = resolve));
    }
    data = {
      id:
        mobile === "9999999991"
          ? "30000000-0000-4000-8000-000000000001"
          : "30000000-0000-4000-8000-000000000002",
      mobile,
      name: mobile === "9999999991" ? "Customer Alpha" : "Customer Beta",
      is_premium: false,
      regular_stamps: 0,
      premium_stamps: 0,
      last_stamp_date: null,
    };
  }
  if (u.pathname.endsWith("/rpc/create_sale")) {
    const b = r.request().postDataJSON();
    saleCalls.push(b);
    for (const it of b._items) {
      const p = products.find((p) => p.product_variants.some((v) => v.id === it.variant_id));
      p.product_variants.find((v) => v.id === it.variant_id).stock -= it.qty;
    }
    data = {
      bill_no: "SAFE-001",
      sale_id: "50000000-0000-4000-8000-000000000001",
      unlocked: [],
      stamp_regular: false,
    };
  }

  if (u.pathname.endsWith("/user_roles"))
    data = ownerAccess
      ? [{ role: "owner" }]
      : u.searchParams.get("role") === "eq.owner"
        ? null
        : [{ role: "staff" }];
  if (u.pathname.endsWith("/store_settings"))
    data = {
      id: 1,
      business_name: "Demo Store",
      daily_target: 10000,
      bill_design: "Thermal",
      thermal_width: "80",
    };
  if (u.pathname.endsWith("/products")) data = products;
  if (u.pathname.endsWith("/product_variants"))
    data = products.flatMap((p) =>
      p.product_variants.map((v) => ({
        ...v,
        products: { brand: p.brand, article: p.article, category: p.category },
      })),
    );
  if (u.pathname.endsWith("/stock_movements")) data = moves;
  if (u.pathname.endsWith("/purchases")) data = purchases;
  if (u.pathname.endsWith("/product_costs"))
    data = products.map((p) => ({ product_id: p.id, purchase_price: 500 }));
  if (u.pathname.endsWith("/rpc/quick_add_product")) {
    const b = r.request().postDataJSON();
    added.push(b);
    const id = crypto.randomUUID(),
      name = b._product.article;
    const vs = b._sizes.map((s) => ({
      id: crypto.randomUUID(),
      product_id: id,
      size: s.size,
      stock: s.qty,
      damaged_stock: 0,
      min_stock: 3,
      rack: "A",
      barcode: "DEMO" + name + s.size,
      sku: null,
    }));
    products.push({
      ...b._product,
      id,
      status: "Active",
      catalog_visible: false,
      image_url: null,
      created_at: new Date().toISOString(),
      product_variants: vs,
    });
    for (const v of vs)
      if (v.stock)
        moves.push({
          id: crypto.randomUUID(),
          moved_at: new Date().toISOString(),
          type: "QUICK-ADD",
          product_name: name,
          qty_in: v.stock,
          qty_out: 0,
          note: "Quick add",
          product_variants: { size: v.size },
        });
    data = { product_id: id, variants: vs.map((v) => ({ id: v.id, size: v.size })) };
  }
  if (u.pathname.endsWith("/rpc/receive_stock_v2")) {
    const b = r.request().postDataJSON();
    receiptCalls.push(b);
    assert.match(b._request_id, /^[a-f0-9-]{36}$/i);
    if (seenReceipts.has(b._request_id))
      return r.fulfill({ json: seenReceipts.get(b._request_id) });
    let total = 0;
    for (const l of b._items) {
      const p = products.find((p) => p.product_variants.some((v) => v.id === l.variant_id));
      const v = p.product_variants.find((v) => v.id === l.variant_id);
      v.stock += l.qty;
      total += l.qty;
      purchases.push({
        id: crypto.randomUUID(),
        purchase_date: new Date().toISOString(),
        supplier_name: "Demo",
        invoice_no: b._invoice,
        quantity: l.qty,
        purchase_price: l.price,
        total: l.qty * l.price,
        paid_amount: 0,
      });
      moves.push({
        id: crypto.randomUUID(),
        moved_at: new Date().toISOString(),
        type: "PURCHASE",
        product_name: p.article,
        qty_in: l.qty,
        qty_out: 0,
        note: b._invoice,
        product_variants: { size: v.size },
      });
    }
    data = total;
    seenReceipts.set(b._request_id, total);
    if (loseReceipt) {
      loseReceipt = false;
      return r.abort("failed");
    }
  }
  if (method !== "GET" && method !== "HEAD" && !u.pathname.includes("/rpc/"))
    throw Error("Unexpected write " + u.pathname);
  const n = Array.isArray(data) ? data.length : 1;
  return r.fulfill({
    json: data,
    headers: {
      "access-control-expose-headers": "content-range",
      "content-range": n ? `0-${n - 1}/${n}` : "*/0",
    },
  });
});
async function nav(name) {
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname ===
      "/" +
        {
          "POS Billing": "pos",
          Products: "products",
          "Inventory Control": "inventory-control",
          Barcodes: "barcodes",
          "Stock Ledger": "stock-ledger",
          Purchase: "purchase",
        }[name],
  );
}
async function quick(article, qty = 2) {
  const d = page.getByRole("dialog");
  await d.waitFor();
  const inputs = d.locator("input");
  await inputs.nth(0).fill("AUDIT");
  await inputs.nth(1).fill(article);
  await inputs.nth(3).fill("1000");
  await inputs.nth(5).fill("500");
  await d.getByRole("button", { name: "Men", exact: true }).click();
  await d.getByLabel("Subcategory (required)", { exact: true }).selectOption("Other");
  // Leave only size7 selected.
  for (const size of ["6", "8", "9", "10"]) {
    const b = d.getByRole("button", { name: size, exact: true });
    if ((await b.getAttribute("class")).includes("bg-primary")) await b.click();
  }
  if (await d.getByLabel("Pairs for size 7", { exact: true }).count())
    await d.getByLabel("Pairs for size 7", { exact: true }).fill(String(qty));
  await d.getByRole("button", { name: "Save & add", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
const checks = [];
try {
  await page.goto("http://127.0.0.1:3000/auth");
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
    await supabase.auth.setSession({ access_token: token, refresh_token: "mock" });
  }, token);
  await page.goto("http://127.0.0.1:3000/products");
  await page.getByRole("button", { name: /^Quick add/ }).click();
  await quick("CrossScreen Pair");
  await page.getByText("CrossScreen Pair", { exact: true }).first().waitFor();
  assert.equal(
    products[0].product_variants.reduce((n, v) => n + v.stock, 0),
    2,
  );
  await nav("POS Billing");
  await page
    .getByRole("button", { name: "AUDIT CrossScreen Pair, size 7, 2 in stock", exact: true })
    .waitFor();
  checks.push("Products Quick Add → POS size7 and stock2 without full reload");
  await page.getByRole("button", { name: /^Quick add/ }).click();
  await quick("Counter Pair", 1);
  await page
    .getByRole("button", { name: "AUDIT Counter Pair, size 7, 1 in stock", exact: true })
    .waitFor();
  checks.push("Counter Quick Add → immediate POS card");

  // An older customer's lookup must not overwrite the most recent phone.
  const mobile = page.getByPlaceholder("F4 · Customer mobile");
  delayAlpha = true;
  await mobile.fill("9999999991");
  for (let i = 0; i < 100 && !alphaStarted; i++) await page.waitForTimeout(20);
  assert(alphaStarted);
  await mobile.fill("9999999992");
  await page.getByText("Customer Beta", { exact: true }).waitFor();
  releaseAlpha();
  await page.waitForTimeout(180);
  assert.equal(await page.getByText("Customer Alpha", { exact: true }).count(), 0);
  checks.push("Old customer response cannot replace the latest customer");
  await page
    .getByRole("button", { name: "AUDIT CrossScreen Pair, size 7, 2 in stock", exact: true })
    .click();
  await page.getByLabel("Amount received", { exact: true }).fill("-100");
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await page.getByText("Enter a valid non-negative amount received", { exact: true }).waitFor();
  assert.equal(saleCalls.length, 0);
  checks.push("Negative received amount stops before create_sale");
  products[0].selling_price = 1100;
  await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    for (const ch of supabase.getChannels())
      for (const binding of ch.bindings.postgres_changes || []) binding.callback({});
  });
  await page.getByRole("button", { name: "Refresh cart prices", exact: true }).waitFor();
  await page.getByLabel("Amount received", { exact: true }).fill("");
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  assert.equal(saleCalls.length, 0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Refresh cart prices", exact: true }).click();
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await page.getByRole("heading", { name: "Bill saved", exact: true }).waitFor();
  assert.equal(saleCalls[0]._sale.total, 1100);
  await page.keyboard.press("Escape");
  checks.push("Changed prices require explicit cart review and then bill at the current total");
  await nav("Products");
  await page.getByText("Counter Pair", { exact: true }).first().waitFor();
  checks.push("Counter Quick Add → Products list via client navigation");
  await nav("Inventory Control");
  await page.getByText("CrossScreen Pair", { exact: true }).waitFor();
  await page.getByText("Counter Pair", { exact: true }).waitFor();
  checks.push("Both entry points → Inventory Control low-stock sizes");
  await nav("Barcodes");
  await page.getByText("CrossScreen Pair", { exact: true }).first().waitFor();
  await page.getByText("Counter Pair", { exact: true }).first().waitFor();
  checks.push("Both entry points → barcode/QR label selection");
  await nav("Stock Ledger");
  await page.getByRole("cell", { name: "QUICK-ADD", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("cell", { name: "QUICK-ADD", exact: true }).count(), 2);
  checks.push("Both entry points → stock movement rows");
  await nav("Purchase");
  await page.getByRole("button", { name: "New article", exact: true }).click();
  await quick("Received Pair");
  assert(added.at(-1)._sizes.every((v) => v.qty === 0));
  const before = products.at(-1).product_variants.reduce((n, v) => n + v.stock, 0);
  assert.equal(before, 0);
  loseReceipt = true;
  await page.getByRole("button", { name: /^Receive stock$/i }).click();
  await page.getByRole("button", { name: "Retry saved request", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Retry saved request", exact: true }).click();
  await page
    .getByText("Saved transaction confirmed. Check its history before making another entry.", {
      exact: true,
    })
    .waitFor();
  assert.equal(receiptCalls.length, 2);
  assert.deepEqual(receiptCalls[0], receiptCalls[1]);
  checks.push(
    "Receiving lost response + reload retries the exact same saved request without duplicate stock",
  );
  assert.equal(
    products.at(-1).product_variants.reduce((n, v) => n + v.stock, 0),
    1,
  );
  await nav("POS Billing");
  await page
    .getByRole("button", { name: "AUDIT Received Pair, size 7, 1 in stock", exact: true })
    .waitFor();
  checks.push("Purchase New article qty0 → Receive qty1 → POS qty1, without double addition");
  await nav("Stock Ledger");
  await page.getByRole("cell", { name: "PURCHASE", exact: true }).waitFor();
  checks.push("Purchase receipt → stock ledger movement");
  ownerAccess = false;
  for (const path of ["reports", "accounting", "purchase", "suppliers", "inventory-control"]) {
    await page.goto("http://127.0.0.1:3000/" + path);
    await page.waitForURL((url) => url.pathname === "/pos");
  }
  checks.push(
    "Staff direct URLs for Reports, Accounting, Purchase, Suppliers and Inventory Control redirect to POS",
  );
  assert.deepEqual(errors, []);
  const result = {
    result: "PASS",
    scope:
      "Actual authenticated UI and real client navigation; synthetic RPC/storage responses, not proof of live delivery",
    checks,
    createdProducts: products.length,
    productionWrites: 0,
    errors,
  };
  await fs.writeFile(out + "/cross-screen-browser.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await page.screenshot({ path: out + "/cross-screen-harness-failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
