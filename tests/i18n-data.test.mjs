import assert from "node:assert/strict";
import test from "node:test";
import { DICT, translatePhrase } from "../src/lib/i18n-data.ts";
import { ENGLISH } from "../src/lib/i18n-english.ts";

test("light English aliases exactly preserve every legacy English phrase", () => {
  assert.deepEqual(
    ENGLISH,
    Object.fromEntries(
      Object.entries(DICT)
        .filter(([key, value]) => value.english && value.english !== key)
        .map(([key, value]) => [key, value.english]),
    ),
  );
  for (const key of Object.keys(DICT))
    assert.equal(ENGLISH[key] ?? key, translatePhrase(key, "english"), key);
});

test("full dictionary keeps Hindi, Hinglish, English aliases and unknown text", () => {
  for (const [key, value] of Object.entries(DICT)) {
    for (const lang of ["hindi", "hinglish"]) {
      assert.equal(translatePhrase(key, lang), value[lang] ?? key, `${lang}: ${key}`);
      if (value.english && !DICT[value.english])
        assert.equal(translatePhrase(value.english, lang), value[lang]);
    }
  }
  for (const lang of ["english", "hindi", "hinglish"])
    assert.equal(translatePhrase("Unknown product XYZ", lang), "Unknown product XYZ");
});
