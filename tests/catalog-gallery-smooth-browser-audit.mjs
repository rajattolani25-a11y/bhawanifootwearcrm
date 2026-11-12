import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
p.setDefaultTimeout(12000);
const errors = [],
  external = [];
let releaseA,
  releaseB,
  holdA = true,
  holdB = true;
const requests = [];
p.on("pageerror", (e) => errors.push(e.message));
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
      body: 'export const getCatalogPhotos=async({data})=>({available:true,images:data.productId==="one"?["/smooth-one-cover.svg","/smooth-slow-a.svg","/smooth-slow-b.svg","/smooth-fail.svg"]:["/smooth-two-cover.svg","/smooth-two-angle.svg"]});',
    });
  if (u.pathname === "/gallery-smooth.html")
    return r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/gallery-smooth.tsx"></script>',
    });
  if (u.pathname.startsWith("/smooth-")) {
    requests.push(u.pathname);
    if (u.searchParams.get("token") === "expired") return r.abort();
    if (u.pathname === "/smooth-slow-a.svg" && holdA)
      await new Promise((resolve) => (releaseA = resolve));
    if (u.pathname === "/smooth-slow-b.svg" && holdB)
      await new Promise((resolve) => (releaseB = resolve));
    if (u.pathname === "/smooth-fail.svg") return r.abort();
    return r.fulfill({
      contentType: "image/svg+xml",
      body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="' +
        (u.pathname.includes("slow-b") ? "#baa88d" : "#687d50") +
        '"/></svg>',
    });
  }
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  external.push(u.pathname);
  return r.abort();
});
const gallery = () => p.getByLabel("Product photo gallery", { exact: true });
const mainImage = () => gallery().locator("img:not([aria-hidden])").first();
try {
  await p.goto("http://127.0.0.1:3000/gallery-smooth.html");
  await p.getByRole("button", { name: "View photo 4", exact: true }).waitFor();
  await mainImage().evaluate((node) => {
    window.__originalCover = node;
  });
  await p.getByRole("button", { name: "View photo 2", exact: true }).click();
  await p.waitForTimeout(120);
  assert.equal(await mainImage().getAttribute("src"), "/smooth-one-cover.svg");
  await p.getByRole("button", { name: "View photo 3", exact: true }).click();
  assert.equal(await mainImage().getAttribute("src"), "/smooth-one-cover.svg");
  holdB = false;
  releaseB();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
        ?.getAttribute("src") === "/smooth-slow-b.svg",
  );
  assert(
    await gallery()
      .locator("img[aria-hidden=true]")
      .evaluate((node) => node === window.__originalCover),
    "The outgoing photo retains its actual decoded DOM image",
  );
  const frame = await mainImage().evaluate((n) => ({
    duration: getComputedStyle(n).animationDuration,
    name: getComputedStyle(n).animationName,
  }));
  assert.equal(frame.duration, "0.26s");
  assert(frame.name.includes("photo-in"));
  await p.waitForTimeout(300);
  assert.equal(await gallery().locator("img[aria-hidden=true]").count(), 0);
  await p.getByRole("button", { name: "Renew cover token", exact: true }).click();
  await p.waitForTimeout(50);
  assert.equal(
    await mainImage().getAttribute("src"),
    "/smooth-slow-b.svg",
    "Signed URL renewal must not reset the selected angle",
  );
  await p.getByRole("button", { name: "View photo 1", exact: true }).click();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
        ?.getAttribute("src") === "/smooth-one-cover.svg",
  );
  await p.getByRole("button", { name: "View photo 3", exact: true }).click();
  await p.waitForTimeout(30);
  assert.equal(
    await mainImage().getAttribute("src"),
    "/smooth-one-cover.svg",
    "Rapid taps finish the existing fade without snapping",
  );
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
        ?.getAttribute("src") === "/smooth-slow-b.svg",
  );
  assert((await gallery().locator("img[aria-hidden=true]").count()) <= 1);
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "View photo 4", exact: true }).click();
  await p.getByText("Showing available product photo.", { exact: true }).waitFor();
  assert.equal(await mainImage().getAttribute("src"), "/smooth-slow-b.svg");
  await p.getByRole("button", { name: "View photo 2", exact: true }).click();
  await p.getByRole("button", { name: "Switch product", exact: true }).click();
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
        ?.getAttribute("src") === "/smooth-two-cover.svg",
  );
  holdA = false;
  releaseA();
  await p.waitForTimeout(150);
  assert.equal(await mainImage().getAttribute("src"), "/smooth-two-cover.svg");
  assert.equal(requests.filter((u) => u === "/smooth-slow-a.svg").length, 1);
  for (const mode of ["motion=off", "reduced=1"]) {
    await p.emulateMedia({ reducedMotion: mode === "reduced=1" ? "reduce" : "no-preference" });
    await p.goto("http://127.0.0.1:3000/gallery-smooth.html?" + mode);
    await p.getByRole("button", { name: "View photo 3", exact: true }).click();
    await p.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
          ?.getAttribute("src") === "/smooth-slow-b.svg",
    );
    assert.equal(await mainImage().evaluate((n) => n.getAnimations().length), 0);
  }
  await p.goto("http://127.0.0.1:3000/gallery-smooth.html?cover=expired");
  await p.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Product photo gallery"] img:not([aria-hidden])')
        ?.getAttribute("src") === "/smooth-one-cover.svg",
  );
  assert.equal(
    await mainImage().evaluate((node) => node.complete && node.naturalWidth > 0),
    true,
    "An expired cover is replaced by the fresh authorized gallery URL",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      oldPhotoRetainedUntilDecode: true,
      latestTapWins: true,
      crossFadeMs: 260,
      retainedDecodedDom: true,
      rapidTapFadeGuard: true,
      signedTokenKeepsSelectedAngle: true,
      expiredCoverRecoversFreshUrl: true,
      failedPhotoPreservesCurrent: true,
      productSwitchCancelsLateSelection: true,
      prefetchCoalesced: true,
      ownerAndReducedMotion: true,
      liveWrites: 0,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      errors,
      current: await mainImage().getAttribute("src"),
      buttons: await p.getByRole("button").allTextContents(),
    }),
  );
  throw error;
} finally {
  holdA = holdB = false;
  releaseA?.();
  releaseB?.();
  await b.close();
}
