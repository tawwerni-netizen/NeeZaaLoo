import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createNicknameService, NicknameError, validateNicknameContent } from "../src/nickname.mjs";

let db, nicknames;
let CLOCK = Date.now();

async function player(id, handle = id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  nicknames = createNicknameService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("validateNicknameContent (pure)", () => {
  test("accepts a normal nickname", () => {
    assert.equal(validateNicknameContent("ChessMaster99"), null);
  });

  test("rejects too short", () => {
    assert.equal(validateNicknameContent("ab"), NicknameError.INVALID_SHAPE);
  });

  test("rejects too long", () => {
    assert.equal(validateNicknameContent("x".repeat(25)), NicknameError.INVALID_SHAPE);
  });

  test("rejects disallowed characters", () => {
    assert.equal(validateNicknameContent("bad name!"), NicknameError.INVALID_SHAPE);
  });

  test("rejects reserved platform names, case-insensitively", () => {
    assert.equal(validateNicknameContent("Admin"), NicknameError.RESERVED);
    assert.equal(validateNicknameContent("NIZALO"), NicknameError.RESERVED);
    assert.equal(validateNicknameContent("support"), NicknameError.RESERVED);
  });

  test("rejects an 'obvious variant' of a reserved name (substring match)", () => {
    assert.equal(validateNicknameContent("official_nizalo"), NicknameError.RESERVED);
    assert.equal(validateNicknameContent("AdminTeam99"), NicknameError.RESERVED);
  });

  test("rejects prohibited content", () => {
    assert.equal(validateNicknameContent("shithead"), NicknameError.PROHIBITED);
  });
});

describe("changeNickname", () => {
  test("a valid rename succeeds and is reflected in the player row", async () => {
    await player("alice1");
    const r = await nicknames.changeNickname("alice1", "AliceTheGreat");
    assert.equal(r.ok, true);
    assert.equal(r.nickname, "AliceTheGreat");
    const row = await db.query("SELECT handle FROM player WHERE id = $1", ["alice1"]);
    assert.equal(row.rows[0].handle, "AliceTheGreat");
  });

  test("an invalid shape is refused before ever touching the database", async () => {
    await player("bob1");
    const r = await nicknames.changeNickname("bob1", "x");
    assert.equal(r.ok, false);
    assert.equal(r.reason, NicknameError.INVALID_SHAPE);
  });

  test("a reserved name is refused", async () => {
    await player("carol1");
    const r = await nicknames.changeNickname("carol1", "TheAdmin");
    assert.equal(r.ok, false);
    assert.equal(r.reason, NicknameError.RESERVED);
  });

  test("a name already taken by ANOTHER player is refused", async () => {
    await player("dan1", "DanTaken");
    await player("erin1");
    const r = await nicknames.changeNickname("erin1", "DanTaken");
    assert.equal(r.ok, false);
    assert.equal(r.reason, NicknameError.TAKEN);
  });

  test("a name that differs only by CASE from another player's is still refused (case-insensitive uniqueness)", async () => {
    await player("frank1", "FrankFrank");
    await player("grace1");
    const r = await nicknames.changeNickname("grace1", "frankfrank");
    assert.equal(r.ok, false);
    assert.equal(r.reason, NicknameError.TAKEN);
  });

  test("renaming to a case-variant of ONE'S OWN current name succeeds", async () => {
    await player("henry1", "henryhandle");
    const r = await nicknames.changeNickname("henry1", "HenryHandle");
    assert.equal(r.ok, true);
    assert.equal(r.nickname, "HenryHandle");
  });

  test("a second rename within the cooldown window is refused", async () => {
    await player("iris1");
    const first = await nicknames.changeNickname("iris1", "IrisFirst");
    assert.equal(first.ok, true);
    const second = await nicknames.changeNickname("iris1", "IrisSecond");
    assert.equal(second.ok, false);
    assert.equal(second.reason, NicknameError.COOLDOWN);
    assert.ok(second.retryAfterMs > 0);
  });

  test("after the cooldown elapses, a rename succeeds again", async () => {
    await player("jack1");
    await nicknames.changeNickname("jack1", "JackFirst");
    CLOCK += 31 * 24 * 3600_000; // 31 days
    const r = await nicknames.changeNickname("jack1", "JackSecond");
    assert.equal(r.ok, true);
  });

  test("a rename writes a NICKNAME_CHANGED security event with from/to, never a raw secret", async () => {
    await player("kate1", "KateOld");
    await nicknames.changeNickname("kate1", "KateNew");
    const events = await db.query(
      "SELECT type, detail FROM security_event WHERE player_id = 'kate1' AND type = 'NICKNAME_CHANGED'"
    );
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].detail.from, "KateOld");
    assert.equal(events.rows[0].detail.to, "KateNew");
  });

  test("renaming a nonexistent player is refused cleanly", async () => {
    const r = await nicknames.changeNickname("does-not-exist", "SomeName");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });
});
