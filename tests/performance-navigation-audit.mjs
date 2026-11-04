import assert from "node:assert/strict";
// Optional browser checks: install Playwright separately; start npm run dev on port8080.
// PLAYWRIGHT_MODULE may point to its index.mjs. All shop data in route checks is mocked.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import fs from "node:fs/promises";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const loaded = [];
p.on("request", (r) => loaded.push(r.url()));
let role = "owner";
const metrics = { productReads: 0, signCalls: 0, signedPaths: 0, productBytes: 0 };
const rows = Array.from({ length: 120 }, (_, i) => ({
  id: "demo" + String(i).padStart(3, "0"),
  brand: "Demo",
  article: "Perf Pair " + i,
  category: "Gents",
  color: "Cream",
  gender: null,
  created_at: "2026-01-01T00:00:00Z",
  status: "Active",
  catalog_visible: true,
  mrp: 1299,
  selling_price: 999,
  image_url: "demo/photo" + (i % 101) + ".webp",
  product_variants: [
    {
      id: "v" + i,
      size: "7",
      stock: 8,
      damaged_stock: 0,
      min_stock: 2,
      rack: "A",
      barcode: "PERF" + i,
      sku: "PERF" + i,
    },
  ],
}));
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
await p.routeWebSocket("**/*", (socket) => socket.close());
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return r.continue();
  if (u.pathname.includes("/storage/v1/object/sign/")) {
    if (r.request().method() === "POST") {
      const paths = r.request().postDataJSON().paths || [];
      metrics.signCalls++;
      metrics.signedPaths += paths.length;
      return r.fulfill({
        json: paths.map((path) => ({
          path,
          signedURL: "/object/sign/product-images/" + path + "?token=fixture",
        })),
      });
    }
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><path d="M10 90L40 30L100 60L180 80L190 105L10 105Z" fill="#cdbb95"/></svg>',
    });
  }
  if (u.pathname.startsWith("/auth/v1")) return r.fulfill({ json: user });
  if (u.pathname.startsWith("/rest/v1/")) {
    let data = [];
    if (u.pathname.endsWith("/products")) {
      metrics.productReads++;
      const offset = Number(u.searchParams.get("offset") || 0),
        limit = Number(u.searchParams.get("limit") || 1000);
      data = rows.slice(offset, offset + limit);
      metrics.productBytes += JSON.stringify(data).length;
    }
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
    if (u.pathname.endsWith("/store_settings"))
      data = {
        id: 1,
        business_name: "Demo Store",
        daily_target: 10000,
        bill_design: "Thermal",
        thermal_width: "80",
        business_phone: "",
        business_address: "",
      };
    if (u.pathname.includes("/rpc/")) data = null;
    if (u.pathname.endsWith("/rpc/ensure_variant_label_code")) data = "SS1234567890";
    return r.fulfill({ json: data, headers: { "content-range": "0-0/0" } });
  }
  return r.abort();
});
await p.goto("http://127.0.0.1:3000/auth");
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
try {
  await p.goto("http://127.0.0.1:3000/pos");
  await p.getByLabel("Search or scan products", { exact: true }).waitFor();
  await p.getByText("Perf Pair 0", { exact: true }).first().waitFor();
  await p.getByRole("link", { name: "Products", exact: true }).click();
  await p.getByRole("heading", { name: "Products", exact: true }).waitFor();
  await p.getByText("Perf Pair 0", { exact: true }).first().waitFor();
  await p.getByRole("link", { name: "WhatsApp & Posters", exact: true }).click();
  await p.getByRole("heading", { name: "WhatsApp Community & Posters", exact: true }).waitFor();
  await p.getByAltText("Selected product poster").waitFor();
  const result = {
    scope:
      "120 synthetic products,101 unique photo paths; warm client navigation POS→Products→Posters; no real writes",
    ...metrics,
    errors,
  };
  assert.equal(metrics.productReads, 1);
  assert.equal(metrics.signCalls, 2);
  assert.equal(metrics.signedPaths, 101);
  const panel = p.getByRole("region", { name: "Poster products", exact: true });
  assert.equal(await panel.locator("button[aria-pressed]").count(), 30);
  await panel.getByRole("button", { name: "Show more products", exact: true }).click();
  assert.equal(await panel.locator("button[aria-pressed]").count(), 60);
  await p.getByPlaceholder("Search article", { exact: true }).fill("Perf Pair 119");
  await p.getByText("Perf Pair 119", { exact: true }).first().waitFor();
  result.incrementalListAndSearch = true;
  await p.getByRole("link", { name: "Barcodes", exact: false }).first().click();
  await p.getByRole("heading", { name: "Barcodes & QR", exact: true }).waitFor();
  assert(
    !loaded.some((u) => /\/(jsbarcode|qrcode)(\.|\/|\?)/i.test(u)),
    "Label tools loaded before preview click",
  );
  await p.getByLabel("Labels for size 7", { exact: true }).first().fill("1");
  await p.getByRole("button", { name: "Preview labels (1)", exact: true }).first().click();
  await p.locator("#print-preview iframe").waitFor();
  await p.frameLocator("#print-preview iframe").locator(".label svg").waitFor();
  assert(loaded.some((u) => u.includes("jsbarcode")));
  assert(loaded.some((u) => u.includes("qrcode")));
  result.lazyBarcodeAndQrTools = true;
  await p.getByRole("button", { name: "Close", exact: true }).click();
  const signedBeforeLogout = metrics.signCalls;
  await p.evaluate(() => {
    window.__navigationMarker = "same-context";
  });
  await p.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.signOut();
  });
  await p.waitForURL("**/auth");
  user.id = "00000000-0000-4000-8000-000000000002";
  role = "staff";
  const staffToken =
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
    const r = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "mock-refresh",
    });
    if (r.error) throw r.error;
  }, staffToken);
  await p.evaluate(() => {
    history.pushState({}, "", "/pos");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await p.getByText("Perf Pair 0", { exact: true }).first().waitFor();
  assert.equal(await p.evaluate(() => window.__navigationMarker), "same-context");
  assert(metrics.signCalls > signedBeforeLogout, "Old-user photo URLs survived logout");
  result.logoutLoginRenewsImages = true;
  result.sameBrowserContextAuthReset = true;
  assert.deepEqual(errors, []);
  const target = process.env.PERF_OUT || "/tmp/solestack-audit/perf-baseline.json";
  await fs.writeFile(target, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await b.close();
}
