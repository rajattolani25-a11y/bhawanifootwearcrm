import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(15000);
const errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
let lineCount = 12,
  lineReads = 0;
let failHero = false,
  failBase = false,
  invalid = false;
let product = {
  db_bytes: 1362944,
  photo_bytes: 420000,
  photos: 3,
  products: 1,
  variants: 5,
  bills: 0,
  customers: 0,
  suppliers: 0,
  stock_entries: 5,
};
let hero = { photo_bytes: 100000, photos: 1, current_bytes: 80000 };
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.routeWebSocket("**/*", (s) => s.close());
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/storage-meter.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/storage-meter.html", import.meta.url), "utf8"),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.endsWith("/rest/v1/sale_items")) {
    assert.equal(r.request().method(), "HEAD");
    lineReads++;
    return r.fulfill({
      status: 200,
      body: "",
      headers: {
        "content-range": `*/${lineCount}`,
        "access-control-expose-headers": "content-range",
      },
    });
  }
  if (u.pathname.includes("/rpc/")) {
    const name = u.pathname.split("/").at(-1);
    if (name === "stored_bill_line_count") { lineReads++; return r.fulfill({ json: lineCount }); }
    assert(["store_usage", "catalog_hero_storage_usage"].includes(name));
    const fail = name === "store_usage" ? failBase : failHero;
    if (fail)
      return r.fulfill({
        status: 503,
        json: { code: "TEST", message: "Synthetic reading unavailable" },
      });
    return r.fulfill({ json: name === "store_usage" ? (invalid ? {} : product) : hero });
  }
  writes.push(u.pathname);
  return r.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/storage-meter.html");
  const region = page.getByRole("region", { name: "Storage measurements" });
  await region.getByText("520.00 KB", { exact: true }).waitFor();
  assert.equal(await region.getByText("1.36 MB", { exact: true }).count(), 1);
  assert.equal(await region.getByText("13,62,944", { exact: true }).count(), 1);
  assert.equal(await region.getByText("Product, hero, promo & showcase photos", { exact: true }).count(), 1);
  await region
    .getByText("No bills are stored. Database allocation can still stay the same after reset.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await region
      .getByText("Bill records", { exact: true })
      .locator("..")
      .getByText("0", { exact: true })
      .count(),
    1,
  );
  const estimates = region.getByRole("region", { name: "Estimated remaining capacity" });
  await estimates.getByText("Assumed limits:", { exact: true }).waitFor();
  await estimates.getByText("more bills", { exact: true }).waitFor();
  assert.equal(lineReads, 0, "Empty shop should not request bill line counts");
  assert(!/Safe|Room for about/.test(await region.innerText()));
  await estimates.getByText("Change assumed limits", { exact: true }).click();
  await estimates.getByLabel("Database limit (MB)", { exact: true }).fill("750");
  await estimates.getByRole("button", { name: "Apply estimate limits", exact: true }).click();
  await estimates.getByText("Estimate limits saved on this device.", { exact: true }).waitFor();
  await page.reload();
  await estimates.getByText("750.00 MB", { exact: true }).waitFor();
  product = { ...product, bills: 4 };
  await region.getByRole("button", { name: "Refresh storage usage" }).click();
  await estimates.getByText("Based on your average:", { exact: true }).waitFor();
  assert.equal(
    await region
      .getByText("No bills are stored. Database allocation can still stay the same after reset.", {
        exact: true,
      })
      .count(),
    0,
  );
  assert(lineReads > 0);
  assert.equal(await estimates.getByText("3", { exact: true }).count(), 1);
  lineCount = 32;
  await region.getByRole("button", { name: "Refresh storage usage" }).click();
  await estimates.getByText("8", { exact: true }).waitFor();
  // A failed refresh must not keep an old hero reading in the combined total.
  failHero = true;
  await region.getByRole("button", { name: "Refresh storage usage" }).click();
  await region
    .getByText("Hero photo size is unavailable. Showing product photos only; refresh to retry.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await region.getByText("420.00 KB", { exact: true }).count(), 1);
  assert.equal(await region.getByText("520.00 KB", { exact: true }).count(), 0);
  failHero = false;
  hero = { photo_bytes: 0, photos: 0, current_bytes: 0 };
  product = { ...product, photo_bytes: 125, photos: 1 };
  await region.getByRole("button", { name: "Refresh storage usage" }).click();
  await region
    .getByLabel("Photo file storage", { exact: true })
    .getByText("125 B", { exact: true })
    .waitFor();
  assert.equal(await region.getByText("Product, hero, promo & showcase photos", { exact: true }).count(), 1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/solestack-storage-meter-mobile.png", fullPage: true });
  failBase = true;
  await region.getByRole("button", { name: "Refresh storage usage" }).click();
  await page
    .getByRole("alert")
    .getByText("Storage usage could not be loaded.", { exact: true })
    .waitFor();
  assert.equal(await page.getByText("0 B", { exact: true }).count(), 0);
  failBase = false;
  invalid = true;
  const invalidResponse = page.waitForResponse((response) =>
    response.url().endsWith("/rpc/store_usage"),
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  assert.deepEqual(await (await invalidResponse).json(), {});
  await page.getByRole("alert").waitFor();
  invalid = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await region.waitFor();
  await estimates.getByText("Change assumed limits", { exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "solestack-storage-estimate-limits-v1")
        throw new DOMException("Blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await estimates.getByLabel("Database limit (MB)", { exact: true }).fill("800");
  await estimates.getByRole("button", { name: "Apply estimate limits", exact: true }).click();
  await estimates
    .getByText("Limits applied for this visit. Device storage is unavailable.", { exact: true })
    .waitFor();
  await page.evaluate(() => localStorage.setItem("solestack-language", "hindi"));
  await page.reload();
  await page.getByText("डेटाबेस के लिए आवंटित जगह", { exact: true }).waitFor();
  await page.getByText("ताज़ा करें", { exact: true }).waitFor();
  await page.getByText("बची क्षमता का अनुमान", { exact: true }).waitFor();
  await page
    .getByRole("region", { name: "बची क्षमता का अनुमान" })
    .getByText("750.00 MB", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      scope: "Mocked read-only RPCs; actual StorageMeter UI; no production requests",
      checks: [
        "bytes/SI units",
        "0 bills retains allocation",
        "labelled planning ranges, editable limits survive reload, real bill-line count adapts",
        "hero totals and failed refresh excludes old data",
        "small files and actual zero hero",
        "refresh/retry",
        "malformed response fails closed",
        "Hindi",
        "320/390/768/1440px fit",
      ],
    }),
  );
} catch (error) {
  console.error(
    "limits",
    await page.evaluate(() => localStorage.getItem("solestack-storage-estimate-limits-v1")),
  );
  console.error((await page.locator("body").innerText()).slice(-4500));
  await page.screenshot({ path: "/tmp/solestack-estimate-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
