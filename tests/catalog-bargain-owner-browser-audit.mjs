import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
page.setDefaultTimeout(20000);
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__owner = true;
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.includes("/src/hooks/use-auth.tsx"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `export const useAuth=()=>({isOwner:window.__owner,loading:false});`,
    });
  if (u.pathname.includes("/src/integrations/supabase/client.ts"))
    return route.fulfill({
      contentType: "application/javascript",
      body: `export const supabase={rpc:async(name,args)=>{const policy=JSON.parse(localStorage.getItem('qa-policy')||'null')||{enabled:false,kind:'amount',min_discount:0,max_discount:0,rounding:5,revision:null};if(!window.__owner)return {error:{message:'Owner access required'}};if(name==='owner_catalog_bargain_policy')return {data:policy,error:null};if(name==='save_catalog_bargain_policy'){if(args._expected_revision!==policy.revision)return {error:{message:'Bargaining rules changed. Reload before saving.'}};const saved={...args._policy,revision:crypto.randomUUID()};localStorage.setItem('qa-policy',JSON.stringify(saved));return {data:saved,error:null};}throw Error('Unexpected owner RPC');}};`,
    });
  if (u.pathname === "/owner-bargain-audit.html")
    return route.fulfill({
      contentType: "text/html",
      body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/catalog-bargain-owner.tsx"></script></body></html>',
    });
  if (u.pathname === "/owner-bargain-harness.tsx")
    return route.fulfill({
      contentType: "application/javascript",
      body: `import React from'/node_modules/.vite/deps/react.js';const {useState}=React;import ReactDOM from'/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;import{QueryClient,QueryClientProvider}from'/node_modules/.vite/deps/@tanstack_react-query.js';import{LanguageProvider}from'/src/lib/i18n.tsx';import{BargainPolicyEditor}from'/src/components/catalog-commerce/BargainPolicyEditor.tsx';function App(){const[owner,setOwner]=useState(true);return React.createElement('div',{style:{padding:20,maxWidth:600,margin:'auto'}},React.createElement('button',{onClick:()=>{window.__owner=!owner;setOwner(!owner)}},'Switch role'),React.createElement(BargainPolicyEditor,{key:String(owner),productId:'10000000-0000-4000-8000-000000000001',price:2200}));}createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(LanguageProvider,null,React.createElement(App))));`,
    });
  if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
  external.push(u.origin);
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/owner-bargain-audit.html", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.getByRole("switch").check();
  await page.getByRole("spinbutton", { name: "Maximum discount", exact: true }).fill("200");
  await page.getByRole("button", { name: "Bargaining rules", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Bargaining rules", { exact: true }).waitFor();
  assert.equal(await dialog.locator("li").count(), 14);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "Discount type", exact: true }).selectOption("percent");
  await page.getByRole("spinbutton", { name: "Maximum discount", exact: true }).fill("25");
  await page.getByRole("button", { name: "Save bargaining settings", exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("qa-policy") || "null")?.max_discount === 25,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("switch").waitFor();
  assert.equal(await page.getByRole("switch").isChecked(), true);
  assert.equal(
    await page.getByRole("spinbutton", { name: "Maximum discount", exact: true }).inputValue(),
    "25",
  );
  await fs.mkdir("/tmp/solestack-audit/catalog-commerce", { recursive: true });
  await page.screenshot({ path: "/tmp/solestack-audit/catalog-commerce/owner-controls.png" });
  await page.getByRole("button", { name: "Switch role", exact: true }).click();
  assert.equal(await page.getByRole("switch").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Bargaining rules", exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log("Owner bargain controls audit passed");
} catch (e) {
  console.error({ errors, external, body: await page.locator("body").innerText() });
  throw e;
} finally {
  await browser.close();
}
