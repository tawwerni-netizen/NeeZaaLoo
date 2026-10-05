import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeBio, validateBio, BioError, BIO_MAX_LENGTH } from "../src/bio.mjs";

describe("sanitizeBio", () => {
  test("strips tag-like sequences entirely, never storing them", () => {
    const result = sanitizeBio("Hello <script>alert(1)</script> world");
    assert.equal(result.includes("<"), false);
    assert.equal(result.includes(">"), false);
    assert.equal(result.includes("script"), false);
  });

  test("strips an img tag with an onerror handler", () => {
    const result = sanitizeBio('<img src=x onerror="alert(1)">');
    assert.equal(result, "");
  });

  test("plain text with no markup passes through, trimmed", () => {
    assert.equal(sanitizeBio("  Competitive chess player.  "), "Competitive chess player.");
  });

  test("collapses runs of spaces/tabs left behind after stripping tags", () => {
    const result = sanitizeBio("Hello<b>  </b>world");
    assert.equal(result, "Hello world");
  });
});

describe("validateBio", () => {
  test("accepts a normal bio", () => {
    assert.equal(validateBio("I love chess and speed math."), null);
  });

  test("rejects a bio over the character limit", () => {
    assert.equal(validateBio("x".repeat(BIO_MAX_LENGTH + 1)), BioError.TOO_LONG);
  });

  test("accepts a bio at exactly the character limit", () => {
    assert.equal(validateBio("x".repeat(BIO_MAX_LENGTH)), null);
  });

  test("rejects prohibited content", () => {
    assert.equal(validateBio("this bio contains shit in it"), BioError.PROHIBITED);
  });

  test("an empty bio is valid -- clearing a bio is allowed", () => {
    assert.equal(validateBio(""), null);
  });
});
