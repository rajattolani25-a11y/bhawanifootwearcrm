import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/spotlight-category";
await fs.mkdir(out, { recursive: true });
const cases = [
  ["Men / Sports & Active", "SPORT", "sport"],
  ["Men / Sneakers & Streetwear", "STREET", "street"],
  ["Men / Formals & Occasion", "FORMAL", "formal"],
  ["Men / Sandals & Floaters", "SANDALS", "sandals"],
  ["Men / Slides & Slippers", "EASY", "easy"],
  ["Men / Other", "EXPLORE", "neutral"],
  ["Women / Sports & Active", "ACTIVE", "active"],
  ["Women / Sneakers & Casuals", "CASUAL", "casual"],
  ["Women / Heels & Occasion", "HEELS", "heels"],
  ["Women / Sandals & Flats", "FLATS", "flats"],
  ["Women / Slides & Slippers", "EASY", "easy"],
  ["Women / Other", "EXPLORE", "neutral"],
  ["Boys", "PLAY", "play"],
  ["Kids", "PLAY", "play"],
  ["Men / Future custom collection", "EXPLORE", "neutral"],
];
const products = cases.map(([category], i) => ({
  id: "p" + i,
  brand: "Test",
  article: "Pair " + i,
  category,
  gender: null,
  color: "Olive",
  price: 1000 + i,
  mrp: 1500,
  image: "/category-shoe.svg?i=" + i,
  sizes: [{ id: "v" + i, size: "7", available: true }],
}));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
page.setDefaultTimeout(12000);
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
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
      body: `const data={enabled:true,shop:{name:'Bhawani Footwear',phone:null,booking:false,local:false,outside:false},products:${JSON.stringify(products)}.map(p=>({...p,spotlight_label:location.search.includes('custom=1')?'WALK-COMFORT':location.search.includes('invalid=1')?'<bad>':null})),hero:null,presentation:{gallery_enabled:!location.search.includes('gallery=off'),category_accents:!location.search.includes('accents=off'),motion_enabled:!location.search.includes('motion=off'),theme:'ivory'}};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No live writes')};`,
    });
  if (u.pathname.includes("/src/lib/catalog-promotion.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: "export const getCatalogPromotion=async()=>({available:true,value:null});",
    });
  if (u.pathname === "/category-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/category-shoe.svg")
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
  external.push(u.pathname);
  return route.abort();
});
const spot = () => page.getByRole("region", { name: "Product spotlight", exact: true });
const search = () => page.getByRole("textbox", { name: "Search footwear or brand", exact: true });
try {
  await page.goto("http://127.0.0.1:3000/category-audit.html");
  await spot().hover();
  const visited = new Set();
  for (let i = 0; i < products.length; i++) {
    const id = await spot().getAttribute("data-spotlight-product");
    const index = +id.slice(1),
      expected = cases[index];
    visited.add(id);
    assert.equal(await spot().getAttribute("data-tone"), expected[2]);
    assert.equal(
      await spot().locator("[aria-hidden=true][data-no-translate]").innerText(),
      expected[1],
    );
    assert((await spot().locator("img").count()) <= 3);
    await spot().getByRole("button", { name: "Next product", exact: true }).click();
  }
  assert.equal(visited.size, products.length);
  const departments = page.getByRole("navigation", { name: "Footwear categories", exact: true });
  await departments.getByRole("button", { name: "Men", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Style", exact: true })
    .selectOption(JSON.stringify(["Men", "Formals & Occasion"]));
  await spot().waitFor();
  assert.equal(await spot().getAttribute("data-tone"), "formal");
  assert.equal(await spot().locator("img").count(), 1);
  assert.equal(await spot().getByRole("button", { name: "Next product", exact: true }).count(), 0);
  assert.equal(await spot().getAttribute("data-autoplay"), "false");
  await spot().getByRole("button", { name: "View pair", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Pair 2", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await departments.getByRole("button", { name: "Women", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Style", exact: true })
    .selectOption(JSON.stringify(["Women", "Heels & Occasion"]));
  assert.equal(await spot().getAttribute("data-tone"), "heels");
  await departments.getByRole("button", { name: "All", exact: true }).click();
  await spot().hover();
  // The surface must interpolate, not flash to a new palette; retain existing photographs.
  let old = await spot().getAttribute("data-tone");
  for (let i = 0; i < products.length; i++) {
    await spot()
      .locator("[data-slot=current] img")
      .evaluate((n) => (window.__oldSpotPhoto = n));
    await spot().getByRole("button", { name: "Next product", exact: true }).click();
    const tone = await spot().getAttribute("data-tone");
    if (tone !== old) {
      assert(await page.evaluate(() => window.__oldSpotPhoto.isConnected));
      const a = await spot().evaluate((n) =>
        n.getAnimations().find((a) => a.transitionProperty === "background-color"),
      );
      assert(a, "Surface colour transition is active");
      break;
    }
    old = tone;
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await spot().scrollIntoViewIfNeeded();
    await spot().hover();
    await page.waitForTimeout(800);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    const image = await spot()
      .locator("[data-slot=current] img")
      .evaluate((n) => ({
        ratio: n.getBoundingClientRect().width / n.parentElement.getBoundingClientRect().width,
      }));
    assert(Math.abs(image.ratio - 0.86) < 0.01);
    await page.screenshot({ path: out + "/spotlight-" + width + ".png" });
  }
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await spot().scrollIntoViewIfNeeded();
  const dark = await spot().evaluate((n) => ({
    ink: getComputedStyle(n).color,
    surface: getComputedStyle(n).backgroundColor,
  }));
  assert.notEqual(dark.ink, dark.surface);
  await page.screenshot({ path: out + "/dark.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => document.querySelector("[data-spotlight-product]")?.dataset.transitions === "false",
  );
  assert.equal(await spot().evaluate((n) => getComputedStyle(n).transitionDuration), "0s");
  await page.goto("http://127.0.0.1:3000/category-audit.html?accents=off&motion=off");
  await spot().waitFor();
  assert.equal(await spot().getAttribute("data-accents"), "false");
  assert.equal(await spot().getAttribute("data-autoplay"), "false");
  assert.equal(
    await spot().evaluate((n) => getComputedStyle(n).getPropertyValue("--spot-highlight").trim()),
    await spot().evaluate((n) => getComputedStyle(n).getPropertyValue("--catalog-accent").trim()),
  );
  await search().fill("no product matches this");
  await spot().waitFor({ state: "detached" });
  await page.goto("http://127.0.0.1:3000/category-audit.html?gallery=off");
  assert.equal(await spot().count(), 0);
  await page.goto("http://127.0.0.1:3000/category-audit.html?custom=1&motion=off");
  await spot().waitFor();
  assert.equal(await spot().locator("[data-custom=true]").innerText(), "WALK-COMFORT");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await spot()
      .locator("[data-custom=true]")
      .evaluate(
        (n) =>
          n.getBoundingClientRect().right <= n.closest("section").getBoundingClientRect().right,
      );
    assert(fits, "Longest custom word fits the Spotlight");
  }
  await page.goto("http://127.0.0.1:3000/category-audit.html?invalid=1&motion=off");
  await spot().waitFor();
  assert.equal(await spot().locator("[data-custom=true]").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      categories: cases.length,
      allTracksCurrentPair: true,
      filteredSinglePair: true,
      exactProductOpens: true,
      smoothPaletteInterpolation: true,
      photoWidth: "86%",
      viewports: [320, 390, 768, 1440],
      ownerFlagsAndReducedMotion: true,
      externalRequests: 0,
      liveWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
