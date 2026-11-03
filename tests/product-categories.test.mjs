import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCategory,
  categoryLabel,
  categoryValue,
  categoryMatches,
  heroCategoryValue,
  SUBCATEGORIES,
} from "../src/lib/product-categories.ts";
test("adult legacy labels normalize without changing stored records or custom categories", () => {
  for (const raw of ["Ladies", "Girls", "Women"])
    assert.deepEqual(parseCategory(raw), { department: "Women", subcategory: "" });
  for (const raw of ["Gents", "Mens", "Men"]) assert.equal(parseCategory(raw).department, "Men");
  assert.equal(parseCategory("Custom range").department, "Custom range");
  assert.equal(parseCategory("Boys").department, "Boys");
});
test("five adult subcategories plus sixth Other survive serialization and filtering", () => {
  for (const dept of ["Men", "Women"]) {
    assert.equal(SUBCATEGORIES[dept].length, 6);
    assert.equal(SUBCATEGORIES[dept][5], "Other");
    for (const sub of SUBCATEGORIES[dept]) {
      const stored = categoryValue(dept, sub);
      assert.deepEqual(parseCategory(stored), { department: dept, subcategory: sub });
      assert(categoryMatches(stored, dept));
      assert(categoryMatches(stored, "All"));
      assert.equal(categoryLabel(stored), dept + " · " + sub);
    }
  }
  assert.equal(categoryMatches("Women / Other", "Men"), false);
});
test("legacy hero constraints keep working with modern labels", () => {
  assert.equal(heroCategoryValue("Women"), "Ladies");
  assert.equal(heroCategoryValue("Girls"), "Ladies");
  assert.equal(heroCategoryValue("Men"), "Gents");
  assert.equal(heroCategoryValue("All"), "All");
  assert.equal(categoryLabel("Ladies"), "Women");
  assert.equal(categoryLabel("Gents"), "Men");
});

import { catalogProductLink, catalogShareText } from "../src/lib/catalog-share.ts";
test("professional product share is short, localized, and has a clean product-only URL", () => {
  const url = catalogProductLink("https://shop.example", "pair&one", "7.5");
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/catalog");
  assert.equal(parsed.searchParams.get("product"), "pair&one");
  assert.equal(parsed.searchParams.get("size"), "7.5");
  assert.equal(parsed.searchParams.size, 2);
  const args = {
    shop: "Demo Footwear",
    brand: "LAKHANI",
    article: "FLYO",
    price: 1048.95,
    url,
    size: "7.5",
  };
  const english = catalogShareText(args);
  assert(english.includes("Price: ₹1,048.95"));
  assert.equal(
    english,
    `Take a look at this pair from *Demo Footwear*.\n\n*LAKHANI FLYO*\nPrice: ₹1,048.95\nSize: 7.5\n\nView photos, available sizes and product details:\n${url}`,
  );
  const noSize = catalogShareText({ ...args, size: "" });
  assert(!noSize.includes("Size:"));
  assert(noSize.endsWith(url));
  assert(english.length < 300);
  assert(!english.includes("undefined"));
  assert(
    catalogShareText({ ...args, language: "hindi" }).includes(
      "फोटो, उपलब्ध साइज़ और प्रोडक्ट की जानकारी देखें:",
    ),
  );
  assert(
    catalogShareText({ ...args, language: "hinglish" }).includes(
      "Photos, available sizes aur product details dekhein:",
    ),
  );
});
