import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isValidCategory, configFor, defaultPriorityFor, TICKET_CATEGORIES, CATEGORY_CONFIG } from "../src/categories.mjs";

describe("isValidCategory", () => {
  test("accepts every documented category", () => {
    for (const c of TICKET_CATEGORIES) assert.equal(isValidCategory(c), true);
  });

  test("rejects an unrecognized category", () => {
    assert.equal(isValidCategory("NOT_A_CATEGORY"), false);
  });
});

describe("configFor", () => {
  test("every category has a config entry", () => {
    for (const c of TICKET_CATEGORIES) assert.ok(configFor(c), `missing config for ${c}`);
  });

  test("DEPOSIT_PENDING references a DEPOSIT and asks for a reference id, nothing the platform already knows", () => {
    const cfg = configFor("DEPOSIT_PENDING");
    assert.equal(cfg.referenceType, "DEPOSIT");
    assert.deepEqual(cfg.fields, ["referenceId"]);
  });

  test("ACCOUNT has no reference type and no extra fields", () => {
    assert.deepEqual(configFor("ACCOUNT"), { referenceType: null, fields: [] });
  });

  test("an unknown category returns null, not a throw", () => {
    assert.equal(configFor("NOPE"), null);
  });
});

describe("defaultPriorityFor", () => {
  test("MISSING_FUNDS starts at CRITICAL automatically", () => {
    assert.equal(defaultPriorityFor("MISSING_FUNDS"), "CRITICAL");
  });

  test("WITHDRAWAL_FAILED and ANTI_CHEAT start at HIGH", () => {
    assert.equal(defaultPriorityFor("WITHDRAWAL_FAILED"), "HIGH");
    assert.equal(defaultPriorityFor("ANTI_CHEAT"), "HIGH");
  });

  test("everything else defaults to NORMAL", () => {
    for (const c of TICKET_CATEGORIES) {
      if (!["MISSING_FUNDS", "WITHDRAWAL_FAILED", "ANTI_CHEAT"].includes(c)) {
        assert.equal(defaultPriorityFor(c), "NORMAL", `${c} should default to NORMAL`);
      }
    }
  });
});

test("CATEGORY_CONFIG has no entries for categories that do not exist", () => {
  for (const key of Object.keys(CATEGORY_CONFIG)) {
    assert.ok(TICKET_CATEGORIES.includes(key), `${key} is configured but not a real category`);
  }
});
