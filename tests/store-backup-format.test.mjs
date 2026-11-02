import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  sealBackup,
  verifyBackup,
  clearStoreDrafts,
} from "../src/lib/store-backup-format.ts";
const photo = Buffer.from("test photo bytes");
const snapshot = {
  version: 2,
  state: { installation_id: "installation", generation: "before", reset_at: null },
  fingerprint: "fingerprint",
  tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])),
  assets: [],
  team: {},
  numbering: { next_bill: 42 },
};
const base = () => ({
  format: BACKUP_FORMAT,
  version: 2,
  createdAt: "2026-11-02",
  snapshot: structuredClone(snapshot),
  files: [],
});
test("complete backup checksum round-trips and any edited row is rejected", async () => {
  const b = await sealBackup(base());
  assert.deepEqual(await verifyBackup(JSON.parse(JSON.stringify(b))), b);
  b.snapshot.tables.products.push({ id: "changed" });
  await assert.rejects(() => verifyBackup(b), /checksum/);
});
test("actual photo bytes are verified separately from envelope; missing photos fail", async () => {
  const body = base();
  body.snapshot.assets.push({ bucket: "product-images", path: "p.webp" });
  const { createHash } = await import("node:crypto");
  body.files.push({
    bucket: "product-images",
    path: "p.webp",
    mime: "image/webp",
    bytes: photo.length,
    base64: photo.toString("base64"),
    sha256: createHash("sha256").update(photo).digest("hex"),
  });
  assert.ok(await verifyBackup(await sealBackup(body)));
  body.files[0].base64 = Buffer.from("damaged bytes").toString("base64");
  await assert.rejects(async () => verifyBackup(await sealBackup(body)), /Photo verification/);
  body.files = [];
  await assert.rejects(async () => verifyBackup(await sealBackup(body)), /photo manifest/);
});
test("legacy exports, incomplete table sets and unsafe bucket paths are rejected", async () => {
  await assert.rejects(() => verifyBackup({ store_settings: [] }), /version 2/);
  let body = base();
  delete body.snapshot.tables.catalog_bookings;
  await assert.rejects(async () => verifyBackup(await sealBackup(body)), /table manifest/);
  body = base();
  body.snapshot.assets = [{ bucket: "private-other-bucket", path: "x" }];
  body.files = [{}];
  await assert.rejects(async () => verifyBackup(await sealBackup(body)), /photo path/);
});
test("reset clears business drafts only, never auth, language or device appearance", () => {
  const local = new Map([
    ["solestack-held-bills", "old"],
    ["solestack-poster-campaigns-v1", "old"],
    ["sb-project-auth-token", "keep"],
    ["solestack-language", "hi"],
    ["solestack-theme", "dark"],
  ]);
  const session = new Map([
    ["offer-seen", "old"],
    ["other", "keep"],
  ]);
  clearStoreDrafts(
    { removeItem: (k) => local.delete(k) },
    { removeItem: (k) => session.delete(k) },
  );
  assert.deepEqual(
    [...local.keys()],
    ["sb-project-auth-token", "solestack-language", "solestack-theme"],
  );
  assert.deepEqual([...session.keys()], ["other"]);
});
