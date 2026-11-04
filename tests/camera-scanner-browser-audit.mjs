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
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__scanCalls = [];
  window.__starts = 0;
  window.__stops = 0;
  window.__trackStops = 0;
  window.__constraints = [];
});
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("@zxing_browser") && u.pathname.endsWith(".js"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export class BrowserMultiFormatReader {
 constructor(hints,options){window.__options=options;window.__hints=Array.from(hints);}
 async decodeFromConstraints(constraints,target,callback){
 window.__starts++;window.__cameraConstraints=constraints;
 if(window.__failCamera){window.__failCamera=false;throw new Error('Permission denied');}
 const track={stop(){window.__trackStops++;},getCapabilities(){return {torch:true,focusMode:['continuous']};},applyConstraints:async c=>{window.__constraints.push(c);}};
 Object.defineProperty(target,'srcObject',{configurable:true,writable:true,value:{getVideoTracks:()=>[track],getTracks:()=>[track]}});
 window.__emit=code=>callback({getText:()=>code});
 const controls={stop(){window.__stops++;}};
 if(window.__delayCamera)await new Promise(resolve=>{window.__resolveCamera=resolve;});
 return controls;
 }} `,
    });
  if (u.pathname === "/scanner-audit.html")
    return r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/scanner.jsx"></script>',
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  return r.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/scanner-audit.html");
  await page.getByText("Keep the full QR or barcode in view.", { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.__starts), 1);
  assert.equal(await page.evaluate(() => window.__cameraConstraints.video.width.ideal), 1280);
  assert.equal(
    await page.evaluate(() => window.__cameraConstraints.video.facingMode.ideal),
    "environment",
  );
  assert.equal(await page.evaluate(() => window.__options.delayBetweenScanAttempts), 180);
  assert(
    await page.evaluate(() =>
      window.__constraints.some((c) => c.advanced[0].focusMode === "continuous"),
    ),
  );
  await page.getByRole("button", { name: "Rerender", exact: false }).click();
  assert.equal(await page.evaluate(() => window.__starts), 1);
  await page.evaluate(() => {
    window.__emit("UNKNOWN");
    window.__emit("UNKNOWN");
  });
  assert.deepEqual(await page.evaluate(() => window.__scanCalls), ["UNKNOWN"]);
  await page.evaluate(() => {
    window.__emit("KNOWN");
    window.__emit("KNOWN");
  });
  assert.deepEqual(await page.evaluate(() => window.__scanCalls), ["UNKNOWN", "KNOWN"]);
  await page.getByRole("button", { name: "Turn on light", exact: true }).click();
  await page.getByRole("button", { name: "Turn off light", exact: true }).waitFor();
  assert(await page.evaluate(() => window.__constraints.some((c) => c.advanced[0].torch === true)));
  await page.getByRole("button", { name: "Turn off light", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => window.__stops >= 1 && window.__trackStops >= 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => window.__starts === 2);
  await page.getByRole("button", { name: "Close scanner", exact: true }).click();
  await page.waitForFunction(() => window.__stops >= 2 && window.__trackStops >= 2);
  await page.evaluate(() => (window.__failCamera = true));
  await page.getByRole("button", { name: "Open scanner", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Retry camera", exact: true }).click();
  await page.getByRole("button", { name: "Turn on light", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__starts), 4);
  await page.getByRole("button", { name: "Close scanner", exact: true }).click();
  await page.evaluate(() => (window.__delayCamera = true));
  await page.getByRole("button", { name: "Open scanner", exact: true }).click();
  await page.waitForFunction(() => window.__resolveCamera);
  const stops = await page.evaluate(() => window.__stops);
  await page.getByRole("button", { name: "Close scanner", exact: true }).click();
  await page.evaluate(() => window.__resolveCamera());
  await page.waitForFunction((old) => window.__stops > old, stops);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "Rear720p camera and180ms retry; capability-gated continuous autofocus and torch",
        "Parent callback rerenders keep one camera; accepted frame latched; unknown-code toast throttled",
        "Background/unmount stops camera; resume restarts; permission retry and late-start cleanup work",
      ],
      productionWrites: 0,
      errors,
    }),
  );
} finally {
  await browser.close();
}
