import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { requireEnv, decodeKey, loadOrGenerateKey, MissingEnvError } from "../src/env.mjs";

describe("requireEnv", () => {
  test("passes silently when every variable is present", () => {
    assert.doesNotThrow(() => requireEnv(["A", "B"], { A: "1", B: "2" }));
  });

  test("lists every missing variable at once, not just the first", () => {
    try {
      requireEnv(["A", "B", "C"], { A: "1" });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof MissingEnvError);
      assert.deepEqual(e.missing, ["B", "C"]);
    }
  });
});

describe("decodeKey", () => {
  test("returns null when the variable is absent, never throws", () => {
    assert.equal(decodeKey("NOPE", { env: {} }), null);
  });

  test("decodes valid base64 to the right byte length", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const decoded = decodeKey("K", { expectedBytes: 32, env: { K: key } });
    assert.equal(decoded.length, 32);
    assert.ok(decoded.equals(Buffer.alloc(32, 7)));
  });

  test("refuses a key of the wrong length with a clear error", () => {
    const key = Buffer.alloc(16, 1).toString("base64");
    assert.throws(() => decodeKey("K", { expectedBytes: 32, env: { K: key } }), /must decode to exactly 32 bytes/);
  });
});

describe("loadOrGenerateKey", () => {
  test("uses the real env value when present, in any environment", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    const decoded = loadOrGenerateKey("K", { bytes: 32, env: { K: key, NODE_ENV: "production" } });
    assert.ok(decoded.equals(Buffer.alloc(32, 9)));
  });

  test("falls back to an ephemeral random key locally when absent", () => {
    const decoded = loadOrGenerateKey("K", { bytes: 32, env: {} });
    assert.equal(decoded.length, 32);
  });

  test("two ephemeral generations never collide", () => {
    const a = loadOrGenerateKey("K", { bytes: 32, env: {} });
    const b = loadOrGenerateKey("K", { bytes: 32, env: {} });
    assert.ok(!a.equals(b));
  });

  test("refuses to fall back in production -- a missing secret there is fatal, not silently ephemeral", () => {
    assert.throws(
      () => loadOrGenerateKey("K", { bytes: 32, env: { NODE_ENV: "production" } }),
      MissingEnvError
    );
  });

  test("refuses to fall back in staging too", () => {
    assert.throws(
      () => loadOrGenerateKey("K", { bytes: 32, env: { NODE_ENV: "staging" } }),
      MissingEnvError
    );
  });

  test("logs a loud warning (never the key itself) when falling back", () => {
    const emitted = [];
    loadOrGenerateKey("K", { bytes: 32, env: {}, logger: { emit: (event, fields) => emitted.push({ event, fields }) } });
    assert.equal(emitted.length, 1);
    assert.match(emitted[0].fields.error, /EPHEMERAL/);
    assert.match(emitted[0].fields.error, /K/);
  });
});
