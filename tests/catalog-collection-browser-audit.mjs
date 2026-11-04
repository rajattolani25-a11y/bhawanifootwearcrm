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
  category:
    i < 3
      ? "Men / Sports & Active"
      : i === 4
        ? "Women / Sports & Active"
        : "Women / Sandals & Flats",
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
  for (const name of ["Size", "Sort by", "Style"])
    assert.equal(await page.getByRole("combobox", { name, exact: true }).count(), 1);
  assert.equal(await page.getByRole("combobox", { name: "Brand", exact: true }).count(), 0);
  assert.equal(await page.getByRole("combobox", { name: "Subcategory", exact: true }).count(), 0);
  assert.equal(await sorting().locator("option").count(), 5);
  const spotlight = page.getByRole("heading", { name: "In the spotlight", exact: true });
  await spotlight.waitFor();
  assert(
    await spotlight.evaluate(
      (el) =>
        !!(
          el.compareDocumentPosition(document.querySelector('[class*="filterPanel"]')) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
    "Spotlight precedes size/sort controls",
  );
  const size = page.getByRole("combobox", { name: "Size", exact: true });
  const choice = (department, value) => JSON.stringify([department, value]);
  const style = page.getByRole("combobox", { name: "Style", exact: true });
  assert.deepEqual(
    await style.locator("optgroup").evaluateAll((nodes) => nodes.map((node) => node.label)),
    ["Men", "Women"],
  );
  await style.selectOption(JSON.stringify(["Men", "Sports & Active"]));
  assert.deepEqual(await order(), ["Cedar", "Atlas", "Birch"]);
  await style.selectOption(JSON.stringify(["Women", "Sports & Active"]));
  assert.deepEqual(
    await order(),
    ["Elm"],
    "Women's Sports style never includes Men's Sports products",
  );
  await page.getByRole("button", { name: "All", exact: true }).click();
  await sorted("price-asc", ["Birch", "Dune", "Cedar", "Fir", "Elm", "Atlas"]);
  await sorted("price-desc", ["Atlas", "Elm", "Cedar", "Fir", "Dune", "Birch"]);
  await sorted("name", ["Atlas", "Birch", "Cedar", "Dune", "Elm", "Fir"]);
  await sorted("discount", ["Birch", "Fir", "Atlas", "Cedar", "Dune", "Elm"]);
  await page.getByRole("button", { name: "Men", exact: true }).click();
  await size.selectOption(choice("Men", "7"));
  await sorted("price-asc", ["Birch", "Cedar"]);
  await page.getByRole("button", { name: "Demo Birch", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Birch", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  assert.equal(await sorting().inputValue(), "default");
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
  // Identical size labels across departments must never mix products.
  const expanded = structuredClone(fresh);
  expanded.products.push(
    {
      ...products[0],
      id: "kids",
      article: "Mini",
      brand: "",
      category: "Kids",
      sizes: [
        { id: "kids2", size: "2", available: true },
        { id: "kids3", size: "3", available: false },
        { id: "blank", size: "", available: true },
      ],
    },
    {
      ...products[0],
      id: "boys",
      article: "School",
      category: "Boys",
      sizes: [
        { id: "boys2", size: "2", available: true },
        { id: "boys4", size: "4", available: true },
      ],
    },
    {
      ...products[0],
      id: "girls",
      article: "Blossom",
      category: "Girls",
      sizes: [
        { id: "girls5", size: "5", available: true },
        { id: "girls7", size: "7", available: true },
      ],
    },
  );
  await page.evaluate((fresh) => {
    window.__nextCatalog = fresh;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  }, expanded);
  await size.locator('optgroup[label="Boys"]').waitFor({ state: "attached" });
  const groups = () =>
    size.locator("optgroup").evaluateAll((nodes) => nodes.map((node) => node.label));
  assert.deepEqual(await groups(), ["Men", "Women", "Kids", "Girls", "Boys"]);
  assert.equal(await size.locator('option[value=""]').count(), 0);
  assert.equal(
    await size.locator('optgroup[label="Kids"] option').count(),
    1,
    "Sold-out and blank sizes are excluded",
  );
  for (const [department, value, expected] of [
    ["Kids", "2", ["Mini"]],
    ["Boys", "2", ["School"]],
    ["Girls", "7", ["Blossom"]],
    ["Men", "7", ["Cedar", "Birch"]],
  ]) {
    await size.selectOption(choice(department, value));
    assert.deepEqual(await order(), expected, `Exact ${department} size selection`);
  }
  await page.getByRole("button", { name: "Women", exact: true }).click();
  assert.equal(await size.inputValue(), "All");
  assert.deepEqual(await groups(), ["Women", "Girls"]);
  await size.selectOption(choice("Women", "7"));
  assert.deepEqual(await order(), ["Dune", "Fir", "Elm"]);
  await page.getByRole("button", { name: "Men", exact: true }).click();
  assert.deepEqual(await groups(), ["Men"]);
  await size.selectOption(choice("Men", "8"));
  assert.deepEqual(await order(), ["Birch", "Atlas"], "Out-of-stock Men size8 excluded");
  await page.getByRole("button", { name: "Kids", exact: true }).click();
  assert.deepEqual(await groups(), ["Kids"]);
  await page.getByRole("button", { name: "Boys", exact: true }).click();
  assert.deepEqual(await groups(), ["Boys"]);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await size.selectOption(choice("Kids", "2"));
  const soldOut = structuredClone(expanded);
  soldOut.products.find((p) => p.id === "kids").sizes[0].available = false;
  await page.evaluate((fresh) => {
    window.__nextCatalog = fresh;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  }, soldOut);
  await page.getByRole("heading", { name: "No designs found.", exact: true }).waitFor();
  assert.equal(await size.inputValue(), choice("Kids", "2"));
  assert.equal(
    await size.locator("option:checked").evaluate((option) => option.disabled),
    true,
    "Unavailable selection remains labelled, never blank: " + (await size.innerHTML()),
  );
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  assert.equal(
    await grid.getByRole("heading").count(),
    9,
    "A product without a brand remains listed",
  );
  await page.evaluate((fresh) => {
    window.__nextCatalog = fresh;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  }, fresh);
  await page.waitForFunction(
    () => document.querySelectorAll('#catalog-collection [class*="productGrid"] h3').length === 6,
  );
  await sorting().selectOption("price-asc");
  const layouts = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const boxes = await page
      .locator('#catalog-collection [class*="filters"] > label')
      .evaluateAll((labels) =>
        labels.map((label) => {
          const r = label.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    assert.equal(boxes.length, 3);
    assert(Math.abs(boxes[0].y - boxes[1].y) < 1, "First two fields must align");
    assert(
      Math.abs(boxes[0].w - boxes[1].w) < 1 && Math.abs(boxes[2].w - boxes[0].w) < 1,
      "Equal field widths",
    );
    assert(Math.abs(boxes[2].y - boxes[0].y) < 1, "Style stays beside size and sort");
    assert.equal(
      Math.round((await page.locator('[class*="filterPanel"]').boundingBox()).height),
      44,
      "Only one compact control row",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({ path: out + `/collection-${width}.png` });
    if (width === 390) {
      await heading.scrollIntoViewIfNeeded();
      await page.screenshot({ path: out + "/size-sort-style-mobile.png" });
    }
    layouts.push({ width, height, aligned: true, noOverflow: true });
  }
  await page.getByRole("button", { name: "Ask about a photo", exact: true }).click();
  const inquiry = page.getByRole("dialog");
  await inquiry.getByRole("heading", { name: "Ask by photo", exact: true }).waitFor();
  assert.equal(await inquiry.locator('input[type="file"]').count(), 0);
  assert.equal(await inquiry.locator("img").count(), 0);
  assert.equal(await inquiry.getByRole("button", { name: /Choose a photo/ }).count(), 0);
  await inquiry
    .getByText("WhatsApp will open — attach your photo there and send.", { exact: true })
    .waitFor();
  await inquiry.getByRole("button", { name: "Men", exact: true }).click();
  await inquiry.getByRole("button", { name: "7", exact: true }).click();
  const handoff = new URL(
    await inquiry
      .getByRole("link", { name: "Continue on WhatsApp", exact: true })
      .getAttribute("href"),
  );
  assert.equal(handoff.hostname, "wa.me");
  assert.equal(handoff.pathname, "/919999999999");
  assert(handoff.searchParams.get("text").includes("Bhawani Footwear"));
  assert(handoff.searchParams.get("text").includes("(Men), Size 7"));
  await page.screenshot({ path: out + "/photo-inquiry-mobile.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ask about a photo", exact: true }).click();
  const resetMessage = new URL(
    await inquiry
      .getByRole("link", { name: "Continue on WhatsApp", exact: true })
      .getAttribute("href"),
  ).searchParams.get("text");
  assert(!resetMessage.includes("Size 7"), "Closing inquiry clears the previous selection");
  await page.keyboard.press("Escape");
  for (const [language, sortLabel] of [
    ["hindi", "क्रम चुनें"],
    ["hinglish", "Sort by"],
    ["english", "Sort by"],
  ]) {
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption(language);
    await page.getByRole("combobox", { name: sortLabel, exact: true }).selectOption("price-desc");
    assert.equal((await order())[0], "Atlas");
    await page.getByRole("button", { name: "Ask about a photo", exact: true }).click();
    await inquiry
      .getByRole("heading", {
        name: { hindi: "फोटो से पूछें", hinglish: "Photo se poochein", english: "Ask by photo" }[
          language
        ],
        exact: true,
      })
      .waitFor();
    assert.equal(await inquiry.locator('input[type="file"]').count(), 0);
    await inquiry
      .getByRole("link", {
        name: {
          hindi: "WhatsApp पर जारी रखें",
          hinglish: "WhatsApp par continue karein",
          english: "Continue on WhatsApp",
        }[language],
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Escape");
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
    photoInquiryWithoutFilePicker: true,
    whatsappHandoffIncludesSelectedCategoryAndSize: true,
    photoInquiryResetAndThreeLanguages: true,
    categorySizeGroups: true,
    overlappingSizeLabelsSeparated: true,
    spotlightBeforeControls: true,
    brandRemoved: true,
    styleAlongsideSizeAndSort: true,
    separateMenWomenStyles: true,
    blankBrandProductRetained: true,
    noBlankSizeOptionOnStockRefresh: true,
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
