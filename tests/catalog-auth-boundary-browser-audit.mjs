import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (t) => t;
  window.__sdkLoads = 0;
  window.__sessions = 0;
  window.__listeners = [];
  window.__unsubscribed = 0;
  window.__role = "owner";
  window.__session = { user: { id: "qa-user" }, access_token: "QA-TOKEN-NOT-A-REAL-CREDENTIAL" };
});
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith("/catalog-auth-boundary.html"))
    return route.fulfill({
      contentType: "text/html",
      body: await fs.readFile(
        new URL("./fixtures/catalog-auth-boundary.html", import.meta.url),
        "utf8",
      ),
    });
  if (u.pathname === "/src/integrations/supabase/client.ts")
    return route.fulfill({
      contentType: "application/javascript",
      body: await fs.readFile(new URL("./fixtures/app-auth-client.mjs", import.meta.url), "utf8"),
    });
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
  external.push(u.origin);
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:3000/tests/fixtures/catalog-auth-boundary.html");
  await page.getByText("Public catalog boundary", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__sdkLoads),
    0,
    "A fresh public-only visit never imports the auth SDK",
  );
  const publicCalls = await page.evaluate(async () => {
    const a = window.__authBoundary;
    const results = [];
    for (const f of a.publicFns) {
      const id = f.url.split("/").at(-1);
      results.push(
        await a.client({
          serverFnMeta: { id },
          next: async (opts) => ({ headers: opts?.headers ?? {} }),
        }),
      );
    }
    return results;
  });
  assert.equal(publicCalls.length, 12);
  assert(publicCalls.every((r) => !r.headers.Authorization));
  assert.equal(
    await page.evaluate(() => window.__sdkLoads),
    0,
    "All public catalog RPCs remain anonymous without auth SDK",
  );
  const privateCall = await page.evaluate(async () =>
    window.__authBoundary.client({
      serverFnMeta: { id: "qa-private-function" },
      next: async (opts) => opts,
    }),
  );
  assert.equal(privateCall.headers.Authorization, "Bearer QA-TOKEN-NOT-A-REAL-CREDENTIAL");
  await page.evaluate(() => window.__authBoundary.router.navigate({ to: "/dashboard" }));
  await page.getByText("App auth boundary", { exact: true }).waitFor();
  await page.waitForFunction(() => window.__listeners.length === 1);
  await page.evaluate(() => {
    const a = window.__authBoundary;
    a.queryClient.setQueryData(["private"], "owner-data");
    window.__listeners.forEach((cb) => cb("INITIAL_SESSION", window.__session));
  });
  await page.evaluate(() => window.__authBoundary.router.navigate({ to: "/catalog" }));
  await page.getByText("Public catalog boundary", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__listeners.length),
    1,
    "Once started, auth observer stays active on the catalog",
  );
  await page.evaluate(() => window.__listeners.forEach((cb) => cb("SIGNED_OUT", null)));
  assert.equal(
    await page.evaluate(() => window.__authBoundary.queryClient.getQueryData(["private"])),
    undefined,
    "Sign-out still clears private query caches on catalog",
  );
  const owner = await page.evaluate(async () => {
    await window.__authBoundary.requireOwnerRoute({ context: { user: { id: "qa-user" } } });
    return true;
  });
  assert(owner);
  const denied = await page.evaluate(async () => {
    window.__role = "staff";
    try {
      await window.__authBoundary.requireOwnerRoute({ context: { user: { id: "qa-user" } } });
      return false;
    } catch {
      return true;
    }
  });
  assert(denied, "Owner guard still denies staff");
  const signedOut = await page.evaluate(async () => {
    window.__session = null;
    try {
      await window.__authBoundary.beforeLoad({});
      return false;
    } catch {
      return true;
    }
  });
  assert(signedOut, "Authenticated route still blocks absent sessions");
  const signedIn = await page.evaluate(async () => {
    window.__session = { user: { id: "qa-user" }, access_token: "QA-TOKEN-NOT-A-REAL-CREDENTIAL" };
    return (await window.__authBoundary.beforeLoad({})).user.id;
  });
  assert.equal(signedIn, "qa-user");
  const anonymousPrivate = await page.evaluate(async () => {
    window.__session = null;
    return await window.__authBoundary.client({
      serverFnMeta: { id: "private" },
      next: async (opts) => opts,
    });
  });
  assert.deepEqual(anonymousPrivate.headers, {});
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: anonymous public RPCs avoid SDK; private tokens, app auth observer, sign-out clearing and owner/session guards preserved",
  );
} catch (e) {
  console.log("PAGE ERRORS", errors);
  console.log((await page.locator("body").innerText()).slice(-2000));
  throw e;
} finally {
  await browser.close();
}
