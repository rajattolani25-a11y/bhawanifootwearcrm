import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/presentation-settings";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
let role = "owner",
  missing = false;
let flags = { gallery_enabled: true, category_accents: true, motion_enabled: true };
let writes = 0;
let sharedTheme,
  themeWrites = 0;
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const products = ["Demo Sports", "Demo Formal", "Demo Casual"].map((article, i) => ({
  id: "demo" + i,
  brand: "Demo",
  article,
  category: "Gents",
  gender: null,
  color: "Cream",
  mrp: 999,
  price: 799,
  image: null,
  sizes: [{ id: "size" + i, size: "7", available: true }],
}));
const shop = {
  name: "Demo Store",
  phone: null,
  address: null,
  booking: false,
  local: false,
  outside: false,
  local_charge: 30,
  outside_charge: 80,
  free_delivery_above: null,
  delivery_note: null,
  advance_percent: 50,
  hold_hours: 24,
};
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350"><path d="M80 250L120 120L230 180L410 200L520 260L500 300L80 300Z" fill="#d8e2d9"/></svg>',
  );
const hero = {
  image,
  offer_kind: "custom",
  offer_value: 20,
  custom_text: "Demo collection",
  heading: "Demo collection",
  subtitle: "Synthetic preview",
  button_label: "View collection",
  action: "collection",
  product_id: null,
  category: "All",
  motion: true,
  image_scale: 90,
};
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
      body: `export const getCatalog=async()=>(${JSON.stringify({ enabled: true, shop, products, hero, presentation: missing ? undefined : { ...flags, theme: sharedTheme } })});export const checkCoupon=async()=>null;export const createBooking=async()=>{throw Error('No orders in this fixture')};export const trackOrder=async()=>null;`,
    });
  if (u.pathname === "/presentation-catalog.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/storage/v1/object/sign/")) {
    if (r.request().method() === "POST")
      return r.fulfill({ json: { signedURL: "/object/sign/catalog-hero-images/fixture.webp" } });
    return r.fulfill({
      contentType: "image/svg+xml",
      body: decodeURIComponent(image.split(",").slice(1).join(",")),
    });
  }
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    if (u.pathname.endsWith("/catalog_presentation_settings")) {
      if (missing)
        return r.fulfill({
          status: 404,
          json: { code: "PGRST205", message: "Missing presentation table" },
        });
      if (r.request().method() === "PATCH") {
        if (role !== "owner")
          return r.fulfill({ status: 403, json: { code: "42501", message: "Denied" } });
        const body = r.request().postDataJSON();
        if (body.theme) {
          sharedTheme = body.theme;
          themeWrites++;
        } else {
          flags = { ...flags, ...body };
          writes++;
        }
      }
      return r.fulfill({ json: { id: 1, ...flags, theme: sharedTheme } });
    }
    let data = [];
    if (u.pathname.endsWith("/catalog_hero_settings")) {
      const { image: _image, ...settings } = hero;
      data = {
        id: 1,
        ...settings,
        enabled: true,
        image_path: "hero/00000000-0000-4000-8000-000000000001.webp",
      };
    }
    if (u.pathname.endsWith("/user_roles"))
      data = u.searchParams.get("role") === "eq.owner" && role === "staff" ? [] : [{ role }];
    if (u.pathname.endsWith("/store_settings"))
      data = {
        id: 1,
        business_name: "Demo Store",
        catalog_enabled: true,
        daily_target: 10000,
        bill_design: "Thermal",
        thermal_width: "80",
        business_phone: "",
        business_address: "",
      };
    if (u.pathname.includes("/rpc/")) data = null;
    return r.fulfill({ json: data, headers: { "content-range": "0-0/0" } });
  }
  return r.abort();
});
await p.goto("http://localhost:8080/auth");
await p.waitForTimeout(1000);
const token =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 86400,
      aud: "authenticated",
      role: "authenticated",
    }),
  ).toString("base64url") +
  ".mock";
await p.evaluate(async (token) => {
  const { supabase } = await import("/src/integrations/supabase/client.ts");
  const r = await supabase.auth.setSession({ access_token: token, refresh_token: "mock-refresh" });
  if (r.error) throw r.error;
}, token);
await p.goto("http://localhost:8080/settings");
await p.getByRole("heading", { name: "Catalog appearance", exact: true }).waitFor();
if (!(await p.getByRole("button", { name: "Save catalog theme", exact: true }).isDisabled()))
  throw Error("Theme save enabled without a supported shared field");
if (
  (await p
    .getByRole("tablist", { name: "Settings sections", exact: true })
    .getByRole("tab")
    .count()) !== 6
)
  throw Error(
    "Settings sections missing: " +
      JSON.stringify(
        await p
          .getByRole("tablist", { name: "Settings sections", exact: true })
          .getByRole("tab")
          .allTextContents(),
      ),
  );
if (await p.getByRole("link", { name: "Guide", exact: true }).count())
  throw Error("Guide navigation remains");
await p.getByRole("region", { name: "Featured collection" }).waitFor();
await p.getByRole("button", { name: "Midnight Blue", exact: true }).click();
if (
  (await p.getByRole("region", { name: "Featured collection" }).getAttribute("data-palette")) !==
  "midnight"
)
  throw Error("Owner theme preview did not change");
