import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__calls = [];
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.includes("/src/integrations/supabase/client.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `let received=false;const summary=()=>({cart_no:'CT-ABCDEF1234567890',shop:'Bhawani Footwear',advance:600,orders:[{receipt_recorded:received,status:received?'confirmed':'pending'},{receipt_recorded:received,status:received?'confirmed':'pending'}]});export const supabase={rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='catalog_cart_payment_summary')return {data:summary(),error:null};if(name==='confirm_catalog_cart_payment'){if(window.__fail)return {error:{message:'Synthetic receipt rejection'}};received=true;return {data:summary(),error:null};}throw Error('Unexpected write');}};`,
    });
  if (u.pathname === "/cart-owner.html")
    return route.fulfill({
      contentType: "text/html",
      body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/catalog-cart-owner.tsx"></script></body></html>',
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/cart-owner.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Confirm cart payment", exact: true }).click();
  await page.waitForFunction(() => !!window.__update);
  const data = await page.evaluate(() => ({
    calls: window.__calls,
    update: window.__update,
    refresh: window.__refresh,
  }));
  const call = data.calls.find((x) => x.name === "confirm_catalog_cart_payment");
  assert.equal(call.args._expected_advance, 600);
  assert.equal(call.args._settled, true);
  assert(data.update.url.includes("wa.me/919999999999"));
  assert(new URL(data.update.url).searchParams.get("text").includes("CT-ABCDEF1234567890"));
  assert.equal(data.refresh, 1);
  assert.equal(
    await page.getByRole("button", { name: "Payment verified", exact: true }).isDisabled(),
    true,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.__fail = true;
  });
  await page.getByRole("button", { name: "Confirm cart payment", exact: true }).click();
  await page.waitForFunction(() =>
    window.__calls.some((x) => x.name === "confirm_catalog_cart_payment"),
  );
  assert.equal(await page.evaluate(() => window.__update), undefined);
  assert.equal(
    await page.getByRole("button", { name: "Confirm cart payment", exact: true }).isEnabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log("Combined owner payment UI audit passed");
} finally {
  await browser.close();
}
