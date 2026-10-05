import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveLocale, parseAcceptLanguage, matchSupportedLocale } from "../src/resolve.mjs";
import { SUPPORTED_LOCALE_CODES } from "../src/locales.mjs";

describe("parseAcceptLanguage", () => {
  test("orders tags by descending quality value", () => {
    assert.deepEqual(parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5"), [
      "fr-ch", "fr", "en", "de", "*",
    ]);
  });

  test("treats a bare tag with no q as quality 1", () => {
    assert.deepEqual(parseAcceptLanguage("ar"), ["ar"]);
  });

  test("returns an empty list for missing or malformed input", () => {
    assert.deepEqual(parseAcceptLanguage(null), []);
    assert.deepEqual(parseAcceptLanguage(""), []);
    assert.deepEqual(parseAcceptLanguage(undefined), []);
  });
});

describe("matchSupportedLocale", () => {
  test("matches an exact supported code first", () => {
    assert.equal(matchSupportedLocale(["fr"], SUPPORTED_LOCALE_CODES), "fr");
  });

  test("falls back to the base language of a regional tag (ar-EG -> ar)", () => {
    assert.equal(matchSupportedLocale(["ar-eg"], SUPPORTED_LOCALE_CODES), "ar");
  });

  test("an exact match anywhere in the list beats a fuzzy base-language match earlier in it", () => {
    // "hi-in" only matches via its base language "hi" (pass two); "en" is an
    // exact match (pass one) and wins even though it comes later in the list.
    assert.equal(matchSupportedLocale(["nl", "hi-in", "en"], SUPPORTED_LOCALE_CODES), "en");
  });

  test("with no exact match anywhere, the first fuzzy base-language match is used", () => {
    assert.equal(matchSupportedLocale(["nl", "hi-in", "sv"], SUPPORTED_LOCALE_CODES), "hi");
  });

  test("returns null when nothing matches", () => {
    assert.equal(matchSupportedLocale(["nl", "sv"], SUPPORTED_LOCALE_CODES), null);
  });
});

describe("resolveLocale priority order", () => {
  test("an explicit user choice wins over everything, including a saved preference", () => {
    const locale = resolveLocale({ explicit: "fr", saved: "hi", acceptLanguage: "es" });
    assert.equal(locale, "fr");
  });

  test("a saved account preference wins over the device locale", () => {
    const locale = resolveLocale({ explicit: null, saved: "hi", acceptLanguage: "ar-EG,ar;q=0.9" });
    assert.equal(locale, "hi");
  });

  test("with no explicit choice or saved preference, the device/browser locale is used", () => {
    const locale = resolveLocale({ explicit: null, saved: null, acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8" });
    assert.equal(locale, "zh");
  });

  test("an unsupported device locale falls back to English", () => {
    const locale = resolveLocale({ explicit: null, saved: null, acceptLanguage: "nl-NL,nl;q=0.9,sv;q=0.8" });
    assert.equal(locale, "en");
  });

  test("no signal at all falls back to English", () => {
    assert.equal(resolveLocale({}), "en");
    assert.equal(resolveLocale(), "en");
  });

  test("an explicit or saved locale outside the supported set is ignored, not trusted blindly", () => {
    const locale = resolveLocale({ explicit: "xx", saved: "yy", acceptLanguage: "zh" });
    assert.equal(locale, "zh");
  });

  test("Arabic device locale resolves to Arabic", () => {
    assert.equal(resolveLocale({ acceptLanguage: "ar-SA,ar;q=0.9,en;q=0.5" }), "ar");
  });

  test("English device locale resolves to English", () => {
    assert.equal(resolveLocale({ acceptLanguage: "en-US,en;q=0.9" }), "en");
  });

  test("Hindi device locale resolves to Hindi", () => {
    assert.equal(resolveLocale({ acceptLanguage: "hi-IN,hi;q=0.9,en;q=0.5" }), "hi");
  });

  test("Chinese device locale resolves to Chinese", () => {
    assert.equal(resolveLocale({ acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.5" }), "zh");
  });

  test("Spanish device locale resolves to Spanish", () => {
    assert.equal(resolveLocale({ acceptLanguage: "es-MX,es;q=0.9,en;q=0.5" }), "es");
  });

  test("French device locale resolves to French", () => {
    assert.equal(resolveLocale({ acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.5" }), "fr");
  });

  test("a logged-in user's saved language is not disturbed by a later device-locale change", () => {
    // Simulates: player saved "en" while on an English phone, then travels /
    // switches OS language to Arabic. The saved preference must still win.
    const firstVisit = resolveLocale({ saved: null, acceptLanguage: "en-US" });
    const savedLocale = firstVisit; // "en" gets persisted to the account
    const laterVisit = resolveLocale({ saved: savedLocale, acceptLanguage: "ar-SA" });
    assert.equal(laterVisit, "en");
  });
});
