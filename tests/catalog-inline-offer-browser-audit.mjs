import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-inline-offer";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
page.setDefaultTimeout(15000);
const names = ["Cedar", "Atlas", "Birch", "Dune", "Elm", "Fir"];
const products = names.map((article, i) => ({
  id: "p" + i,
  article,
  brand: i % 2 ? "North" : "Demo",
  color: "Cream",
  category:
    i < 3
      ? "Men / Sports & Active"
      : i === 4
        ? "Women / Sports & Active"
        : "Women / Sandals & Flats",
  price: [999, 1499, 499, 799, 1299, 999][i],
  mrp: [1299, 1999, 999, 799, 1299, 1499][i],
  image: null,
  image_key: null,
  sizes: [
    { id: `v${i}-7`, size: "7", available: i !== 1 },
    { id: `v${i}-8`, size: "8", available: i !== 0 },
  ],
}));
const data = {
  enabled: true,
  shop: { name: "Bhawani Footwear", phone: "9999999999", booking: true },
  products,
  hero: null,
  presentation: {
    gallery_enabled: true,
    category_accents: true,
    motion_enabled: false,
    theme: "ivory",
  },
};
const offer = {
  title: "A LITTLE EXTRA, ON US",
  subtitle: "A little extra for your next pair.",
  code: "PAIR200",
  kind: "fixed",
  value: 200,
  min_bill: 1499,
  max_discount: null,
  card: false,
};
data.offer = offer;
data.presentation.motion_enabled = true;
const errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() !== "GET") writes.push(url.pathname);
  if (url.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>window.__nextCatalog??data;export const getCatalogPhotos=async()=>({available:true,images:[]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No live writes allowed')};`,
    });
  if (url.pathname === "/collection-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
  return route.abort();
});

