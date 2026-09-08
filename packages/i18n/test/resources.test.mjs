import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadResources } from "../src/resources.mjs";
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE } from "../src/locales.mjs";

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) keys.push(...flattenKeys(v, full));
    else keys.push(full);
  }
  return keys;
}

describe("translation resources", () => {
  test("a resource file exists for every supported locale", () => {
    const resources = loadResources();
    for (const code of SUPPORTED_LOCALE_CODES) {
      assert.ok(resources[code], `missing locale resource: ${code}`);
    }
  });

  test("every locale has exactly the same key set as the default locale -- no partial translations shipped silently", () => {
    const resources = loadResources();
    const baseline = flattenKeys(resources[DEFAULT_LOCALE]).sort();
    for (const code of SUPPORTED_LOCALE_CODES) {
      if (code === DEFAULT_LOCALE) continue;
      const keys = flattenKeys(resources[code]).sort();
      assert.deepEqual(keys, baseline, `${code}.json key set diverges from ${DEFAULT_LOCALE}.json`);
    }
  });

  test("no translated value is an empty string", () => {
    const resources = loadResources();
    for (const code of SUPPORTED_LOCALE_CODES) {
      for (const key of flattenKeys(resources[code])) {
        const parts = key.split(".");
        let value = resources[code];
        for (const p of parts) value = value[p];
        assert.notEqual(value.trim(), "", `${code}.json: ${key} is empty`);
      }
    }
  });
});
