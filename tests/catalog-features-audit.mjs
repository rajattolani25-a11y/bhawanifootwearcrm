import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-release";
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__orderCalls = 0;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>({enabled:false});export const trackOrder=async()=>null;export const createBooking=async()=>{window.__orderCalls++;throw Error('Fixture blocks orders')};export const checkCoupon=async({data})=>{await new Promise(r=>setTimeout(r,data.code==='SLOW'?350:35));if(data.code==='BAD')throw Error('Invalid coupon');return {code:data.code,amount:100}};`,
    });
  if (u.pathname === "/catalog-features.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(new URL("./fixtures/catalog-features.html", import.meta.url), "utf8"),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  return r.abort();
});
await p.goto("http://localhost:8080/catalog-features.html");
await p.getByRole("heading", { name: "In the spotlight" }).waitFor();
const bg = () => p.locator("main").evaluate((e) => getComputedStyle(e).backgroundColor);
const sports = await bg();
await p.getByRole("combobox", { name: "Preview type" }).selectOption("Formal");
await p.waitForTimeout(260);
if (sports === (await bg())) throw Error("Category accent did not change");
await p.getByRole("button", { name: "Next product", exact: true }).click();
await p.getByRole("heading", { name: "Demo Formal", exact: true }).waitFor();
await p.getByRole("button", { name: "Previous product", exact: true }).click();
await p.getByRole("heading", { name: "Demo Sports", exact: true }).waitFor();
if ((await p.locator("section img").count()) > 3) throw Error("Gallery mounts too many photos");
await p.screenshot({ path: out + "/gallery-mobile.png", fullPage: true });
await p.setViewportSize({ width: 1440, height: 1000 });
await p.screenshot({ path: out + "/gallery-desktop.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 844 });
await p.getByRole("button", { name: "View pair", exact: true }).click();
await p.getByRole("button", { name: "7", exact: true }).click();
await p.getByRole("button", { name: "Get this pair", exact: true }).click();
await p.getByRole("button", { name: /Local delivery/ }).click();
await p.getByRole("button", { name: "Continue", exact: true }).click();
await p.getByPlaceholder("Your name", { exact: true }).fill("Demo Customer");
await p.getByPlaceholder("Mobile number", { exact: true }).fill("9876500001");
await p
  .getByPlaceholder("Full address (house, street, landmark)")
  .fill("Demo building, test street");
const code = p.getByPlaceholder("Coupon code (optional)");
await code.fill("BAD");
await p.getByRole("button", { name: "Apply", exact: true }).click();
await p.getByText("Invalid coupon", { exact: true }).waitFor();
if (await p.getByText("Applied", { exact: true }).count())
  throw Error("Invalid coupon shown as applied");
await code.fill("DEMO100");
await p.getByRole("button", { name: "Apply", exact: true }).click();
await p.getByText("Applied", { exact: true }).waitFor();
await p.getByText("₹729", { exact: true }).waitFor();
await p.screenshot({ path: out + "/coupon-mobile.png", fullPage: true });
await p.getByPlaceholder("Mobile number", { exact: true }).fill("9876500002");
if (await p.getByText("Applied", { exact: true }).count())
  throw Error("Coupon retained after mobile change");
await code.fill("SLOW");
await p.getByRole("button", { name: "Apply", exact: true }).click();
await p.getByPlaceholder("Mobile number", { exact: true }).fill("9876500003");
await p.waitForTimeout(500);
if (await p.getByText("Applied", { exact: true }).count())
  throw Error("Stale coupon response applied");
await p.keyboard.press("Escape");
await p.getByRole("button", { name: "Preview saved receipt" }).click();
await p.waitForFunction(() => document.querySelectorAll("#receipt-preview svg path").length > 6);
await p.waitForFunction(() => document.querySelector('#receipt-preview [data-animation="complete"]'));
await p.screenshot({ path: out + "/receipt-mobile.png", fullPage: true });
await p.emulateMedia({ reducedMotion: "reduce" });
await p.waitForTimeout(150);
if ((await p.locator("#receipt-preview svg").count()) !== 1)
  throw Error("Reduced-motion fallback missing");
if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
  throw Error("Mobile overflow");
if (await p.evaluate(() => window.__orderCalls)) throw Error("Test submitted an order");
if (errors.length) throw Error(errors.join("\n"));
const result = {
  categoryPalette: true,
  galleryNextPrevious: true,
  maxPhotoElements: 3,
  invalidCouponRejected: true,
  validCouponTotal: 729,
  changedMobileClearsCoupon: true,
  staleResponseIgnored: true,
  receiptSvgRendered: true,
  reducedMotionFallback: true,
  mobileOverflow: false,
  realOrdersSubmitted: 0,
  errors,
};
await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await b.close();
