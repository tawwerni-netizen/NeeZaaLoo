/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/auth/test/real-pg-email-challenge.test.mjs's own header for why
 * this matters and PGlite (single connection) cannot substitute for it.
 *
 * Every idempotency/uniqueness guarantee this slice makes -- a nickname
 * can't be claimed twice, an EXP event can't be double-granted, an
 * achievement or badge can't be double-awarded -- rests on a real
 * database constraint (a UNIQUE index or a compare-and-swap UPDATE), not
 * a check-then-act promise in application code. This file is the direct
 * evidence those constraints actually hold when two requests race for
 * real, on two separate connections, not just when PGlite serializes them
 * one at a time.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createNicknameService } from "../src/nickname.mjs";
import { createExpService } from "../src/exp.mjs";
import { createAchievementService } from "../src/achievements.mjs";
import { createBadgeService, BadgeSource } from "../src/badges.mjs";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

let reachable = true;
let reachabilityError = null;
try {
  const probe = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch (e) {
  reachable = false;
  reachabilityError = e;
}

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return {
    client, db,
    nicknames: createNicknameService(db),
    exp: createExpService(db),
    achievements: createAchievementService(db),
    badges: createBadgeService(db),
  };
}

describe(
  "Profile/EXP/achievement/badge concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); });

    test("two DIFFERENT players simultaneously claiming the SAME nickname: exactly one wins", async () => {
      const nickname = `Race${randomUUID().replace(/-/g, "").slice(0, 10)}`;
      const playerA = `pa${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const playerB = `pb${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1),($2,$2)", [playerA, playerB]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.nicknames.changeNickname(playerA, nickname),
        B.nicknames.changeNickname(playerB, nickname),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      const failed = [ra, rb].filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success, got ${JSON.stringify([ra, rb])}`);
      assert.equal(failed[0].reason, "TAKEN");

      const rows = await admin.client.query("SELECT id FROM player WHERE LOWER(handle) = LOWER($1)", [nickname]);
      assert.equal(rows.rows.length, 1, "the nickname must belong to exactly one player, never zero or two");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("two DIFFERENT players simultaneously claiming CASE-VARIANT spellings of the SAME nickname: exactly one wins", async () => {
      // The exact-match race above is already caught by the original
      // case-sensitive UNIQUE(handle) constraint from migration 0003 --
      // this proves the ADDITIONAL case-insensitive guarantee
      // (player_handle_lower_unique) also holds under real concurrency,
      // not just nickname.mjs's own SELECT-then-UPDATE pre-check (which,
      // on its own, two truly concurrent callers could both pass before
      // either commits).
      const base = `CaseRace${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const upper = base.toUpperCase().slice(0, 20);
      const lower = base.toLowerCase().slice(0, 20);
      const playerA = `ca${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const playerB = `cb${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1),($2,$2)", [playerA, playerB]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.nicknames.changeNickname(playerA, upper),
        B.nicknames.changeNickname(playerB, lower),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success for case-variant spellings, got ${JSON.stringify([ra, rb])}`);

      const rows = await admin.client.query("SELECT id FROM player WHERE LOWER(handle) = LOWER($1)", [lower]);
      assert.equal(rows.rows.length, 1, "case-variant spellings of the same nickname must never both land");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("the SAME player attempting two concurrent nickname updates: exactly one lands as the final value", async () => {
      const playerId = `pu${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const A = await connection();
      const B = await connection();
      const nameA = `NameA${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const nameB = `NameB${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const [ra, rb] = await Promise.all([
        A.nicknames.changeNickname(playerId, nameA),
        B.nicknames.changeNickname(playerId, nameB),
      ]);
      // Both may plausibly succeed (there is no PER-PLAYER lock preventing
      // two of the player's OWN concurrent renames -- only cross-player
      // uniqueness is guaranteed) -- what must hold is that the row ends
      // up as EXACTLY ONE of the two attempted names, never a corrupted
      // hybrid and never both silently applied.
      const finalRow = await admin.client.query("SELECT handle FROM player WHERE id = $1", [playerId]);
      assert.ok([nameA, nameB].includes(finalRow.rows[0].handle), `final handle ${finalRow.rows[0].handle} must be one of the two attempted names`);
      assert.ok(ra.ok || rb.ok, "at least one of the two concurrent attempts must have succeeded");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("duplicate EXP event (same dedupe key) from two connections: exactly one award lands", async () => {
      const playerId = `pe${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
      const dedupeKey = `race-exp-${randomUUID()}`;

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.exp.award({ playerId, eventType: "GAME_WON", amount: 25, dedupeKey }),
        B.exp.award({ playerId, eventType: "GAME_WON", amount: 25, dedupeKey }),
      ]);
      assert.ok(ra.ok && rb.ok, "neither call should error -- the loser is a graceful no-op");
      const awardedCount = [ra, rb].filter((r) => r.awarded).length;
      assert.equal(awardedCount, 1, `expected exactly one real award, got ${JSON.stringify([ra, rb])}`);

      const total = await admin.client.query(
        "SELECT COALESCE(SUM(amount),0)::int AS total FROM exp_event WHERE player_id = $1", [playerId]
      );
      assert.equal(total.rows[0].total, 25, "EXP must be granted exactly once, never twice");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("concurrent achievement award (same player, same achievement) from two connections: exactly one row exists afterward", async () => {
      const playerId = `pa2${randomUUID().replace(/-/g, "").slice(0, 13)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.achievements.award(playerId, "FIRST_WIN"),
        B.achievements.award(playerId, "FIRST_WIN"),
      ]);
      assert.ok(ra.ok && rb.ok);
      const awardedCount = [ra, rb].filter((r) => r.awarded).length;
      assert.equal(awardedCount, 1, `expected exactly one real award, got ${JSON.stringify([ra, rb])}`);

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM player_achievement WHERE player_id = $1 AND achievement_code = 'FIRST_WIN'", [playerId]
      );
      assert.equal(rows.rows[0].n, 1);

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("concurrent badge award (same player, same badge) from two connections: exactly one row exists afterward", async () => {
      const playerId = `pb2${randomUUID().replace(/-/g, "").slice(0, 13)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.badges.award(playerId, "FIRST_WIN", BadgeSource.ACHIEVEMENT),
        B.badges.award(playerId, "FIRST_WIN", BadgeSource.ACHIEVEMENT),
      ]);
      assert.ok(ra.ok && rb.ok);
      const awardedCount = [ra, rb].filter((r) => r.awarded).length;
      assert.equal(awardedCount, 1, `expected exactly one real award, got ${JSON.stringify([ra, rb])}`);

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM player_badge WHERE player_id = $1 AND badge_code = 'FIRST_WIN'", [playerId]
      );
      assert.equal(rows.rows[0].n, 1);

      await Promise.all([A.client.end(), B.client.end()]);
    });
  }
);
