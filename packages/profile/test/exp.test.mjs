import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createExpService, ExpError } from "../src/exp.mjs";

let db, exp;
let CLOCK = Date.now();

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  exp = createExpService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

test("awarding EXP increases the player's total", async () => {
  await player("alice");
  const r = await exp.award({ playerId: "alice", eventType: "GAME_WON", amount: 25, dedupeKey: "duel:1:win" });
  assert.equal(r.ok, true);
  assert.equal(r.awarded, true);
  assert.equal(await exp.totalFor("alice"), 25);
});

test("multiple distinct awards accumulate", async () => {
  await player("bob");
  await exp.award({ playerId: "bob", eventType: "GAME_COMPLETED", amount: 10, dedupeKey: "duel:2:complete" });
  await exp.award({ playerId: "bob", eventType: "GAME_WON", amount: 25, dedupeKey: "duel:2:win" });
  assert.equal(await exp.totalFor("bob"), 35);
});

test("the exact same dedupe key never awards twice -- a retried match settlement does not double-grant EXP", async () => {
  await player("carol");
  const first = await exp.award({ playerId: "carol", eventType: "GAME_WON", amount: 25, dedupeKey: "duel:3:win" });
  assert.equal(first.awarded, true);
  const retry = await exp.award({ playerId: "carol", eventType: "GAME_WON", amount: 25, dedupeKey: "duel:3:win" });
  assert.equal(retry.ok, true);
  assert.equal(retry.awarded, false, "the retry is a harmless no-op, not an error and not a second award");
  assert.equal(await exp.totalFor("carol"), 25, "total must reflect exactly one award");
});

test("a zero or negative amount is refused", async () => {
  await player("dan");
  const zero = await exp.award({ playerId: "dan", eventType: "X", amount: 0, dedupeKey: "d1" });
  assert.equal(zero.ok, false);
  assert.equal(zero.reason, ExpError.INVALID_AMOUNT);
  const negative = await exp.award({ playerId: "dan", eventType: "X", amount: -10, dedupeKey: "d2" });
  assert.equal(negative.ok, false);
  assert.equal(negative.reason, ExpError.INVALID_AMOUNT);
  assert.equal(await exp.totalFor("dan"), 0);
});

test("a non-integer amount is refused", async () => {
  await player("erin");
  const r = await exp.award({ playerId: "erin", eventType: "X", amount: 12.5, dedupeKey: "d3" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, ExpError.INVALID_AMOUNT);
});

test("a player with no EXP events has a total of exactly zero, not null or an error", async () => {
  await player("frank");
  assert.equal(await exp.totalFor("frank"), 0);
});

test("historyFor returns the most recent events first, bounded by limit", async () => {
  await player("grace");
  await exp.award({ playerId: "grace", eventType: "A", amount: 10, dedupeKey: "g1" });
  CLOCK += 1000;
  await exp.award({ playerId: "grace", eventType: "B", amount: 20, dedupeKey: "g2" });
  const history = await exp.historyFor("grace", { limit: 1 });
  assert.equal(history.length, 1);
  assert.equal(history[0].event_type, "B");
});

test("EXP for one player never affects another player's total", async () => {
  await player("henry");
  await player("iris");
  await exp.award({ playerId: "henry", eventType: "X", amount: 100, dedupeKey: "h1" });
  assert.equal(await exp.totalFor("iris"), 0);
});
