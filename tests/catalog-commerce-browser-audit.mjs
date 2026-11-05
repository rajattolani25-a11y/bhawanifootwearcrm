import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const out = "/tmp/solestack-audit/catalog-commerce";
await fs.mkdir(out, { recursive: true });
const errors = [],
  external = [];
const product = {
  id: "10000000-0000-4000-8000-000000000001",
  brand: "DEMO",
  article: "Everyday Sports Shoe",
  category: "Men / Sports & Active",
  color: "White / Green",
  description: "Everyday comfort. Flexible sole.",
  price: 2200,
  mrp: 2799,
  image: null,
  bargain_enabled: true,
  sizes: [
    { id: "20000000-0000-4000-8000-000000000001", size: "7", available: true },
    { id: "20000000-0000-4000-8000-000000000002", size: "8", available: true },
  ],
};
const data = {
  enabled: true,
  shop: {
    name: "Bhawani Footwear",
    phone: "9999999999",
    address: "Main Road",
    booking: true,
    local: true,
    outside: false,
    local_charge: 50,
    outside_charge: 100,
    free_delivery_above: 2150,
    advance_percent: 20,
    hold_hours: 24,
  },
  products: [product],
  hero: null,
  presentation: { gallery_enabled: false, motion_enabled: false, theme: "ivory" },
};
async function setup(page) {
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__vite_plugin_react_preamble_installed__ = true;
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (t) => t;
  });
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes("/src/lib/catalog-bargain.functions.ts"))
      return route.fulfill({
        contentType: "application/javascript",
        body: `
const key='qa-deal';
export const getBargain=async()=>{const d=JSON.parse(localStorage.getItem(key)||'null');return d?{...d,server_now:new Date().toISOString()}:null;};
export const makeBargain=async({data})=>{window.__bids=(window.__bids||[]).concat(data);let d=JSON.parse(localStorage.getItem(key)||'null');if(d&&d.bids.includes(data.offer))return {...d,duplicate:true,server_now:new Date().toISOString()};if(d?.attempts===2)throw Error('Both chances have been used.');d={id:crypto.randomUUID(),product_id:'${product.id}',variant_id:data.variantId,listed_price:2200,price:d?2045:2090,offer:data.offer,attempts:d?2:1,state:d?'final':'counter',heading:d?2:0,bids:[...(d?.bids||[]),data.offer],expires_at:new Date(Date.now()+180000).toISOString(),server_now:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(d));return d;};`,
      });
    if (u.pathname.includes("/src/lib/catalog.functions.ts"))
      return route.fulfill({
        contentType: "application/javascript",
        body: `const d=${JSON.stringify(data)};export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>{throw Error('Bargained orders cannot use coupons')};export const trackOrder=async()=>null;export const createBooking=async({data})=>{window.__order=data;const q=JSON.parse(localStorage.getItem('qa-deal'));if(data.bargain&&(data.bargain.id!==q.id||data.quote.net!==q.price||data.coupon))throw Error('ORDER_REJECTED: Invalid deal');return {booking_no:'BK-DEMO-ORDER',price:data.quote.net,advance:data.quote.advance,delivery_charge:data.quote.charge,fulfillment:data.fulfillment,upi_id:'demo@upi',shop:'Bhawani Footwear',phone:'9999999999',product:'Everyday Sports Shoe',size:'7',hold_hours:24};};`,
      });
    if (u.pathname === "/bargain-audit.html")
      return route.fulfill({
        contentType: "text/html",
        body: await fs.readFile(
          new URL("./fixtures/presentation-catalog.html", import.meta.url),
          "utf8",
        ),
      });
    if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
    external.push(u.origin);
    return route.abort();
  });
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await setup(page);
  await page.goto("http://127.0.0.1:3000/bargain-audit.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const box = await page.getByRole("button", { name: "Your cart", exact: true }).boundingBox();
    assert(box.width >= 44 && box.height >= 44);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  await page.getByText("Your cart is empty.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue shopping", exact: true }).click();
  await page.getByRole("button", { name: /DEMO Everyday/ }).click();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Make an offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1900");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByText("Here’s our counter.", { exact: true }).waitFor();
  const expiry = await page.evaluate(() => JSON.parse(localStorage.getItem("qa-deal")).expires_at);
  assert(
    (await page.getByRole("dialog").locator("time").innerText()).startsWith("02:") ||
      (await page.getByRole("dialog").locator("time").innerText()) === "03:00",
  );
  await page.getByRole("button", { name: "Revise my offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1900");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByText("You’ve already made this offer.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("qa-deal")).expires_at),
    expiry,
  );
  await page.getByRole("button", { name: "Revise my offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1975");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByText("Here’s our closing offer.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Revise my offer", exact: true }).count(), 0);
  await page.screenshot({ path: out + "/counter-390.png" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    const bounds = await page.getByRole("dialog").locator("time").boundingBox();
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 700);
    const a = await page.getByRole("button", { name: /Accept price & continue/ }).boundingBox();
    assert(a.y >= 0 && a.y + a.height <= 700);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Accept price & continue/ }).click();
  await page.getByText("How do you want it?", { exact: true }).waitFor();
  // Bargained net2045 is below free-shipping2150; local quote must show50, not Free.
  assert((await page.getByRole("button", { name: /Local delivery/ }).innerText()).includes("50"));
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.getByRole("button", { name: "Back to catalog", exact: true }).click();
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  await page.getByRole("button", { name: "Review & order", exact: true }).waitFor();
  await page.screenshot({ path: out + "/cart-390.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Review & order", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Review & order", exact: true }).click();
  await page.getByRole("button", { name: "Get this pair", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Your name", { exact: true }).fill("Demo buyer");
  await page.getByPlaceholder("Mobile number", { exact: true }).fill("9999999999");
  assert.equal(await page.getByPlaceholder("Coupon code (optional)", { exact: true }).count(), 0);
  const timer = await page.getByRole("dialog").locator("time").boundingBox();
  assert(timer.y + timer.height < 844);
  await page.screenshot({ path: out + "/checkout-390.png" });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("BK-DEMO-ORDER", { exact: true }).first().waitFor();
  const order = await page.evaluate(() => window.__order);
  assert.equal(order.quote.net, 2045);
  assert.equal(order.quote.advance, 409);
  assert(order.bargain.id);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("solestack-catalog-cart-v1")).length),
    0,
  );
  // A separate customer context tests timer expiry and explicit listed-price fallback.
  const expiryContext = await browser.newContext({
    viewport: { width: 320, height: 700 },
    reducedMotion: "reduce",
  });
  const e = await expiryContext.newPage();
  await setup(e);
  await e.goto("http://127.0.0.1:3000/bargain-audit.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  await e.getByRole("button", { name: /DEMO Everyday/ }).click();
  await e.getByRole("button", { name: "7", exact: true }).click();
  await e.getByRole("button", { name: "Make an offer", exact: true }).click();
  await e.getByRole("textbox", { name: "Your offer", exact: true }).fill("1900");
  await e.getByRole("button", { name: "Send my offer", exact: true }).click();
  await e.getByRole("button", { name: /Accept price & continue/ }).click();
  await e.evaluate(()=>{const now=Date.now.bind(Date);Date.now=()=>now()+181000;});
  await e.waitForTimeout(1100);
  await e
    .getByText("This bargain price has expired. Choose the listed price to continue.", {
      exact: true,
    })
    .waitFor();
  await e.screenshot({ path: out + "/expired-320.png" });
  await e.getByRole("button", { name: /Use listed price/ }).click();
  assert.equal(await e.locator("time").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    out + "/checks.json",
    JSON.stringify(
      {
        pass: true,
        checks: [
          "cart placement320to1440",
          "two bids and duplicate",
          "context headings",
          "fixed180second timer",
          "cart persistence",
          "correct reduced-price shipping",
          "no coupon stack",
          "exact negotiated checkout",
          "cart removes only ordered pair",
          "expiry requires explicit price choice",
        ],
        errors,
        external,
      },
      null,
      2,
    ),
  );
  console.log("Catalog commerce browser audit passed");
} finally {
  await browser.close();
}
