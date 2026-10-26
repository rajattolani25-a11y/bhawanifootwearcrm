// Optional browser checks: install Playwright separately; start npm run dev on port8080.
// PLAYWRIGHT_MODULE may point to its index.mjs. All shop data in route checks is mocked.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import fs from "node:fs/promises";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
let role = "owner";
const writes = [];
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return r.continue();
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    if (r.request().method() === "PATCH") {
      writes.push(r.request().postDataJSON());
      return r.fulfill({ json: {} });
    }
    let data = [];
    if (u.pathname.endsWith("/user_roles"))
      data = r.request().headers()["accept"]?.includes("object")
        ? role === "owner"
          ? { role }
          : null
        : [{ role }];
    if (
      u.pathname.endsWith("/user_roles") &&
      u.searchParams.get("role") === "eq.owner" &&
      role === "staff"
    )
      data = [];
    if (u.pathname.endsWith("/products"))
      data = Array.from({ length: 20 }, (_, i) => ({
        id: "product" + i,
        brand: "Demo",
        article: "Article" + String(i).padStart(4, "0"),
        category: "Gents",
        color: "Cream",
        mrp: 999,
        selling_price: 799,
        image_url: null,
        product_variants: [7, 8].map((size) => ({
          id: "variant" + i + "-" + size,
          size: String(size),
          stock: 8,
          sku: "BC" + i + size,
          barcode: "BC" + i + size,
          rack: "A",
        })),
      }));
    if (u.pathname.endsWith("/store_settings"))
      data = {
        catalog_enabled: true,
        booking_enabled: false,
        pickup_enabled: true,
        delivery_enabled: true,
        outside_enabled: false,
        local_charge: 30,
        outside_charge: 80,
        free_delivery_above: null,
        delivery_note: "Demo area",
        show_few_left: true,
        upi_id: "demo@upi",
        advance_percent: 50,
        hold_hours: 24,
        id: 1,
        business_name: "Demo Store",
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
await p.waitForTimeout(1500);
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
await p.evaluate(
  async ({ token }) => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const r = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "mock-refresh",
    });
    if (r.error) throw r.error;
  },
  { token },
);

const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const out = "/tmp/solestack-audit/catalog-release";
await fs.mkdir(out, { recursive: true });
await p.goto("http://localhost:8080/barcodes");
await p.getByRole("checkbox", { name: "Select Demo Article0000 labels", exact: true }).waitFor();
await p.getByRole("checkbox", { name: "Select Demo Article0000 labels", exact: true }).check();
const dock = p.getByRole("complementary", { name: "Selected label actions" });
await dock.getByText("1 article selected", { exact: true }).waitFor();
const initialDock = await dock.boundingBox();
if (!initialDock || initialDock.y < 0 || initialDock.y + initialDock.height > 844) throw Error("Dock hidden on long inventory list");
await p.getByPlaceholder("Article or scan code", { exact: true }).fill("Article0019");
await p.getByRole("checkbox", { name: "Select Demo Article0019 labels", exact: true }).check();
await dock.getByText("2 articles selected", { exact: true }).waitFor();
const bounds = await dock.boundingBox();
if (!bounds || bounds.y < 0 || bounds.y + bounds.height > 844)
  throw Error("Dock outside mobile viewport");
await p.screenshot({ path: out + "/labels-mobile.png" });
await dock.getByRole("button", { name: "Clear selection", exact: true }).click();
await dock.waitFor({ state: "detached" });
await p.getByRole("spinbutton", { name: "Labels for size 7", exact: true }).fill("999");
await p.getByRole("spinbutton", { name: "Labels for size 7", exact: true }).blur();
if (
  (await p.getByRole("spinbutton", { name: "Labels for size 7", exact: true }).inputValue()) !==
  "500"
)
  throw Error("Count not clamped");
await p.getByRole("spinbutton", { name: "Labels for size 7", exact: true }).fill("2");
await dock.getByRole("button", { name: "Print selected labels", exact: true }).click();
await p.waitForFunction(
  () =>
    document.querySelector("#print-preview iframe")?.contentDocument?.querySelectorAll(".label")
      .length === 2,
);
await p.getByRole("button", { name: "Close", exact: true }).click();
await p.goto("http://localhost:8080/settings");
await p.getByRole("tab", { name: "Orders & delivery", exact: true }).click();
await p.getByRole("button", { name: "Save catalog settings", exact: true }).waitFor();
await p
  .getByText("Local delivery charge (₹)", { exact: true })
  .locator("..")
  .locator("input")
  .fill("0");
await p.getByRole("button", { name: "Save catalog settings", exact: true }).click();
await p.waitForTimeout(350);
if (!writes.some((x) => x.local_charge === 0)) throw Error("Free delivery charge save failed");
role = "staff";
await p.goto("http://localhost:8080/settings");
await p.getByText("Only the Owner can open Settings.", { exact: true }).waitFor();
if (await p.getByRole("button", { name: "Save catalog settings", exact: true }).count()) throw Error("Staff can see catalog controls");
if (errors.length) throw Error(errors.join("\n"));
const result = {
  selectionSurvivesSearch: true,
  mobileDockVisible: true,
  clearSelection: true,
  countClampedTo500: true,
  twoLabelPreview: true,
  ownerFreeDeliverySave: true,
  longListDockVisible: true,
  staffSettingsBlocked: true,
  mockedWrites: writes.length,
  realWrites: 0,
  errors,
};
await fs.writeFile(out + "/labels-settings-checks.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await b.close();
