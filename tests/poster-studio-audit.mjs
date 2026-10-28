import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/poster-studio";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__drawn = [];
  const native = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
    const m = this.measureText(value),
      scale = Math.min(1, (maxWidth ?? m.width) / (m.width || 1));
    if (this.canvas.width === 1080 && this.canvas.height === 1920)
      window.__drawn.push({
        value,
        x1: x - m.actualBoundingBoxLeft * scale,
        x2: x + m.actualBoundingBoxRight * scale,
        y1: y - m.actualBoundingBoxAscent,
        y2: y + m.actualBoundingBoxDescent,
      });
    return native.call(this, value, x, y, maxWidth);
  };
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/poster-studio.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/poster-studio.html", import.meta.url), "utf8"),
    });
  if (url.pathname === "/poster-shoe.png")
    return route.fulfill(
      process.env.PREVIEW_SHOE
        ? { contentType: "image/png", body: await fs.readFile(process.env.PREVIEW_SHOE) }
        : {
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><path d="M70 450L180 240L400 340L870 400L930 550L100 550Z" fill="#ead4ab"/></svg>',
          },
    );
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
  if (!["GET", "OPTIONS"].includes(route.request().method()))
    writes.push({ path: url.pathname, method: route.request().method() });
  if (url.pathname.includes("/rest/v1/store_settings"))
    return route.fulfill({
      json: { business_name: "Bhawani Footwear", business_phone: "00000 00000" },
    });
  return route.fulfill({ json: [] });
});
const ready = async () => {
  await page.getByAltText("Selected product poster").waitFor();
  await page.getByAltText("Selected product poster").evaluate((el) => el.decode());
};
try {
  await page.goto("http://localhost:8080/poster-studio.html");
  await ready();
  const themes = await page.evaluate(() => window.__posters.POSTER_THEMES);
  const renders = await page.evaluate(async () => {
    const api = window.__posters,
      p = window.__products[0],
      results = [];
    for (const theme of api.POSTER_THEMES) {
      window.__drawn = [];
      const { canvas, photo } = await api.drawPoster(
        p,
        "Bhawani Footwear",
        "00000 00000",
        "NEW ARRIVAL",
        theme.id,
        "Up to 30% off",
      );
      const full = [...window.__drawn];
      const blob = await api.posterBlob(canvas);
      window.__drawn = [];
      await api.drawPoster(p, "Bhawani Footwear", "00000 00000", "NEW ARRIVAL", theme.id, "");
      const blank = [...window.__drawn];
      const hidden = Object.fromEntries(api.POSTER_FIELDS.map((f) => [f.id, false]));
      window.__drawn = [];
      await api.drawPoster(
        p,
        "SECRET SHOP",
        "SECRET PHONE",
        "SECRET TAG",
        theme.id,
        "SECRET OFFER",
        hidden,
      );
      const none = [...window.__drawn];
      results.push({
        theme: theme.id,
        full,
        blank,
        none,
        photo,
        width: canvas.width,
        height: canvas.height,
        bytes: blob.size,
        png: canvas.toDataURL("image/png"),
      });
    }
    return results;
  });
  await fs.writeFile(
    out + "/render-metrics.json",
    JSON.stringify(
      renders.map(({ png, ...r }) => r),
      null,
      2,
    ),
  );
  for (const item of renders)
    await fs.writeFile(`${out}/${item.theme}.png`, Buffer.from(item.png.split(",")[1], "base64"));
  for (const item of renders) {
    assert.equal(item.width, 1080);
    assert.equal(item.height, 1920);
    assert(item.bytes > 10000);
    assert.equal(item.photo.transparent, true);
    assert(
      item.full.some((t) => t.value === "Up to 30% off"),
      `No offer on ${item.theme}`,
    );
    assert(!item.blank.some((t) => /30%|off/i.test(t.value)), `Fake offer on ${item.theme}`);
    assert.equal(item.none.length, 0, `Hidden fields still exported on ${item.theme}`);
    assert(
      item.full.some((t) => t.value === "AVAILABLE SIZES  6  /  7"),
      "Unavailable or duplicate size in export",
    );
    assert(!item.full.some((t) => /message to check sizes/i.test(t.value)));
    for (const text of item.full)
      assert(
        text.x1 >= 50 && text.x2 <= 1030 && text.y1 >= 100 && text.y2 <= 1820,
        `${item.theme}: unsafe text ${JSON.stringify(text)}`,
      );
    for (const [i, a] of item.full.entries())
      for (const b of item.full.slice(i + 1)) {
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1),
          overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        assert(
          !(overlapX > 3 && overlapY > 3),
          `${item.theme} text collision: ${a.value} / ${b.value}`,
        );
      }
    await fs.writeFile(`${out}/${item.theme}.png`, Buffer.from(item.png.split(",")[1], "base64"));
  }
  // Long names, non-Latin text, portrait photos, opaque backgrounds, missing photos and failed loads.
  const edges = await page.evaluate(async () => {
    const api = window.__posters,
      base = window.__products[0];
    const opaque = document.createElement("canvas");
    opaque.width = 120;
    opaque.height = 400;
    const g = opaque.getContext("2d");
    g.fillStyle = "white";
    g.fillRect(0, 0, 120, 400);
    let rows = [];
    for (const theme of api.POSTER_THEMES) {
      window.__drawn = [];
      const result = await api.drawPoster(
        {
          ...base,
          article: "आरामदायक जूते ".repeat(6),
          brand: "Very long brand name ".repeat(6),
          image_src: opaque.toDataURL(),
        },
        "A very long shop name ".repeat(8),
        "00000 00000",
        "IN STORE NOW",
        theme.id,
        "FLAT ₹200 OFF — ON SELECTED STYLES",
      );
      rows.push({
        theme: theme.id,
        opaque: !result.photo.transparent,
        width: result.photo.width,
        safe: window.__drawn.every((t) => t.x1 >= 50 && t.x2 <= 1030 && t.y2 <= 1820),
      });
      const missing = await api.drawPoster(
        { ...base, image_src: null },
        "Shop",
        "",
        "NEW ARRIVAL",
        theme.id,
      );
      if (missing.photo !== null) throw Error("Missing photo mishandled");
    }
    let rejected = false;
    try {
      await api.drawPoster(
        { ...base, image_src: "data:image/png;base64,bad" },
        "Shop",
        "",
        "NEW ARRIVAL",
        "luxury",
      );
    } catch {
      rejected = true;
    }
    return { rows, rejected };
  });
  assert(edges.rows.every((r) => r.opaque && r.safe));
  assert(edges.rejected);
  await page.getByLabel("Offer text (optional)", { exact: true }).fill("Flat ₹200 off");
  await ready();
  for (const theme of themes) {
    const old = await page.getByAltText("Selected product poster").getAttribute("src");
    await page.getByRole("button", { name: theme.label, exact: true }).click();
    await ready();
    assert.equal(
      await page
        .getByRole("button", { name: theme.label, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert(await page.getByAltText("Selected product poster").getAttribute("src"));
  }
  await page.getByText("Show or hide poster details", { exact: true }).click();
  await page.getByLabel("Price", { exact: true }).uncheck();
  await page.getByLabel("Available sizes", { exact: true }).uncheck();
  await page.getByLabel("Contact number", { exact: true }).uncheck();
  await page.getByLabel("Offer text", { exact: true }).uncheck();
  await ready();
  assert.equal(await page.getByLabel("Offer text (optional)", { exact: true }).isDisabled(), true);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const download = await downloadEvent;
  assert(download.suggestedFilename().endsWith("-dark-poster.png"));
  await download.saveAs(out + "/download.png");
  const bytes = await fs.readFile(out + "/download.png");
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1920);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page
    .getByText("Poster preview is ready — download it and attach in WhatsApp status", {
      exact: true,
    })
    .waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__shared = {
          keys: Object.keys(data),
          type: data.files[0].type,
          bytes: data.files[0].size,
        };
      },
    });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => window.__shared);
  assert.deepEqual(shared.keys, ["files"]);
  assert.equal(shared.type, "image/png");
  assert(shared.bytes > 10000);
  await page.getByText("Product photo guide", { exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Mobile overflow at " + width,
    );
  }
  await page.getByRole("button", { name: "हिंदी", exact: true }).click();
  await page.getByText("प्रोडक्ट फोटो के सुझाव", { exact: true }).waitFor();
  await page.getByText(/बेहतर लुक के लिए पारदर्शी PNG/).waitFor();
  await page.getByRole("button", { name: "Hinglish", exact: true }).click();
  await page.getByText("Product photo ki guide", { exact: true }).waitFor();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByText("Product photo guide", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Poster studio" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/mobile.png" });
  const result = {
    themes: themes.map((t) => t.id),
    png: "1080x1920",
    offersOptionalInAllThemes: true,
    hiddenFieldsOmitted: true,
    noSizeMessageCTA: true,
    inStockSizesOnly: true,
    transparentAndOpaquePhotos: true,
    longTextAndPortraitPhotos: true,
    noTextCollisionsOrClipping: true,
    downloadPass: true,
    shareApiMockAndFallbackPass: true,
    guideLanguages: ["english", "hindi", "hinglish"],
    widths: [320, 390, 768, 1440],
    realWrites: writes,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
