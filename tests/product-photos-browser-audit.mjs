import assert from "node:assert/strict";
// Optional browser checks: install Playwright separately; start npm run dev on port8080.
// PLAYWRIGHT_MODULE may point to its index.mjs. All shop data in route checks is mocked.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import fs from "node:fs/promises";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => console.error("PAGE", e.message));
const failures = [];
const loaded = [];
p.on("request", (r) => loaded.push(r.url()));
let role = "owner";
const metrics = { productReads: 0, signCalls: 0, signedPaths: 0, productBytes: 0 };
const productId = "10000000-0000-4000-8000-000000000001";
const rows = [
  {
    id: productId,
    brand: "Demo",
    article: "Gallery Pair",
    category: "Gents",
    color: "Cream",
    gender: null,
    created_at: "2026-01-01T00:00:00Z",
    status: "Active",
    catalog_visible: true,
    mrp: 1299,
    selling_price: 999,
    image_url: productId + "/cover.webp",
    product_variants: [
      {
        id: "v1",
        size: "7",
        stock: 5,
        damaged_stock: 0,
        min_stock: 2,
        rack: "A",
        barcode: "GALLERY7",
        sku: "GALLERY7",
      },
    ],
  },
];
let paths = [productId + "/cover.webp", productId + "/sole.webp"];
const writes = [];
let failUpload = false;
let linked = true;
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
await p.routeWebSocket("**/*", (socket) => socket.close());
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return r.continue();
  if (u.pathname.includes("/storage/v1/object/list/")) {
    const body = r.request().postDataJSON();
    return r.fulfill({
      json: paths
        .filter((path) => path.startsWith(body.prefix + "/"))
        .map((path) => ({ id: path, name: path.split("/").pop() })),
    });
  }
  if (
    u.pathname.endsWith("/storage/v1/object/product-images") &&
    r.request().method() === "DELETE"
  ) {
    const chosen = r.request().postDataJSON().prefixes;
    writes.push({ type: "remove", paths: chosen });
    paths = paths.filter((path) => !chosen.includes(path));
    return r.fulfill({ json: chosen.map((name) => ({ name })) });
  }
  if (
    u.pathname.includes("/storage/v1/object/product-images/") &&
    r.request().method() === "POST"
  ) {
    if (failUpload)
      return r.fulfill({
        status: 400,
        json: { statusCode: "400", error: "Upload failed", message: "Simulated quota exceeded" },
      });
    const path = decodeURIComponent(u.pathname.split("/storage/v1/object/product-images/")[1]);
    paths.push(path);
    writes.push({ type: "upload", path });
    return r.fulfill({ json: { Key: "product-images/" + path, Id: path } });
  }
  if (u.pathname.includes("/storage/v1/object/sign/")) {
    if (r.request().method() === "POST") {
      const paths = r.request().postDataJSON().paths || [];
      metrics.signCalls++;
      metrics.signedPaths += paths.length;
      return r.fulfill({
        json: paths.map((path) => ({
          path,
          signedURL: "/object/sign/product-images/" + path + "?token=fixture",
        })),
      });
    }
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><path d="M10 90L40 30L100 60L180 80L190 105L10 105Z" fill="#cdbb95"/></svg>',
    });
  }
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    let data = [];
    if (u.pathname.endsWith("/products")) {
      const method = r.request().method();
      const id = u.searchParams.get("id")?.replace("eq.", "");
      if (method === "PATCH") {
        const update = r.request().postDataJSON();
        Object.assign(
          rows.find((row) => row.id === id),
          update,
        );
        writes.push({ type: "update", id, update });
        return r.fulfill({ json: rows.find((row) => row.id === id) });
      }
      if (method === "DELETE") {
        if (linked)
          return r.fulfill({
            status: 409,
            json: { code: "23503", message: "foreign key constraint" },
          });
        const i = rows.findIndex((row) => row.id === id);
        const [deleted] = rows.splice(i, 1);
        writes.push({ type: "delete", id });
        return r.fulfill({ json: deleted });
      }
      data = r.request().headers()["accept"]?.includes("object")
        ? rows.find((row) => row.id === id)
        : rows;
    }
    if (u.pathname.endsWith("/rpc/quick_add_product")) {
      const body = r.request().postDataJSON();
      const id = "10000000-0000-4000-8000-000000000002";
      rows.push({ ...rows[0], ...body._product, id, image_url: null, product_variants: [] });
      writes.push({ type: "quick-add", id });
      return r.fulfill({ json: { product_id: id, variants: [] } });
    }
    if (u.pathname.endsWith("/user_roles"))
      data = r.request().headers()["accept"]?.includes("object")
        ? role === "owner"
          ? { role }
          : null
        : [{ role }];
    if (
      u.pathname.endsWith("/user_roles") &&
      u.searchParams.get("role") === "eq.owner" &&
      role === "staff"
    )
      data = [];
    if (u.pathname.endsWith("/store_settings"))
      data = {
        id: 1,
        business_name: "Demo Store",
        daily_target: 10000,
        bill_design: "Thermal",
        thermal_width: "80",
        business_phone: "",
        business_address: "",
      };
    if (u.pathname.includes("/rpc/")) data = null;
    return r.fulfill({ json: data, headers: { "content-range": "0-0/0" } });
  }
  return r.abort();
});
console.log("auth start");
await p.goto("http://localhost:8080/auth");
console.log("auth loaded");
await p.waitForTimeout(1500);
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
await p.evaluate(
  async ({ token }) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const r = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "mock-refresh",
    });
    if (r.error) throw r.error;
  },
  { token },
);

