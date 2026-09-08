/**
 * issueOAuthState/verifyOAuthState (tokens.mjs) -- the stateless,
 * HMAC-signed CSRF binder for the Google OAuth redirect round trip. See
 * tokens.mjs's own header for why this needs no database row.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { issueOAuthState, verifyOAuthState, issueStepUpToken } from "../src/tokens.mjs";

const KEY = Buffer.alloc(32, 7);
const NOW = Date.now();

describe("issueOAuthState / verifyOAuthState", () => {
  test("round-trips intent, provider, playerId and returnTo", () => {
    const state = issueOAuthState({ intent: "link", provider: "google", playerId: "alice", returnTo: "/settings" }, KEY, NOW);
    const r = verifyOAuthState(state, KEY, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.claims.intent, "link");
    assert.equal(r.claims.provider, "google");
    assert.equal(r.claims.playerId, "alice");
    assert.equal(r.claims.returnTo, "/settings");
  });

  test("a login-intent state carries a null playerId", () => {
    const state = issueOAuthState({ intent: "login", provider: "google" }, KEY, NOW);
    const r = verifyOAuthState(state, KEY, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.claims.playerId, null);
  });

  test("two states minted back-to-back are never identical -- each carries its own nonce", () => {
    const a = issueOAuthState({ intent: "login", provider: "google" }, KEY, NOW);
    const b = issueOAuthState({ intent: "login", provider: "google" }, KEY, NOW);
    assert.notEqual(a, b);
  });

  test("expires after its ttl", () => {
    const state = issueOAuthState({ intent: "login", provider: "google", ttlSeconds: 60 }, KEY, NOW);
    const r = verifyOAuthState(state, KEY, NOW + 61_000);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "EXPIRED");
  });

  test("a tampered payload (bit flip) fails signature verification", () => {
    const state = issueOAuthState({ intent: "login", provider: "google" }, KEY, NOW);
    const [body, sig] = state.split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    claims.playerId = "attacker-controlled-id";
    const tamperedBody = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const r = verifyOAuthState(`${tamperedBody}.${sig}`, KEY, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "BAD_SIGNATURE");
  });

  test("verified with the wrong key fails signature verification", () => {
    const state = issueOAuthState({ intent: "login", provider: "google" }, KEY, NOW);
    const wrongKey = Buffer.alloc(32, 9);
    const r = verifyOAuthState(state, wrongKey, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "BAD_SIGNATURE");
  });

  test("a step-up token (a different typ) is never accepted as OAuth state", () => {
    const stepUp = issueStepUpToken({ playerId: "alice", action: "player.identity.link" }, KEY, NOW);
    const r = verifyOAuthState(stepUp, KEY, NOW);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "WRONG_TOKEN_TYPE");
  });

  test("garbage input is rejected cleanly, never throws", () => {
    assert.doesNotThrow(() => verifyOAuthState("not-a-token", KEY, NOW));
    assert.equal(verifyOAuthState("not-a-token", KEY, NOW).ok, false);
  });
});
