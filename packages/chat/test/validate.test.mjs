import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeContent, validateContent, ChatContentError } from "../src/validate.mjs";

describe("normalizeContent", () => {
  test("trims surrounding whitespace", () => {
    assert.equal(normalizeContent("  hello  "), "hello");
  });

  test("NFC-normalizes composed vs decomposed accents to the same string", () => {
    const decomposed = "cafe" + String.fromCharCode(0x65, 0x0301); // e + combining acute accent
    const composed = "cafe" + String.fromCharCode(0xe9);           // precomposed e-acute
    assert.equal(normalizeContent(decomposed), normalizeContent(composed));
  });

  test("non-string input normalizes to an empty string, never throws", () => {
    assert.equal(normalizeContent(undefined), "");
    assert.equal(normalizeContent(null), "");
    assert.equal(normalizeContent(42), "");
  });
});

describe("validateContent", () => {
  test("accepts an ordinary message", () => {
    assert.equal(validateContent("gg, well played!"), null);
  });

  test("accepts a message containing a literal newline", () => {
    assert.equal(validateContent("line one\nline two"), null);
  });

  test("rejects an empty string", () => {
    assert.equal(validateContent(""), ChatContentError.EMPTY);
  });

  test("rejects a message over 1000 characters", () => {
    assert.equal(validateContent("x".repeat(1001)), ChatContentError.TOO_LONG);
  });

  test("accepts exactly 1000 characters", () => {
    assert.equal(validateContent("x".repeat(1000)), null);
  });

  test("rejects a NUL byte", () => {
    const withNul = "hi" + String.fromCharCode(0x00) + "there";
    assert.equal(validateContent(withNul), ChatContentError.CONTROL_CHARS);
  });

  test("rejects a C0 control character (e.g. bell)", () => {
    const withBell = "hi" + String.fromCharCode(0x07) + "there";
    assert.equal(validateContent(withBell), ChatContentError.CONTROL_CHARS);
  });

  test("rejects a C1 control character", () => {
    const withC1 = "hi" + String.fromCharCode(0x85) + "there";
    assert.equal(validateContent(withC1), ChatContentError.CONTROL_CHARS);
  });

  test("does not reject ordinary punctuation that looks dangerous but is not, e.g. angle brackets", () => {
    assert.equal(validateContent("5 " + String.fromCharCode(0x3c) + " 10, right?"), null);
  });

  test("does not reject non-Latin scripts", () => {
    assert.equal(validateContent(String.fromCharCode(0x3053, 0x3093, 0x306b, 0x3061, 0x306f)), null);
    assert.equal(validateContent(String.fromCharCode(0x0623, 0x0647, 0x0644, 0x0627, 0x064b)), null);
    assert.equal(validateContent(String.fromCharCode(0x4f60, 0x597d)), null);
  });
});
