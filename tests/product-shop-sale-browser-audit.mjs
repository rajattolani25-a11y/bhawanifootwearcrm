import assert from "node:assert/strict";
import fs from "node:fs/promises";
const out = "/tmp/solestack-audit/product-shop-sale";
await fs.mkdir(out, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const variants = [
  { id: "v7", size: "7", stock: 10, barcode: "OLD0007", sku: "SHARED", label_code: "SS1234567890" },
  { id: "v8", size: "8", stock: 5, barcode: "OLD0008", sku: "SHARED", label_code: "SS1234567891" },
  { id: "v9", size: "9", stock: 0, barcode: "OLD0009", sku: null, label_code: "SS1234567892" },
];
const products = [
  {
    id: "p1",
    brand: "Demo",
    article: "Scan Pair",
    status: "Active",
    category: "Men / Sports Shoes",
    color: "Black",
    selling_price: 999,
    mrp: 999,
    image_url: null,
    product_variants: variants,
  },
];
products.push(
  {
    ...products[0],
    id: "p2",
    article: "Other Pair",
    product_variants: [{ ...variants[0], id: "other-v" }],
  },
  {
    ...products[0],
    id: "p3",
    article: "Sold Out",
    product_variants: [{ ...variants[0], id: "out-v", stock: 0 }],
  },
  { ...products[0], id: "p4", article: "Archived", status: "Archived" },
);
const sales = [],
  requests = [];
const errors = [],
  unexpected = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.routeWebSocket("**/*", (s) => s.close());
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!u.pathname.startsWith("/rest/v1/")) return r.abort();
  requests.push({ path: u.pathname, method: r.request().method() });
  if (u.pathname.endsWith("/rpc/retail_integrity_version")) return r.fulfill({ json: 32 });
  if (u.pathname.endsWith("/rpc/operational_safety_version")) return r.fulfill({ json: 40 });
  if (u.pathname.endsWith("/rpc/create_sale")) {
    const body = r.request().postDataJSON();
    assert.equal(body._sale.payment_mode, "UPI");
    assert.equal(body._sale.total, 1998);
    assert.equal(body._sale.paid_amount, 1998);
    assert.equal(body._sale.due_amount, 0);
    assert.match(body._sale.request_id, /^[a-f0-9-]{36}$/);
    assert.equal(body._items.length, 1);
    assert.equal(body._items[0].variant_id, "v7");
    assert.equal(body._items[0].qty, 2);
    assert.equal(body._items[0].price, 999);
    sales.push(body);
    variants[0].stock -= 2;
    return r.fulfill({ json: { bill_no: "SHOP-001", stamp_regular: false, unlocked: [] } });
  }
  if (u.pathname.startsWith("/storage/v1/object/list/")) return r.fulfill({ json: [] });
  let data = [];
  if (u.pathname.endsWith("/user_roles")) data = [{ role: "owner" }];
  if (u.pathname.endsWith("/store_settings"))
    data = { id: 1, business_name: "Demo", default_bill_type: "simple", default_gst_rate: 0 };
  if (u.pathname.endsWith("/products")) data = products;
  if (u.pathname.endsWith("/rpc/expire_catalog_bookings")) data = 0;
  if (
    r.request().method() !== "GET" &&
    !["/rpc/expire_catalog_bookings", "/rpc/catalog_hero_storage_usage", "/rpc/store_usage"].some(
      (path) => u.pathname.endsWith(path),
    )
  ) {
    unexpected.push(u.pathname);
    return r.abort();
  }
  return r.fulfill({
    json: data,
    headers: {
      "content-range":
        Array.isArray(data) && data.length ? `0-${data.length - 1}/${data.length}` : "*/0",
    },
  });
});

