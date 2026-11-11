import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
p.setDefaultTimeout(15000);
const errors = [],
  external = [];
const products = Array.from({ length: 120 }, (_, i) => ({
  id: "p" + i,
  article: "Pair " + i,
  brand: "Demo",
  category: "Men / Sports & Active",
  color: "Olive",
  mrp: 2099,
  price: 1599,
  bargain_enabled: false,
  image: "/render-shoe.svg",
  image_key: "cover" + i,
  sizes: [{ id: "v" + i, size: "7", available: true }],
}));
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__reads = 0;
  window.__price = 1599;
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (
    u.pathname.includes("/src/components/CatalogProductGrid.tsx") &&
    !u.searchParams.has("original")
  )
    return r.fulfill({
      contentType: "application/javascript",
      body: `import {CatalogProductGrid as Grid} from '/src/components/CatalogProductGrid.tsx?original=1';export function CatalogProductGrid(props){const R=window.__profileReact;return R.createElement(R.Profiler,{id:'grid',onRender:(_id,_phase,duration)=>window.__gridCommits.push(duration)},R.createElement(Grid,props));}`,
    });
  if (u.pathname.includes("/src/lib/catalog.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: `const data={enabled:true,products:${JSON.stringify(products)},shop:{name:'Bhawani Footwear',phone:null,booking:false,local:false,outside:false},hero:null,presentation:{gallery_enabled:true,category_accents:true,motion_enabled:false,theme:'ivory'}};export const getCatalog=async()=>structuredClone(data);export const getCatalogSnapshot=async()=>{window.__reads++;return structuredClone({enabled:true,shop:data.shop,products:data.products.map(p=>({...p,image:null,price:p.id==='p0'?window.__price:p.price}))})};export const getCatalogPhotos=async()=>({images:[],available:true});export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async()=>{throw Error('No real writes')};`,
    });
  if (u.pathname.includes("/src/lib/catalog-promotion.functions.ts"))
    return r.fulfill({
      contentType: "application/javascript",
      body: "export const getCatalogPromotion=async()=>({available:true,value:null});",
    });
  if (u.pathname === "/render-smooth.html")
    return r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/catalog-render-smooth.tsx"></script>',
    });
  if (u.pathname === "/render-shoe.svg")
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path d="M20 300 100 100 250 220 530 270 550 340 20 340Z" fill="#687d50"/></svg>',
    });
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  external.push(u.pathname);
  return r.abort();
});
try {
  await p.goto("http://127.0.0.1:3000/render-smooth.html");
  await p.getByRole("button", { name: "Demo Pair 0", exact: true }).waitFor();
  await p.waitForTimeout(900);
  await p.evaluate(() => (window.__gridCommits = []));
  const baseline = await p.evaluate(() => window.__reads);
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => window.dispatchEvent(new Event("solestack-catalog-refresh")));
    await p.waitForFunction((n) => window.__reads >= n, baseline + i + 1);
    await p.waitForTimeout(80);
  }
  const unchanged = await p.evaluate(() => window.__gridCommits.length);
  assert.equal(unchanged, 0, "Fresh identical reads must not commit the 120-card grid");
  await p.getByRole("button", { name: "Demo Pair 0", exact: true }).click();
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(250);
  await p.evaluate(() => {
    window.__gridCommits = [];
    window.__price = 1499;
    window.dispatchEvent(new Event("solestack-catalog-refresh"));
  });
  await p.getByRole("dialog").getByText("₹1,499", { exact: true }).first().waitFor();
  assert(
    (await p.locator('[class*="productGrid"] button[aria-label="Demo Pair 0"]').innerText()).includes(
      "1,499",
    ),
  );
  const changed = await p.evaluate(() => window.__gridCommits);
  assert(changed.length >= 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      products: 120,
      freshIdenticalReads: 5,
      unchangedGridCommits: unchanged,
      changedPriceReachesGridAndOpenProduct: true,
      changedCommitDurationsMs: changed,
      liveWrites: 0,
    }),
  );
} finally {
  await b.close();
}