await p.getByRole("tab", { name: "Store", exact: true }).click();
const shopName = p.getByText("Shop name", { exact: true }).locator("..").locator("input");
await shopName.fill("Draft shop name");
await p.getByRole("tab", { name: "Billing", exact: true }).click();
await p.getByRole("heading", { name: "Bill printing", exact: true }).waitFor();
await p.getByRole("button", { name: "Catalog controls", exact: true }).click();
await p.getByRole("heading", { name: "Hero banner", exact: true }).waitFor();
if (
  (await p.getByRole("region", { name: "Featured collection" }).getAttribute("data-palette")) !==
  "midnight"
)
  throw Error("Tab change lost preview draft");
await p.getByRole("tab", { name: "Store", exact: true }).click();
if ((await shopName.inputValue()) !== "Draft shop name") throw Error("Tab change lost form draft");
await p.getByRole("button", { name: "Catalog controls", exact: true }).click();
await p.evaluate(() => window.scrollTo(0, 0));
await p.screenshot({ path: out + "/organized-settings-mobile.png" });
const gallery = p.getByRole("switch", { name: /Show spotlight gallery/ }),
  accents = p.getByRole("switch", { name: /Category colour accents/ }),
  motion = p.getByRole("switch", { name: /Catalog animations/ });
await gallery.uncheck();
await accents.uncheck();
await motion.uncheck();
await p.getByRole("button", { name: "Save appearance", exact: true }).click();
await p.waitForTimeout(250);
if (writes !== 1 || Object.values(flags).some(Boolean))
  throw Error("False values were not persisted");
await p.reload();
await p.getByRole("switch", { name: /Show spotlight gallery/ }).waitFor();
for (const control of [gallery, accents, motion])
  if (await control.isChecked()) throw Error("Owner reload lost saved off state");
await p.locator("#catalog-appearance-controls").scrollIntoViewIfNeeded();
await p.screenshot({ path: out + "/owner-mobile.png" });
sharedTheme = "studio";
await p.reload();
await p.getByRole("button", { name: "Midnight Blue", exact: true }).click();
await p.getByRole("button", { name: "Save catalog theme", exact: true }).click();
await p.getByText("Catalog theme saved", { exact: true }).waitFor();
await p.reload();
await p.getByRole("region", { name: "Featured collection" }).waitFor();
await p.waitForFunction(() => document.querySelector('[data-palette="midnight"]'));
if (themeWrites !== 1) throw Error("Theme save request count incorrect");
await p.goto("http://localhost:8080/presentation-catalog.html");
await p.getByRole("heading", { name: "Shop the collection", exact: true }).waitFor();
if (
  (await p.getByRole("region", { name: "Featured collection" }).getAttribute("data-palette")) !==
  "midnight"
)
  throw Error("Public catalog ignored the saved theme");
if (await p.getByRole("region", { name: "Product spotlight" }).count())
  throw Error("Gallery off ignored");
await p.getByRole("combobox", { name: "Type", exact: true }).selectOption("Formal");
if ((await p.locator("[data-theme]").getAttribute("data-tone")) !== "All")
  throw Error("Category accents off ignored");
if ((await p.locator("[data-theme]").getAttribute("data-motion")) !== "false")
  throw Error("Motion off ignored");
if (
  (await p.getByRole("region", { name: "Featured collection" }).getAttribute("data-motion")) !==
  "false"
)
  throw Error("Master motion did not override hero");
await p.screenshot({ path: out + "/catalog-off-mobile.png", fullPage: true });
role = "staff";
await p.goto("http://localhost:8080/settings");
await p.getByText("Only the Owner can open Settings.", { exact: true }).waitFor();
if (await p.getByRole("button", { name: "Save appearance", exact: true }).count())
  throw Error("Staff editor exposed");
role = "owner";
missing = true;
await p.goto("http://localhost:8080/settings");
await p
  .getByText(
    "Appearance settings storage is unavailable. Apply migration 0021 in Lovable, then retry. The catalog still works.",
    { exact: true },
  )
  .waitFor();
if (await p.getByRole("button", { name: "Save appearance", exact: true }).count())
  throw Error("Missing storage allows false save");
await p.goto("http://localhost:8080/presentation-catalog.html");
await p.getByRole("heading", { name: "In the spotlight", exact: true }).waitFor();
await p.goto("http://localhost:8080/guide");
await p.waitForURL("**/dashboard");
if (errors.length) throw Error(errors.join("\n"));
const result = {
  ownerControls: true,
  settingsSections: 6,
  draftsSurviveSections: true,
  catalogShortcut: true,
  ownerThemePreview: true,
  sharedThemeSaveGuarded: true,
  supportedSharedThemeReload: true,
  publicThemeApplied: true,
  legacyGuideRedirect: true,
  guideNavigationRemoved: true,
  allFalseSaved: true,
  reloadPreservesOff: true,
  publicGalleryHidden: true,
  neutralPalette: true,
  heroMasterMotionOff: true,
  staffEditorDenied: true,
  missingStorageBlocksSave: true,
  missingStorageCatalogFallback: true,
  mockedWrites: writes,
  mockedThemeWrites: themeWrites,
  realWrites: 0,
  errors,
};
await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
