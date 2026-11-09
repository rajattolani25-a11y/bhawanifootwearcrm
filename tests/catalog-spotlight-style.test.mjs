import test from "node:test";
import assert from "node:assert/strict";
import { spotlightLabel, spotlightStyle } from "../src/lib/catalog-spotlight-style.ts";
test("custom word accepts bounded English identifiers and normalizes owner input", () => {
  assert.equal(spotlightLabel(" comfort "), "COMFORT");
  assert.equal(spotlightLabel("walk-comfort"), "WALK-COMFORT");
  assert.equal(spotlightLabel("EVERYDAY1234"), "EVERYDAY1234");
  for (const value of [
    null,
    undefined,
    {},
    "",
    "123START",
    "TWO WORDS",
    "<img>",
    "THIRTEENCHARS",
    "अपना",
  ])
    assert.equal(spotlightLabel(value), "");
});
test("custom wording does not change the saved category palette; legacy/unknown safely resolve", () => {
  assert.deepEqual(spotlightStyle("Ladies / Sports & Active"), {
    tone: "active",
    word: "ACTIVE",
    label: "Sports & Active",
  });
  assert.equal(spotlightStyle("Gents / Formals & Occasion").word, "FORMAL");
  assert.equal(spotlightStyle("Men / Other").word, "EXPLORE");
  assert.equal(spotlightStyle("Women / Future style").tone, "neutral");
  assert.equal(spotlightStyle("Kids").word, "PLAY");
});
