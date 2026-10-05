import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAchievementService, AchievementError } from "../src/achievements.mjs";

let db, achievements;

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  achievements = createAchievementService(db);
});

after(async () => { await db.close?.(); });

test("awarding a real achievement succeeds", async () => {
  await player("alice");
  const r = await achievements.award("alice", "FIRST_WIN");
  assert.equal(r.ok, true);
  assert.equal(r.awarded, true);
});

test("awarding the SAME achievement to the SAME player twice is a harmless no-op, never a duplicate row", async () => {
  await player("bob");
  const first = await achievements.award("bob", "FIRST_WIN");
  assert.equal(first.awarded, true);
  const second = await achievements.award("bob", "FIRST_WIN");
  assert.equal(second.ok, true);
  assert.equal(second.awarded, false);
  const list = await achievements.listFor("bob");
  assert.equal(list.length, 1);
});

test("awarding an unknown achievement code is refused", async () => {
  await player("carol");
  const r = await achievements.award("carol", "DOES_NOT_EXIST");
  assert.equal(r.ok, false);
  assert.equal(r.reason, AchievementError.UNKNOWN_ACHIEVEMENT);
});

test("the same achievement can be earned independently by different players", async () => {
  await player("dan");
  await player("erin");
  await achievements.award("dan", "FIRST_WIN");
  await achievements.award("erin", "FIRST_WIN");
  assert.equal((await achievements.listFor("dan")).length, 1);
  assert.equal((await achievements.listFor("erin")).length, 1);
});

test("listFor a player with no achievements returns an empty array, not an error", async () => {
  await player("frank");
  assert.deepEqual(await achievements.listFor("frank"), []);
});

test("a player can hold multiple different achievements", async () => {
  await player("grace");
  await achievements.award("grace", "FIRST_WIN");
  await achievements.award("grace", "FIRST_TOURNAMENT");
  const codes = (await achievements.listFor("grace")).map((r) => r.achievement_code).sort();
  assert.deepEqual(codes, ["FIRST_TOURNAMENT", "FIRST_WIN"]);
});
