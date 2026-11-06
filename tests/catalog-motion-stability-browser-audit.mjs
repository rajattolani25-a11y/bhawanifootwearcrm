import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-motion-stability";
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
p.setDefaultTimeout(15000);
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const hero = {
  image: "/hero-main.svg?token=0",
  offer_kind: "up-to",
  offer_value: 20,
  custom_text: "Selected pairs",
  heading: "Everyday. Elevated.",
  subtitle: "Find your next pair.",
  button_label: "Shop the collection",
  action: "collection",
  product_id: null,
  category: "All",
  motion: true,
  image_scale: 90,
};
const products = Array.from({ length: 6 }, (_, i) => ({
  id: "p" + i,
  brand: "Demo",
  article: "Pair " + i,
  category: "Men",
  color: "Olive",
  price: 999,
  mrp: 1299,
  image: "/pair-" + i + ".svg",
  sizes: [{ id: "v" + i, size: "7", available: true }],
}));
let delay = 0,
  failToken = "",
  slowPath = "";
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop: { name: "Bhawani Footwear", phone: null, booking: false }, products, hero, presentation: { theme: "ivory", gallery_enabled: true, category_accents: true, motion_enabled: true } })});export const getCatalogPhotos=async()=>({images:[],available:false});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No writes allowed')};`,
    });
  if (u.pathname === "/motion-stability.html")
    return r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/hero-stability.tsx"></script>',
    });
  if (
    u.pathname.endsWith(".svg") &&
    (u.pathname.startsWith("/hero-") || u.pathname.startsWith("/pair-"))
  ) {
    if (delay || u.pathname === slowPath)
      await new Promise((resolve) => setTimeout(resolve, u.pathname === slowPath ? 650 : delay));
    const failed = failToken && u.searchParams.get("token") === failToken;
    return r.fulfill({
      status: failed ? 404 : 200,
      contentType: failed ? "text/plain" : "image/svg+xml",
      body: failed
        ? "missing image"
        : '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  }
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  return r.abort();
});
const banner = () => p.getByRole("region", { name: "Featured collection", exact: true });
const spot = () => p.getByRole("region", { name: "Product spotlight", exact: true });
async function change(next) {
  await p.evaluate((h) => window.__replaceCatalog({ hero: h, heroUnavailable: false }), next);
}
try {
  await p.goto("http://127.0.0.1:3000/motion-stability.html");
  await banner()
    .locator("img")
    .evaluate((el) => el.decode());
  await p.evaluate(() => {
    window.__heroNode = document.querySelector('[aria-label="Featured collection"]');
    window.__heroRemovals = 0;
    new MutationObserver((records) => {
      for (const m of records)
        for (const node of m.removedNodes)
          if (node === window.__heroNode || node.contains?.(window.__heroNode))
            window.__heroRemovals++;
    }).observe(document.body, { subtree: true, childList: true });
  });
  delay = 350;
  for (let token = 1; token <= 3; token++) {
    const previous = await banner().locator("img").getAttribute("src");
    await change({ ...hero, image: "/hero-main.svg?token=" + token });
    await p.waitForTimeout(100);
    assert.equal(await banner().locator("img").getAttribute("src"), previous);
    assert(
      await p.evaluate(
        () => document.querySelector('[aria-label="Featured collection"]') === window.__heroNode,
      ),
    );
    await p.waitForFunction(
      (token) =>
        document.querySelector('[aria-label="Featured collection"] img')?.getAttribute("src") ===
        "/hero-main.svg?token=" + token,
      token,
    );
    assert.equal(
      await banner()
        .locator("img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    assert.equal(
      await banner().getByRole("heading", { name: hero.heading, exact: true }).isVisible(),
      true,
    );
  }
  failToken = "bad";
  await change({ ...hero, image: "/hero-main.svg?token=bad" });
  await p.waitForTimeout(600);
  assert.equal(await banner().locator("img").getAttribute("src"), "/hero-main.svg?token=3");
  await p.evaluate(() => window.__replaceCatalog({ hero: null, heroUnavailable: true }));
  await p.waitForTimeout(100);
  assert.equal(await banner().count(), 1);
  assert.equal(await p.evaluate(() => window.__heroRemovals), 0);
  // A real replacement can load progressively; last response wins.
  slowPath = "/hero-slow.svg";
  await change({ ...hero, image: "/hero-slow.svg?token=4" });
  await p.waitForTimeout(60);
  delay = 0;
  await change({ ...hero, image: "/hero-fast.svg?token=5" });
  await p.waitForFunction(
    () =>
      document.querySelector('[aria-label="Featured collection"] img')?.getAttribute("src") ===
      "/hero-fast.svg?token=5",
  );
  await p.waitForTimeout(700);
  assert.equal(await banner().locator("img").getAttribute("src"), "/hero-fast.svg?token=5");
  await p.screenshot({ path: out + "/hero-stable.png" });
  // Owner OFF must clear the previous banner, even after a temporary read failure.
  await p.evaluate(() => window.__replaceCatalog({ hero: null, heroUnavailable: false }));
  await banner().waitFor({ state: "detached" });
  await change(hero);
  await banner().waitFor();
  await spot().scrollIntoViewIfNeeded();
  await spot().hover();
  await p.waitForFunction(() =>
    Array.from(document.querySelectorAll("[data-spotlight-product] img")).every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  // The hero was just remounted; finish Spotlight's starting-style entrance
  // before measuring the separate next-product crossfade.
  await p.waitForFunction(() => {
    const current = document.querySelector('[data-spotlight-product] [data-slot="current"]');
    return current && +getComputedStyle(current).opacity === 1;
  });
  await spot()
    .locator('[data-slot="current"] img')
    .evaluate((img) => (window.__oldPair = img));
  const before = await spot().getAttribute("data-spotlight-product");
  await spot().getByRole("button", { name: "Next product", exact: true }).click();
  await p.waitForFunction(
    (id) => document.querySelector("[data-spotlight-product]")?.dataset.spotlightProduct !== id,
    before,
  );
  assert(await p.evaluate(() => window.__oldPair.isConnected));
  assert.equal(
    await p.evaluate(() => window.__oldPair.closest("[data-slot]").dataset.slot),
    "previous",
  );
  await p.waitForTimeout(150);
  const motion = await spot().evaluate((root) => {
    const incoming = root.querySelector('[data-slot="current"]'),
      old = root.querySelector('[data-slot="previous"]');
    return {
      incoming: +getComputedStyle(incoming).opacity,
      outgoing: +getComputedStyle(old).opacity,
      transition: getComputedStyle(incoming).transitionDuration,
      images: root.querySelectorAll("img").length,
      height: root.getBoundingClientRect().height,
    };
  });
  assert(
    motion.incoming > 0 && motion.incoming < 1 && motion.outgoing > 0 && motion.outgoing < 1,
    JSON.stringify(motion),
  );
  assert(motion.incoming + motion.outgoing > 0.9, JSON.stringify(motion));
  assert(motion.images <= 3);
  await p.screenshot({ path: out + "/spotlight-crossfade.png" });
  await p.waitForTimeout(600);
  assert.equal(
    await spot()
      .locator('[data-slot="current"]')
      .evaluate((el) => +getComputedStyle(el).opacity),
    1,
  );
  // Desktop uses the same retained frame pool; mobile remains inside the viewport.
  for (const width of [320, 768, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    await spot().scrollIntoViewIfNeeded();
    assert(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    assert((await spot().locator("img").count()) <= 3);
  }
  await p.waitForTimeout(750);
  await p.screenshot({ path: out + "/spotlight-desktop.png" });
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForFunction(
    () => document.querySelector("[data-spotlight-product]")?.dataset.transitions === "false",
  );
  assert.equal(
    await spot()
      .locator('[data-slot="current"]')
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "Three delayed token renewals keep the same hero node and old decoded frame until replacement is ready",
        "Failed token renewal/temporary optional read keeps working hero; late response cannot overwrite newer photo; owner OFF still removes hero",
        "Retained3photo pool has overlapping650ms slide/fade, no empty central frame and no layout overflow at320/768/1440",
        "Reduced motion disables transition",
      ],
      motion,
      productionWrites: 0,
      errors,
    }),
  );
} catch (error) {
  console.error(await p.locator("body").innerText());
  await p.screenshot({ path: out + "/failure.png" });
  throw error;
} finally {
  await b.close();
}
