import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-card-ui";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
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
    id: `p${i}`,
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
      body: `export const getCatalogPhotos=async()=>({images:[],available:true});export const getCatalog=async()=>(${JSON.stringify(data)}); export const checkCoupon=async()=>null; export const createBooking=async()=>{throw Error('No order writes allowed')};export const trackOrder=async()=>null;`,
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
      body: await fs.readFile(process.env.PREVIEW_SHOE),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
  external.push(u.pathname);
  return route.abort();
});
try {
  await page.goto("http://localhost:8080/catalog-ui.html");
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
  assert(await dialog.getByRole("button", { name: "8", exact: true }).isDisabled());
  await dialog.getByRole("button", { name: "7", exact: true }).click();
  assert.equal(
    await dialog.getByRole("button", { name: "7", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await dialog.getByRole("button", { name: "Get this pair", exact: true }).click();
  await dialog.getByText("Pickup from store", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/catalog-dark.png" });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    widths: [320, 390, 768, 1440],
    lightAndDark: true,
    productDialog: true,
    availableSizeSelection: true,
    unavailableSizeDisabled: true,
    deliveryOptionsOpen: true,
    realWrites: 0,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
