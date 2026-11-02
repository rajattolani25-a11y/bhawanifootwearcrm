import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage();
let reads = 0,
  signs = 0,
  stock = 8,
  price = 999,
  delay = 0;
const errors = [];
await p.routeWebSocket("**/*", socket => socket.close());
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/performance.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/performance.html", import.meta.url), "utf8"),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.endsWith("/rest/v1/products")) {
    reads++;
    const snapshot = ["Active", "Inactive"].map((status, i) => ({
      id: "p" + i,
      brand: "Demo",
      article: status,
      category: "Gents",
      status,
      catalog_visible: true,
      gender: null,
      color: null,
      created_at: "2026-01-01",
      mrp: 1299,
      selling_price: price,
      image_url: "same.webp",
      product_variants: [{ id: "v" + i, size: "7", stock, sku: "CODE" + i, barcode: "CODE" + i }],
    }));
    if (delay) await new Promise((done) => setTimeout(done, delay));
    return r.fulfill({ json: snapshot });
  }
  if (u.pathname.includes("/storage/v1/object/sign/")) {
    signs++;
    return r.fulfill({
      json: [{ path: "same.webp", signedURL: "/object/sign/product-images/same.webp?token=mock" }],
    });
  }
  return r.fulfill({ json: [] });
});
const emit = async () =>
  p.evaluate(() => {
    for (const ch of window.__perf.supabase.getChannels())
      for (const binding of ch.bindings.postgres_changes || []) binding.callback({});
  });
const data = async (panel) => JSON.parse(await p.locator(`[data-panel=${panel}]`).innerText());
try {
  await p.goto("http://localhost:8080/performance.html");
  await p.waitForFunction(() =>
    document.querySelector("[data-panel=pos]")?.textContent?.startsWith("["),
  );
  assert.equal(reads, 1);
  assert.equal(signs, 1);
  assert.equal((await data("pos")).length, 1);
  assert.equal((await data("all")).length, 2);
  assert.equal(
    await p.evaluate(() => window.__perf.supabase.getChannels().length),
    1,
    "Duplicate realtime channels",
  );
  stock = 5;
  price = 1099;
  await emit();
  await p.waitForFunction(() =>
    document.querySelector("[data-panel=pos]")?.textContent?.includes("1099"),
  );
  assert.equal((await data("pos"))[0].product_variants[0].stock, 5);
  assert.equal((await data("all"))[0].selling_price, 1099);
  assert.equal(signs, 1, "Unchanged paths re-signed");
  let before = reads;
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    window.__perf.focusManager.setFocused(false);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  stock = 2;
  for (let i = 0; i < 5; i++) await emit();
  await p.waitForTimeout(350);
  assert.equal(reads, before, "Hidden realtime triggered reads");
  await p.evaluate(() => {
    delete document.hidden;
    window.__perf.focusManager.setFocused(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForFunction(() =>
    document.querySelector("[data-panel=pos]")?.textContent?.includes('"stock":2'),
  );
  await p.waitForTimeout(180);
  assert.equal(reads, before + 1, "Resume duplicated requests");
  before = reads;
  await p.getByRole("button", { name: "Unmount second consumer" }).click();
  stock = 1;
  await emit();
  await p.waitForFunction(() =>
    document.querySelector("[data-panel=pos]")?.textContent?.includes('"stock":1'),
  );
  assert.equal(reads, before + 1, "Last consumer lost realtime subscription");
  delay = 400;
  stock = 6;
  const request = p.waitForRequest((r) => r.url().includes("/rest/v1/products"));
  await p.evaluate(() => {
    void window.__perf.client.invalidateQueries({ queryKey: ["stock-all"] });
  });
  await request;
  stock = 3;
  await emit();
  await p.waitForFunction(() =>
    document.querySelector("[data-panel=pos]")?.textContent?.includes('"stock":3'),
  );
  assert.deepEqual(errors, []);
  const result = {
    sharedRead: true,
    activeFilterPreserved: true,
    oneRealtimeChannel: true,
    priceAndStockRefresh: true,
    photoUrlsReused: true,
    hiddenEventsPaused: true,
    resumeRefreshSingleRequest: true,
    referenceCountedCleanup: true,
    eventDuringReadRefreshes: true,
    reads,
    signs,
    realWrites: 0,
    errors,
  };
  await fs.mkdir("/tmp/solestack-audit/performance", { recursive: true });
  await fs.writeFile(
    "/tmp/solestack-audit/performance/freshness.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.log("Diagnostic", JSON.stringify({errors,body:await p.locator("body").innerText()}));
  throw error;
} finally {
  await b.close();
}
