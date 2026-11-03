// Measures actual rendered motion, rather than only checking its final DOM state.
// Vite must be running at localhost:8080. All external traffic is intercepted.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/motion-playback";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const errors = [],
  blockedWrites = [];
page.on("pageerror", (e) => errors.push(e.message));
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
let motionEnabled = true;
let releaseReceipt, releaseSale;
const receiptGate = new Promise((resolve) => {
  releaseReceipt = resolve;
});
const saleGate = new Promise((resolve) => {
  releaseSale = resolve;
});
let receiptRequested = false,
  saleResponseAt = 0;
const mockSales = [];
const products = ["Demo Sports", "Demo Formal"].map((article, i) => ({
  id: "demo" + i,
  brand: "Demo",
  article,
  category: "Gents",
  gender: null,
  color: "Cream",
  mrp: 999,
  price: 799,
  image: null,
  sizes: [{ id: "size" + i, size: "7", available: true }],
}));
const shop = {
  name: "Demo Store",
  phone: null,
  address: null,
  booking: false,
  local: false,
  outside: false,
  local_charge: 30,
  outside_charge: 80,
  free_delivery_above: null,
  delivery_note: null,
  advance_percent: 50,
  hold_hours: 24,
};
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350"><path d="M80 250L120 120L230 180L410 200L520 260L500 300L80 300Z" fill="#d8e2d9"/></svg>',
  );
