import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createOAuthIdentityService, OAuthIdentityError } from "../src/oauth-identity.mjs";

let db, identity;
let CLOCK = Date.now();

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  identity = createOAuthIdentityService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("link", () => {
  test("links a fresh (provider, subject) pair to a player", async () => {
    await player("alice");
    const r = await identity.link({ playerId: "alice", provider: "google", subject: "sub-alice", email: "alice@example.com", emailVerified: true });
    assert.equal(r.ok, true);
    assert.equal(r.identity.provider_subject, "sub-alice");
    assert.equal(r.identity.email_verified, true);
  });

  test("getByProviderSubject and getByPlayerId both find it afterward", async () => {
    await player("bob");
    await identity.link({ playerId: "bob", provider: "google", subject: "sub-bob" });
    const bySubject = await identity.getByProviderSubject("google", "sub-bob");
    assert.equal(bySubject.player_id, "bob");
    const byPlayer = await identity.getByPlayerId("bob", "google");
    assert.equal(byPlayer.provider_subject, "sub-bob");
  });

  test("relinking the exact same (player, provider, subject) is a harmless no-op success", async () => {
    await player("carol");
    await identity.link({ playerId: "carol", provider: "google", subject: "sub-carol" });
    const r = await identity.link({ playerId: "carol", provider: "google", subject: "sub-carol" });
    assert.equal(r.ok, true);
    assert.equal(r.alreadyLinked, true);
  });

  test("a subject already linked to a DIFFERENT player is refused (no silent takeover)", async () => {
    await player("dan");
    await player("erin");
    await identity.link({ playerId: "dan", provider: "google", subject: "sub-shared" });
    const r = await identity.link({ playerId: "erin", provider: "google", subject: "sub-shared" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, OAuthIdentityError.SUBJECT_ALREADY_LINKED);
    // dan's link is untouched
    const stillDan = await identity.getByProviderSubject("google", "sub-shared");
    assert.equal(stillDan.player_id, "dan");
  });

  test("a player who already has a DIFFERENT google identity is refused, not silently overwritten", async () => {
    await player("frank");
    await identity.link({ playerId: "frank", provider: "google", subject: "sub-frank-1" });
    const r = await identity.link({ playerId: "frank", provider: "google", subject: "sub-frank-2" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, OAuthIdentityError.ALREADY_LINKED);
    const stillOriginal = await identity.getByPlayerId("frank", "google");
    assert.equal(stillOriginal.provider_subject, "sub-frank-1");
  });

  test("two different providers can each link the same player independently", async () => {
    await player("grace");
    await identity.link({ playerId: "grace", provider: "google", subject: "g-sub" });
    const r = await identity.link({ playerId: "grace", provider: "microsoft", subject: "m-sub" });
    assert.equal(r.ok, true);
    assert.equal((await identity.getByPlayerId("grace", "google")).provider_subject, "g-sub");
    assert.equal((await identity.getByPlayerId("grace", "microsoft")).provider_subject, "m-sub");
  });
});

describe("unlink", () => {
  test("removes an existing link", async () => {
    await player("henry");
    await identity.link({ playerId: "henry", provider: "google", subject: "sub-henry" });
    const r = await identity.unlink("henry", "google");
    assert.equal(r.ok, true);
    assert.equal(await identity.getByPlayerId("henry", "google"), null);
  });

  test("unlinking a provider with no link is refused as NOT_LINKED", async () => {
    await player("iris");
    const r = await identity.unlink("iris", "google");
    assert.equal(r.ok, false);
    assert.equal(r.reason, OAuthIdentityError.NOT_LINKED);
  });
});
