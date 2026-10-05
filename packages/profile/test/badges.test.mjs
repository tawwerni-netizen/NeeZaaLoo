import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createBadgeService, BadgeError, BadgeSource } from "../src/badges.mjs";

let db, badges;

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  badges = createBadgeService(db);
});

after(async () => { await db.close?.(); });

test("awarding an EARNED badge succeeds and is tagged with its source", async () => {
  await player("alice");
  const r = await badges.award("alice", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
  assert.equal(r.ok, true);
  const list = await badges.listFor("alice");
  assert.equal(list.length, 1);
  assert.equal(list[0].source, "ACHIEVEMENT");
});

test("awarding the SAME badge to the SAME player twice is a harmless no-op", async () => {
  await player("bob");
  await badges.award("bob", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
  const second = await badges.award("bob", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
  assert.equal(second.awarded, false);
  assert.equal((await badges.listFor("bob")).length, 1);
});

test("awarding an unknown badge code is refused", async () => {
  await player("carol");
  const r = await badges.award("carol", "NOT_A_REAL_BADGE", BadgeSource.ACHIEVEMENT);
  assert.equal(r.ok, false);
  assert.equal(r.reason, BadgeError.UNKNOWN_BADGE);
});

describe("select (the compact preview badge)", () => {
  test("a player can select a badge they own", async () => {
    await player("dan");
    await badges.award("dan", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
    const r = await badges.select("dan", "FIRST_WIN");
    assert.equal(r.ok, true);
    const row = await db.query("SELECT selected_badge_code FROM player WHERE id = 'dan'");
    assert.equal(row.rows[0].selected_badge_code, "FIRST_WIN");
  });

  test("selecting a badge the player does NOT own is refused, and does not change the current selection", async () => {
    await player("erin");
    await badges.award("erin", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
    await badges.select("erin", "FIRST_WIN");
    const r = await badges.select("erin", "FIRST_TOURNAMENT");
    assert.equal(r.ok, false);
    assert.equal(r.reason, BadgeError.NOT_OWNED);
    const row = await db.query("SELECT selected_badge_code FROM player WHERE id = 'erin'");
    assert.equal(row.rows[0].selected_badge_code, "FIRST_WIN", "the earlier valid selection must be untouched");
  });

  test("selecting null clears the current selection", async () => {
    await player("frank");
    await badges.award("frank", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
    await badges.select("frank", "FIRST_WIN");
    const r = await badges.select("frank", null);
    assert.equal(r.ok, true);
    const row = await db.query("SELECT selected_badge_code FROM player WHERE id = 'frank'");
    assert.equal(row.rows[0].selected_badge_code, null);
  });

  test("a brand new player with no badges cannot select anything", async () => {
    await player("grace");
    const r = await badges.select("grace", "FIRST_WIN");
    assert.equal(r.ok, false);
    assert.equal(r.reason, BadgeError.NOT_OWNED);
  });
});

test("EARNED and PURCHASE sources stay distinguishable per badge row -- awarding never conflates them", async () => {
  await player("henry");
  await badges.award("henry", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
  const list = await badges.listFor("henry");
  assert.equal(list.every((b) => b.source === "ACHIEVEMENT"), true);
});