const hero = {
  image,
  offer_kind: "custom",
  offer_value: 20,
  custom_text: "Demo collection",
  heading: "Demo collection",
  subtitle: "Synthetic preview",
  button_label: "View collection",
  action: "collection",
  product_id: null,
  category: "All",
  motion: true,
  image_scale: 90,
};
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("lottie_light") || u.pathname.endsWith("/bill-success.json")) {
    receiptRequested = true;
    await receiptGate;
    return r.continue();
  }
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop, products, hero, presentation: { gallery_enabled: true, category_accents: true, motion_enabled: motionEnabled } })}); export const checkCoupon=async()=>null;export const createBooking=async()=>{throw Error('Orders disabled in fixture')};export const trackOrder=async()=>null;`,
    });
  if (u.pathname === "/presentation-catalog.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    if (u.pathname.endsWith("/rpc/create_sale")) {
      mockSales.push(r.request().postDataJSON());
      await saleGate;
      saleResponseAt = Date.now();
      return r.fulfill({ json: { bill_no: "DEMO-001", stamp_regular: false, unlocked: [] } });
    }
    if (r.request().method() !== "GET") {
      blockedWrites.push(u.pathname);
      return r.fulfill({ status: 403, json: { message: "No business writes in this audit" } });
    }
    let data = [];
    if (u.pathname.endsWith("/user_roles")) data = [{ role: "owner" }];
    if (u.pathname.endsWith("/store_settings"))
      data = { id: 1, business_name: "Demo Store", bill_design: "Thermal", thermal_width: "80" };
    if (u.pathname.endsWith("/products"))
      data = [
        {
          id: "product-demo",
          brand: "Demo",
          article: "Sports",
          category: "Gents",
          color: "Cream",
          selling_price: 799,
          mrp: 999,
          status: "Active",
          image_url: null,
          product_variants: [
            { id: "variant-demo", size: "7", stock: 8, sku: "DEMO7", barcode: "DEMO7" },
          ],
        },
      ];
    return r.fulfill({ json: data, headers: { "content-range": "0-0/1" } });
  }
  return r.abort();
});
async function sampleDuring(selector, action) {
  await page.evaluate((selector) => {
    window.motionFrames = [];
    const generation = (window.motionGeneration = (window.motionGeneration || 0) + 1);
    let frames = 0;
    function collect() {
      if (window.motionGeneration !== generation) return;
      const el = document.querySelector(selector);
      if (el) {
        const s = getComputedStyle(el),
          rect = el.getBoundingClientRect();
        window.motionFrames.push({
          transform: s.transform,
          opacity: Number(s.opacity),
          visible: rect.width > 0 && rect.height > 0,
        });
      }
      if (frames++ < 160) requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
  }, selector);
  await action();
  await page.waitForFunction(() => window.motionFrames?.length >= 35);
  return page.evaluate(() => {
    window.motionGeneration++;
    return window.motionFrames;
  });
}
const moving = (samples) =>
  samples.some((s) => s.visible && s.opacity < 0.99) &&
  new Set(samples.filter((s) => s.visible).map((s) => s.transform)).size > 3;
const still = (samples) =>
  samples.length > 10 &&
  samples.every(
    (s) =>
      s.opacity === 1 && (s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)"),
  );
try {
  await page.goto("http://localhost:8080/presentation-catalog.html");
  const next = page.getByRole("button", { name: "Next product", exact: true });
  await next.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const gallery = await sampleDuring('[class*="featured"]', () => next.click());
  assert(moving(gallery), "Gallery changed product without rendering a slide/fade");
  await page
    .getByRole("region", { name: "Product spotlight" })
    .getByRole("heading", { name: "Demo Formal", exact: true })
    .waitFor();
  const backwards = await sampleDuring('[class*="featured"]', () =>
    page.getByRole("button", { name: "Previous product", exact: true }).click(),
  );
  assert(moving(backwards), "Previous product did not animate");
  await page.screenshot({ path: out + "/gallery-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await next.scrollIntoViewIfNeeded();
  const reduced = await sampleDuring('[class*="featured"]', () => next.click());
  assert(still(reduced), "Device reduced-motion preference ignored");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  motionEnabled = false;
  await page.goto("http://localhost:8080/presentation-catalog.html");
  await next.scrollIntoViewIfNeeded();
  const disabled = await sampleDuring('[class*="featured"]', () => next.click());
  assert(still(disabled), "Owner motion OFF did not keep gallery static");
  const heroOff = await page
    .getByRole("region", { name: "Featured collection" })
    .locator("img")
    .evaluate((el) => el.getAnimations().filter((a) => a.playState === "running").length);
  assert.equal(heroOff, 0, "Owner motion OFF left hero running");
  await page.goto("http://localhost:8080/auth");
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:8080/pos");
  const add = page.getByRole("button", { name: "Demo Sports, size 7, 8 in stock", exact: true });
  await add.waitFor();
  await page.waitForTimeout(400);
  const cart = await sampleDuring('[class*="cartItems"] > [class*="cartItem"]', () => add.click());
  assert(moving(cart), "POS new row did not animate");
  await page.getByRole("button", { name: "Increase Sports size 7", exact: true }).click();
  assert.equal(await page.locator('[class*="itemAmount"]').innerText(), "₹1,598");
  assert(receiptRequested, "Receipt resources were not warmed during preparation");
  await page.getByRole("button", { name: /F8 · Complete Sale/ }).click();
  await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Bill saved", exact: true }).count(),
    0,
    "Success displayed before database confirmation",
  );
  await page.keyboard.press("F8");
  await page.keyboard.press("F8");
  releaseSale();
  await page.getByRole("heading", { name: "Bill saved", exact: true }).waitFor({ timeout: 1500 });
  const confirmationAfterResponseMs = Date.now() - saleResponseAt;
  assert(confirmationAfterResponseMs < 1000, "Saved-bill popup waited for decoration");
  assert.equal(mockSales.length, 1, "Repeated F8 submitted a duplicate sale");
  assert.equal(mockSales[0]._items[0].qty, 2);
  assert.equal(mockSales[0]._sale.total, 1677.9);
  assert.equal(
    await page.locator('[data-animation="playing"]').count(),
    0,
    "Receipt loading gate was not exercised",
  );
  releaseReceipt();
  await page.waitForFunction(() => document.querySelector('[data-animation="complete"]'));
  await page.screenshot({ path: out + "/saved-bill.png" });
  await page.getByRole("button", { name: "New bill", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await add.click();
  await page.waitForTimeout(500);
  const mobileCart = await sampleDuring('[class*="cartItems"] > [class*="cartItem"]', () =>
    page
      .getByRole("navigation", { name: "POS workspace" })
      .getByRole("button", { name: /Cart/ })
      .click(),
  );
  assert(moving(mobileCart), "Mobile row played while hidden, rather than when opening Cart");
  await page.screenshot({ path: out + "/pos-mobile.png" });
  await page.getByRole("button", { name: "Remove Sports size 7", exact: true }).click();
  await page
    .getByRole("navigation", { name: "POS workspace" })
    .getByRole("button", { name: "Products", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await add.waitFor();
  await add.click();
  const reducedCart = await sampleDuring('[class*="cartItems"] > [class*="cartItem"]', () =>
    page
      .getByRole("navigation", { name: "POS workspace" })
      .getByRole("button", { name: /Cart/ })
      .click(),
  );
  assert(still(reducedCart), "POS reduced-motion preference ignored");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    "Mobile overflow",
  );
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(errors, []);
  const result = {
    gallerySlideFade: true,
    previousProductMotion: true,
    measuredGalleryTransformStates: new Set(gallery.map((s) => s.transform)).size,
    ownerMotionOffRespected: true,
    reducedMotionRespected: true,
    desktopCartEntry: true,
    mobileCartEntryAfterOpening: true,
    cartQuantityAmount: 1598,
    receiptPreloadedDuringPreparation: true,
    confirmationShownBeforeAnimationDownload: true,
    confirmationAfterResponseMs,
    duplicateSubmitBlocked: true,
    unchangedMockedSaleTotal: 1677.9,
    mockedSales: mockSales.length,
    realBusinessWrites: 0,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  await fs.writeFile(
    out + "/frame-samples.json",
    JSON.stringify(
      { gallery, backwards, reduced, disabled, cart, mobileCart, reducedCart },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(result));
} finally {
  releaseReceipt();
  releaseSale();
  await browser.close();
}
