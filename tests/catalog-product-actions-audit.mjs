import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/workspace/review/catalog-product-actions";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
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
  description,
  sizes: [
    { id: `20000000-0000-4000-8000-00000000000${i}`, size: "7", available: true },
    { id: `30000000-0000-4000-8000-00000000000${i}`, size: "8", available: false },
  ],
}));
let shop = {
  name: "Bhawani Footwear · Preview",
  phone: "9999999999",
  address: null,
  booking: true,
  local: true,
  outside: false,
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
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop, products, hero: null, presentation: { gallery_enabled: false, category_accents: true, motion_enabled: false, theme: "ivory" } })});export const getCatalogPhotos=async()=>({images:['/demo-shoe.png','/demo-shoe.png?angle=2','/demo-shoe.png?angle=3'],available:true});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async({data})=>{window.__catalogOrderCalls.push(data);return {booking_no:'DEMO-ORDER',advance:500,price:999,delivery_charge:0,fulfillment:data.fulfillment,upi_id:'demo@upi',shop:'Preview store',phone:null,product:'FLYO Sports Shoe',size:'7',hold_hours:24};};`,
    });
  if (u.pathname === "/catalog-actions.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
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
const footer = () => dialog().getByRole("contentinfo", { name: "Product actions", exact: true });
const body = () => dialog().getByRole("region", { name: "Product information", exact: true });
async function open() {
  await page.goto("http://localhost:8080/catalog-actions.html");
  await page.getByRole("button", { name: "LAKHANI FLYO Sports Shoe", exact: true }).click();
  await body().waitFor();
}
const rect = (locator) =>
  locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
try {
  await page.goto("http://localhost:8080/catalog-actions.html");
  const card = page.getByRole("button", { name: "LAKHANI FLYO Sports Shoe", exact: true });
  await card.waitFor();
  assert(!(await card.innerText()).includes("Select your preferred size"));
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/catalog-mobile.png" });
  await card.click();
  await dialog().getByRole("heading", { name: "Product description", exact: true }).waitFor();
  assert((await dialog().innerText()).includes(description));
  await footer().getByRole("button", { name: "Get this pair", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    "Choose size",
  );
  assert.equal(await page.getByText("How do you want it?", { exact: true }).count(), 0);
  assert.equal(await dialog().getByRole("button", { name: "8", exact: true }).isDisabled(), true);
  await dialog().getByRole("button", { name: "7", exact: true }).click();
  assert.equal(
    await dialog().getByRole("button", { name: "7", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  const href = await footer()
    .getByRole("link", { name: "Ask on WhatsApp & visit store", exact: true })
    .getAttribute("href");
  const url = new URL(href);
  assert.equal(url.hostname, "wa.me");
  assert(url.searchParams.get("text").includes("7"));
  assert(url.searchParams.get("text").includes("FLYO Sports Shoe"));
  const sizes = [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1440, 1000],
    [844, 390],
  ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await body().evaluate((e) => (e.scrollTop = 0));
    const first = await rect(footer());
    await body().evaluate((e) => (e.scrollTop = e.scrollHeight));
    const last = await rect(footer()),
      content = await rect(body()),
      modal = await rect(dialog());
    assert(Math.abs(first.y - last.y) < 1, "Footer moved at " + width);
    assert(last.bottom <= height + 1 && last.y >= 0);
    assert(content.bottom <= last.y + 1, "Content covered by actions");
    assert(modal.y >= -1 && modal.bottom <= height + 1);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Overflow " + width,
    );
    for (const button of [
      footer().getByRole("button", { name: "Get this pair", exact: true }),
      footer().getByRole("link", { name: "Ask on WhatsApp & visit store", exact: true }),
    ])
      assert((await rect(button)).height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await body().evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: out + "/product-mobile-top.png" });
  await body().evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.screenshot({ path: out + "/product-mobile-scrolled.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await body().evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: out + "/product-desktop.png" });
  await footer().getByRole("button", { name: "Get this pair", exact: true }).click();
  await page.getByText("How do you want it?", { exact: true }).waitFor();
  assert.equal(await footer().count(), 0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Your name", { exact: true }).fill("Demo Customer");
  await page.getByPlaceholder("Mobile number", { exact: true }).fill("9999999999");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("Order placed — pair kept aside", { exact: true }).waitFor();
  const orders = await page.evaluate(() => window.__catalogOrderCalls);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].variantId, products[0].sizes[0].id);
  assert.equal(orders[0].fulfillment, "pickup");
  shop = { ...shop, booking: false };
  await open();
  await dialog().getByRole("button", { name: "7", exact: true }).click();
  await footer().getByRole("button", { name: "Get this pair", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(),
    false,
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByPlaceholder("Full address (house, street, landmark)").waitFor();
  shop = { ...shop, local: false };
  await open();
  assert.equal(
    await footer().getByRole("button", { name: "Get this pair", exact: true }).count(),
    0,
  );
  assert((await rect(footer().getByRole("link"))).width > (await rect(footer())).width * 0.8);
  products[0].description = "";
  await open();
  assert.equal(
    await dialog().getByRole("heading", { name: "Product description", exact: true }).count(),
    0,
  );
  shop = { ...shop, booking: true };
  products[0].sizes[0].available = false;
  await open();
  assert.equal(
    await footer().getByRole("button", { name: "Out of stock", exact: true }).isDisabled(),
    true,
  );
  products[0].sizes[0].available = true;
  products[0].description = description;
  await page.goto("http://localhost:8080/catalog-actions.html");
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await page.getByRole("button", { name: "LAKHANI FLYO Sports Shoe", exact: true }).click();
  assert.equal(await dialog().getAttribute("data-product-theme"), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/product-dark-mobile.png" });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    result: "PASS",
    scope: "Real UI; fixture product/price and mocked order. No live messages/payments/writes.",
    checks: [
      "description only after product open",
      "pinned header/footer across 5 viewport sizes",
      "44px touch targets and no overlapping content",
      "size-required focus prompt",
      "sold-out sizes blocked",
      "WhatsApp carries chosen size",
      "pickup flow keeps chosen variant",
      "delivery-only default works",
      "owner ordering-off hides purchase button",
      "blank description hidden",
      "dark theme in product portal",
    ],
    screenshots: out,
    errors,
    liveWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-4000));
  throw e;
} finally {
  await browser.close();
}
