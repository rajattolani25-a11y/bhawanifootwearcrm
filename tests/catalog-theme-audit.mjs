import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-themes";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const image = "/catalog-preview-shoe.png";
const products = ["Everyday Sneaker", "Studio Sneaker", "Classic Pair"].map((article, i) => ({
  id: "demo" + i,
  brand: "DEMO COLLECTION",
  article,
  category: "Gents",
  gender: null,
  color: "Cream",
  mrp: 1499,
  price: 999,
  image,
  sizes: [{ id: "size" + i, size: "7", available: true }],
}));
const shop = {
  name: "Bhawani Footwear",
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
const hero = {
  image,
  offer_kind: "up-to",
  offer_value: 40,
  custom_text: "New collection",
  heading: "Your everyday. Elevated.",
  subtitle: "Find your next favourite pair.",
  button_label: "Shop the collection",
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
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop, products, hero, presentation: { gallery_enabled: true, category_accents: true, motion_enabled: true } })});export const checkCoupon=async()=>null;export const createBooking=async()=>{throw Error('No demo orders')};export const trackOrder=async()=>null;`,
    });
  const fixture = {
    "/catalog-themes.html": "catalog-themes.html",
    "/presentation-catalog.html": "presentation-catalog.html",
  }[u.pathname];
  if (fixture)
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/" + fixture, import.meta.url), "utf8"),
    });
  if (u.pathname === image) {
    if (process.env.PREVIEW_SHOE)
      return r.fulfill({
        contentType: "image/png",
        body: await fs.readFile(process.env.PREVIEW_SHOE),
      });
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350"><path d="M80 250L120 120L230 180L410 200L520 260L500 300L80 300Z" fill="#ddd5c4"/></svg>',
    });
  }
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  return r.abort();
});
try {
  await page.goto("http://localhost:8080/catalog-themes.html");
  await page.getByRole("heading", { name: "Catalog themes", exact: true }).waitFor();
  const palettes = ["studio", "midnight", "plum", "ivory", "sage", "copper", "slate"];
  const names = [
    "Charcoal Studio",
    "Midnight Blue",
    "Plum Atelier",
    "Warm Ivory",
    "Sage Gallery",
    "Copper Sand",
    "Slate Minimal",
  ];
  const backgrounds = [];
  for (let i = 0; i < names.length; i++) {
    await page.getByRole("button", { name: names[i], exact: true }).click();
    const selected = page.locator("#selected-theme section");
    assert.equal(await selected.getAttribute("data-palette"), palettes[i]);
    backgrounds.push(await selected.evaluate((el) => getComputedStyle(el).backgroundImage));
  }
  assert.equal(new Set(backgrounds).size, 7);
  await page.locator("#theme-sheet").screenshot({ path: out + "/seven-theme-previews.png" });
  const sizes = [];
  await page.goto("http://localhost:8080/presentation-catalog.html");
  await page.getByRole("heading", { name: "Your everyday. Elevated.", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    const bounds = await page.getByRole("region", { name: "Featured collection" }).boundingBox();
    assert(bounds.height < 360, "Normal banner too tall at " + width + ": " + bounds.height);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    sizes.push({ width, heroHeight: bounds.height });
    if (width === 390 || width === 1440) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${out}/catalog-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Catalog navigation" });
  const navChecks = [];
  for (const y of [0, 400, 10000]) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(60);
    const rect = await nav.boundingBox();
    assert(
      Math.abs(rect.y + rect.height - 844) < 2,
      "Bottom navigation moved away from viewport bottom",
    );
    navChecks.push({ scrollY: await page.evaluate(() => scrollY), bottom: rect.y + rect.height });
  }
  await page.screenshot({ path: out + "/catalog-bottom-390.png" });
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  const darkBackground = await page
    .getByRole("region", { name: "Featured collection" })
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  assert(darkBackground.includes("gradient"), "Hero lost studio backdrop in dark view");
  assert.deepEqual(errors, []);
  const result = {
    palettes: 7,
    previewOnly: true,
    heroSizes: sizes,
    viewportBottomNavigation: navChecks,
    allWidthsFit: true,
    noLiveWrites: true,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
