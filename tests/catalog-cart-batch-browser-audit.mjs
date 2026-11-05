import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const profile = "/tmp/solestack-cart-profile-" + Date.now(),
  out = "/tmp/solestack-audit/catalog-cart-batch";
await fs.mkdir(out, { recursive: true });
const products = [2200, 800, 1200].map((price, i) => ({
  id: "10000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  brand: "DEMO",
  article: ["Aero", "Breeze", "Cedar"][i],
  category: "Men / Other",
  color: ["Black", "White", "Blue"][i],
  price,
  mrp: price + 200,
  image: null,
  bargain_enabled: i === 2,
  sizes: [
    {
      id: "20000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
      size: "7",
      available: true,
    },
  ],
}));
const data = {
  enabled: true,
  shop: {
    name: "Bhawani Footwear",
    phone: "9999999999",
    booking: true,
    local: true,
    outside: false,
    local_charge: 90,
    outside_charge: 150,
    free_delivery_above: 5000,
    advance_percent: 20,
    hold_hours: 24,
    cart_ready: true,
  },
  products,
  hero: null,
  presentation: { gallery_enabled: false, motion_enabled: false, theme: "ivory" },
};
const errors = [],
  external = [];
let context;
async function open() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = context.pages()[0];
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__vite_plugin_react_preamble_installed__ = true;
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (t) => t;
  });
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes("/src/lib/catalog-cart.functions.ts"))
      return route.fulfill({
        contentType: "application/javascript",
        body: `const key='qa-server-cart';export const createCartOrder=async({data})=>{const stored=JSON.parse(localStorage.getItem(key)||'null');const calls=JSON.parse(localStorage.getItem('qa-cart-calls')||'[]');calls.push(data);localStorage.setItem('qa-cart-calls',JSON.stringify(calls));if(stored){if(JSON.stringify(stored.request)!==JSON.stringify(data))throw Error('ORDER_REJECTED: Retry differs');return {...stored.result,server_now:new Date().toISOString()};}const result={cart_no:'CT-ABCDEF1234567890',price:data.quote.net,delivery_charge:data.quote.charge,advance:data.quote.advance,upi_id:'demo@upi',shop:'Bhawani Footwear',phone:'9999999999',hold_hours:24,server_now:new Date().toISOString(),orders:data.items.map((item,i)=>({booking_no:'CT-ABCDEF1234567890-0'+(i+1),variant_id:item.variantId,product_id:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),product:i===0?'DEMO Aero':'DEMO Breeze',color:i===0?'Black':'White',size:'7',price:item.net,advance:item.net+(i===0?data.quote.charge:0),delivery_charge:i===0?data.quote.charge:0,fulfillment:data.fulfillment,status:'pending',receipt_recorded:false,expires_at:new Date(Date.now()+1800000).toISOString()}))};localStorage.setItem(key,JSON.stringify({request:data,result}));throw Error('ORDER_UNCONFIRMED: Synthetic response interrupted after commit');};`,
      });
    if (u.pathname.includes("/src/lib/catalog.functions.ts"))
      return route.fulfill({
        contentType: "application/javascript",
        body: `const d=${JSON.stringify(data)};export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async({data})=>{if(data.variantId!=='${products[1].sizes[0].id}')throw Error('Wrong coupon pair');return {code:'PAIR100',amount:100};};export const createBooking=async()=>{throw Error('Unexpected single-pair order')};export const trackOrder=async()=>JSON.parse(localStorage.getItem('qa-server-cart')).result;`,
      });
    if (u.pathname === "/cart-batch.html")
      return route.fulfill({
        contentType: "text/html",
        body: await fs.readFile(
          new URL("./fixtures/presentation-catalog.html", import.meta.url),
          "utf8",
        ),
      });
    if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
    external.push(u.origin);
    return route.abort();
  });
  await page.goto("http://127.0.0.1:3000/cart-batch.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  return page;
}
try {
  let page = await open();
  for (const product of products) {
    await page.getByRole("button", { name: "DEMO " + product.article, exact: true }).click();
    await page.getByRole("button", { name: "7", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.getByRole("button", { name: "Back to catalog", exact: true }).click();
  }
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Cedar 7", exact: true }).uncheck();
  assert.equal(await page.getByRole("button", { name: /Review & order/ }).count(), 0);
  await page.getByRole("button", { name: "Order · 2", exact: true }).click();
  await page.getByRole("button", { name: /Local delivery/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Your name", { exact: true }).fill("Demo buyer");
  await page.getByPlaceholder("Mobile number", { exact: true }).fill("9999999999");
  await page
    .getByPlaceholder("Full address (house, street, landmark)", { exact: true })
    .fill("Demo address for synthetic test only");
  await page
    .getByRole("combobox", { name: "Coupon pair", exact: true })
    .selectOption(products[1].sizes[0].id);
  await page.getByPlaceholder("Coupon code (optional)", { exact: true }).fill("PAIR100");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByText("PAIR100 · −₹100", { exact: true }).waitFor();
  await page.screenshot({ path: out + "/checkout-390.png" });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Recover saved cart order", exact: true })
    .waitFor();
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("qa-cart-calls"))[0]);
  assert.equal(first.items.length, 2);
  assert.equal(first.quote.net, 2900);
  assert.equal(first.quote.charge, 90);
  assert.equal(first.quote.advance, 2990);
  assert.equal(first.items.filter((item) => item.coupon).length, 1);
  await context.close();
  page = await open(); // Real browser restart with the same persistent profile.
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Recover saved cart order", exact: true })
    .click();
  await page.getByText("CT-ABCDEF1234567890", { exact: true }).waitFor();
  const calls = await page.evaluate(() => JSON.parse(localStorage.getItem("qa-cart-calls")));
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("solestack-catalog-checkout-pending-v1")),
    null,
  );
  const remaining = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("solestack-catalog-cart-v1")),
  );
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].productId, products[2].id);
  const dialog = page.getByRole("dialog");
  const upi = await dialog.getByRole("link", { name: /Pay with UPI/ }).getAttribute("href");
  assert.equal(new URL(upi).searchParams.get("am"), "2990");
  const proof = await dialog
    .getByRole("link", { name: "Send screenshot on WhatsApp", exact: true })
    .getAttribute("href");
  const text = new URL(proof).searchParams.get("text");
  assert(text.includes("Aero") && text.includes("Breeze") && text.includes("₹2,990"));
  await page.screenshot({ path: out + "/reserved-390.png" });
  await dialog.getByRole("button", { name: "Track order", exact: true }).click();
  await page.getByPlaceholder("Mobile number", { exact: true }).fill("9999999999");
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await page.getByRole("dialog").getByText("DEMO Aero", { exact: true }).waitFor();
  await page.getByRole("dialog").getByText("DEMO Breeze", { exact: true }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate((p) => {
    const item = {
      productId: p.id,
      variantId: p.sizes[0].id,
      deal: {
        id: crypto.randomUUID(),
        product_id: p.id,
        variant_id: p.sizes[0].id,
        listed_price: p.price,
        price: 1100,
        offer: 1000,
        attempts: 2,
        state: "final",
        heading: 0,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        server_now: new Date().toISOString(),
        local_expires_at: Date.now() - 1000,
      },
    };
    localStorage.setItem("solestack-catalog-cart-v1", JSON.stringify([item]));
    window.dispatchEvent(new Event("solestack-catalog-cart-change"));
  }, products[2]);
  await page.getByRole("button", { name: "Your cart", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Order · 1", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: /Use listed price/ }).click();
  assert.equal(
    await page.getByRole("button", { name: "Order · 1", exact: true }).isEnabled(),
    true,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    out + "/checks.json",
    JSON.stringify(
      {
        pass: true,
        checks: [
          "Shop Orders Cart bottom placement",
          "selected products enter one checkout",
          "one coupon target without multiplying discount",
          "one delivery charge",
          "single combined UPI amount",
          "exact original request after real browser restart",
          "unselected cart product retained",
          "expired bargain requires explicit listed-price choice",
          "all products in payment proof and tracking",
        ],
        productionWrites: 0,
      },
      null,
      2,
    ),
  );
  console.log("Combined cart browser/restart audit passed");
} finally {
  await context?.close();
  await fs.rm(profile, { recursive: true, force: true });
}
