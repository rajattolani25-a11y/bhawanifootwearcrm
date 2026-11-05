import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/bargain-cooldown";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(20000);
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
const product = {
  id: "10000000-0000-4000-8000-000000000001",
  brand: "DEMO",
  article: "Everyday Sports Shoe",
  category: "Men / Sports & Active",
  color: "White / Green",
  price: 2200,
  mrp: 2799,
  image: "/cooldown-shoe.png",
  bargain_enabled: true,
  description: "Everyday comfort. Flexible sole.",
  sizes: [{ id: "20000000-0000-4000-8000-000000000001", size: "7", available: true }],
};
const data = {
  enabled: true,
  products: [product],
  shop: {
    name: "Bhawani Footwear",
    phone: "9999999999",
    booking: true,
    local: true,
    outside: false,
    advance_percent: 20,
    local_charge: 90,
    hold_hours: 24,
  },
  presentation: { theme: "ivory", gallery_enabled: false, motion_enabled: false },
  hero: null,
};
const shoe = await fs.readFile(
  "/workspace/footwear-catalog-images/transparent/01-side-transparent.png",
);
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__qaOffset = 0;
  const now = Date.now.bind(Date);
  Date.now = () => now() + window.__qaOffset;
  window.__qaBids = [];
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === "/cooldown.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/cooldown-shoe.png")
    return route.fulfill({ contentType: "image/png", body: shoe });
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const d=${JSON.stringify(data)};export const getCatalog=async()=>d;export const getCatalogSnapshot=async()=>d;export const getCatalogPhotos=async()=>({available:true,images:[]});export const createBooking=async()=>{throw Error('No orders in visual test')};export const trackOrder=async()=>null;export const checkCoupon=async()=>null;`,
    });
  if (u.pathname.includes("/src/lib/catalog-bargain.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const key='qa-cooldown';const read=()=>JSON.parse(localStorage.getItem(key)||'null');const send=d=>d?{...d,server_now:new Date(Date.now()).toISOString()}:null;export const getBargain=async()=>send(read());export const makeBargain=async({data})=>{window.__qaBids.push(data);let d=read();if(data.restart){if(Date.parse(d.retry_at)>Date.now())throw Error('Too early');d=null;}if(d?.bids.includes(data.offer))return send({...d,duplicate:true});if(d?.attempts>=4)throw Error('Both chances used');const attempts=(d?.attempts||0)+1;const expires=Date.now()+180000;d={id:crypto.randomUUID(),product_id:'${product.id}',variant_id:data.variantId,listed_price:2200,price:attempts===1?2090:2045,offer:data.offer,attempts,state:attempts===1?'counter':'closer',heading:0,bids:[...(d?.bids||[]),data.offer],expires_at:new Date(expires).toISOString(),cooldown_supported:true,bid_limit:4,retry_at:attempts===4?new Date(expires+1800000).toISOString():null};localStorage.setItem(key,JSON.stringify(d));return send(d);};`,
    });
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
  external.push(u.origin);
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/cooldown.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "DEMO Everyday Sports Shoe", exact: true }).click();
  await page.waitForTimeout(300); // Wait for the existing dialog entrance transform to finish.
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const offer = page.getByRole("button", { name: "Make an offer", exact: true });
    const box = await offer.boundingBox();
    assert(
      box.width >= 44 && box.height >= 44,
      JSON.stringify({
        width,
        box,
        css: await offer.evaluate((e) => ({
          minHeight: getComputedStyle(e).minHeight,
          height: getComputedStyle(e).height,
        })),
      }),
    );
    const row = offer.locator("..");
    assert((await row.innerText()).includes("₹2,200"));
    const geometry = await row.evaluate((el) => {
      const a = el.querySelector("p").getBoundingClientRect(),
        b = el.querySelector("button").getBoundingClientRect();
      return {
        aligned: Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom),
        inside: b.right <= innerWidth && b.left >= 0,
      };
    });
    assert(geometry.inside && geometry.aligned, JSON.stringify({ width, geometry }));
    assert.equal(await page.getByRole("button", { name: "Make an offer", exact: true }).count(), 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/price-placement-390.png" });
  await page.getByRole("button", { name: "Make an offer", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Your offer", exact: true }).count(), 0);
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Make an offer", exact: true }).click();
  const note =
    "After the final price expires, there is a 30-minute cooldown before bargaining again.";
  await page.getByText(note, { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1900");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByRole("button", { name: "Revise my offer", exact: true }).waitFor();
  await page.evaluate(() => {
    window.__qaOffset += 181000;
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByText("This offer has expired.", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Revise my offer", exact: true }).isEnabled());
  await page.getByRole("button", { name: "Revise my offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1975");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByRole("button", { name: "Revise my offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1990");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  assert.equal(await page.getByText("FINAL COUNTER-OFFER", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Revise my offer", exact: true }).click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1995");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByText("FINAL COUNTER-OFFER", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").locator("time").count(), 1);
  assert.equal(await page.getByText("Try another offer in", { exact: true }).count(), 0);
  await page.evaluate(() => {
    window.__qaOffset += 181000;
    window.dispatchEvent(new Event("focus"));
  });
  const again = page.getByRole("button", { name: "Start a new bargain", exact: true });
  await again.waitFor();
  assert(await again.isDisabled());
  assert.equal(await page.getByRole("dialog").locator("time").count(), 1); // Only expired 3-minute timer; no cooldown countdown.
  const retry = await page.evaluate(() => JSON.parse(localStorage.getItem("qa-cooldown")).retry_at);
  await page.screenshot({ path: out + "/cooldown-note-390.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Make an offer", exact: true }).click();
  await again.waitFor();
  assert(await again.isDisabled());
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("qa-cooldown")).retry_at),
    retry,
  );
  await page.evaluate(() => {
    window.__qaOffset += 1800000;
    window.dispatchEvent(new Event("focus"));
  });
  await again.click();
  await page.getByRole("textbox", { name: "Your offer", exact: true }).fill("1900");
  await page.getByRole("button", { name: "Send my offer", exact: true }).click();
  await page.getByText("OUR COUNTER-OFFER", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("qa-cooldown")).attempts),
    1,
  );
  assert.equal(await page.evaluate(() => window.__qaBids.at(-1).restart), true);
  await page.screenshot({ path: out + "/new-round-390.png" });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    out + "/checks.json",
    JSON.stringify(
      {
        pass: true,
        checks: [
          "one offer action beside price at320/390/768/1440",
          "size-required focus prompt",
          "static 30-minute cooldown note, no visible countdown",
          "unused second bid survives expired first quote",
          "final quote expiry blocks early restart",
          "reopen preserves deadline",
          "new four-bid round after cooldown",
        ],
        productionWrites: 0,
      },
      null,
      2,
    ),
  );
  console.log("Price placement and cooldown browser audit passed");
} finally {
  await browser.close();
}