await page.addInitScript(() => {
  window.__copied = [];
  window.__clipboardFails = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (window.__clipboardFails) throw Error("Denied");
        window.__copied.push(text);
      },
    },
  });
});
const ticket = () => page.locator("[data-catalog-offer-ticket]");
const copyButton = () => ticket().getByRole("button", { name: "Copy Coupon code", exact: true });
async function refresh(offer, options = {}) {
  const next = { ...data, ...options, offer };
  await page.evaluate((next) => {
    window.__nextCatalog = next;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  }, next);
  if (!offer) await ticket().waitFor({ state: "detached" });
  else
    await page.waitForFunction(
      (text) => document.querySelector("[data-catalog-offer-ticket]")?.textContent?.includes(text),
      offer.code || offer.subtitle || offer.title,
    );
}
try {
  await page.goto("http://127.0.0.1:3000/collection-audit.html");
  await ticket().waitFor();
  assert.equal(await page.locator("header + button").count(), 0, "No old black header offer strip");
  assert.equal(
    await ticket().count(),
    1,
    "Legacy card=false must still show the replacement inline offer",
  );
  assert((await ticket().innerText()).includes("₹200 OFF"));
  assert((await ticket().innerText()).includes("₹1,499+"));
  const layouts = [];
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await ticket().evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = await ticket().boundingBox();
    assert(box.height <= 100, JSON.stringify({ width, box }));
    assert.equal(await ticket().evaluate((el) => getComputedStyle(el).position), "relative");
    const before = await page
      .getByRole("heading", { name: "In the spotlight", exact: true })
      .boundingBox();
    const collection = await page
      .getByRole("heading", { name: "Shop the collection", exact: true })
      .boundingBox();
    assert(
      before.y + before.height < box.y && box.y + box.height <= collection.y,
      "Spotlight → ticket → collection",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    assert((await copyButton().boundingBox()).height >= 44, "Copy touch target remains usable");
    await page.screenshot({ path: out + `/inline-${width}.png` });
    layouts.push({
      width,
      height,
      ticketHeight: Math.round(box.height),
      inFlow: true,
      noOverflow: true,
    });
  }
  await copyButton().click();
  await ticket().getByText("Copied", { exact: true }).first().waitFor();
  assert.deepEqual(await page.evaluate(() => window.__copied), ["PAIR200"]);
  assert.equal(
    await page.getByRole("dialog").count(),
    0,
    "Successful copy must not interrupt browsing",
  );
  await ticket().getByRole("button", { name: "Offer details", exact: true }).click();
  const dialog = () => page.getByRole("dialog");
  await dialog().getByRole("heading", { name: "Offer details", exact: true }).waitFor();
  assert.equal(
    await dialog().getByRole("textbox", { name: "Coupon code", exact: true }).inputValue(),
    "PAIR200",
  );
  await dialog().getByText("Minimum order: ₹1,499", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.__clipboardFails = true;
  });
  await copyButton().click();
  await dialog()
    .getByText("Could not copy. Select the code below and copy it manually.", { exact: true })
    .waitFor();
  assert.equal(
    await dialog()
      .getByRole("textbox", { name: "Coupon code", exact: true })
      .evaluate((el) => el.selectionEnd - el.selectionStart),
    7,
  );
  assert.equal(
    await ticket().getByText("Copied", { exact: true }).count(),
    0,
    "Denied copy cannot claim success",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.__clipboardFails = false;
  });
  await refresh({ ...offer, code: "SAVE20", kind: "percent", value: 20, max_discount: 100 });
  assert((await ticket().innerText()).includes("20% OFF"));
  assert((await ticket().innerText()).includes("Max ₹100 OFF"));
  await ticket().getByRole("button", { name: "Offer details", exact: true }).click();
  await dialog().getByText("Maximum discount: ₹100", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await refresh({ ...offer, code: "CAPPED", max_discount: 100 });
  assert(
    (await ticket().innerText()).includes("₹100 OFF"),
    "Fixed coupons must also respect their real cap",
  );
  await refresh({
    ...offer,
    code: null,
    kind: null,
    value: null,
    min_bill: null,
    max_discount: null,
    subtitle: "Explore our festive collection",
  });
  assert.equal(await ticket().getByRole("button", { name: /Copy/ }).count(), 0);
  assert(!(await ticket().innerText()).includes("₹200"));
  await refresh(null);
  assert.equal(await ticket().count(), 0);
  await refresh(offer, {
    presentation: { ...data.presentation, motion_enabled: false, gallery_enabled: false },
  });
  assert.equal(
    await ticket().evaluate((el) => getComputedStyle(el, "::after").animationName),
    "none",
  );
  assert(
    await ticket().evaluate((el) => el.parentElement.firstElementChild === el),
    "No spotlight still leaves one usable inline ticket",
  );
  await refresh({ ...offer, code: "MOTION" });
  await ticket().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForFunction(
    () => document.querySelector("[data-catalog-offer-ticket]")?.dataset.motion === "true",
  );
  assert.equal(
    await ticket().evaluate((el) => getComputedStyle(el, "::after").animationIterationCount),
    "1",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await ticket().evaluate((el) => getComputedStyle(el, "::after").animationName),
    "none",
  );
  for (const [lang, label, details] of [
    ["hindi", "कॉपी कूपन कोड", "ऑफ़र की जानकारी"],
    ["hinglish", "Copy Coupon code", "Offer ki details"],
    ["english", "Copy Coupon code", "Offer details"],
  ]) {
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption(lang);
    await ticket().getByRole("button", { name: label, exact: true }).waitFor();
    await ticket().getByRole("button", { name: details, exact: true }).click();
    await dialog().getByRole("heading", { name: details, exact: true }).waitFor();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Switch theme", exact: true }).click();
  await ticket().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: out + "/inline-dark.png" });
  await page.clock.install();
  await page.clock.fastForward(22000);
  assert.equal(await dialog().count(), 0, "No timer-driven offer popup");
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  const result = {
    passed: true,
    oldHeaderStripRemoved: true,
    spotlightThenInlineTicket: true,
    layouts,
    copyExactCode: true,
    clipboardFailureManualFallback: true,
    minimumAndCapsAccurate: true,
    noCouponAndDisabledOfferSafe: true,
    ownerMotionAndReducedMotionRespected: true,
    animationIterations: 1,
    languages: 3,
    noAutomaticPopup: true,
    productionWrites: 0,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(await page.locator("body").innerText(), errors);
  await page.screenshot({ path: out + "/failure.png" });
  throw error;
} finally {
  await browser.close();
}
