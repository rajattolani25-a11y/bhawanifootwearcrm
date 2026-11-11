import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-colours";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(15000);
const blackId = "10000000-0000-4000-8000-000000000001",
  whiteId = "10000000-0000-4000-8000-000000000002";
const black7 = "20000000-0000-4000-8000-000000000001",
  white8 = "20000000-0000-4000-8000-000000000004";
const products = [
  {
    id: blackId,
    brand: "DEMO",
    article: "Aero",
    category: "Men / Sports & Active",
    color: "Black",
    price: 2199,
    mrp: 2999,
    image: "/black-shoe.svg",
    sizes: [
      { id: black7, size: "7", available: true },
      { id: "black8", size: "8", available: false },
    ],
  },
  {
    id: whiteId,
    brand: "DEMO",
    article: "Aero",
    category: "Men / Sports & Active",
    color: "White",
    price: 2299,
    mrp: 2999,
    image: "/white-shoe.svg",
    sizes: [
      { id: "white7", size: "7", available: false },
      { id: white8, size: "8", available: true },
    ],
  },
];
products.push(
  { ...products[1], id: "other-brand", brand: "OTHER", color: "Purple" },
  { ...products[1], id: "other-department", category: "Women / Sports & Active", color: "Pink" },
  { ...products[1], id: "other-article", article: "Different", color: "Blue" },
);
const data = {
  enabled: true,
  shop: {
    name: "Bhawani Footwear",
    phone: "9999999999",
    booking: true,
    advance_percent: 50,
    hold_hours: 24,
    local: false,
    outside: false,
  },
  products,
  hero: null,
  presentation: {
    gallery_enabled: true,
    category_accents: true,
    motion_enabled: false,
    theme: "ivory",
  },
};
const errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() !== "GET") writes.push(url.pathname);
  if (url.pathname.includes("/src/lib/catalog.functions.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `const data=${JSON.stringify(data)};export const getCatalog=async()=>data;export const getCatalogSnapshot=async()=>window.__nextCatalog??data;export const getCatalogPhotos=async({data:request})=>{window.__galleryReads=(window.__galleryReads||[]).concat(request.productId);const product=data.products.find(p=>p.id===request.productId);return {available:true,images:[product.image,product.image+"?angle=2"]};};export const checkCoupon=async()=>null;export const trackOrder=async()=>null;export const createBooking=async({data:request})=>{window.__colourOrders=(window.__colourOrders||[]).concat(request);return {booking_no:"COLOUR-001",advance:1150,price:2299,delivery_charge:0,fulfillment:"pickup",upi_id:"demo@upi",shop:"Bhawani Footwear",phone:"9999999999",product:"DEMO Aero",size:"8",hold_hours:24};};`,
    });
  if (url.pathname === "/collection-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (url.pathname.endsWith("-shoe.svg"))
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect x="40" y="70" width="220" height="60" rx="20" fill="${url.pathname.includes("black") ? "#222" : "#eee"}" stroke="#777"/></svg>`,
    });
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
  return route.abort();
});

try {
  await page.goto(`http://127.0.0.1:3000/collection-audit.html?product=${blackId}&size=7`);
  const dialog = () => page.getByRole("dialog");
  await dialog().getByRole("button", { name: "Colour: Black", exact: true }).waitFor();
  const ambiguous = await page.evaluate(async (products) => {
    const { catalogColourOptions } = await import("/src/lib/product-colours.ts");
    return catalogColourOptions(
      [...products, { ...products[0], id: "duplicate", color: " black " }],
      products[0],
    ).length;
  }, products);
  assert.equal(
    ambiguous,
    0,
    "Duplicate colour identities must not offer an automatic stock choice",
  );
  assert.equal(
    await dialog().getByRole("button", { name: "7", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await dialog().getByRole("button", { name: "Colour: Purple", exact: true }).count(),
    0,
  );
  assert.equal(
    await dialog().getByRole("button", { name: "Colour: Pink", exact: true }).count(),
    0,
  );
  assert.equal(
    await dialog().getByRole("button", { name: "Colour: Blue", exact: true }).count(),
    0,
  );
  await dialog().getByRole("button", { name: "Colour: White", exact: true }).click();
  await dialog().getByRole("button", { name: "Colour: White", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("product"), whiteId);
  assert.equal(new URL(page.url()).searchParams.has("size"), false);
  await page.waitForFunction((whiteId) => window.__galleryReads?.at(-1) === whiteId, whiteId);
  const image = dialog().getByRole("img", { name: /DEMO Aero.*White.*view 1/ });
  await image.waitFor();
  assert((await image.getAttribute("src")).includes("white-shoe.svg"));
  assert.equal(await dialog().getByRole("button", { name: "7", exact: true }).isDisabled(), true);
  assert.equal(
    await dialog().getByRole("button", { name: "8", exact: true }).getAttribute("aria-pressed"),
    "false",
  );
  await dialog().getByRole("button", { name: "Get this pair", exact: true }).click();
  await dialog().getByText("Select a size to continue", { exact: true }).first().waitFor();
  await dialog().getByRole("button", { name: "8", exact: true }).click();
  const wa = new URL(
    await dialog()
      .getByRole("link", { name: "Ask on WhatsApp & visit store", exact: true })
      .getAttribute("href"),
  );
  assert(wa.searchParams.get("text").includes("White"));
  assert(wa.searchParams.get("text").includes("8"));
  const share = new URL(
    await dialog()
      .getByRole("link", { name: "Share product on WhatsApp", exact: true })
      .getAttribute("href"),
  );
  assert(share.searchParams.get("text").includes("White"));
  assert(share.searchParams.get("text").includes(whiteId));
  await page.screenshot({ path: out + "/white-catalog-mobile.png" });
  await dialog().getByRole("button", { name: "Get this pair", exact: true }).click();
  await dialog().getByRole("button", { name: "Continue", exact: true }).click();
  await dialog().getByPlaceholder("Your name").fill("Demo buyer");
  await dialog().getByPlaceholder("Mobile number").fill("9999999991");
  await page.getByRole("checkbox", { name: "I agree to the Terms & Conditions", exact: true }).check();
  await dialog().getByRole("button", { name: "Place order", exact: true }).click();
  await page.waitForFunction(() => window.__colourOrders?.length === 1);
  const request = await page.evaluate(() => window.__colourOrders[0]);
  assert.equal(
    products.find((product) => product.sizes.some((size) => size.id === request.variantId)).id,
    whiteId,
  );
  assert.equal(request.variantId, white8);
  assert.equal(request.quote.price, 2299);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(
    JSON.stringify({
      pass: true,
      colourPhotosSwitch: true,
      correctGalleryFolder: true,
      correctColourSizes: true,
      selectionResets: true,
      correctOrderVariantAndPrice: true,
      colourInShareAndInquiry: true,
      unrelatedProductsExcluded: true,
      productionWrites: 0,
    }),
  );
} finally {
  await browser.close();
}
