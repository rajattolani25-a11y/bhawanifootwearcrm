import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(15000);
const errors = [],
  external = [];
let termsReads = 0,
  failTerms = true;
const product = {
  id: "10000000-0000-4000-8000-000000000001",
  brand: "QA",
  article: "Everyday Pair",
  category: "Men / Sports & Active",
  color: "Olive",
  price: 1599,
  mrp: 2099,
  image: null,
  description: "QA shoe description",
  sizes: [{ id: "20000000-0000-4000-8000-000000000001", size: "7", available: true }],
};
const shop = {
  name: "Bhawani Footwear",
  phone: "9999999999",
  address: "Main Road, Near Indore Sweets, Jawahar Nagar, Jabalpur",
  booking: true,
  local: true,
  outside: false,
  local_charge: 40,
  outside_charge: 80,
  advance_percent: 50,
  hold_hours: 24,
  free_delivery_above: null,
};
const data = {
  enabled: true,
  shop,
  products: [product],
  hero: null,
  offer: null,
  presentation: { gallery_enabled: false, motion_enabled: false, theme: "ivory" },
};
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__orders = 0;
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/catalog-terms.json") && !url.search.includes("url")) {
    termsReads++;
    return failTerms
      ? route.fulfill({ status: 503, contentType: "text/plain", body: "Synthetic offline error" })
      : route.fulfill({
          contentType: "application/json",
          body: await fs.readFile(
            new URL("../src/lib/catalog-terms.json", import.meta.url),
            "utf8",
          ),
        });
  }
  if (url.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const d=${JSON.stringify(data)};export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async({data})=>{window.__orders++;return{booking_no:'QA-ORDER',price:1599,advance:800,delivery_charge:0,fulfillment:'pickup',upi_id:'qa@upi',phone:'9999999999',shop:'Bhawani Footwear',product:'Everyday Pair',size:'7',hold_hours:24};};`,
    });
  if (url.pathname === "/terms-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
  external.push(url.origin);
  return route.abort();
});
const terms = () => page.locator("[data-catalog-terms]");
const agreement = () =>
  page.getByRole("checkbox", { name: "I agree to the Terms & Conditions", exact: true });
try {
  await page.goto("http://127.0.0.1:3000/terms-audit.html");
  await page.getByRole("heading", { name: "Shop the collection", exact: true }).waitFor();
  assert.equal(termsReads, 0, "Terms text not downloaded on initial entry");
  await page
    .locator("footer")
    .getByRole("button", { name: "Terms & Conditions", exact: true })
    .click();
  await terms()
    .getByText("Terms could not load. Check your connection and try again.", { exact: true })
    .waitFor();
  failTerms = false;
  await terms().getByRole("button", { name: "Retry", exact: true }).click();
  await terms().getByRole("heading", { name: "Cancellations & Refunds", exact: true }).waitFor();
  assert.equal(await terms().locator("ol > li").count(), 12);
  assert(
    (await terms().innerText()).includes(
      "customer-requested cancellations and change-of-mind refunds are not accepted",
    ),
  );
  await terms().getByRole("button", { name: "Back", exact: true }).click();
  const cachedReads = termsReads;
  await page
    .getByRole("navigation", { name: "Catalog navigation" })
    .getByRole("button", { name: "Help", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Terms & Conditions", exact: true })
    .click();
  await terms().getByRole("heading", { name: "Size Exchange", exact: true }).waitFor();
  await terms().getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(
    await page.getByRole("dialog").getByRole("heading", { name: "Help", exact: true }).count(),
    1,
    "Terms returns to Help",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "QA Everyday Pair", exact: true }).click();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Get this pair", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Your name", { exact: true }).fill("QA Customer");
  await page.getByPlaceholder("Mobile number", { exact: true }).fill("9999999999");
  assert.equal(await agreement().isChecked(), false);
  assert.equal(
    await page.getByRole("button", { name: "Place order", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await page.evaluate(() => window.__orders), 0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Terms & Conditions", exact: true })
    .click();
  await terms().getByRole("heading", { name: "Product Images & Colours", exact: true }).waitFor();
  assert(
    await terms().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return !!document
        .elementFromPoint(r.x + r.width / 2, r.y + 110)
        ?.closest("[data-catalog-terms]");
    }),
    "Terms paints above the checkout portal",
  );
  await terms().evaluate(async el=>{await Promise.allSettled(el.getAnimations().map(a=>a.finished));});
  assert.equal(await terms().evaluate(el=>getComputedStyle(el).opacity),"1");
  await page.screenshot({ path: "/workspace/review/catalog-terms/terms-open.png" });
  await terms().getByRole("button", { name: "Back", exact: true }).click();
  assert.equal(
    await page.getByPlaceholder("Your name", { exact: true }).inputValue(),
    "QA Customer",
  );
  assert.equal(
    await page.getByPlaceholder("Mobile number", { exact: true }).inputValue(),
    "9999999999",
  );
  assert.equal(await agreement().isChecked(), false, "Reading terms does not auto-check consent");
  assert.equal(termsReads, cachedReads, "Repeated reads reuse the loaded static text");
  await agreement().check();
  assert.equal(
    await page.getByRole("button", { name: "Place order", exact: true }).isEnabled(),
    true,
  );
  await agreement().uncheck();
  assert.equal(
    await page.getByRole("button", { name: "Place order", exact: true }).isDisabled(),
    true,
  );
  const out = "/workspace/review/catalog-terms";
  await fs.mkdir(out, { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await agreement().boundingBox();
    assert(box.width === 14 && box.height === 14, "Small 14px checkbox " + width);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await agreement().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/checkout-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await agreement().check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("QA-ORDER", { exact: false }).first().waitFor();
  assert.equal(await page.evaluate(() => window.__orders), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: deferred/retryable terms, footer/help links, nested checkout draft preservation, default unchecked 14px consent, order gate and responsive geometry",
  );
} finally {
  await browser.close();
}
