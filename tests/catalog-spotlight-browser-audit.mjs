import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
page.setDefaultTimeout(15000);
const errors = [],
  external = [];
let motion = true;
const products = Array.from({ length: 8 }, (_, i) => ({
  id: "p" + i,
  brand: "Demo",
  article: "Pair " + i,
  category: i < 4 ? "Men / Sports & Active" : "Women / Sandals & Flats",
  color: "Cream",
  price: 500 + i,
  mrp: 999,
  image: "/demo-shoe.svg",
  sizes: [{ id: "v" + i, size: "7", available: true }],
}));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, products, shop: { name: "Demo Store", phone: null, booking: false, local: false, outside: false }, hero: null, presentation: { gallery_enabled: true, category_accents: true, motion_enabled: motion, theme: "ivory" } })});export const getCatalogPhotos=async()=>({images:[],available:false});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No order writes allowed')};`,
    });
  if (u.pathname === "/spotlight-audit.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/demo-shoe.svg")
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  external.push(u.pathname);
  return r.abort();
});
const spotlight = () => page.getByRole("region", { name: "Product spotlight", exact: true });
const selected = () => spotlight().getAttribute("data-spotlight-product");
async function show() {
  await spotlight().scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
}
async function playing() {
  await page.waitForFunction(
    () => document.querySelector("[data-spotlight-product]")?.dataset.autoplay === "true",
  );
}
try {
  await page.goto("http://127.0.0.1:3000/spotlight-audit.html");
  await spotlight().waitFor();
  const openers = [];
  for (let i = 0; i < 5; i++) {
    await page.reload();
    await spotlight().waitFor();
    const id = await selected();
    if (i) assert.notEqual(id, openers.at(-1));
    openers.push(id);
  }
  await show();
  await playing();
  assert.equal(
    await spotlight()
      .getByRole("button", { name: /Pause|Play/ })
      .count(),
    0,
  );
  const initial = await selected();
  await page.waitForTimeout(1000);
  assert.equal(await selected(), initial);
  await page.waitForFunction(
    (id) => document.querySelector("[data-spotlight-product]")?.dataset.spotlightProduct !== id,
    initial,
    { timeout: 4000 },
  );
  const second = await selected();
  await page.waitForFunction(
    (id) => document.querySelector("[data-spotlight-product]")?.dataset.spotlightProduct !== id,
    second,
    { timeout: 4000 },
  );
  assert((await spotlight().locator("img").count()) <= 3);
  await spotlight().hover();
  for (
    let i = 0;
    i < 8 && (await spotlight().locator("span[data-no-translate]").innerText()) !== "8 / 8";
    i++
  ) {
    await spotlight().getByRole("button", { name: "Next product", exact: true }).click();
  }
  const lastInCycle = await selected();
  await show();
  await playing();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-spotlight-product] span[data-no-translate]")?.textContent ===
      "1 / 8",
    { timeout: 4500 },
  );
  assert.notEqual(await selected(), lastInCycle);
  const seen = [];
  await spotlight().hover();
  const hovered = await selected();
  await page.waitForTimeout(3200);
  assert.equal(await selected(), hovered);
  for (let i = 0; i < 8; i++) {
    seen.push(await selected());
    await spotlight().getByRole("button", { name: "Next product", exact: true }).click();
  }
  assert.equal(new Set(seen).size, 8);
  assert.equal(await selected(), seen[0]);
  await spotlight().getByRole("button", { name: "View pair", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Pair " + seen[0].slice(1), exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await show();
  await playing();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    () => document.querySelector("[data-spotlight-product]")?.dataset.autoplay === "false",
  );
  const hidden = await selected();
  await page.waitForTimeout(3200);
  assert.equal(await selected(), hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await playing();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(
    () => document.querySelector("[data-spotlight-product]")?.dataset.autoplay === "false",
  );
  const offscreen = await selected();
  await page.waitForTimeout(3200);
  assert.equal(await selected(), offscreen);
  await page.setViewportSize({ width: 320, height: 740 });
  const categories = page.getByRole("navigation", { name: "Footwear categories", exact: true });
  const scroll = await categories.evaluate((el) => {
    const style = getComputedStyle(el);
    el.scrollLeft = el.scrollWidth;
    return {
      style: style.scrollbarWidth,
      left: el.scrollLeft,
      width: el.clientWidth,
      all: el.scrollWidth,
    };
  });
  assert.equal(scroll.style, "none");
  assert(scroll.all > scroll.width && scroll.left > 0, JSON.stringify(scroll));
  await categories.getByRole("button", { name: "Women", exact: true }).click();
  await spotlight().waitFor();
  await spotlight().hover();
  for (let i = 0; i < 4; i++) {
    assert(Number((await selected()).slice(1)) >= 4);
    await spotlight().getByRole("button", { name: "Next product", exact: true }).click();
  }
  await categories.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search footwear or brand", exact: true }).fill("Pair 0");
  assert.equal(await spotlight().count(), 0);
  await page.reload();
  await spotlight().waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await show();
  const reduced = await selected();
  await page.waitForTimeout(3200);
  assert.equal(await selected(), reduced);
  assert.equal(await spotlight().getAttribute("data-autoplay"), "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  motion = false;
  await page.reload();
  await spotlight().waitFor();
  await show();
  const disabled = await selected();
  await page.waitForTimeout(3200);
  assert.equal(await selected(), disabled);
  assert.equal(await spotlight().getAttribute("data-autoplay"), "false");
  await page.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    }),
  );
  await page.reload();
  await spotlight().waitFor();
  assert(await selected());
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "New shuffled opener across5reloads, no immediate repeat; no Pause/Play controls",
        "Automatic3second advance with at most3images; manual arrows visit each eligible pair once and open exact product",
        "Mouse hover, hidden tab and offscreen pause; owner motionOFF and reduced motion stop autoplay",
        "Women filter restricts spotlight; one-result search hides it;320px category strip scrolls with no scrollbar",
        "Restricted session storage retains working carousel",
      ],
      openers,
      productionWrites: 0,
      errors,
    }),
  );
} finally {
  await browser.close();
}
