import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = "/tmp/solestack-audit/catalog-description";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const errors = [],
  writes = [],
  external = [];
let missing = false,
  failSave = false,
  role = "owner";
const products = [1, 2].map((i) => ({
  id: `10000000-0000-4000-8000-00000000000${i}`,
  brand: "Demo",
  article: `Comfort Pair ${i}`,
  category: "Gents",
  color: "Cream",
  image_url: null,
  mrp: 1299,
  selling_price: 999,
  catalog_visible: true,
  status: "Active",
  catalog_description: i === 1 ? "Soft upper.\nRegular fit." : null,
  product_variants: [],
}));
const shop = {
  name: "Demo Footwear",
  phone: null,
  address: null,
  booking: true,
  local: false,
  outside: false,
  local_charge: 30,
  outside_charge: 80,
  free_delivery_above: null,
  delivery_note: null,
  advance_percent: 50,
  hold_hours: 24,
};
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/*", (socket) => socket.close());
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (r) => {
  const u = new URL(r.request().url()),
    method = r.request().method();
  if (u.pathname.includes("/src/lib/catalog.functions.ts")) {
    const data = {
      enabled: true,
      shop,
      products: products.map((p) => ({
        id: p.id,
        brand: p.brand,
        article: p.article,
        category: p.category,
        gender: null,
        color: p.color,
        mrp: p.mrp,
        price: p.selling_price,
        image: null,
        description: missing ? undefined : p.catalog_description,
        sizes: [{ id: p.id + "size", size: "7", available: true }],
      })),
      hero: null,
      presentation: { gallery_enabled: false, category_accents: true, motion_enabled: false },
    };
    return r.fulfill({
      contentType: "application/javascript",
      body: `export const getCatalog=async()=>(${JSON.stringify(data)});export const getCatalogPhotos=async()=>({images:[],available:true});export const checkCoupon=async()=>null;export const createBooking=async()=>{throw Error('NO ORDER WRITES')};export const trackOrder=async()=>null;`,
    });
  }
  if (u.pathname === "/description-public.html")
    return r.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/presentation-catalog.html", import.meta.url),
        "utf8",
      ),
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    let data = [];
    if (u.pathname.endsWith("/products")) {
      const id = u.searchParams.get("id")?.replace("eq.", ""),
        row = products.find((p) => p.id === id);
      if (u.searchParams.get("select")?.includes("catalog_description") && missing)
        return r.fulfill({
          status: 400,
          json: { code: "42703", message: "column catalog_description does not exist" },
        });
      if (method === "PATCH") {
        assert.equal(role, "owner");
        const payload = r.request().postDataJSON();
        assert.deepEqual(
          Object.keys(payload),
          ["catalog_description"],
          "only catalog content can be saved",
        );
        if (failSave)
          return r.fulfill({
            status: 400,
            json: { code: "42501", message: "Simulated denied save" },
          });
        writes.push({ id, payload });
        Object.assign(row, payload);
      }
      data = r.request().headers().accept?.includes("object") ? row : products;
    }
    if (u.pathname.endsWith("/user_roles"))
      data = u.searchParams.get("role") === "eq.owner" && role !== "owner" ? [] : [{ role }];
    if (u.pathname.endsWith("/store_settings"))
      data = {
        id: 1,
        business_name: "Demo Footwear",
        business_phone: "",
        business_address: "",
        daily_target: 10000,
        bill_design: "Thermal",
        thermal_width: "80",
        catalog_enabled: true,
        booking_enabled: false,
        pickup_enabled: true,
        delivery_enabled: false,
        outside_enabled: false,
        local_charge: 30,
        outside_charge: 80,
        free_delivery_above: null,
        delivery_note: null,
        show_few_left: true,
        upi_id: "",
        advance_percent: 50,
        hold_hours: 24,
      };
    if (u.pathname.endsWith("/catalog_hero_settings")) data = null;
    if (u.pathname.endsWith("/catalog_presentation_settings"))
      data = { id: 1, gallery_enabled: false, category_accents: true, motion_enabled: false };
    return r.fulfill({ json: data, headers: { "content-range": "0-1/2" } });
  }
  if (u.pathname.includes("/storage/v1/object/list/")) return r.fulfill({ json: [] });
  if (!u.hostname.endsWith("googleapis.com") && !u.hostname.endsWith("gstatic.com"))
    external.push(u.pathname);
  return r.abort();
});
const editor = () => page.getByRole("region", { name: "Product description editor", exact: true });
async function openEditor() {
  await page.goto("http://localhost:8080/catalog-studio");
  await page.getByRole("tab", { name: "Products & visibility", exact: true }).click();
  await page.getByLabel("Product description", { exact: true }).waitFor();
}
try {
  await page.goto("http://localhost:8080/auth");
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
  await page.evaluate(async (token) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const r = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "mock-refresh",
    });
    if (r.error) throw r.error;
  }, token);
  await openEditor();
  const input = page.getByLabel("Product description", { exact: true });
  await page.waitForFunction(
    () => document.querySelector("textarea")?.value === "Soft upper.\nRegular fit.",
  );
  await input.fill(
    "  Lightweight upper.\nआरामदायक फिट.\n<script>window.descriptionInjected=true</script>  ",
  );
  assert.equal(
    await editor().getByRole("button", { name: "Save description", exact: true }).isEnabled(),
    true,
  );
  await editor().getByRole("button", { name: "Save description", exact: true }).click();
  await page.getByText("Product description saved", { exact: true }).first().waitFor();
  assert.equal(
    products[0].catalog_description,
    "Lightweight upper.\nआरामदायक फिट.\n<script>window.descriptionInjected=true</script>",
  );
  await openEditor();
  assert.equal(await input.inputValue(), products[0].catalog_description);
  failSave = true;
  await input.fill("Keep my unsaved changes");
  await editor().getByRole("button", { name: "Save description", exact: true }).click();
  await page
    .getByText("Could not save description. Your changes are still here.", { exact: true })
    .first()
    .waitFor();
  assert.equal(await input.inputValue(), "Keep my unsaved changes");
  await editor().getByRole("button", { name: "Discard changes", exact: true }).click();
  assert.equal(await input.inputValue(), products[0].catalog_description);
  failSave = false;
  await input.fill("Unsaved change");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Demo Comfort Pair 2 Visible in catalog", exact: true })
    .click();
  assert.equal(await input.inputValue(), "Unsaved change");
  await editor().getByRole("button", { name: "Discard changes", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < 1024) await page.getByRole("tab", { name: "Edit product", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Owner overflow " + width,
    );
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("tab", { name: "Edit product", exact: true }).click();
  await editor().scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/owner-mobile.png" });
  await page.goto("http://localhost:8080/description-public.html");
  const card = page.getByRole("button", { name: "Demo Comfort Pair 1", exact: true });
  await card.waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "Public overflow " + width,
    );
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/catalog-mobile.png" });
  await card.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Product description", exact: true }).waitFor();
  assert((await dialog.innerText()).includes(products[0].catalog_description));
  assert.equal(await page.evaluate(() => window.descriptionInjected), undefined);
  await dialog.getByRole("button", { name: "7", exact: true }).click();
  await dialog.getByRole("button", { name: "Get this pair", exact: true }).waitFor();
  await page.screenshot({ path: out + "/details-mobile.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Demo Comfort Pair 2", exact: true }).click();
  assert.equal(
    await dialog.getByRole("heading", { name: "Product description", exact: true }).count(),
    0,
  );
  await page.keyboard.press("Escape");
  products[0].catalog_description =
    "Lightweight sports shoes for everyday wear.\nSoft upper, regular fit and easy-to-clean finish.";
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openEditor();
  assert.equal(await input.getAttribute("maxlength"), "1000");
  await page.evaluate(() =>
    document.querySelectorAll("[data-sonner-toast]").forEach((n) => n.remove()),
  );
  await page.screenshot({ path: out + "/owner-desktop-clean.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("tab", { name: "Edit product", exact: true }).click();
  await editor().scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/owner-mobile-clean.png" });
  await page.goto("http://localhost:8080/description-public.html");
  await page.getByRole("button", { name: "Demo Comfort Pair 1", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Product description", exact: true })
    .waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: out + "/details-mobile-clean.png" });
  await page.keyboard.press("Escape");
  await page.getByLabel("Language", { exact: true }).selectOption("hindi");
  await page.getByRole("button", { name: "Demo Comfort Pair 1", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "प्रोडक्ट का विवरण", exact: true })
    .waitFor();
  assert((await page.getByRole("dialog").innerText()).includes(products[0].catalog_description));
  await page.keyboard.press("Escape");
  await page.getByLabel("Language", { exact: true }).selectOption("english");
  products[0].catalog_description = "x".repeat(1000);
  await page.reload();
  await page.getByRole("button", { name: "Demo Comfort Pair 1", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Product description", exact: true })
      .count(),
    1,
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openEditor();
  await input.fill("   ");
  await editor().getByRole("button", { name: "Save description", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("textarea")?.value);
  assert.equal(products[0].catalog_description, null);
  missing = true;
  await openEditor();
  await page
    .getByText("Product descriptions need a database update before they can be saved.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await input.isDisabled(), true);
  assert.equal(
    await editor().getByRole("button", { name: "Save description", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole("switch", { name: "Visible in catalog", exact: true }).count(),
    1,
  );
  await page.goto("http://localhost:8080/description-public.html");
  await page.getByRole("button", { name: "Demo Comfort Pair 1", exact: true }).click();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: "Product description", exact: true })
      .count(),
    0,
  );
  role = "staff";
  await page.goto("http://localhost:8080/catalog-studio");
  await page.waitForURL("**/pos");
  assert.equal(await editor().count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    result: "PASS",
    scope: "Real components with synthetic HTTP data; zero live reads/writes",
    checks: [
      "owner load/edit/save/reload",
      "failed save retains draft",
      "discard changes",
      "cancel product switch preserves draft",
      "mobile layout at 320/390/768/1440",
      "public description only after opening product",
      "literal HTML is inert",
      "Hindi content preserved",
      "unchanged size selection",
      "blank clears description",
      "missing storage preserves existing editor and catalog",
      "staff route blocked",
    ],
    writes: writes.length,
    errors,
  };
  await fs.writeFile(out + "/checks.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-4500));
  throw e;
} finally {
  await browser.close();
}
