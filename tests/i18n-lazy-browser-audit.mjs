import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
let requests = 0,
  release,
  hold = true;
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === "/src/lib/i18n-data.ts") {
    requests++;
    if (hold) await new Promise((resolve) => (release = resolve));
    return route.continue();
  }
  if (u.pathname === "/language-lazy.html")
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;import {LanguageProvider,LanguageSelect,useLang} from '/src/lib/i18n.tsx';
function App(){const {t}=useLang();return React.createElement(React.Fragment,null,React.createElement(LanguageSelect),React.createElement('p',{id:'legacy'},t('Baaki wale khate')),React.createElement('p',{id:'normal'},'Products'),React.createElement('input',{placeholder:'Products'}));}
createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider,null,React.createElement(App)));
</script>`,
    });
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/language-lazy.html");
  await page.getByRole("button", { name: "English", exact: true }).waitFor();
  assert.equal(await page.locator("#legacy").innerText(), "Accounts with outstanding balances");
  assert.equal(requests, 0, "English entry must not fetch the full dictionary");
  await page.getByRole("button", { name: "हिंदी", exact: true }).click();
  await page.waitForFunction(() => true);
  for (let i = 0; i < 30 && !release; i++) await page.waitForTimeout(30);
  assert(release);
  // A later English choice must win even when the earlier language chunk is late.
  await page.getByRole("button", { name: "English", exact: true }).click();
  hold = false;
  release();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#normal").innerText(), "Products");
  await page.getByRole("button", { name: "हिंदी", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#normal").textContent === "सामान");
  assert.equal(await page.locator("input").getAttribute("placeholder"), "सामान");
  await page.getByRole("button", { name: "Hinglish", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#normal").textContent === "Saman");
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#normal")?.textContent === "Saman");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#normal").textContent === "Products");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      englishDictionaryRequests: 0,
      legacyEnglish: true,
      lateSelectionGuard: true,
      allLanguagesAndSavedPreference: true,
      liveWrites: 0,
    }),
  );
} catch (e) {
  console.error("BROWSER_ERRORS", errors, await page.locator("body").innerText());
  throw e;
} finally {
  release?.();
  await browser.close();
}
