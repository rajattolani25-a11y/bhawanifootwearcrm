import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-order-recovery";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
page.setDefaultTimeout(20000);
const errors = [],
  external = [];
const shoeBytes = await fs
  .readFile(
    process.env.PREVIEW_SHOE ||
      "/workspace/footwear-catalog-images/transparent/01-side-transparent.png",
  )
  .catch(() =>
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOUkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
page.on("pageerror", (e) => errors.push(e.message));
const description =
  "Lakhani FLYO sports shoe in Olive / Black.\n\nSelect your preferred size from the sizes currently available in our store.\n\nFor fitting guidance or more product details, ask Bhawani Footwear on WhatsApp before placing your order.";
const products = [1, 2, 3].map((i) => ({
  id: `10000000-0000-4000-8000-00000000000${i}`,
  brand: "LAKHANI",
  article: i === 1 ? "FLYO Sports Shoe" : i === 2 ? "FLYO Everyday Pair" : "FLYO Walking Pair",
  category: "Gents",
  gender: null,
  color: "Olive / Black",
  mrp: 999,
  price: 999,
  image: "/demo-shoe.png",
  image_key: "demo/path",
  description,
  sizes: [
    { id: `20000000-0000-4000-8000-00000000000${i}`, size: "7", available: true },
    { id: `30000000-0000-4000-8000-00000000000${i}`, size: "8", available: false },
  ],
}));
let motion = true;
let shop = {
  name: "Bhawani Footwear · Preview",
  phone: "9999999999",
  address: null,
  booking: true,
  local: true,
  outside: true,
  local_charge: 30,
  outside_charge: 80,
  free_delivery_above: null,
  delivery_note: null,
  advance_percent: 50,
  hold_hours: 24,
};
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__catalogOrderCalls = [];
});
const calls = [];
let lose = true;
await page.route("**/*", async (r) => {
  if (new URL(r.request().url()).pathname === "/mock-order") {
    const data = r.request().postDataJSON();
    calls.push(data);
    if (lose) {
      lose = false;
      return r.fulfill({ status: 503, body: "lost response" });
    }
    assert.deepEqual(data, calls[0], "Recovery must reuse exact request and quote");
    return r.fulfill({
      json: {
        booking_no: "DEMO-RECOVERED",
        advance: 500,
        price: 999,
        delivery_charge: 0,
        fulfillment: "pickup",
        upi_id: "demo@upi",
        shop: "Demo store",
        phone: "9999999999",
        product: "FLYO Sports Shoe",
        size: "7",
        hold_hours: 24,
      },
    });
  }
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `const initial=${JSON.stringify({ enabled: true, shop, products, hero: null, presentation: { gallery_enabled: false, category_accents: true, motion_enabled: true, theme: "ivory" } })};window.__fullReads=0;export const getCatalog=async()=>{window.__fullReads++;return initial;};export const getCatalogSnapshot=async()=>({...initial,products:initial.products.map(p=>({...p,price:window.__freshPrice||p.price,image:null,sizes:p.sizes.map(s=>({...s,available:window.__soldOut?false:s.available}))}))});export const getCatalogPhotos=async()=>({images:[],available:true});export const checkCoupon=async()=>({code:'DEMO',amount:200});export const trackOrder=async()=>null;export const createBooking=async({data})=>{const r=await fetch('/mock-order',{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('ORDER_UNCONFIRMED: Response interrupted');return r.json();};`,
    });
  if (u.pathname === "/catalog-actions.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("file:///workspace/bhawanifootwearcrm/tests/fixtures/presentation-catalog.html"),
        "utf8",
      ),
    });
  if (u.pathname === "/demo-shoe.png")
    return r.fulfill({
      contentType: "image/png",
      body: shoeBytes,
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (!u.hostname.endsWith("googleapis.com") && !u.hostname.endsWith("gstatic.com"))
    external.push(u.pathname);
  return r.abort();
});

const dialog = () => page.getByRole("dialog");
async function form() {
  await page.goto("http://127.0.0.1:3000/catalog-actions.html");
  await page.getByRole("button", { name: "LAKHANI FLYO Sports Shoe", exact: true }).click();
  await dialog().getByRole("button", { name: "7", exact: true }).click();
  await dialog().getByRole("button", { name: "Get this pair", exact: true }).click();
  await dialog().getByRole("button", { name: "Continue", exact: true }).click();
  await dialog().getByPlaceholder("Your name").fill("Demo Buyer");
  await dialog().getByPlaceholder("Mobile number").fill("9999999991");
}
const checks = [];
try {
  await form();
  await dialog().getByRole("button", { name: "Place order", exact: true }).click();
  await dialog().getByRole("button", { name: "Recover saved order", exact: true }).waitFor();
  assert.equal(calls.length, 1);
  assert.equal(await page.locator("[data-order-success]").count(), 0);
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("solestack-catalog-order-pending-v1")),
  );
  assert.equal(saved.data.requestId, calls[0].requestId);
  assert.deepEqual(saved.data.quote, { price: 999, net: 999, charge: 0, advance: 500 });
  checks.push("Interrupted response retains exact order request and quote; no false success");
  await page.reload();
  await page.getByRole("button", { name: "Recover saved order", exact: true }).click();
  await dialog().getByRole("button", { name: "Recover saved order", exact: true }).click();
  await dialog().getByText("DEMO-RECOVERED", { exact: true }).waitFor();
  assert.equal(calls.length, 2);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("solestack-catalog-order-pending-v1")),
    null,
  );
  const proof = page.locator("[data-payment-proof]");
  assert.equal(await proof.locator("input[type=file]").count(), 0);
  const wa = await proof.getByRole("link").getAttribute("href");
  assert(wa.startsWith("https://wa.me/919999999999?text="));
  assert(new URL(wa).searchParams.get("text").includes("DEMO-RECOVERED"));
  checks.push(
    "Reload recovers one original order; direct shop WhatsApp includes order reference, with no app screenshot upload",
  );
  assert(await dialog().getByRole("link", { name: "Pay with UPI", exact: true }).isVisible());
  await page.waitForTimeout(850);
  assert.equal(
    await page
      .locator("[data-order-success]")
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
      ),
    0,
  );
  checks.push(
    "Recovered order immediately provides UPI/tracking; success flourish settles within1second",
  );
  await dialog().getByRole("button", { name: "Close", exact: true }).first().click();
  await page.evaluate(() => {
    window.__freshPrice = 1099;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  });
  await page.waitForFunction(() => document.body.textContent.includes("1,099"));
  assert.equal(
    await page.evaluate(() => window.__fullReads),
    1,
    "Unchanged images must not be signed/refetched",
  );
  await page.getByRole("button", { name: "LAKHANI FLYO Sports Shoe", exact: true }).click();
  await dialog().getByRole("button", { name: "7", exact: true }).click();
  await page.evaluate(() => {
    window.__soldOut = true;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[role=dialog] button")).some(
      (b) => b.textContent.trim() === "7" && b.disabled,
    ),
  );
  assert(await dialog().getByRole("button", { name: "Out of stock", exact: true }).isDisabled());
  checks.push(
    "Open catalog and product view refresh current price/stock without re-signing unchanged photos; sold-out checkout blocked",
  );
  await page.screenshot({ path: out + "/fresh-soldout.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ result: "PASS", checks, productionWrites: 0, errors }));
} catch (e) {
  await fs.writeFile(out + "/failure.txt", await page.locator("body").innerText());
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
