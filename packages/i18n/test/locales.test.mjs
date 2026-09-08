import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_CODES,
  DEFAULT_LOCALE,
  ADMIN_LOCALE,
  isSupportedLocale,
  directionFor,
} from "../src/locales.mjs";

describe("locale registry", () => {
  test("exposes exactly the six official languages", () => {
    assert.equal(SUPPORTED_LOCALES.length, 6);
    assert.equal(SUPPORTED_LOCALE_CODES.length, 6);
    assert.deepEqual([...SUPPORTED_LOCALE_CODES].sort(), ["ar", "en", "es", "fr", "hi", "zh"]);
  });

  test("every code is unique", () => {
    assert.equal(new Set(SUPPORTED_LOCALE_CODES).size, SUPPORTED_LOCALE_CODES.length);
  });

  test("the default locale is English and is itself supported", () => {
    assert.equal(DEFAULT_LOCALE, "en");
    assert.ok(isSupportedLocale(DEFAULT_LOCALE));
  });

  test("Arabic is registered as RTL, every other supported locale as LTR", () => {
    assert.equal(directionFor("ar"), "rtl");
    for (const { code, dir } of SUPPORTED_LOCALES) {
      if (code !== "ar") assert.equal(dir, "ltr", `${code} should be ltr`);
    }
  });

  test("an unsupported code is reported as unsupported", () => {
    assert.equal(isSupportedLocale("xx"), false);
    assert.equal(isSupportedLocale(""), false);
    assert.equal(isSupportedLocale(undefined), false);
  });

  test("the registry is frozen -- nothing can mutate it at runtime", () => {
    assert.throws(() => { SUPPORTED_LOCALES.push({ code: "xx" }); });
    assert.throws(() => { SUPPORTED_LOCALES[0].code = "zz"; });
  });

  test("the admin surface is locked to English, independent of the user registry", () => {
    assert.equal(ADMIN_LOCALE, "en");
  });
});
