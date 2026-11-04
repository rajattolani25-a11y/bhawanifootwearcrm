import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/product-colours";
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
p.setDefaultTimeout(30000);
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};

const sourceId = "10000000-0000-4000-8000-000000000001",
  whiteId = "10000000-0000-4000-8000-000000000002";
const makeVariant = (id, size, stock) => ({
  id,
  size,
  stock,
  min_stock: 1,
  damaged_stock: 0,
  sku: id,
  barcode: id,
  label_code: id,
  rack: "",
});
const black = {
  id: sourceId,
  brand: "DEMO",
  article: "Aero",
  category: "Men / Sports & Active",
  color: "Black",
  status: "Active",
  mrp: 2999,
  selling_price: 2199,
  image_url: null,
  catalog_visible: true,
  product_variants: [makeVariant("black7", "7", 2), makeVariant("black8", "8", 3)],
};
const products = [black];
const errors = [],
  writes = [],
  created = [],
  uploaded = [];
let role = "owner";
p.on("pageerror", (e) => errors.push(e.message));
await p.routeWebSocket("**/*", (s) => s.close());
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url()),
    method = r.request().method(),
    path = u.pathname;
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  if (path.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (path.startsWith("/storage/v1/object/list/")) {
    const body = r.request().postDataJSON();
    const found = uploaded.filter((path) => path.startsWith(body.prefix + "/"));
    return r.fulfill({ json: found.map((path) => ({ id: path, name: path.split("/").pop() })) });
  }
  if (path.startsWith("/storage/v1/object/sign/") && method === "POST")
    return r.fulfill({
      json: r
        .request()
        .postDataJSON()
        .paths.map((path) => ({
          path,
          signedURL: "/object/sign/product-images/" + path + "?token=mock",
        })),
    });
  if (path.startsWith("/storage/v1/object/product-images/") && method === "POST") {
    assert(path.includes(whiteId), "A new colour photo must not overwrite its parent folder");
    uploaded.push(path.split("/product-images/")[1]);
    return r.fulfill({ json: { Key: path } });
  }
  if (path.startsWith("/storage/v1/object/sign/product-images/") && method === "GET")
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="white"/></svg>',
    });
  if (!path.startsWith("/rest/v1/")) return r.abort();
  const body = method === "POST" ? r.request().postDataJSON() : null;
  if (path.endsWith("/rpc/retail_integrity_version")) return r.fulfill({ json: 32 });
  if (path.endsWith("/rpc/operational_safety_version")) return r.fulfill({ json: 40 });
  if (path.endsWith("/rpc/expire_catalog_bookings")) return r.fulfill({ json: 0 });
  if (path.endsWith("/rpc/quick_add_product")) {
    created.push(body);
    assert.equal(body._product.article, "Aero");
    assert.equal(body._product.brand, "DEMO");
    assert.equal(body._product.color, "White");
    assert.equal(body._product.mrp, 2999);
    assert.equal(body._product.selling_price, 2199);
    assert.equal(body._cost, null);
    assert.deepEqual(body._sizes, [
      { size: "7", qty: 0 },
      { size: "8", qty: 0 },
    ]);
    const white = {
      ...black,
      id: whiteId,
      color: "White",
      image_url: null,
      catalog_visible: false,
      product_variants: [makeVariant("white7", "7", 0), makeVariant("white8", "8", 0)],
    };
    products.push(white);
    return r.fulfill({
      json: { product_id: whiteId, variants: white.product_variants, existing: false },
    });
  }
  if (path.endsWith("/rpc/create_sale")) {
    assert.equal(body._items[0].variant_id, "white7");
    assert.equal(body._items[0].price, 2199);
    assert.equal(body._items[0].qty, 1);
    assert(body._items[0].product_name.includes("White"));
    products[1].product_variants[0].stock -= 1;
    writes.push("white-bill");
    return r.fulfill({ json: { bill_no: "COLOUR-BILL-001", stamp_regular: false, unlocked: [] } });
  }
  if (path.endsWith("/rpc/edit_product_variant")) {
    assert.equal(body._product_id, whiteId);
    assert.equal(body._variant_id, "white7");
    assert.equal(body._expected_stock, 0);
    assert.equal(body._stock, 3);
    assert.equal(body._reason, "Opening white stock");
    products[1].product_variants[0].stock = 3;
    writes.push("guarded-size-stock");
    return r.fulfill({ json: { id: "white7", size: "7", stock: 3 } });
  }
  if (path.endsWith("/products") && method === "PATCH") {
    const change = r.request().postDataJSON();
    assert.equal(u.searchParams.get("id"), "eq." + whiteId);
    assert(Object.keys(change).every((key) => ["image_url", "catalog_visible"].includes(key)));
    Object.assign(products[1], change);
    writes.push("white-profile");
    return r.fulfill({ json: { id: whiteId } });
  }
  if (method !== "GET") {
    writes.push("UNEXPECTED " + path);
    return r.abort();
  }
  let data = [];
  if (path.endsWith("/user_roles")) data = [{ role }];
  if (path.endsWith("/store_settings"))
    data = { id: 1, business_name: "Demo", default_bill_type: "simple" };
  if (path.endsWith("/product_costs")) data = null;
  if (path.endsWith("/products")) {
    const filter = u.searchParams.get("id");
    const rows = filter ? products.filter((product) => "eq." + product.id === filter) : products;
    data = r.request().headers().accept?.includes("object") ? (rows[0] ?? null) : rows;
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
  await p.getByRole("button", { name: "Edit product", exact: true }).click();
  await p.getByRole("button", { name: "Add colour", exact: true }).click();
  const add = p
    .getByRole("dialog")
    .filter({ has: p.getByRole("heading", { name: "Add colour", exact: true }) });
  await add.waitFor();
  assert.equal(await add.locator("#quick-product-stock-brand").inputValue(), "DEMO");
  assert.equal(await add.locator("#quick-product-stock-brand").getAttribute("readonly"), "");
  assert.equal(await add.locator("#quick-product-stock-article").inputValue(), "Aero");
  assert.equal(await add.locator("#quick-product-stock-selling_price").inputValue(), "2199");
  assert.equal(await add.locator("#quick-product-stock-mrp").inputValue(), "2999");
  assert.equal(
    await add.getByLabel("Pairs for size 7", { exact: true }).count(),
    0,
    "Parent quantity must not be copied",
  );
  await add.getByRole("button", { name: "Save colour", exact: true }).click();
  await p.getByText("Enter a different colour name", { exact: true }).waitFor();
  assert.equal(created.length, 0);
  await add.locator("#quick-product-stock-color").fill("White");
  const png = await p.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const c = canvas.getContext("2d");
    c.fillStyle = "white";
    c.fillRect(5, 5, 50, 50);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await add.locator("#new-product-photos").setInputFiles({
    name: "white.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await p.screenshot({ path: out + "/add-colour-mobile.png" });
  await add.getByRole("button", { name: "Save colour", exact: true }).click();
  await add.waitFor({ state: "detached" });
  await p.getByRole("textbox", { name: "Product colour", exact: true }).waitFor();
  await p.waitForFunction(
    () => document.querySelector('[aria-label="Product colour"]')?.value === "White",
  );
  assert.equal(created.length, 1);
  assert.equal(uploaded.length, 1);
  assert.equal(black.product_variants[0].stock, 2);
  assert.equal(products[1].product_variants[0].stock, 0);
  await p.getByRole("combobox", { name: "Size to edit", exact: true }).selectOption("white7");
  await p.getByRole("textbox", { name: "Size stock", exact: true }).fill("3");
  await p
    .getByRole("textbox", { name: "Stock adjustment reason", exact: true })
    .fill("Opening white stock");
  await p.getByRole("button", { name: "Save size", exact: true }).click();
  await p.getByText("Size and stock saved", { exact: true }).waitFor();
  assert.equal(black.product_variants[0].stock, 2);
  assert.equal(products[1].product_variants[0].stock, 3);
  await p.getByRole("switch", { name: "Show this colour in catalog", exact: true }).click();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Show this colour in catalog"]')
        ?.getAttribute("aria-checked") === "true",
  );
  assert.equal(products[1].catalog_visible, true);
  await p
    .getByRole("region", { name: "Article colours", exact: true })
    .getByRole("button", { name: "Black", exact: true })
    .click();
  await p.waitForFunction(
    () => document.querySelector('[aria-label="Product colour"]')?.value === "Black",
  );
  assert.equal(
    await p.getByRole("combobox", { name: "Size to edit", exact: true }).inputValue(),
    "",
    "Switching colours resets the stock editor",
  );
  await p.getByRole("button", { name: "Add colour", exact: true }).click();
  await add.locator("#quick-product-stock-color").fill("White");
  await add.getByRole("button", { name: "Save colour", exact: true }).click();
  await p
    .getByText("This colour already exists. Open it to edit photos or stock.", { exact: true })
    .waitFor();
  assert.equal(created.length, 1);
  await p.keyboard.press("Escape");
  await p.keyboard.press("Escape");
  await p.goto("http://127.0.0.1:3000/pos");
  await p.getByLabel("Search or scan products", { exact: true }).fill("White");
  await p.getByRole("button", { name: "DEMO Aero, size 7, 3 in stock", exact: true }).click();
  await p.getByRole("button", { name: "Cart 1", exact: true }).click();
  await p.getByRole("button", { name: "UPI", exact: true }).click();
  await p.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await p.getByRole("heading", { name: "Bill saved", exact: true }).waitFor();
  assert.equal(products[1].product_variants[0].stock, 2);
  assert.equal(black.product_variants[0].stock, 2);
  await p.goto("http://127.0.0.1:3000/products");
  role = "staff";
  await p.reload();
  await p.getByRole("button", { name: "View product", exact: true }).first().click();
  assert.equal(await p.getByRole("button", { name: "Add colour", exact: true }).count(), 0);
  assert(!writes.some((path) => path.startsWith("UNEXPECTED")), JSON.stringify(writes));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      inheritedDetailsAndPrices: true,
      zeroOpeningStock: true,
      separatePhotoFolder: true,
      guardedColourStock: true,
      billingDeductsSelectedColourOnly: true,
      ownerCatalogPublish: true,
      parentStockUnchanged: true,
      duplicateColourBlocked: true,
      staffAddHidden: true,
      productionWrites: 0,
    }),
  );
} catch (error) {
  console.error(await p.locator("body").innerText(), errors);
  await p.screenshot({ path: out + "/failure.png" });
  throw error;
} finally {
  await b.close();
}
