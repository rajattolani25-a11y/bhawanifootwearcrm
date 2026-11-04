import assert from "node:assert/strict";
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
const errors = [],
  unexpected = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.routeWebSocket("**/*", (s) => s.close());
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("@zxing_browser") && u.pathname.endsWith(".js"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export class BrowserMultiFormatReader{async decodeFromConstraints(c,target,callback){window.__cameraScans=code=>callback({getText:()=>code});return{stop(){}};}}`,
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (!u.pathname.startsWith("/rest/v1/")) return r.abort();
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
const search = () => p.getByLabel("Search or scan products", { exact: true });
const quantity = (size) =>
  p
    .getByRole("button", { name: `Increase Scan Pair size ${size}`, exact: true })
    .locator("..")
    .locator("span");
async function scan(code) {
  await search().fill(code);
  await search().press("Enter");
}
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
  await p.goto("http://127.0.0.1:3000/pos");
  await search().waitFor();
  await p.getByText("Scan Pair", { exact: true }).first().waitFor();
  await scan("ss1234567890");
  assert.equal(await quantity("7").innerText(), "1");
  await scan("OLD0007");
  assert.equal(await quantity("7").innerText(), "2");
  await scan("SHARED");
  await p
    .getByText(
      "This code matches multiple sizes. Select the correct size or print its unique label.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await quantity("7").innerText(), "2");
  await scan("OLD0009");
  await p.getByText("Size 9 is out of stock", { exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: "Increase Scan Pair size 9", exact: true }).count(),
    0,
  );
  await search().fill("");
  await p.getByRole("heading", { name: "POS Billing", exact: true }).click();
  await p.keyboard.type("SS1234567891", { delay: 10 });
  await p.keyboard.press("Enter");
  assert.equal(await quantity("8").innerText(), "1");
  await p.getByRole("button", { name: "Scan with phone camera", exact: true }).click();
  await p.waitForFunction(() => window.__cameraScans);
  await p.evaluate(() => {
    window.__cameraScans("SS1234567890");
    window.__cameraScans("SS1234567890");
  });
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await quantity("7").innerText(), "3");
  await p.getByRole("button", { name: "Quick add product", exact: true }).click();
  await p
    .getByRole("dialog")
    .getByRole("heading", { name: "Quick add product", exact: true })
    .click();
  await p.keyboard.type("SS1234567891", { delay: 10 });
  await p.keyboard.press("Enter");
  await p.keyboard.press("Escape");
  assert.equal(await quantity("8").innerText(), "1");
  await p.goto("http://127.0.0.1:3000/products");
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Quick add product", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Men", exact: true }).click();
  assert((await dialog.innerText()).includes("Large sizes"));
  assert.equal(await dialog.getByPlaceholder("For example: 13 or 4", { exact: true }).count(), 1);
  assert(!/\b(Bade|Chhote|khaali|likho|jaise|karo|jayega|aaye)\b/i.test(await dialog.innerText()));
  await dialog.getByRole("button", { name: "Save & add", exact: true }).click();
  await p.getByText("Enter an article name", { exact: true }).waitFor();
  // Hardware scans behind another dialog must not alter the cart.
  await p.keyboard.type("SS1234567891", { delay: 10 });
  await p.keyboard.press("Enter");
  assert.equal(unexpected.length, 0);
  await p.keyboard.press("Escape");
  // Switch language on Settings, then verify the shared add form switches back cleanly.
  await p.goto("http://127.0.0.1:3000/settings");
  await p.getByRole("tab", { name: "Appearance", exact: true }).click();
  await p.getByRole("button", { name: "Hinglish", exact: true }).click();
  await p.goto("http://127.0.0.1:3000/products");
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  await dialog.getByRole("button", { name: "Men", exact: true }).click();
  await dialog.getByText("Bade size", { exact: true }).waitFor();
  assert.equal(await dialog.getByPlaceholder("Jaise 13 ya 4", { exact: true }).count(), 1);
  await p.evaluate(() => localStorage.setItem("solestack-language", "english"));
  await p.reload();
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  await dialog.getByRole("button", { name: "Kids", exact: true }).click();
  await dialog.getByText("Small", { exact: true }).waitFor();
  await dialog.getByText("Large", { exact: true }).waitFor();
  assert(!/\b(Bade|Chhote|khaali|likho|jaise|karo|jayega|aaye)\b/i.test(await dialog.innerText()));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "Label aliases and legacy barcode resolve the exact size; duplicate old codes and zero stock do not add a wrong pair",
        "USB keyboard scan adds correct size; camera duplicate frames add once and close immediately",
        "English add-product has no Hinglish leftovers; category hints, placeholder, validation and Hinglish→English switch verified",
      ],
      productionWrites: 0,
      errors,
    }),
  );
} finally {
  await b.close();
}
