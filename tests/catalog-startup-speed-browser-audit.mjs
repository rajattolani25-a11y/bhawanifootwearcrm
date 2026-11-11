import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
p.setDefaultTimeout(15000);
const errors = [],
  external = [],
  modules = { cart: 0, bargain: 0 },
  images = [];
let releaseCart;
let holdCart = true;
const products = Array.from({ length: 40 }, (_, i) => ({
  id: "10000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  brand: "DEMO",
  article: "Pair " + i,
  category: "Men / Sports & Active",
  color: "Olive",
  price: 1599,
  mrp: 2099,
  image: "/startup-shoe.svg?i=" + i,
  bargain_enabled: true,
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
  products,
  shop: {
    name: "Bhawani Footwear",
    phone: "9999999999",
    booking: true,
    local: false,
    outside: false,
  },
  hero: {
    image: "/below-fold-hero.svg",
    heading: "Everyday. Elevated.",
    subtitle: "Your next pair",
    offer_kind: "custom",
    custom_text: "New arrivals",
    button_label: "Explore",
    offer_value: 1,
    action: "collection",
    product_id: null,
    category: "All",
    motion: true,
    image_scale: 100,
  },
  presentation: {
    gallery_enabled: true,
    category_accents: true,
    motion_enabled: true,
    theme: "ivory",
  },
};
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/components/catalog-commerce/CatalogCart.tsx")) {
    modules.cart++;
    if (holdCart) await new Promise((resolve) => (releaseCart = resolve));
  }
  if (u.pathname.includes("/src/components/catalog-commerce/BargainSheet.tsx")) modules.bargain++;
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `const d=${JSON.stringify(data)};d.presentation.motion_enabled=!location.search.includes('motion=off');d.products=d.products.map(p=>({...p,bargain_enabled:!location.search.includes('bargain=off')}));export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async({data})=>({available:true,images:[d.products.find(p=>p.id===data.productId).image]});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No live writes')};`,
    });
  if (u.pathname.includes("/src/lib/catalog-promotion.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: "export const getCatalogPromotion=async()=>({available:true,value:null});",
    });
  if (u.pathname.includes("/src/lib/catalog-bargain.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: 'export const getBargain=async()=>null;export const makeBargain=async()=>{throw Error("No bid writes")};',
    });
  if (u.pathname === "/startup-speed.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname.endsWith(".svg")) {
    images.push(u.pathname + u.search);
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  }
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  external.push(u.pathname);
  return r.abort();
});
const spot = () => p.getByRole("region", { name: "Product spotlight", exact: true });
const hot = () => p.locator("[data-hot-offer]");
const offer = () => p.getByRole("button", { name: "Make an offer", exact: true });
try {
  await p.goto("http://127.0.0.1:3000/startup-speed.html");
  await spot().waitFor();
  await p.mouse.move(0, 0);
  await p.waitForTimeout(200);
  assert.deepEqual(modules, { cart: 0, bargain: 0 });
  assert.equal(images.filter((x) => x.startsWith("/below-fold-hero")).length, 0);
  assert.equal(
    await spot().locator("[data-slot=current] img").getAttribute("fetchpriority"),
    "high",
  );
  assert.equal(
    await p.locator('[class*="productGrid"] img[loading=lazy][fetchpriority=low]').count(),
    40,
  );
  const hero = p.getByRole("region", { name: "Featured collection", exact: true });
  assert.equal(await hero.locator("img").getAttribute("loading"), "lazy");
  assert.equal(await hero.locator("img").getAttribute("fetchpriority"), "low");
  await p.evaluate(() =>
    Promise.all([
      document.fonts.load('400 16px "IBM Plex Sans"'),
      document.fonts.load('700 20px "Libre Baskerville"'),
    ]),
  );
  const fonts = await p.evaluate(() =>
    [...document.fonts]
      .filter((f) => /IBM Plex Sans|Libre Baskerville/.test(f.family) && f.status === "loaded")
      .map((f) => f.family),
  );
  assert(fonts.length >= 2);
  assert.equal(
    await p.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some(
          (r) => r.name.includes("fonts.googleapis.com") || r.name.includes("fonts.gstatic.com"),
        ),
    ),
    false,
  );
  await p.getByRole("button", { name: "Your cart", exact: true }).click();
  await p.getByRole("status").filter({ hasText: "Loading…" }).waitFor();
  await p.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  holdCart = false;
  releaseCart();
  await p.waitForTimeout(200);
  assert.equal(await p.getByRole("dialog").count(), 0);
  await p.getByRole("button", { name: "Your cart", exact: true }).click();
  await p.getByText("Your cart is empty.", { exact: true }).waitFor();
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "DEMO Pair 0", exact: true }).click();
  await hot().waitFor();
  await offer().scrollIntoViewIfNeeded();
  await p.waitForFunction(
    () => document.querySelector("[data-hot-offer]")?.dataset.playing === "true",
  );
  assert.equal(await hot().innerText(), "HOT");
  assert.equal(
    await hot().evaluate((n) => getComputedStyle(n).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(await hot().locator("svg").count(), 1);
  assert.equal(await p.locator("video,canvas").count(), 0);
  const animations = await hot().evaluate((n) =>
    n
      .getAnimations({ subtree: true })
      .map((a) => ({
        name: a.animationName,
        duration: a.effect.getTiming().duration,
        properties: Object.keys(a.effect.getKeyframes()[0]),
      })),
  );
  assert(animations.length >= 3);
  const tongues = animations.filter((a) => a.name.includes("hot-tongue"));
  assert.equal(tongues.length, 3);
  assert.equal(new Set(tongues.map((a) => a.duration)).size, 3);
  const flameFrame = () =>
    hot()
      .locator("svg path")
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).transform));
  const firstFlame = await flameFrame();
  await p.waitForTimeout(180);
  assert.notDeepEqual(
    await flameFrame(),
    firstFlame,
    "Flame tips and core actually change between frames",
  );
  assert(
    animations.every(
      (a) => !a.properties.some((p) => ["width", "height", "filter", "boxShadow"].includes(p)),
    ),
  );
  await fs.mkdir("/workspace/review/offer-hot", { recursive: true });
  await hot().screenshot({ path: "/workspace/review/offer-hot/actual-hot-badge.png" });
  await p.screenshot({ path: "/workspace/review/offer-hot/product-hot.png" });
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 844 });
    await offer().scrollIntoViewIfNeeded();
    const box = await offer().boundingBox();
    assert(box.width >= 44 && box.height >= 44);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole("button", { name: "7", exact: true }).click();
  await offer().click();
  await p.getByRole("dialog").getByRole("textbox").waitFor();
  assert(modules.bargain >= 1);
  await p.keyboard.press("Escape");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await hot().waitFor();
  assert.equal(await hot().evaluate((n) => n.getAnimations({ subtree: true }).length), 0);
  await p.keyboard.press("Escape");
  await p.goto("http://127.0.0.1:3000/startup-speed.html?motion=off");
  await p.getByRole("button", { name: "DEMO Pair 0", exact: true }).click();
  await hot().waitFor();
  assert.equal(await hot().getAttribute("data-playing"), "false");
  await p.keyboard.press("Escape");
  await p.goto("http://127.0.0.1:3000/startup-speed.html?bargain=off");
  await p.getByRole("button", { name: "DEMO Pair 0", exact: true }).click();
  assert.equal(await hot().count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      cartAndBargainAbsentOnEntry: true,
      belowFoldHeroNotDownloaded: true,
      spotlightPriority: true,
      gridLazyAndLowPriority: true,
      selfHostedFontsLoaded: fonts,
      cancellableChunkLoading: true,
      hotOnly: true,
      transparentButton: true,
      cssAndSVGOnly: true,
      offerStillOpens: true,
      motionControls: true,
      viewports: [320, 390, 768, 1440],
      externalRequests: 0,
      liveWrites: 0,
    }),
  );
} finally {
  holdCart = false;
  releaseCart?.();
  await b.close();
}
