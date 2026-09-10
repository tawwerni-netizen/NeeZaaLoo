/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/chat/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection) cannot substitute for it.
 *
 * The underlying EXP/achievement/badge primitives already have their OWN
 * real-Postgres concurrency proof (packages/profile/test/real-pg-
 * concurrency.test.mjs) -- this file is NOT a duplicate of that. What is
 * specific to THIS package and needs its own proof: that
 * processDuelCompletion()/processTournamentCompletion() themselves are
 * safe when the SAME completion is processed by two workers at once (the
 * exact "two workers processing the same completion" and "duplicate
 * completion event" scenarios directive #16 names), and that the
 * progression_processed_at marker race never produces a lost update or a
 * duplicate reward.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createExpService } from "../../profile/src/exp.mjs";
import { createAchievementService } from "../../profile/src/achievements.mjs";
import { createBadgeService } from "../../profile/src/badges.mjs";
import { createMasteryService } from "../../mastery/src/service.mjs";
import { createStreakService } from "../../engagement/src/streaks.mjs";
import { createProgressionService } from "../src/service.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  const exp = createExpService(db);
  const achievements = createAchievementService(db);
  const badges = createBadgeService(db);
  const mastery = createMasteryService(db);
  const streaks = createStreakService(db);
  const progression = createProgressionService(db, { exp, achievements, badges, mastery, streaks });
  return { client, db, exp, achievements, badges, progression };
}

