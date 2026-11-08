import test from "node:test";
import assert from "node:assert/strict";
import { readPublicCatalog } from "../src/lib/catalog-read.ts";
import { PublicCatalogPhotoCache, publicCatalogPhotoCache } from "../src/lib/public-catalog-photo-cache.ts";

export function catalogFixture(latency = 0) {
  const events = [];
  const state = {
    price: 999,
    cartVersion: 1,
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
        data:
          name === "catalog_cart_version"
            ? state.cartVersion
            : name === "public_catalog_hero"
              ? hero
              : { title: "Offer", value: 20 },
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

test("temporary hero-read failure is distinguishable from an owner-disabled hero", async () => {
  const { sb } = catalogFixture();
  const rpc = sb.rpc.bind(sb);
  sb.rpc = (name) =>
    name === "public_catalog_hero"
      ? Promise.resolve({ data: null, error: { message: "temporarily unavailable" } })
      : rpc(name);
  const unavailable = await readPublicCatalog(sb);
  assert.equal(unavailable.hero, null);
  assert.equal(unavailable.heroUnavailable, true);
  assert.equal(unavailable.products.length, 2);
  sb.rpc = (name) =>
    name === "public_catalog_hero" ? Promise.resolve({ data: null, error: null }) : rpc(name);
  const disabled = await readPublicCatalog(sb);
  assert.equal(disabled.hero, null);
  assert.equal(disabled.heroUnavailable, undefined);
});

test("whole-cart coupon readiness requires version 2 and preserves basic cart on version 1", async () => {
  const { sb, state } = catalogFixture();
  let result = await readPublicCatalog(sb);
  assert.equal(result.shop.cart_ready, true);
  assert.equal(result.shop.cart_coupon_ready, false);
  state.cartVersion = 2;
  result = await readPublicCatalog(sb);
  assert.equal(result.shop.cart_coupon_ready, true);
  state.optionalError = true;
  result = await readPublicCatalog(sb);
  assert.equal(result.shop.cart_ready, false);
  assert.equal(result.shop.cart_coupon_ready, false);
});

test("large catalogs sign covers in bounded overlapping batches without dropping products", async () => {
  const {sb}=catalogFixture();const rpc=sb.rpc.bind(sb);
  sb.rpc=async name=>{const result=await rpc(name);if(name==='public_catalog')result.data.products=Array.from({length:350},(_,i)=>({...result.data.products[0],id:'p'+i,image:'photo-'+i+'.webp'}));return result;};
  let active=0,maxActive=0;const sizes=[];
  const storage=sb.storage.from.bind(sb.storage);
  sb.storage.from=bucket=>({...storage(bucket),createSignedUrls:async paths=>{sizes.push(paths.length);maxActive=Math.max(maxActive,++active);await new Promise(r=>setTimeout(r,15));active--;return {data:paths.map(path=>({path,signedUrl:'https://fixture.invalid/'+path}))};}});
  const result=await readPublicCatalog(sb);
  assert.equal(result.products.length,350);assert(result.products.every(p=>p.image && p.price===999));assert.deepEqual(sizes,[100,100,100,50]);assert.equal(maxActive,3);
});
test("cover signing failure keeps products, fresh prices and size availability",async()=>{
 const {sb,state}=catalogFixture();const storage=sb.storage.from.bind(sb.storage);
 sb.storage.from=bucket=>({...storage(bucket),createSignedUrls:async()=>{throw Error('Photo signing service unavailable');}});
 state.price=1200;state.available=false;const result=await readPublicCatalog(sb);
 assert.equal(result.enabled,true);assert.equal(result.products.length,2);assert(result.products.every(p=>p.image===null&&p.price===1200&&p.sizes[0].available===false));
});

test("warm public photo URLs skip signing while all product prices and availability stay fresh", async () => {
  const {sb,state,events}=catalogFixture();const photos=new PublicCatalogPhotoCache();
  const first=await readPublicCatalog(sb,photos);
  state.price=1500;state.available=false;
  const second=await readPublicCatalog(sb,photos);
  assert.equal(second.products[0].price,1500);assert.equal(second.products[0].sizes[0].available,false);
  assert.equal(second.products[0].image,first.products[0].image);assert.equal(second.hero.image,first.hero.image);
  assert.equal(events.filter(e=>e[0]==='start'&&e[1]==='public_catalog').length,2);
  assert.equal(events.filter(e=>e[0]==='start'&&e[1]==='photos').length,1);
  assert.equal(events.filter(e=>e[0]==='start'&&e[1]==='hero-photo').length,1);
});
test("cached URLs never revive an OFF catalog/hero or a removed cover", async () => {
  const {sb,state}=catalogFixture();const photos=new PublicCatalogPhotoCache();
  await readPublicCatalog(sb,photos);state.enabled=false;
  assert.deepEqual(await readPublicCatalog(sb,photos),{enabled:false});
  state.enabled=true;const rpc=sb.rpc.bind(sb);
  sb.rpc=async name=>{const r=await rpc(name);if(name==='public_catalog')r.data.products.forEach(p=>p.image=null);if(name==='public_catalog_hero')r.data=null;return r;};
  const fresh=await readPublicCatalog(sb,photos);assert.equal(fresh.hero,null);assert(fresh.products.every(p=>p.image===null));
});
test("only new cover paths sign again; photo failures retry and public namespaces are isolated",async()=>{
 const {sb,state}=catalogFixture();const photos=new PublicCatalogPhotoCache();await readPublicCatalog(sb,photos);
 const rpc=sb.rpc.bind(sb);sb.rpc=async name=>{const r=await rpc(name);if(name==='public_catalog')r.data.products.forEach(p=>p.image='replacement.webp');return r;};
 await readPublicCatalog(sb,photos);assert.deepEqual(state.signedPaths,[['shared.webp'],['replacement.webp']]);
 const other=new PublicCatalogPhotoCache();await readPublicCatalog(sb,other);assert.equal(state.signedPaths.length,3);
 assert.equal(publicCatalogPhotoCache('anonymous-backend-A'),publicCatalogPhotoCache('anonymous-backend-A'));
 assert.notEqual(publicCatalogPhotoCache('anonymous-backend-A'),publicCatalogPhotoCache('anonymous-backend-B'));
});
test("concurrent public reads coalesce URL requests and expired links renew",async()=>{
 let now=0;const photos=new PublicCatalogPhotoCache(()=>now);const {sb,state,events}=catalogFixture(10);
 await Promise.all([readPublicCatalog(sb,photos),readPublicCatalog(sb,photos)]);
 assert.equal(state.signedPaths.length,1);assert.equal(events.filter(e=>e[0]==='start'&&e[1]==='hero-photo').length,1);
 now=55*60*1000+1;await readPublicCatalog(sb,photos);assert.equal(state.signedPaths.length,2);
});
test("public photo buckets stay isolated and failed signatures are never cached",async()=>{
 const cache=new PublicCatalogPhotoCache();let attempts=0;
 assert.equal((await cache.getMany('product-images',['same'],async()=>{attempts++;throw Error('Offline');})).size,0);
 const product=await cache.getMany('product-images',['same'],async paths=>{attempts++;return new Map(paths.map(p=>[p,'product-url']));});
 const hero=await cache.getMany('catalog-hero-images',['same'],async paths=>new Map(paths.map(p=>[p,'hero-url'])));
 assert.equal(attempts,2);assert.equal(product.get('same'),'product-url');assert.equal(hero.get('same'),'hero-url');
});
