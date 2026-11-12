import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-gallery";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
let galleryAvailable = true;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
const data = {
  enabled: true,
  products: [
    "Daily Comfort",
    "Everyday walking shoes with a longer product name",
    "Office Loafers",
  ].map((article, i) => ({
    id: `10000000-0000-4000-8000-00000000000${i + 1}`,
    brand: "Demo",
    article,
    category: "Gents",
    gender: null,
    color: "Cream",
    price: 999,
    mrp: 1299,
    image: "/catalog-shoe.png",
    sizes: [
      { id: `s${i}`, size: "7", available: true },
      { id: `out${i}`, size: "8", available: false },
    ],
  })),
  shop: {
    name: "Sample Footwear",
    phone: null,
    address: "Demo address",
    booking: true,
    local: true,
    outside: true,
    local_charge: 30,
    outside_charge: 80,
    free_delivery_above: null,
    delivery_note: null,
    advance_percent: 50,
    hold_hours: 24,
  },
  presentation: { gallery_enabled: false, category_accents: true, motion_enabled: true },
  hero: null,
};
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalogPhotos=async()=>({images:${galleryAvailable ? JSON.stringify(["/catalog-shoe.png?angle=1", "/catalog-shoe.png?angle=2", "/catalog-shoe.png?angle=3"]) : "[]"},available:${galleryAvailable}});export const getCatalog=async()=>(${JSON.stringify(data)}); export const checkCoupon=async()=>null; export const createBooking=async()=>{throw Error('No order writes allowed')};export const trackOrder=async()=>null;`,
    });
  if (u.pathname === "/catalog-ui.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/catalog-shoe.png")
    return route.fulfill({
      contentType: "image/png",
      body: process.env.PREVIEW_SHOE
        ? await fs.readFile(process.env.PREVIEW_SHOE)
        : PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 255) }),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
  external.push(u.pathname);
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/catalog-ui.html");
  const card = page.getByRole("button", { name: "Demo Daily Comfort", exact: true });
  await card.waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Catalog overflow " + width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/catalog-mobile.png" });
  await card.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "View photo 3", exact: true }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: /View photo/ }).count(), 3);
  await dialog.getByRole("button", { name: "View photo 3", exact: true }).click();
  assert.equal(
    await dialog
      .getByRole("button", { name: "View photo 3", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert(
    (
      await dialog
        .getByAltText("Demo Daily Comfort · Cream — view 3", { exact: true })
        .getAttribute("src")
    ).includes("angle=3"),
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/gallery-mobile.png" });
  await page.keyboard.press("Escape");
  galleryAvailable = false;
  await page.reload();
  await page.getByRole("button", { name: "Demo Daily Comfort", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText("Showing available product photo.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByAltText("Demo Daily Comfort · Cream — view 1", { exact: true })
      .count(),
    1,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    widths: [320, 390, 768, 1440],
    galleryThreeAngles: true,
    missingMigrationCoverFallback: true,
    productDialog: true,

    realWrites: 0,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    errors,
    await page.getByLabel("Product photo gallery", { exact: true }).innerHTML(),
  );
  throw error;
} finally {
  await browser.close();
}
