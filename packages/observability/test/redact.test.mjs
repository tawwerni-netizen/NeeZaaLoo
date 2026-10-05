import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../src/redact.mjs";

describe("redact", () => {
  test("a password is never returned, whatever it was", () => {
    const out = redact({ handle: "alice", password: "correct horse battery staple" });
    assert.equal(out.handle, "alice");
    assert.equal(out.password, "[REDACTED]");
  });

  test("secrets, keys, and tokens are all caught by name, regardless of case or separator", () => {
    const out = redact({
      ipnSecret: "s1",
      api_key: "k1",
      privateKey: "pk1",
      private_key: "pk2",
      refreshToken: "rt1",
      accessToken: "at1",
      Authorization: "Bearer xyz",
      sessionId: "sess1",
      cardNumber: "4111111111111111",
      cvv: "123",
      mnemonic: "twelve words here",
    });
    for (const v of Object.values(out)) assert.equal(v, "[REDACTED]");
  });

  test("redaction recurses into nested objects and arrays", () => {
    const out = redact({
      user: { id: "u1", credential: { password: "hunter2" } },
      webhooks: [{ signature: "sig1", body: "ok" }],
    });
    assert.equal(out.user.credential.password, "[REDACTED]");
    assert.equal(out.webhooks[0].signature, "[REDACTED]");
    assert.equal(out.webhooks[0].body, "ok");
  });

  test("non-sensitive gameplay fields are left completely alone, including a duel's own `seed`", () => {
    const out = redact({ duelId: "d1", seed: "e2e-seed", playerId: "alice", rating: 1500 });
    assert.deepEqual(out, { duelId: "d1", seed: "e2e-seed", playerId: "alice", rating: 1500 });
  });

  test("an Error is reduced to name/message/code -- never its full object (which may carry request internals)", () => {
    const err = Object.assign(new Error("insufficient funds"), { code: "INSUFFICIENT_FUNDS", sql: "SELECT ..." });
    const out = redact({ error: err });
    assert.deepEqual(out.error, { name: "Error", message: "insufficient funds", code: "INSUFFICIENT_FUNDS" });
  });

  test("a BigInt (ledger amounts are stored as BigInt) serializes as a string, not a crash", () => {
    const out = redact({ stakeMinor: 10_000_000n });
    assert.equal(out.stakeMinor, "10000000");
  });

  test("redact() never mutates its input", () => {
    const input = { password: "x" };
    redact(input);
    assert.equal(input.password, "x");
  });

  test("null and primitives pass through unchanged", () => {
    assert.equal(redact(null), null);
    assert.equal(redact(42), 42);
    assert.equal(redact("plain string"), "plain string");
  });

  test("pathologically deep nesting is truncated rather than looping forever or blowing the stack", () => {
    let deep = { password: "leak-me" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    const out = redact(deep);
    // Walk down until we hit the truncation marker -- it must appear before
    // ever reaching the buried password.
    let cursor = out;
    let sawTruncated = false;
    for (let i = 0; i < 20; i++) {
      if (cursor === "[TRUNCATED]") { sawTruncated = true; break; }
      cursor = cursor.child;
    }
    assert.ok(sawTruncated, "deep nesting must be truncated, not traversed indefinitely");
  });
});
