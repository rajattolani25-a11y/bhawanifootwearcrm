import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/spotlight-placement";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ reducedMotion: "reduce" });
page.setDefaultTimeout(12000);
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
const product = {
  id: "p1",
  brand: "LAKHANI VARDAAN",
  article: "CANYON-24",
  category: "Men / Sports & Active",
  color: "Olive",
  price: 1599,
  mrp: 2099,
  image: "/placement-shoe.svg",
  sizes: [{ id: "v1", size: "7", available: true }],
};
const hero = {
  image: "/placement-shoe.svg",
  heading: "Everyday. Elevated.",
  subtitle: "Find your next favourite pair.",
  button_label: "Browse collection",
  offer_kind: "custom",
  offer_value: 1,
  custom_text: "New arrivals",
  action: "collection",
  product_id: null,
  category: "All",
  motion: true,
  image_scale: 100,
};
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `const d={enabled:true,shop:{name:'Bhawani Footwear',phone:'9999999999',booking:true,local:true,outside:false,address:'Main Road, Near Indore Sweets, Jawahar Nagar'},products:${JSON.stringify([product, { ...product, id: "p2", article: "Second Pair" }])},hero:${JSON.stringify(hero)},presentation:{gallery_enabled:!location.search.includes('gallery=off'),category_accents:true,motion_enabled:true,theme:'ivory'}};export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No real orders')};`,
    });
  if (u.pathname.includes("/src/lib/catalog-promotion.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: "export const getCatalogPromotion=async()=>({available:true,value:null});",
    });
  if (u.pathname === "/placement.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/placement-shoe.svg")
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  external.push(u.pathname);
  return r.abort();
});
const spot = () => page.getByRole("region", { name: "Product spotlight", exact: true });
const banner = () => page.getByRole("region", { name: "Featured collection", exact: true });
const checks = [];
try {
  for (const [width, height] of [
    [320, 568],
    [390, 640],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:3000/placement.html");
    await spot().waitFor();
    await page.waitForTimeout(150);
    const position = await spot().boundingBox(),
      search = await page
        .getByRole("textbox", { name: "Search footwear or brand", exact: true })
        .boundingBox(),
      nav = await page
        .getByRole("navigation", { name: "Catalog navigation", exact: true })
        .boundingBox(),
      photo = await spot().locator("[data-slot=current] img").boundingBox(),
      action = await spot().getByRole("button", { name: "View pair", exact: true }).boundingBox();
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert(search.y + search.height < position.y);
    assert(
      photo.y >= position.y && photo.y + photo.height < nav.y,
      "Main photo is visible on opening",
    );
    assert(action.y + action.height <= nav.y, "View pair stays above fixed navigation");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    const h = await banner().boundingBox(),
      grid = await page.locator('[class*="productGrid"]').boundingBox();
    assert(h.y >= grid.y + grid.height);
    assert.equal(await banner().count(), 1);
    checks.push({
      width,
      height,
      spotlightTop: position.y,
      actionBottom: action.y + action.height,
      navTop: nav.y,
    });
    await page.screenshot({ path: out + "/entry-" + width + "-" + height + ".png" });
  }
  await banner().getByRole("button", { name: "Browse collection", exact: true }).click();
  assert((await spot().boundingBox()).y >= 0);
  await page.goto("http://127.0.0.1:3000/placement.html?gallery=off");
  assert.equal(await spot().count(), 0);
  assert(
    (await banner().boundingBox()).y <
      (
        await page
          .getByRole("textbox", { name: "Search footwear or brand", exact: true })
          .boundingBox()
      ).y,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks,
      heroRetainedBelowProducts: true,
      galleryOffPreservesOriginalHero: true,
      heroActionWorks: true,
      externalRequests: 0,
      liveWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
