import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
await p.addInitScript(() => {
  window.__vite_plugin_react_preamble_installed__ = true;
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
});
p.on("pageerror", (e) => errors.push(e.message));
await p.route("**/i18n-audit.html", async (r) =>
  r.fulfill({
    contentType: "text/html",
    body: await fs.readFile(new URL("./fixtures/audit-harness.html", import.meta.url), "utf8"),
  }),
);
try {
  await p.goto("http://127.0.0.1:3000/i18n-audit.html");
  await p.getByRole("button", { name: "English", exact: true }).waitFor();
  const beforeVisits = await p.evaluate(() => {
    const section = document.createElement("section");
    section.dataset.noTranslate = "";
    section.id = "protected";
    section.innerHTML = Array.from(
      { length: 3000 },
      () => '<article><span>Products</span><input placeholder="Products" /></article>',
    ).join("");
    document.body.append(section);
    const label = document.createElement("p");
    label.id = "outside";
    label.textContent = "Products";
    document.body.append(label);
    const pre = document.createElement("pre");
    pre.id = "code";
    pre.innerHTML = "<span>Products</span>";
    document.body.append(pre);
    const native = document.createTreeWalker.bind(document);
    const old = native(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let count = 0;
    while (old.nextNode()) count++;
    window.__visits = 0;
    document.createTreeWalker = (...args) => {
      const walker = native(...args);
      const next = walker.nextNode.bind(walker);
      walker.nextNode = () => {
        const node = next();
        if (node) window.__visits++;
        return node;
      };
      return walker;
    };
    return count;
  });
  await p.getByRole("button", { name: "हिंदी", exact: true }).click();
  await p.waitForFunction(() => document.querySelector("#outside").textContent === "सामान");
  const afterVisits = await p.evaluate(() => window.__visits);
  assert(afterVisits < beforeVisits / 10, JSON.stringify({ beforeVisits, afterVisits }));
  assert.equal(await p.locator("#protected span").first().innerText(), "Products");
  assert.equal(await p.locator("#protected input").first().getAttribute("placeholder"), "Products");
  assert.equal(await p.locator("#code span").innerText(), "Products");
  await p.getByRole("button", { name: "Hinglish", exact: true }).click();
  await p.waitForFunction(() => document.querySelector("#outside").textContent === "Saman");
  await p.getByRole("button", { name: "English", exact: true }).click();
  await p.waitForFunction(() => document.querySelector("#outside").textContent === "Products");
  await p.evaluate(() => {
    const el = document.createElement("p");
    el.id = "later";
    el.textContent = "Products";
    document.body.append(el);
  });
  await p.getByRole("button", { name: "हिंदी", exact: true }).click();
  await p.waitForFunction(() => document.querySelector("#later").textContent === "सामान");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "English/Hindi/Hinglish and newly mounted text translate correctly",
        "Protected product data, placeholders and code remain untouched",
        "Protected subtrees are skipped instead of visiting each nested element",
      ],
      scenario: "Synthetic3000protectedrows; tree-walker returned-node counts, not whole-app speed",
      beforeVisits,
      afterVisits,
      errors,
    }),
  );
} catch (error) {
  console.error(await p.locator("body").innerText(), errors);
  throw error;
} finally {
  await b.close();
}
