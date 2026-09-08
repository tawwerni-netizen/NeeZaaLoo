import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatCurrency, formatDate } from "../src/format.mjs";

describe("locale-aware formatting", () => {
  test("number grouping differs between English and French (comma vs space+comma)", () => {
    const en = formatNumber(12345.6, "en");
    const fr = formatNumber(12345.6, "fr");
    assert.equal(en, "12,345.6");
    assert.equal(fr, "12 345,6");
  });

  test("currency stays denominated in USD regardless of locale -- only presentation changes", () => {
    const en = formatCurrency(1234.5, "en");
    const fr = formatCurrency(1234.5, "fr");
    assert.match(en, /\$/);
    assert.match(fr, /1 234,50/);
    assert.match(fr, /\$/);
  });

  test("date formatting is stable and locale-tagged, not a hardcoded pattern", () => {
    const d = new Date(Date.UTC(2026, 0, 15));
    const en = formatDate(d, "en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const hi = formatDate(d, "hi", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    assert.match(en, /January/);
    assert.match(hi, /जनवरी/);
  });

  test("an unsupported locale code does not throw -- formatting degrades to the default", () => {
    assert.doesNotThrow(() => formatNumber(1000, "xx"));
  });
});
