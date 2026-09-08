/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/chat/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * Settlement had no real-Postgres concurrency proof of its own before
 * this file (packages/progression's own real-pg suite proves progression
 * is safe under concurrent processing of an ALREADY-settled duel, but
 * nothing proved settle() ITSELF -- the row lock via `lockDuel`'s `FOR
 * UPDATE`, and the idempotency guard checking `status === 'SETTLED'` --
 * actually holds when two real connections race to settle the SAME duel).
 * This is exactly the gap the golden-reference Chess slice's own directive
 * calls for closing: "if a shared infrastructure bug is discovered, fix
 * the shared layer and add regression tests" -- here nothing was broken,
 * but the missing PROOF was.
 *
 * Also covers VS_COMPUTER's specific concurrency property: the
 * `is_vs_computer` gate on rating write-back (settle.mjs) must hold
 * exactly as reliably under two real racing connections as it already
 * does, proven, under a single PGlite connection.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../src/settle.mjs";
import { createProgressionService } from "../../progression/src/service.mjs";
import { createExpService } from "../../profile/src/exp.mjs";
import { createAchievementService } from "../../profile/src/achievements.mjs";
import { createBadgeService } from "../../profile/src/badges.mjs";

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
  const settlement = createSettlementService(db);
  const exp = createExpService(db);
  const achievements = createAchievementService(db);
  const badges = createBadgeService(db);
  const progression = createProgressionService(db, { exp, achievements, badges });
  return { client, db, settlement, exp, progression };
}

async function withTwoConnections(fn) {
  const A = await connection();
  const B = await connection();
  try {
    return await fn(A, B);
  } finally {
    await Promise.all([A.client.end(), B.client.end()]);
  }
}

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Settlement concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); });

    async function seedPlayer(playerId) {
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
    }

    async function seedCompletedDuel(duelId, seat0, seat1, result, { isVsComputer = false } = {}) {
      await admin.client.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, result, termination_reason, completed_at, is_vs_computer)
         VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb,'COMPLETED','${result}','CHECKMATE',now(),$4)`,
        [duelId, seat0, seat1, isVsComputer]
      );
    }

    test("two connections racing settle() on the SAME duel: exactly one settles, exactly one rating write, the other sees ALREADY_SETTLED", async () => {
      const a = id("sca"); const b = id("scb"); const duelId = id("scd");
      await seedPlayer(a); await seedPlayer(b);
      await seedCompletedDuel(duelId, a, b, "1-0");

      const results = await withTwoConnections((A, B) =>
        Promise.all([A.settlement.settle(duelId), B.settlement.settle(duelId)])
      );

      const settledCount = results.filter((r) => r.reason === "SETTLED").length;
      const alreadyCount = results.filter((r) => r.reason === "ALREADY_SETTLED").length;
      assert.equal(settledCount, 1, "exactly one of the two racing calls actually settled it");
      assert.equal(alreadyCount, 1, "the other must observe it was already done, never re-process it");

      const rating = await admin.client.query(
        "SELECT games_played FROM rating WHERE player_id = $1 AND game_id = 'chess'", [a]
      );
      assert.equal(rating.rows[0].games_played, 1, "the rating moved exactly once, not zero and not twice");

      const row = await admin.client.query("SELECT status FROM duel WHERE id = $1", [duelId]);
      assert.equal(row.rows[0].status, "SETTLED");
    });

    test("two connections racing settle() on a VS_COMPUTER duel: exactly one settles, and NEITHER ever writes a rating", async () => {
      const a = id("vca");
      await seedPlayer(a);
      const duelId = id("vcd");
      await seedCompletedDuel(duelId, a, "ai-hard", "1-0", { isVsComputer: true });

      const results = await withTwoConnections((A, B) =>
        Promise.all([A.settlement.settle(duelId), B.settlement.settle(duelId)])
      );

      assert.equal(results.filter((r) => r.reason === "SETTLED").length, 1);
      for (const r of results) {
        if (r.reason === "SETTLED") assert.equal(r.ratings, null, "a VS_COMPUTER settlement never returns ratings");
      }
      const rated = await admin.client.query(
        "SELECT 1 FROM rating WHERE player_id = $1 AND game_id = 'chess'", [a]
      );
      assert.equal(rated.rows.length, 0, "no rating row was created for the human, even under a real settle() race");
    });

    test("settle() then two concurrent progression sweeps: EXP is awarded exactly once, end to end through both real subsystems", async () => {
      const a = id("pea"); const b = id("peb"); const duelId = id("ped");
      await seedPlayer(a); await seedPlayer(b);
      await seedCompletedDuel(duelId, a, b, "1-0");
      await admin.settlement.settle(duelId);

      await withTwoConnections((A, B) =>
        Promise.all([A.progression.processDuelCompletion(duelId), B.progression.processDuelCompletion(duelId)])
      );

      assert.equal(await admin.exp.totalFor(a), 35, "GAME_COMPLETED (10) + GAME_WON (25), exactly once");
      assert.equal(await admin.exp.totalFor(b), 10, "GAME_COMPLETED only, exactly once");
    });
  }
);