async function withTwoConnections(fn) {
  const A = await connection();
  const B = await connection();
  try {
    await fn(A, B);
  } finally {
    await Promise.all([A.client.end(), B.client.end()]);
  }
}

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Progression concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
      // This database is fresh per run (see provisionRealPgDatabase), but a
      // `limit:10` sweep is still only safe to rely on if nothing is
      // pending beforehand -- drain any backlog up front so every test
      // below starts from "nothing pending except what it itself just
      // seeded," regardless of what earlier tests in this same file left.
      await admin.progression.progressionDue({ limit: 100000 });
      await admin.progression.tournamentProgressionDue({ limit: 100000 });
    });

    after(async () => { await admin.client.end(); await drop(); });

    async function seedPlayer(playerId) {
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
    }

    async function seedSettledDuel(duelId, seat0, seat1, result) {
      await admin.client.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, result, termination_reason, completed_at, settled_at)
         VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb,'SETTLED','${result}','CHECKMATE',now(),now())`,
        [duelId, seat0, seat1]
      );
    }

    async function seedSettledTournament(tournamentId, participants) {
      await admin.client.query(
        `INSERT INTO tournament (id, game_id, format, status, capacity, time_control, registration_closes_at, completed_at, ruleset_version)
         VALUES ($1,'chess','SINGLE_ELIMINATION','COMPLETED',4,'{}'::jsonb,now(),now(),1)`,
        [tournamentId]
      );
      let rank = 1;
      for (const playerId of participants) {
        await admin.client.query(
          `INSERT INTO tournament_settlement (tournament_id, player_id, rank, prize_minor) VALUES ($1,$2,$3,0)`,
          [tournamentId, playerId, rank++]
        );
      }
    }

    test("two workers processing the SAME settled duel concurrently: EXP is awarded exactly once per event, FIRST_WIN exactly once", async () => {
      const a = id("cwa"); const b = id("cwb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("cwduel");
      await seedSettledDuel(duelId, a, b, "1-0");

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.progression.processDuelCompletion(duelId),
          B.progression.processDuelCompletion(duelId),
        ]);
        assert.ok(ra.ok && rb.ok, `both calls must resolve successfully, got ${JSON.stringify([ra, rb])}`);

        const total = await admin.exp.totalFor(a);
        assert.equal(total, 35, "GAME_COMPLETED (10) + GAME_WON (25) exactly once, never double-awarded");

        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM exp_event WHERE player_id = $1", [a]
        );
        assert.equal(rows.rows[0].n, 2, "exactly two exp_event rows (completed + won), never four");

        const ach = await admin.client.query(
          "SELECT count(*)::int AS n FROM player_achievement WHERE player_id = $1 AND achievement_code = 'FIRST_WIN'", [a]
        );
        assert.equal(ach.rows[0].n, 1);

        const badgeRows = await admin.client.query(
          "SELECT count(*)::int AS n FROM player_badge WHERE player_id = $1 AND badge_code = 'FIRST_WIN'", [a]
        );
        assert.equal(badgeRows.rows[0].n, 1);
      });
    });

    test("two workers racing progressionDue() over the SAME pending duel: exactly one of them (or both, safely) processes it -- never a duplicate reward", async () => {
      const a = id("cra"); const b = id("crb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("crduel");
      await seedSettledDuel(duelId, a, b, "0-1");

      await withTwoConnections(async (A, B) => {
        await Promise.all([
          A.progression.progressionDue({ limit: 10 }),
          B.progression.progressionDue({ limit: 10 }),
        ]);
        assert.equal(await admin.exp.totalFor(b), 35, "the winner's EXP must reflect exactly one processing, whichever worker's sweep actually did it");
        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM exp_event WHERE player_id = $1", [b]
        );
        assert.equal(rows.rows[0].n, 2);
      });
    });

    test("progression_processed_at is set by exactly one of two concurrent writers, and the row is never left inconsistent", async () => {
      const a = id("cma"); const b = id("cmb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("cmduel");
      await seedSettledDuel(duelId, a, b, "1/2-1/2");

      await withTwoConnections(async (A, B) => {
        await Promise.all([
          A.progression.processDuelCompletion(duelId),
          B.progression.processDuelCompletion(duelId),
        ]);
        const row = await admin.client.query("SELECT progression_processed_at FROM duel WHERE id = $1", [duelId]);
        assert.ok(row.rows[0].progression_processed_at, "the marker must end up set");
        // A draw: both get GAME_COMPLETED, nobody gets GAME_WON -- verifies
        // the race did not accidentally duplicate OR skip the completion
        // award for either player.
        assert.equal(await admin.exp.totalFor(a), 10);
        assert.equal(await admin.exp.totalFor(b), 10);
      });
    });

    test("concurrent achievement award from two DIFFERENT completions (the same player winning twice at once): FIRST_WIN and its badge are granted exactly once", async () => {
      const winner = id("c2a"); const opp1 = id("c2b"); const opp2 = id("c2c");
      await seedPlayer(winner); await seedPlayer(opp1); await seedPlayer(opp2);
      const duel1 = id("c2duel1"); const duel2 = id("c2duel2");
      await seedSettledDuel(duel1, winner, opp1, "1-0");
      await seedSettledDuel(duel2, winner, opp2, "1-0");

      await withTwoConnections(async (A, B) => {
        await Promise.all([
          A.progression.processDuelCompletion(duel1),
          B.progression.processDuelCompletion(duel2),
        ]);
        const ach = await admin.client.query(
          "SELECT count(*)::int AS n FROM player_achievement WHERE player_id = $1 AND achievement_code='FIRST_WIN'", [winner]
        );
        assert.equal(ach.rows[0].n, 1, "winning two duels AT ONCE must still only ever unlock FIRST_WIN once");
        const badgeRows = await admin.client.query(
          "SELECT count(*)::int AS n FROM player_badge WHERE player_id = $1 AND badge_code='FIRST_WIN'", [winner]
        );
        assert.equal(badgeRows.rows[0].n, 1);
        // Both wins' EXP must still land -- concurrency safety must never
        // come at the cost of losing a real, distinct award.
        assert.equal(await admin.exp.totalFor(winner), (10 + 25) * 2);
      });
    });

    test("two workers processing the SAME settled tournament concurrently: TOURNAMENT_PARTICIPATION and FIRST_TOURNAMENT are granted exactly once per participant", async () => {
      const p1 = id("cta"); const p2 = id("ctb"); const p3 = id("ctc");
      await seedPlayer(p1); await seedPlayer(p2); await seedPlayer(p3);
      const tournamentId = id("ctourn");
      await seedSettledTournament(tournamentId, [p1, p2, p3]);

      await withTwoConnections(async (A, B) => {
        await Promise.all([
          A.progression.processTournamentCompletion(tournamentId),
          B.progression.processTournamentCompletion(tournamentId),
        ]);
        for (const p of [p1, p2, p3]) {
          assert.equal(await admin.exp.totalFor(p), 50);
          const ach = await admin.client.query(
            "SELECT count(*)::int AS n FROM player_achievement WHERE player_id = $1 AND achievement_code='FIRST_TOURNAMENT'", [p]
          );
          assert.equal(ach.rows[0].n, 1);
        }
      });
    });
  }
);