try {
  await p.goto("http://127.0.0.1:3000/auth");
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
  await p.evaluate(async (token) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.setSession({ access_token: token, refresh_token: "mock" });
  }, token);
  await p.goto("http://127.0.0.1:3000/products");
  const shopLinks = p.getByRole("link", { name: "Record shop sale", exact: true });
  await shopLinks.first().waitFor();
  assert.equal(await shopLinks.count(), 2, "Only active stocked articles can start a shop sale");
  assert.equal(await p.getByRole("button", { name: "Edit product", exact: true }).count(), 4);
  assert((await shopLinks.first().getAttribute("href")).includes("product=p1"));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: out + "/products-mobile.png", fullPage: true });
  await shopLinks.first().click();
  await p.getByRole("heading", { name: "Scan Pair", exact: true }).waitFor();
  assert.equal(await p.getByRole("heading", { name: "Other Pair", exact: true }).count(), 0);
  assert.equal(sales.length, 0, "Opening the shortcut must not sell stock");
  assert.equal(variants[0].stock, 10);
  await p.getByText("Already billed in POS? Do not enter it again.", { exact: true }).waitFor();
  await p.screenshot({ path: out + "/shop-sale-mobile.png", fullPage: true });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await p.getByRole("button", { name: "Demo Scan Pair, size 7, 10 in stock", exact: true }).click();
  await p.getByRole("button", { name: "Cart 1", exact: true }).click();
  await p.getByRole("button", { name: "Increase Scan Pair size 7", exact: true }).click();
  await p.getByRole("button", { name: "UPI", exact: true }).click();
  assert.equal(sales.length, 0, "Choosing size/payment still requires explicit completion");
  await p.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await p.getByRole("heading", { name: "Bill saved", exact: true }).waitFor();
  assert.equal(sales.length, 1);
  assert.equal(variants[0].stock, 8);
  assert(!requests.some((r) => r.method === "PATCH"), "No direct stock or invoice writes");
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Products", exact: true }).click();
  await p
    .getByRole("button", { name: "Demo Scan Pair, size 7, 8 in stock", exact: true })
    .waitFor();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.getByRole("button", { name: "Demo Scan Pair, size 8, 5 in stock", exact: true }).click();
  await p.getByRole("button", { name: "Show all products", exact: true }).click();
  await p.getByRole("heading", { name: "Other Pair", exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: "Increase Scan Pair size 8", exact: true }).count(),
    1,
    "Show all keeps the current cart",
  );
  assert.equal(sales.length, 1);
  await p.screenshot({ path: out + "/shop-sale-desktop.png", fullPage: true });
  // A master price change must still stop an already prepared bill.
  products[0].selling_price = 1199;
  await p.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    for (const channel of supabase.getChannels())
      for (const binding of channel.bindings.postgres_changes || []) binding.callback({});
  });
  await p.getByRole("button", { name: "Refresh cart prices", exact: true }).waitFor();
  await p.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await p
    .getByText("Stock or prices changed. Review and refresh the cart.", { exact: true })
    .waitFor();
  assert.equal(sales.length, 1, "A stale cart price cannot create another sale");
  p.once("dialog", (dialog) => dialog.accept());
  await p.getByRole("button", { name: "Refresh cart prices", exact: true }).click();
  await p.getByRole("button", { name: /F8 · Complete Sale ₹1,199/ }).waitFor();
  assert.equal(variants[1].stock, 5, "Reviewing a new price never sells stock");
  await p.goto("http://127.0.0.1:3000/pos?product=missing");
  await p.getByText("No products found.", { exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: /^Increase / }).count(), 0);
  assert.equal(sales.length, 1, "Invalid link must not silently select or sell another product");
  await p.getByRole("button", { name: "Show all products", exact: true }).click();
  await p.getByRole("heading", { name: "Scan Pair", exact: true }).waitFor();
  assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const result = {
    passed: true,
    sales: sales.length,
    stockBefore: 10,
    stockAfter: 8,
    noAutomaticSale: true,
    explicitPayment: true,
    invalidProductSafe: true,
    preservedCart: true,
    staleCartPriceBlocked: true,
    viewportOverflow: false,
    liveWrites: false,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await b.close();
}
