import test from "node:test";
import assert from "node:assert/strict";
import { matchesPublicFunction } from "../src/lib/public-function-auth.ts";
test("only exact compiler function IDs skip automatic bearer attachment", () => {
  const publicFunctions = [
    { url: "/_server/public-id" },
    { url: "https://shop.example/_server/another-id" },
  ];
  assert.equal(matchesPublicFunction("public-id", publicFunctions), true);
  assert.equal(matchesPublicFunction("another-id", publicFunctions), true);
  for (const id of ["private-id", "id", "public-id?x=1", "public-id/extra", "", undefined])
    assert.equal(matchesPublicFunction(id, publicFunctions), false);
});
test("missing metadata and missing URLs retain ordinary auth attachment", () => {
  assert.equal(matchesPublicFunction("public-id", [{}, { url: "" }]), false);
  assert.equal(matchesPublicFunction(undefined, [{ url: "/_server/undefined" }]), false);
});
