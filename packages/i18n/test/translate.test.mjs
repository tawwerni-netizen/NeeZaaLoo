import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "../src/translate.mjs";

const resources = {
  en: { home: { play_now: "Play now" }, greet: "Hello {name}" },
  fr: { home: { play_now: "Jouer maintenant" } },
};

describe("createTranslator", () => {
  test("resolves a dotted key from the bound locale", () => {
    const { t } = createTranslator("fr", resources);
    assert.equal(t("home.play_now"), "Jouer maintenant");
  });

  test("interpolates {var} placeholders", () => {
    const { t } = createTranslator("en", resources);
    assert.equal(t("greet", { name: "Amara" }), "Hello Amara");
  });

  test("falls back to the default locale when a key is missing in the active locale", () => {
    const { t } = createTranslator("fr", resources);
    // "greet" only exists in en -- fr must not go blank or throw.
    assert.equal(t("greet", { name: "Amara" }), "Hello Amara");
  });

  test("falls back to the raw key when missing everywhere, and reports it", () => {
    let reported = null;
    const { t } = createTranslator("fr", resources, { onMissingKey: (key, locale) => { reported = { key, locale }; } });
    assert.equal(t("nowhere.at_all"), "nowhere.at_all");
    assert.deepEqual(reported, { key: "nowhere.at_all", locale: "fr" });
  });

  test("an unrecognized {var} placeholder with no matching value is left untouched", () => {
    const { t } = createTranslator("en", resources);
    assert.equal(t("greet", {}), "Hello {name}");
  });
});
