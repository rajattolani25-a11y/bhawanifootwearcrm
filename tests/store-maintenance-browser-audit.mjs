// No production data: ALL off-origin HTTP and WebSocket traffic is intercepted.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/*", (s) => s.close());
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
let ownerRole = true;
let blockResetOnce = true,
  resetGuardErrors = 0;
let legacyWrites = 0;
let supported = false,
  cleanup = [],
  failedDelete = true,
  fileExists = true,
  empty = false,
  resetCalls = 0,
  restoreCalls = 0,
  transferCalls = 0;
let state = { installation_id: "installation-fixture", generation: "generation-1", reset_at: null };
const tableNames = [
  "products",
  "product_costs",
  "product_variants",
  "customers",
  "suppliers",
  "coupons",
  "sales",
  "purchases",
  "sale_items",
  "sale_costs",
  "sale_item_costs",
  "sale_returns",
  "credit_payments",
  "loyalty_rewards",
  "loyalty_events",
  "supplier_payments",
  "stock_movements",
  "expenses",
  "coupon_redemptions",
  "catalog_bookings",
  "store_settings",
  "catalog_hero_settings",
  "catalog_presentation_settings",
];
const asset = {
  bucket: "product-images",
  path: "products/demo.webp",
  updated_at: "2026-11-01T00:00:00Z",
};
const snapshot = () => ({
  version: 2,
  state: { ...state },
  fingerprint: empty ? "after-reset" : "before-reset",
  tables: Object.fromEntries(
    tableNames.map((t) => [
      t,
      t === "products" && !empty
        ? [{ id: "p", article: "Demo" }]
        : t.endsWith("_settings")
          ? [{ id: 1 }]
          : [],
    ]),
  ),
  assets: fileExists ? [asset] : [],
  team: {},
  numbering: { next_bill: 42 },
});
await page.route("**/*", async (route) => {
  const req = route.request(),
    u = new URL(req.url());
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
  if (u.pathname.startsWith("/auth/v1")) return route.fulfill({ json: user });
  if (u.pathname.includes("/storage/v1/object/")) {
    if (req.method() === "DELETE") {
      if (failedDelete)
        return route.fulfill({
          status: 500,
          json: { message: "Synthetic storage outage", statusCode: 500, error: "StorageFailure" },
        });
      fileExists = false;
      return route.fulfill({ json: [{ name: asset.path }] });
    }
    if (req.method() === "POST") {
      fileExists = true;
      return route.fulfill({ json: { Key: "product-images/" + asset.path } });
    }
    return fileExists
      ? route.fulfill({ contentType: "image/webp", body: Buffer.from("fixture-image-bytes") })
      : route.fulfill({ status: 404, json: { message: "Not found", statusCode: 404 } });
  }
  if (!u.pathname.startsWith("/rest/v1/")) return route.abort();
  const name = u.pathname.split("/").at(-1);
  if (["store_reset_state", "store_file_cleanup"].includes(name) && !supported)
    return route.fulfill({ status: 404, json: { code: "PGRST205", message: "Missing migration" } });
  if (name === "store_reset_state") return route.fulfill({ json: state });
  if (name === "store_file_cleanup") {
    if (req.method() === "HEAD")
      return route.fulfill({
        status: 200,
        body: "",
        headers: {
          "content-range": `*/${cleanup.length}`,
          "access-control-expose-headers": "content-range",
        },
      });
    return route.fulfill({ json: cleanup });
  }
  if (name === "user_roles")
    return route.fulfill({ json: ownerRole ? [{ user_id: user.id, role: "owner" }] : [] });
  if (name === "profiles")
    return route.fulfill({ json: [{ id: user.id, full_name: "Demo Owner" }] });
  if (name === "store_settings" && req.method() !== "GET") legacyWrites++;
  if (name === "store_settings")
    return route.fulfill({
      json: {
        id: 1,
        business_name: "Demo Store",
        business_phone: "0000000000",
        business_address: "Demo",
        gstin: "",
        bill_footer: "Demo",
        daily_target: 15000,
        bill_design: "Thermal",
        thermal_width: "80",
      },
    });
  if (name === "store_backup_snapshot_v2") return route.fulfill({ json: snapshot() });
  if (name === "reset_store_data_v2") {
    const body = req.postDataJSON();
    assert.equal(body._confirmation, "RESET");
    assert.equal(body._fingerprint, "before-reset");
    assert.equal(body._preserve_identity, true);
    assert.equal(body._preserve_design, false);
    assert.equal(body._restart_numbers, false);
    assert.equal(body._preserve_operations, true);
    if (blockResetOnce) {
      blockResetOnce = false;
      resetGuardErrors++;
      return route.fulfill({
        status: 400,
        json: { code: "21000", message: "DELETE requires a WHERE clause" },
      });
    }
    resetCalls++;
    empty = true;
    state = { ...state, generation: "generation-2", reset_at: "2026-11-02T00:00:00Z" };
    cleanup = [{ ...asset, reason: "reset" }];
    return route.fulfill({
      json: {
        state,
        pending_files: 1,
        database_bytes_before: 24000000,
        database_bytes_after: 500000,
        database_bytes_reclaimed: 23500000,
      },
    });
  }
  if (name === "ack_store_file_cleanup") {
    if (!fileExists) cleanup = [];
    return route.fulfill({ body: "", status: 204 });
  }
  if (name === "stage_store_restore_files") {
    cleanup = [{ ...asset, reason: "restore" }];
    return route.fulfill({ body: "", status: 204 });
  }
  if (name === "restore_store_backup_v2") {
    restoreCalls++;
    assert.equal(req.postDataJSON()._snapshot.tables.products[0].article, "Demo");
    empty = false;
    cleanup = [];
    state = { ...state, generation: "generation-3" };
    return route.fulfill({ body: "", status: 204 });
  }
  if (name === "transfer_store_ownership") {
    transferCalls++;
    assert.equal(req.postDataJSON()._email, "new@example.invalid");
    return route.fulfill({
      status: 400,
      json: { message: "New owner must sign up and verify a different email first" },
    });
  }
  if (name === "store_usage")
    return route.fulfill({
      json: {
        db_bytes: 1024,
        photo_bytes: 1024,
        photos: 1,
        products: 1,
        variants: 1,
        bills: 1,
        customers: 1,
        suppliers: 0,
        stock_entries: 1,
      },
    });
  if (name === "catalog_hero_storage_usage")
    return route.fulfill({ json: { photo_bytes: 0, photos: 0 } });
  return route.fulfill({ json: [] });
});
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
  await page.evaluate(
    async ({ token }) => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      await supabase.auth.setSession({ access_token: token, refresh_token: "mock-refresh" });
      localStorage.setItem("solestack-held-bills", "old");
      localStorage.setItem("solestack-poster-campaigns-v1", "old");
      localStorage.setItem("solestack-language", "en");
      localStorage.setItem("solestack-theme", "light");
    },
    { token },
  );
  await page.goto("http://localhost:8080/settings");
  await page.getByRole("tab", { name: "Data & backup", exact: true }).click();
  await page
    .getByText(/Safe maintenance is unavailable/)
    .first()
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Download backup", exact: true }).isDisabled(),
    true,
  );
  supported = true;
  await page.getByRole("button", { name: "Retry support check", exact: true }).click();
  const downloadButton = page.getByRole("button", {
    name: "Download backup",
    exact: true,
  });
  await downloadButton.waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((b) => b.textContent === "Download backup")
        ?.disabled,
  );
  assert.equal(await page.locator('input[type="checkbox"]:visible').count(), 0);
  assert.equal(await page.locator('input[type="file"]:visible').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/solestack-maintenance-simple-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText("Reset business data", { exact: true }).click();
  await page.getByText("Advanced: change what stays", { exact: true }).click();
  const designOption = page.getByRole("checkbox", { name: /Keep current catalog hero/ });
  assert.equal(await designOption.isChecked(), true);
  await designOption.uncheck();
  await page.getByLabel("Type RESET (uppercase)", { exact: true }).fill("RESET");
  assert.equal(
    await page
      .getByRole("button", { name: "Permanently reset this store", exact: true })
      .isDisabled(),
    true,
  );
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const out = "/tmp/solestack-maintenance-browser-backup.json";
  await download.saveAs(out);
  const raw = JSON.parse(await fs.readFile(out, "utf8"));
  assert.equal(raw.files.length, 1);
  assert.equal(raw.snapshot.tables.products[0].article, "Demo");
  const bad = structuredClone(raw);
  bad.snapshot.tables.products[0].article = "DAMAGED";
  await fs.writeFile("/tmp/solestack-maintenance-damaged.json", JSON.stringify(bad));
  await page
    .getByLabel("Verify downloaded backup", { exact: true })
    .setInputFiles("/tmp/solestack-maintenance-damaged.json");
  await page.getByRole("alert").filter({ hasText: "Backup checksum failed" }).first().waitFor();
  assert.equal(resetCalls, 0);
  await page.getByLabel("Verify downloaded backup", { exact: true }).setInputFiles(out);
  await page.getByText("Saved backup verified ✓", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Permanently reset this store", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "DELETE requires a WHERE clause" })
    .first()
    .waitFor();
  assert.equal(resetCalls, 0);
  assert.equal(empty, false);
  assert.equal(cleanup.length, 0);
  assert.equal(
    await page
      .getByText("Resetting business data in one database transaction…", { exact: true })
      .count(),
    0,
    "Failed RPC left a stale in-progress message",
  );
  // The mocked SQL fix is now installed; the same verified backup can retry.
  await page.getByRole("button", { name: "Permanently reset this store", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Photo cleanup pending" }).first().waitFor();
  assert.equal(resetCalls, 1);
  await page.getByText("Last reset: database allocation", { exact: true }).waitFor();
  await page.getByText("24.00 MB → 500.00 KB", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Permanently reset this store", exact: true })
      .isDisabled(),
    true,
  );
  const device = await page.evaluate(() => ({
    held: localStorage.getItem("solestack-held-bills"),
    campaigns: localStorage.getItem("solestack-poster-campaigns-v1"),
    language: localStorage.getItem("solestack-language"),
    theme: localStorage.getItem("solestack-theme"),
    auth: Object.keys(localStorage).some((k) => k.includes("auth-token")),
  }));
  assert.deepEqual(device, {
    held: null,
    campaigns: null,
    language: "en",
    theme: "light",
    auth: true,
  });
  failedDelete = false;
  await page.getByRole("button", { name: "Retry photo cleanup", exact: true }).click();
  await page.getByText("Pending photo cleanup completed.", { exact: false }).first().waitFor();
  assert.equal(cleanup.length, 0);
  await page.getByText("Restore backup", { exact: true }).click();
  await page.getByLabel("Select backup to restore", { exact: true }).setInputFiles(out);
  await page.getByLabel("Type RESTORE", { exact: true }).fill("RESTORE");
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Restore verified backup",
      )?.disabled,
  );
  await page.getByRole("button", { name: "Restore verified backup", exact: true }).click();
  await page
    .getByText("Backup restored. Team access remains unchanged. Reload to continue.", {
      exact: true,
    })
    .waitFor();
  assert.equal(restoreCalls, 1);
  assert.equal(fileExists, true);
  assert.equal(cleanup.length, 0);
  await page.getByText("Import from the old offline app", { exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Import old JSON" })
    .locator("input")
    .setInputFiles(out);
  await page
    .getByText(/This is not a legacy backup/)
    .first()
    .waitFor();
  assert.equal(
    legacyWrites,
    0,
    "Legacy importer wrote current cloud backup before checking format",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: "/tmp/solestack-maintenance-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Mobile overflow",
  );
  await page.getByRole("tab", { name: "Team", exact: true }).click();
  await page.getByText("New owner / hand over this store", { exact: true }).click();
  await page.getByLabel("New owner’s verified email", { exact: true }).fill("new@example.invalid");
  await page.getByLabel("Type TRANSFER", { exact: true }).fill("TRANSFER");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Transfer ownership and remove my access", exact: true })
    .click();
  await page
    .getByText("New owner must sign up and verify a different email first", { exact: true })
    .first()
    .waitFor();
  assert.equal(transferCalls, 1);
  await page.screenshot({ path: "/tmp/solestack-owner-transfer-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  ownerRole = false;
  state = { ...state, generation: "remote-reset-4" };
  await page.evaluate(() => {
    localStorage.setItem("solestack-held-bills", "old remote bill");
    localStorage.setItem("solestack-poster-campaigns-v1", "old remote preset");
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByRole("heading", { name: "Waiting for owner approval", exact: true }).waitFor();
  await page.waitForFunction(() => localStorage.getItem("solestack-held-bills") === null);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("solestack-poster-campaigns-v1")),
    null,
  );
  console.log(
    JSON.stringify(
      {
        scope:
          "Real Settings UI with entirely mocked off-origin requests; no production reset, storage or ownership mutations",
        checks: [
          "missing migration fails closed",
          "typed confirmation alone cannot enable reset",
          "backup includes actual photo bytes",
          "damaged download rejected",
          "saved file verified before reset",
          "correct reset policy sent, preserving billing and catalog operational preferences",
          "cleanup failure is explicit and retryable",
          "server-measured reset allocation summary remains visible after cleanup failure",
          "no repeated reset after cleanup failure",
          "WHERE-guard error clears stale progress; failed RPC does not mutate fixture state",
          "drafts cleared; auth/theme/language retained",
          "same-backend restore uploads photos and restores rows",
          "mobile has no horizontal overflow",
          "simple initial view hides advanced controls and file inputs",
          "new-owner verification error shown",
          "legacy importer rejects current backup before writes",
          "remote reset clears drafts and revoked user sees approval screen",
        ],
        resetCalls,
        resetGuardErrors,
        restoreCalls,
        transferCalls,
        errors,
        result: "PASS",
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/solestack-maintenance-failure.png", fullPage: true });
  await fs.writeFile("/tmp/solestack-maintenance-failure.html", await page.content());
  throw e;
} finally {
  await browser.close();
}
