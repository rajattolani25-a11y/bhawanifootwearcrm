import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-collection";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(15000);
const names = ["Cedar", "Atlas", "Birch", "Dune", "Elm", "Fir"];
const products = names.map((article, i) => ({
  id: "p" + i,
  article,
  brand: i % 2 ? "North" : "Demo",
  color: "Cream",
  category: i < 3 ? "Men / Sports & Active" : "Women / Sandals & Flats",
  price: [999, 1499, 499, 799, 1299, 999][i],
  mrp: [1299, 1999, 999, 799, 1299, 1499][i],
  image: null,
  image_key: null,
  sizes: [
    { id: `v${i}-7`, size: "7", available: i !== 1 },
    { id: `v${i}-8`, size: "8", available: i !== 0 },
  ],
}));
const data = {
  enabled: true,
  shop: { name: "Bhawani Footwear", phone: "9999999999", booking: true },
  products,
  hero: null,
  presentation: {
    gallery_enabled: true,
    category_accents: true,
    motion_enabled: false,
    theme: "ivory",
  },
};
const errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() !== "GET") writes.push(url.pathname);
  if (url.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>window.__nextCatalog??data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No live writes allowed')};`,
    });
  if (url.pathname === "/collection-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
  return route.abort();
});
const grid = page.locator('#catalog-collection [class*="productGrid"]');
const order = () => grid.getByRole("heading").allTextContents();
const sorting = () => page.getByRole("combobox", { name: "Sort by", exact: true });
async function sorted(value, expected) {
  await sorting().selectOption(value);
  await page.waitForFunction(
    ({ expected }) =>
      JSON.stringify(
        [...document.querySelectorAll('#catalog-collection [class*="productGrid"] h3')].map(
          (el) => el.textContent,
        ),
      ) === JSON.stringify(expected),
    { expected },
  );
  assert.deepEqual(await order(), expected);
}
try {
  await page.goto("http://127.0.0.1:3000/collection-audit.html");
  await grid.getByRole("heading", { name: "Cedar", exact: true }).waitFor();
  const heading = page.getByRole("heading", { name: "Shop the collection", exact: true });
  assert.equal(
    await heading
      .locator("..")
      .getByText(/\d+\s+designs/)
      .count(),
    0,
  );
  assert.deepEqual(await order(), names);
  for (const name of ["Subcategory", "Brand", "Size", "Sort by"])
    assert.equal(await page.getByRole("combobox", { name, exact: true }).count(), 1);
  assert.equal(await sorting().locator("option").count(), 5);
  await sorted("price-asc", ["Birch", "Dune", "Cedar", "Fir", "Elm", "Atlas"]);
  await sorted("price-desc", ["Atlas", "Elm", "Cedar", "Fir", "Dune", "Birch"]);
  await sorted("name", ["Atlas", "Birch", "Cedar", "Dune", "Elm", "Fir"]);
  await sorted("discount", ["Birch", "Fir", "Atlas", "Cedar", "Dune", "Elm"]);
  await page.getByRole("button", { name: "Men", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Subcategory", exact: true })
    .selectOption("Sports & Active");
  await page.getByRole("combobox", { name: "Size", exact: true }).selectOption("7");
  await page.getByRole("combobox", { name: "Brand", exact: true }).selectOption("Demo");
  await sorted("price-asc", ["Birch", "Cedar"]);
  await page.getByRole("button", { name: "Demo Birch", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Birch", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  assert.equal(await sorting().inputValue(), "default");
  assert.equal(
    await page.getByRole("combobox", { name: "Brand", exact: true }).inputValue(),
    "All",
  );
  assert.equal(await page.getByRole("combobox", { name: "Size", exact: true }).inputValue(), "All");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await sorted("price-asc", ["Birch", "Dune", "Cedar", "Fir", "Elm", "Atlas"]);
  const fresh = structuredClone(data);
  fresh.products[0].price = 299;
  await page.evaluate((fresh) => {
    window.__nextCatalog = fresh;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  }, fresh);
  await page.waitForFunction(
    () =>
      document.querySelector('#catalog-collection [class*="productGrid"] h3')?.textContent ===
      "Cedar",
  );
  assert.deepEqual(await order(), ["Cedar", "Birch", "Dune", "Fir", "Elm", "Atlas"]);
  const layouts = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await heading.scrollIntoViewIfNeeded();
    const boxes = await page
      .locator('#catalog-collection [class*="filters"] > label')
      .evaluateAll((labels) =>
        labels.map((label) => {
          const r = label.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    assert.equal(boxes.length, 4);
    assert(Math.abs(boxes[0].y - boxes[1].y) < 1, "First two fields must align");
    assert(Math.abs(boxes[0].w - boxes[1].w) < 1, "Equal field widths");
    if (width < 768) assert(boxes[2].y > boxes[0].y, "Two rows on mobile");
    else assert(Math.abs(boxes[3].y - boxes[0].y) < 1, "One row on desktop/tablet");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({ path: out + `/collection-${width}.png` });
    layouts.push({ width, height, aligned: true, noOverflow: true });
  }
  for (const [language, sortLabel] of [
    ["hindi", "क्रम चुनें"],
    ["hinglish", "Sort by"],
    ["english", "Sort by"],
  ]) {
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption(language);
    await page.getByRole("combobox", { name: sortLabel, exact: true }).selectOption("price-desc");
    assert.equal((await order())[0], "Atlas");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await heading.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/collection-dark.png" });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  const result = {
    passed: true,
    countRemoved: true,
    fiveSortOrders: true,
    filtersCombine: true,
    correctProductOpens: true,
    livePriceRefreshReorders: true,
    languages: 3,
    layouts,
    errors,
    productionWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
