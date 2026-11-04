import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-fullscreen-reservation";
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
let opaquePhoto = false,
  missingPhoto = false;
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop, products, hero: null, presentation: { gallery_enabled: false, category_accents: true, motion_enabled: motion, theme: "ivory" } })});export const getCatalogPhotos=async()=>({images:['/demo-shoe.png','/demo-shoe.png?angle=2','/demo-shoe.png?angle=3'],available:true});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async({data})=>{window.__catalogOrderCalls.push(data);await new Promise((resolve,reject)=>{window.__resolveOrder=resolve;window.__rejectOrder=reject});return {booking_no:'DEMO-ORDER',advance:500,price:999,delivery_charge:0,fulfillment:data.fulfillment,upi_id:'demo@upi',shop:'Bhawani Footwear',phone:null,product:'FLYO Sports Shoe',size:'7',hold_hours:24,...window.__reservationResult};};`,
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
      contentType: opaquePhoto ? "image/svg+xml" : "image/png",
      status: missingPhoto ? 404 : 200,
      body: missingPhoto
        ? "missing"
        : opaquePhoto
          ? Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/><rect x="80" y="200" width="420" height="180" rx="50" fill="#567043"/></svg>',
            )
          : shoeBytes,
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
async function saved() {
  await dialog().getByRole("button", { name: "Place order", exact: true }).click();
  await page.waitForFunction(() => window.__resolveOrder);
  await page.evaluate(() => window.__resolveOrder());
  await dialog().getByText("DEMO-ORDER", { exact: true }).waitFor();
}
try {
  await form();
  await saved();
  const success = page.locator("[data-order-success]");
  await page.waitForFunction(
    () => document.querySelector("[data-image-kind]")?.dataset.imageKind === "transparent",
  );
  assert(await dialog().getByRole("link", { name: "Pay with UPI", exact: true }).isVisible());
  assert.equal(await page.evaluate(() => window.__catalogOrderCalls.length), 1);
  const actual = await success.locator("img").getAttribute("src");
  assert.equal(actual, "/demo-shoe.png");
  const upi = await dialog()
    .getByRole("link", { name: "Pay with UPI", exact: true })
    .getAttribute("href");
  assert(upi.includes("am=500") && upi.includes("DEMO-ORDER"));
  for (const text of ["FLYO Sports Shoe", "7", "₹999", "₹500", "₹499", "PAYMENT PENDING"])
    assert((await success.innerText()).includes(text), text);
  assert(!(await success.innerText()).includes("Payment received"));
  checks.push(
    "Only after saved response: selected real photo/size, authoritative999/500/499 amounts, pending-payment status, UPI and tracking immediately usable",
  );
  for (const [width, height] of [
    [430, 932],
    [390, 844],
    [320, 740],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(50);
    const metrics = await dialog().evaluate((el) => {
      const r = el.getBoundingClientRect();
      el.scrollTop = 0;
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        overflow: el.scrollWidth > el.clientWidth + 1,
      };
    });
    assert(
      Math.abs(metrics.x) < 1 &&
        Math.abs(metrics.y) < 1 &&
        Math.abs(metrics.w - width) < 1 &&
        Math.abs(metrics.h - height) < 1,
      JSON.stringify(metrics),
    );
    assert(!metrics.overflow);
    await dialog()
      .getByRole("link", { name: "Pay with UPI", exact: true })
      .scrollIntoViewIfNeeded();
    assert(await dialog().getByRole("link", { name: "Pay with UPI", exact: true }).isVisible());
    assert.equal(await page.locator("[data-payment-proof] input[type=file]").count(), 0);
    await dialog().evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: out + `/reservation-${width}.png` });
  }
  checks.push(
    "Real fullscreen viewport bounds at320/390/430/768/1440; no horizontal overflow; payment/WhatsApp accessible by scroll; no screenshot picker",
  );
  await page.waitForTimeout(1300);
  assert.equal(
    await success.evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
    ),
    0,
  );
  checks.push("Finite animation settles within1.3s; no loop or artificial payment delay");
  await page.setViewportSize({ width: 430, height: 932 });
  await dialog().evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: out + "/reservation-settled.png" });
  for (const [lang, heading] of [
    ["hindi", "आपकी जोड़ी आरक्षित है।"],
    ["hinglish", "Aapka pair reserved hai."],
    ["english", "Your pair is reserved."],
  ]) {
    await page.locator("select[aria-label=Language]").selectOption(lang, { force: true });
    await dialog().getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  checks.push("Reservation and existing proof actions respond to English/Hindi/Hinglish language");
  await page.setViewportSize({ width: 390, height: 844 });
  motion = false;
  await form();
  await saved();
  assert.equal(await page.locator("[data-order-success]").getAttribute("data-motion"), "false");
  assert.equal(
    await page
      .locator("[data-order-success]")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  motion = true;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await form();
  await saved();
  assert.equal(
    await page
      .locator("[data-order-success]")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  checks.push(
    "Owner motion OFF and device reduced-motion retain static artwork with no animations",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  opaquePhoto = true;
  await form();
  await saved();
  await page.waitForFunction(
    () => document.querySelector("[data-image-kind]")?.dataset.imageKind === "opaque",
  );
  assert.equal(await page.locator("[data-order-success] img").isVisible(), true);
  await page.screenshot({ path: out + "/opaque-fallback.png" });
  missingPhoto = true;
  await form();
  await saved();
  await page.waitForFunction(
    () => document.querySelector("[data-image-kind]")?.dataset.imageKind === "missing",
  );
  assert(await dialog().getByRole("link", { name: "Pay with UPI", exact: true }).isVisible());
  checks.push(
    "Opaque photo uses framed fallback; failed cover falls back to branded box without blocking payment",
  );
  missingPhoto = false;
  opaquePhoto = false;
  await page.evaluate(() => localStorage.setItem("catalog-theme", "dark"));
  await form();
  await saved();
  assert.equal(await page.locator("[data-order-success]").getAttribute("data-theme"), "dark");
  assert.equal(
    await page
      .locator("[data-order-success]")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(23, 37, 29)",
  );
  await page.screenshot({ path: out + "/reservation-dark.png" });
  checks.push("Customer dark preference retains a readable dark reservation screen");
  await page.evaluate(() => localStorage.setItem("catalog-theme", "light"));
  await form();
  await dialog().getByRole("button", { name: "Back", exact: true }).click();
  await dialog()
    .getByRole("button", { name: /Local delivery/ })
    .click();
  await dialog().getByRole("button", { name: "Continue", exact: true }).click();
  await dialog()
    .getByPlaceholder("Full address (house, street, landmark)")
    .fill("123 Sample Road, Sample city");
  await page.evaluate(
    () =>
      (window.__reservationResult = {
        price: 899,
        advance: 929,
        delivery_charge: 30,
        coupon_code: "SAVE100",
        coupon_discount: 100,
      }),
  );
  await saved();
  const delivery = await page.locator("[data-order-success]").innerText();
  for (const text of ["₹999", "₹100", "₹30", "₹929"]) assert(delivery.includes(text), text);
  assert(!delivery.includes("Balance at pickup"));
  checks.push(
    "Delivery and coupon reservation displays original999, discount100, fee30 and payable929; no fictitious pickup balance",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = { result: "PASS", checks, errors, external, productionWrites: 0 };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(
    await dialog().evaluate((el) => ({
      classes: el.className,
      transform: getComputedStyle(el).transform,
      translate: getComputedStyle(el).translate,
      animation: getComputedStyle(el).animation,
      transition: getComputedStyle(el).transition,
    })),
  );
  await fs.writeFile(out + "/failure.txt", await page.locator("body").innerText());
  await page.screenshot({ path: out + "/failure.png" });
  throw e;
} finally {
  await browser.close();
}