console.log("session installed");
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
const photo = Buffer.from(
  await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#687a5b";
    ctx.fillRect(4, 10, 32, 20);
    return c.toDataURL("image/png").split(",")[1];
  }),
  "base64",
);
const upload = (name) => ({ name, mimeType: "image/png", buffer: photo });
try {
  console.log("products start");
  await p.goto("http://localhost:8080/products");
  console.log("products loaded");
  await p.getByRole("button", { name: "Photos", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog.getByText("Product photos (2/8)", { exact: true }).waitFor();
  console.log("photos loaded");
  assert.equal(await dialog.getByAltText(/Product angle/).count(), 2);
  await dialog.getByRole("button", { name: "Set cover", exact: true }).click();
  await p.waitForFunction((id) => window.location.pathname === "/products", productId);
  await p.waitForTimeout(350);
  assert.equal(rows[0].image_url, productId + "/sole.webp");
  assert.equal(paths.length, 2, "changing cover must retain old photo");
  await dialog
    .getByLabel("Add product photos", { exact: true })
    .setInputFiles([upload("front.png"), upload("back.png")]);
  await dialog.getByText("Product photos (4/8)", { exact: true }).waitFor();
  assert.equal(paths.length, 4);
  failUpload = true;
  await dialog.getByLabel("Replace photo 1", { exact: true }).setInputFiles(upload("bad.png"));
  await p.getByText("Simulated quota exceeded", { exact: false }).first().waitFor();
  assert.equal(paths.length, 4);
  assert.equal(rows[0].image_url, productId + "/sole.webp");
  failUpload = false;
  await dialog
    .getByLabel("Replace photo 1", { exact: true })
    .setInputFiles(upload("new-cover.png"));
  await p.waitForTimeout(700);
  assert.notEqual(rows[0].image_url, productId + "/sole.webp");
  assert.equal(paths.length, 4);
  await dialog.getByRole("button", { name: "Delete photo 1", exact: true }).click();
  await dialog.getByText("Product photos (3/8)", { exact: true }).waitFor();
  assert.equal(paths.length, 3);
  assert(paths.includes(rows[0].image_url));
  const beforeDelete = JSON.stringify(paths);
  await dialog.getByRole("button", { name: "Delete product", exact: true }).click();
  await p.getByText("This product has transaction history.", { exact: false }).first().waitFor();
  assert.equal(
    JSON.stringify(paths),
    beforeDelete,
    "blocked product deletion must not remove photos",
  );
  await dialog.getByRole("button", { name: "Archive product", exact: true }).click();
  await dialog.getByRole("button", { name: "Restore product", exact: true }).waitFor();
  assert.equal(rows[0].status, "inactive");
  assert.equal(rows[0].catalog_visible, false);
  await dialog.getByRole("button", { name: "Restore product", exact: true }).click();
  await dialog.getByRole("button", { name: "Archive product", exact: true }).waitFor();
  assert.equal(rows[0].status, "Active");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: "/tmp/solestack-product-photos-mobile.png", fullPage: true });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  const inputs = dialog.locator('input:not([type="file"])');
  await inputs.nth(0).fill("Demo");
  await inputs.nth(1).fill("New Photo Pair");
  await inputs.nth(3).fill("999");
  await dialog.locator('input[type="file"]').setInputFiles([upload("one.png"), upload("two.png")]);
  await dialog.getByAltText("Selected photo 2", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Save & add", exact: true }).click();
  await p.getByText("New Photo Pair", { exact: true }).first().waitFor();
  assert.equal(writes.filter((w) => w.type === "quick-add").length, 1);
  assert.equal(paths.filter((path) => path.startsWith(rows[1].id + "/")).length, 2);
  await p.getByRole("button", { name: "Photos", exact: true }).first().click();
  await dialog.getByText("Product photos (3/8)", { exact: true }).waitFor();
  linked = false;
  await dialog.getByRole("button", { name: "Delete product", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(rows.length, 1);
  assert.equal(paths.filter((path) => path.startsWith(productId + "/")).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      scope: "Mocked HTTP/Storage, real UI and compression. No live writes.",
      checks: [
        "multi upload",
        "cover retention",
        "failed replacement retains original",
        "replace/delete cover",
        "FK failure retains files",
        "archive/restore",
        "mobile overflow",
        "quick add with two photos",
        "delete unused product then files",
      ],
      writes: writes.length,
    }),
  );
} catch (error) {
  await p.screenshot({ path: "/tmp/product-photos-failure.png", fullPage: true });
  console.error((await p.locator("body").innerText()).slice(-4000));
  throw error;
} finally {
  await b.close();
}
