import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-about-speed";
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
p.setDefaultTimeout(20000);
let mapRequests = 0,
  aboutModules = 0,
  photoRequests = 0,
  stock = 999;
const errors = [],
  writes = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
const products = Array.from({ length: 120 }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  brand: "Demo",
  article: "Pair " + i,
  category: "Men / Sports & Active",
  color: "Cream",
  mrp: 1299,
  price: 999,
  image: "/about-shoe.svg",
  image_key: "cover" + i,
  sizes: [{ id: "v" + i, size: "7", available: true }],
}));
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (r.request().method() !== "GET") writes.push(u.pathname);
  if (u.pathname.includes("/src/components/CatalogAbout.tsx")) aboutModules++;
  if (u.hostname === "maps.google.com") {
    mapRequests++;
    return r.fulfill({ contentType: "text/html", body: "<p>Map fixture</p>" });
  }
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop: { name: "Bhawani Footwear", phone: "9999999999", address: "Stored address", booking: true, local: true, outside: false, local_charge: 30, advance_percent: 50, hold_hours: 24 }, products, hero: null, presentation: { gallery_enabled: true, category_accents: true, motion_enabled: true, theme: "ivory" } })});export const getCatalogSnapshot=async()=>({enabled:true,shop:${JSON.stringify({ name: "Bhawani Footwear", phone: "9999999999", booking: true })},products:${JSON.stringify(products)}.map(p=>({...p,price:${stock},image:null}))});export const getCatalogPhotos=async()=>{window.__photoRequests=(window.__photoRequests||0)+1;return{images:['/about-shoe.svg','/about-shoe.svg?view=2'],available:true}};export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No order writes allowed')};`,
    });
  if (u.pathname === "/about-audit.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/about-shoe.svg")
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#687d50" d="M20 300 100 100 250 220 530 270 550 340 20 340Z"/></svg>',
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  return r.abort();
});
try {
  await p.goto("http://127.0.0.1:3000/about-audit.html");
  await p.getByRole("button", { name: "Demo Pair 0", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: /^Demo Pair / }).count(), 120);
  assert.equal(mapRequests, 0);
  assert.equal(aboutModules, 0);
  assert.equal(await p.locator("iframe").count(), 0);
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [568, 320],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await p.setViewportSize({ width, height });
    const menu = p.getByRole("navigation", { name: "Catalog navigation", exact: true });
    if (width < 700) await menu.getByRole("button", { name: "About", exact: true }).click();
    else await p.getByRole("button", { name: "About our store", exact: true }).click();
    const about = p.locator("[data-catalog-about]");
    await about.waitFor();
    const text = await about.innerText();
    assert(text.includes("Bhawani Footwear"));
    assert(text.includes("Main Road, Near Indore Sweets, Jawahar Nagar"));
    assert(!text.includes("Jai Prakash"));
    assert(text.includes("10:30 AM – 10:30 PM"));
    assert(!/weekly|Everyday pair|exchange policy|weekly off/i.test(text));
    const directions = new URL(
      await about.getByRole("link", { name: "Get Directions", exact: true }).getAttribute("href"),
    );
    assert.equal(directions.searchParams.get("destination"), "23.2010194,79.9501189");
    assert.equal(
      await about.getByRole("link", { name: "WhatsApp", exact: true }).getAttribute("href"),
      "https://wa.me/919999999999",
    );
    assert.equal(
      await about.getByRole("link", { name: /Call store/ }).getAttribute("href"),
      "tel:+919999999999",
    );
    await p.evaluate(() => document.fonts.ready);
    await about.evaluate(n => Promise.all(n.getAnimations().map(a => a.finished.catch(() => {}))));
    const box = await about.boundingBox();
    assert(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1,
      JSON.stringify(box),
    );
    // These actions must be visible and actually hit-testable before scrolling.
    for (const name of ["WhatsApp", "Get Directions", /Call store/]) {
      const link = about.getByRole("link", { name, exact: typeof name === "string" });
      const rect = await link.boundingBox();
      assert(
        rect && rect.y >= box.y && rect.y + rect.height <= box.y + box.height + 1,
        JSON.stringify({ width, height, name: String(name), rect, box }),
      );
      assert(
        await link.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || el.contains(hit);
        }),
        `Contact action obscured at ${width}x${height}: ${name}`,
      );
    }
    const whatsapp = about.getByRole("link", { name: "WhatsApp", exact: true });
    const before = await whatsapp.boundingBox();
    await about.locator("iframe").evaluate((frame) => {
      frame.parentElement.scrollTop = frame.parentElement.scrollHeight;
    });
    assert.equal(
      (await whatsapp.boundingBox()).y,
      before.y,
      "Contact actions must stay still while About content scrolls",
    );
    await p.screenshot({ path: out + `/about-${width}.png` });
    await p.keyboard.press("Escape");
    await about.waitFor({ state: "detached" });
  }
  assert(aboutModules > 0);
  assert(mapRequests > 0);
  assert.equal(await p.locator("iframe").count(), 0);
  assert.equal(await p.getByRole("button", { name: /^Demo Pair / }).count(), 120);
  await p.getByRole("button", { name: "Demo Pair 37", exact: true }).click();
  await p.getByRole("dialog").getByRole("heading", { name: "Pair 37", exact: true }).waitFor();
  await p.getByRole("dialog").getByRole("button", { name: "View photo 2", exact: true }).waitFor();
  photoRequests = await p.evaluate(() => window.__photoRequests);
  assert.equal(photoRequests, 1);
  await p.keyboard.press("Escape");
  for (const [lang, label, title] of [
    ["hindi", "हमारी दुकान", "हमारी दुकान के बारे में"],
    ["hinglish", "Hamari dukaan", "Hamari dukaan ke baare mein"],
    ["english", "About our store", "About our store"],
  ]) {
    await p.locator("select[aria-label=Language]").selectOption(lang);
    await p.getByRole("button", { name: label, exact: true }).click();
    await p
      .locator("[data-catalog-about]")
      .getByRole("heading", { name: title, exact: true })
      .waitFor();
    await p.keyboard.press("Escape");
  }
  await p.getByRole("button", { name: "Switch theme", exact: true }).click();
  await p.getByRole("button", { name: "About our store", exact: true }).click();
  await p.locator("[data-catalog-about]").waitFor();
  await p.screenshot({ path: out + "/about-dark.png" });
  await p.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "About/maps absent before opening; lazy-loaded About opens from mobile menu and desktop footer",
        "Approved Main Road/Near Indore Sweets address,10:30AM–10:30PM, exact directions pin and existing contact only",
        "120 products remain available; exact pair opens with its gallery, no live writes",
        "About fits320/360/390/568/768/1440 widths including short landscape; WhatsApp/Call/Directions hit-testable before scrolling and stay fixed during body scroll",
        "English/Hindi/Hinglish and customer dark preference",
      ],
      mapRequests,
      photoRequests,
      errors,
      productionWrites: 0,
    }),
  );
} catch (error) {
  console.error(await p.locator("body").innerText(), errors);
  console.error(
    await p
      .locator("button")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({ text: n.textContent, label: n.getAttribute("aria-label") })).slice(-12),
      ),
  );
  await p.screenshot({ path: out + "/failure.png" });
  throw error;
} finally {
  await b.close();
}
