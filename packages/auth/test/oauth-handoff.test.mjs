import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createOAuthHandoffService, HandoffError } from "../src/oauth-handoff.mjs";

let db, handoff;
let CLOCK = Date.now();

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  handoff = createOAuthHandoffService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

test("issue then consume returns the bound playerId", async () => {
  await player("alice");
  const issued = await handoff.issue({ playerId: "alice", provider: "google" });
  assert.equal(issued.ok, true);
  assert.ok(issued.code.length >= 32);
  const consumed = await handoff.consume({ code: issued.code, provider: "google" });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.playerId, "alice");
});

test("a code cannot be consumed twice", async () => {
  await player("bob");
  const issued = await handoff.issue({ playerId: "bob", provider: "google" });
  await handoff.consume({ code: issued.code, provider: "google" });
  const replay = await handoff.consume({ code: issued.code, provider: "google" });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, HandoffError.NOT_FOUND);
});

test("an unknown code is NOT_FOUND", async () => {
  const r = await handoff.consume({ code: "never-issued", provider: "google" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, HandoffError.NOT_FOUND);
});

test("a code for a DIFFERENT provider is not found -- provider is part of the lookup, not decorative", async () => {
  await player("carol");
  const issued = await handoff.issue({ playerId: "carol", provider: "google" });
  const r = await handoff.consume({ code: issued.code, provider: "microsoft" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, HandoffError.NOT_FOUND);
});

test("an expired code is refused", async () => {
  await player("dan");
  const issued = await handoff.issue({ playerId: "dan", provider: "google", ttlMs: 1000 });
  CLOCK += 2000;
  const r = await handoff.consume({ code: issued.code, provider: "google" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, HandoffError.EXPIRED);
});

test("two different players' codes issued around the same time do not collide", async () => {
  await player("erin");
  await player("frank");
  const a = await handoff.issue({ playerId: "erin", provider: "google" });
  const b = await handoff.issue({ playerId: "frank", provider: "google" });
  assert.notEqual(a.code, b.code);
  assert.equal((await handoff.consume({ code: a.code, provider: "google" })).playerId, "erin");
  assert.equal((await handoff.consume({ code: b.code, provider: "google" })).playerId, "frank");
});
