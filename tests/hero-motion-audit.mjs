import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/hero-motion";
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const c = await b.newContext({
  viewport: { width: 960, height: 540 },
  reducedMotion: "no-preference",
  recordVideo: { dir: out + "/raw", size: { width: 960, height: 540 } },
});
const p = await c.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/hero-motion.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/hero-motion.html", import.meta.url), "utf8"),
    });
  if (u.pathname === "/hero-preview.png")
    return process.env.PREVIEW_SHOE
      ? r.fulfill({ contentType: "image/png", body: await fs.readFile(process.env.PREVIEW_SHOE) })
      : r.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350"><path d="M80 250L120 120L230 180L410 200L520 260L500 300L80 300Z" fill="#d8dccb"/></svg>',
        });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  return r.abort();
});
try {
  await p.goto("http://localhost:8080/hero-motion.html");
  const hero = p.getByRole("region", { name: "Featured collection" });
  await hero.waitFor();
  await hero.locator("img").evaluate((el) => el.decode());
  const snapshot = () =>
    hero.evaluate((root) => {
      const img = root.querySelector("img"),
        light = root.querySelector('[class*="spotlight"]');
      return {
        photo: getComputedStyle(img).transform,
        light: getComputedStyle(light).transform,
        running: root.getAnimations({ subtree: true }).filter((a) => a.playState === "running")
          .length,
      };
    });
  const first = await snapshot();
  await p.waitForTimeout(750);
  const second = await snapshot();
  assert.notEqual(first.photo, second.photo);
  assert.notEqual(first.light, second.light);
  assert(second.running >= 4);
  await p.waitForTimeout(6200);
  await p.getByRole("button", { name: "Shop the collection", exact: false }).click();
  await p.getByText("Collection opened", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Toggle motion", exact: true }).click();
  await p.waitForTimeout(600);
  assert.equal((await snapshot()).running, 0, "Motion OFF left animations running");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.getByRole("button", { name: "Toggle motion", exact: true }).click();
  await p.waitForTimeout(650);
  assert.equal((await snapshot()).running, 0, "Reduced-motion left animations running");
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.reload();
  await hero.waitFor();
  await p.waitForTimeout(800);
  await p.evaluate(() => scrollTo(0, 1000));
  await p.waitForFunction(() => document.querySelector('[data-paused="true"]'));
  assert.equal(
    await hero.evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect.getTiming().iterations === Infinity && a.playState === "running")
          .length,
    ),
    0,
    "Offscreen loops still running",
  );
  await hero.scrollIntoViewIfNeeded();
  await p.waitForFunction(() => document.querySelector('[data-paused="false"]'));
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForFunction(() => document.querySelector('[data-paused="true"]'));
  await p.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 844 });
    await hero.scrollIntoViewIfNeeded();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Overflow at " + width,
    );
  }
  assert.deepEqual(errors, []);
  const result = {
    productActuallyMoves: true,
    spotlightActuallyMoves: true,
    lightSweep: true,
    motionOffStops: true,
    reducedMotionStops: true,
    offscreenPauses: true,
    backgroundHandlerPauses: true,
    ctaResponds: true,
    widths: [320, 390, 768, 1440],
    realWrites: 0,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  const video = p.video();
  await c.close();
  await video.saveAs(out + "/preview-raw.webm");
} finally {
  await b.close();
}
