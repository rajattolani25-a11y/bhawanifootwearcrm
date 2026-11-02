import test from "node:test";
import assert from "node:assert/strict";
import { SignedImageCache } from "../src/lib/signed-image-cache.ts";

test("reuses 101 URLs, batches at 100, retries missing URLs and renews before expiry", async () => {
  let now = 0,
    calls = [];
  const cache = new SignedImageCache(() => now);
  let omit = true;
  const sign = async (paths) => {
    calls.push(paths);
    return new Map(
      paths.filter((p) => !omit || p !== "missing").map((p) => [p, "url:" + p + ":" + now]),
    );
  };
  const paths = Array.from({ length: 101 }, (_, i) => "p" + i);
  assert.equal((await cache.getMany([...paths, paths[0]], sign)).size, 101);
  assert.deepEqual(
    calls.map((p) => p.length),
    [100, 1],
  );
  await cache.getMany(paths, sign);
  assert.equal(calls.length, 2);
  await cache.getMany(["missing"], sign);
  omit = false;
  assert.equal((await cache.getMany(["missing"], sign)).get("missing"), "url:missing:0");
  now = 55 * 60_000;
  assert.equal((await cache.getMany(["p0"], sign)).get("p0"), "url:p0:" + now);
});
test("concurrent consumers coalesce and logout discards old in-flight URLs", async () => {
  const cache = new SignedImageCache();
  let complete;
  let calls = 0;
  const sign = async (paths) => {
    calls++;
    return new Promise((done) => {
      complete = () => done(new Map(paths.map((p) => [p, "old-user-url"])));
    });
  };
  const first = cache.getMany(["shoe"], sign),
    second = cache.getMany(["shoe"], sign);
  assert.equal(calls, 1);
  cache.clear();
  complete();
  assert.equal((await first).size, 0);
  assert.equal((await second).size, 0);
  assert.equal(
    (
      await cache.getMany(["shoe"], async (paths) => new Map(paths.map((p) => [p, "new-user-url"])))
    ).get("shoe"),
    "new-user-url",
  );
});
test("failed signing does not poison cache; cache storage stays bounded", async () => {
  const cache = new SignedImageCache(() => 0, 2);
  assert.equal(
    (
      await cache.getMany(["a"], async () => {
        throw Error("offline");
      })
    ).size,
    0,
  );
  let calls = 0;
  const sign = async (paths) => {
    calls++;
    return new Map(paths.map((p) => [p, p]));
  };
  await cache.getMany(["a", "b", "c"], sign);
  await cache.getMany(["a"], sign);
  assert.equal(calls, 2);
});
