import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.setDefaultTimeout(12000);
const errors = [],
  unexpected = [],
  writes = [],
  reads = [];
let saved = null,
  missing = false,
  fail = false;
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  localStorage.setItem(
    "solestack-language",
    new URLSearchParams(location.search).get("lang") || "english",
  );
});
const row = () => ({
  id: "10000000-0000-4000-8000-000000000001",
  category: "Men / Sports & Active",
  catalog_spotlight_label: saved,
});
await p.route("**/*", async (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.includes("/src/hooks/use-auth"))
    return r.fulfill({
      contentType: "application/javascript",
      body: 'export const useAuth=()=>({isOwner:!location.search.includes("staff=1"),loading:false});',
    });
  if (u.pathname === "/heading-editor.html")
    return r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><div id="root"></div><script type="module" src="/tests/fixtures/spotlight-heading-editor.tsx"></script>',
    });
  if (u.pathname === "/rest/v1/products") {
    if (r.request().method() === "GET") {
      reads.push(u.search);
      if (missing)
        return r.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: "42703", message: "column missing" }),
        });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(row()) });
    }
    if (r.request().method() === "PATCH") {
      const body = r.request().postDataJSON();
      writes.push({ body, guard: u.searchParams.get("catalog_spotlight_label") });
      assert.deepEqual(Object.keys(body), ["catalog_spotlight_label"]);
      assert.equal(u.searchParams.get("id"), "eq.10000000-0000-4000-8000-000000000001");
      if (fail)
        return r.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary failure" }),
        });
      const match =
        u.searchParams.get("catalog_spotlight_label") ===
        (saved === null ? "is.null" : "eq." + saved);
      if (!match)
        return r.fulfill({
          status: 406,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST116", message: "No matching row" }),
        });
      saved = body.catalog_spotlight_label;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(row()) });
    }
  }
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return r.continue();
  unexpected.push(u.pathname);
  return r.abort();
});
const input = () => p.getByRole("textbox", { name: "Spotlight heading", exact: true });
const save = () => p.getByRole("button", { name: "Save Spotlight heading", exact: true });
try {
  await p.goto("http://127.0.0.1:3000/heading-editor.html");
  await input().waitFor();
  await input().fill("comfort");
  assert.equal(await input().inputValue(), "COMFORT");
  await save().click();
  await p.getByText("Spotlight heading saved", { exact: true }).waitFor();
  assert.equal(saved, "COMFORT");
  assert.equal(writes[0].guard, "is.null");
  await input().fill("two words");
  assert(await save().isDisabled());
  assert.equal(writes.length, 1);
  await input().fill("DAILY");
  fail = true;
  await save().click();
  await p.getByText(/Could not save\. Your changes/).waitFor();
  assert.equal(await input().inputValue(), "DAILY");
  assert.equal(saved, "COMFORT");
  fail = false;
  saved = "STREET";
  await save().click();
  await p.waitForTimeout(250);
  assert.equal(saved, "STREET");
  assert.equal(await input().inputValue(), "DAILY");
  await p.reload();
  await input().waitFor();
  await p.waitForFunction(() => document.querySelector("input")?.value === "STREET");
  await p.getByRole("button", { name: "Use automatic heading", exact: true }).click();
  await save().click();
  await p.waitForFunction(() => document.querySelector("input")?.value === "");
  assert.equal(saved, null);
  assert.equal(writes.at(-1).guard, "eq.STREET");
  missing = true;
  await p.reload();
  await p
    .getByText("Apply the Spotlight heading SQL update, then retry.", { exact: true })
    .waitFor();
  assert(await input().isDisabled());
  assert(await p.getByRole("button", { name: "Existing product controls" }).isEnabled());
  missing = false;
  await p.getByRole("button", { name: "Retry", exact: true }).click();
  await input().waitFor({ state: "visible" });
  await p.waitForFunction(() => !document.querySelector("input").disabled);
  for (const lang of ["hindi", "hinglish"]) {
    await p.goto("http://127.0.0.1:3000/heading-editor.html?lang=" + lang);
    await p.getByRole("textbox").waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  const before = reads.length;
  await p.goto("http://127.0.0.1:3000/heading-editor.html?staff=1");
  await p.getByRole("button", { name: "Existing product controls" }).waitFor();
  await p.waitForTimeout(200);
  assert.equal(await p.getByRole("textbox").count(), 0);
  assert.equal(reads.length, before);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    JSON.stringify({
      passed: true,
      ownerSaveConfirmed: true,
      onlyHeadingColumnWritten: true,
      staleGuard: true,
      failedDraftRetained: true,
      resetToAutomatic: true,
      missingSQLIsolated: true,
      threeLanguages: true,
      staffNoFieldOrRead: true,
      liveWrites: 0,
    }),
  );
} finally {
  await b.close();
}
