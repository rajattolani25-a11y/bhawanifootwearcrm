import test from "node:test";
import assert from "node:assert/strict";
import { readPublicCatalog } from "../src/lib/catalog-read.ts";

export function catalogFixture(latency = 0) {
  const events = [];
  const state = {
    price: 999,
    available: true,
    enabled: true,
    primaryError: false,
    optionalError: false,
    signedPaths: [],
  };
  const hero = {
    image_path: "hero/10000000-0000-4000-8000-000000000001.webp",
    offer_kind: "up-to",
    offer_value: 20,
    custom_text: "Selected pairs",
    heading: "Everyday",
    subtitle: "Our collection",
    button_label: "Shop",
    action: "collection",
    product_id: null,
    category: "All",
    motion: true,
    image_scale: 90,
  };
  const delay = async (name, value) => {
    events.push(["start", name]);
    if (latency) await new Promise((r) => setTimeout(r, latency));
    events.push(["end", name]);
    return value;
  };
  const sb = {
    rpc(name) {
      if (name === "public_catalog")
        return delay(name, {
          data: {
            enabled: state.enabled,
            shop: { name: "Demo", phone: null, address: null },
            products: [1, 2].map((i) => ({
              id: "p" + i,
              brand: "Demo",
              article: "Pair" + i,
              price: state.price,
              mrp: 1299,
              image: "shared.webp",
              sizes: [{ id: "v" + i, size: "7", available: state.available }],
            })),
          },
          error: state.primaryError ? { message: "unavailable" } : null,
        });
      if (state.optionalError)
        return delay(name, { data: null, error: { message: "missing optional support" } });
      return delay(name, {
        data: name === "public_catalog_hero" ? hero : { title: "Offer", value: 20 },
        error: null,
      });
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () =>
                  delay("presentation", {
                    data: state.optionalError
                      ? null
                      : {
                          gallery_enabled: false,
                          category_accents: true,
                          motion_enabled: true,
                          theme: "ivory",
                        },
                  }),
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          createSignedUrls(paths) {
            state.signedPaths.push([...paths]);
            return delay("photos", {
              data: paths.map((path) => ({ path, signedUrl: "https://fixture.invalid/" + path })),
            });
          },
          createSignedUrl(path) {
            return delay("hero-photo", { data: { signedUrl: "https://fixture.invalid/" + path } });
          },
        };
      },
    },
  };
  return { sb, state, events };
}
test("catalog starts independent public reads together and retains the complete public result", async () => {
  const { sb, state, events } = catalogFixture(10);
  const result = await readPublicCatalog(sb);
  assert.deepEqual(state.signedPaths, [["shared.webp"]]);
  for (const name of ["presentation", "public_catalog_offer", "public_catalog_hero"])
    assert(
      events.findIndex((e) => e[0] === "start" && e[1] === name) <
        events.findIndex((e) => e[0] === "end" && e[1] === "photos"),
    );
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].price, 999);
  assert.equal(result.products[0].image, "https://fixture.invalid/shared.webp");
  assert.equal(result.products[0].image_key, "shared.webp");
  assert.equal(result.hero.heading, "Everyday");
  assert.equal(result.presentation.gallery_enabled, false);
  assert.equal(result.offer.title, "Offer");
});
test("optional hero/presentation failures leave shopping available; primary failure still rejects", async () => {
  const { sb, state } = catalogFixture();
  state.optionalError = true;
  const result = await readPublicCatalog(sb);
  assert.equal(result.enabled, true);
  assert.equal(result.hero, null);
  assert.equal(result.offer, null);
  assert.equal(result.products.length, 2);
  state.primaryError = true;
  await assert.rejects(() => readPublicCatalog(sb), /Catalog is not available/);
});
test("catalog reads fresh price and size availability on every request", async () => {
  const { sb, state } = catalogFixture();
  const first = await readPublicCatalog(sb);
  state.price = 1200;
  state.available = false;
  const second = await readPublicCatalog(sb);
  assert.equal(first.products[0].price, 999);
  assert.equal(second.products[0].price, 1200);
  assert.equal(second.products[0].sizes[0].available, false);
});
test("disabled catalog never signs photos or reads optional display data", async () => {
  const { sb, state, events } = catalogFixture();
  state.enabled = false;
  assert.deepEqual(await readPublicCatalog(sb), { enabled: false });
  assert.deepEqual(events, [
    ["start", "public_catalog"],
    ["end", "public_catalog"],
  ]);
});
