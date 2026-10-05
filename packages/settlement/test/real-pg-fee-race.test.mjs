/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/ledger/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * Two races named explicitly in the Financial Architecture Reconciliation
 * that nothing in this repo proved against a real, multi-backend race
 * before this file:
 *
 *   1. FEE CONFIGURATION RACE -- an admin committing a new economy_rule at
 *      the exact moment matchmaking is creating CASH duels. The result must
 *      be deterministic and transactionally safe: every duel created gets a
 *      real, valid price (never NULL, never a value that was never actually
 *      configured), and once stamped it never changes.
 *
 *   2. MATCH CREATION RACE -- two workers (or two ticks of the same worker
 *      running concurrently) attempting to pair the SAME two waiting
 *      tickets at once. mm_pair()'s `FOR UPDATE SKIP LOCKED` must produce
 *      exactly one duel, never two, and never a half-created row.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createMatchmakingService } from "../../matchmaking/src/matchmaking.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const TC = { initialMs: 300000, incrementMs: 0 };
const INITIAL = { fen: "startpos" };

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return { client, db, mm: createMatchmakingService(db) };
}

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Fee configuration race and match creation race, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); await drop(); });

    async function seedPlayer(playerId) {
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
    }

    async function cashRule(ruleId, rakeBps) {
      await admin.client.query(
        `INSERT INTO economy_rule
           (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
            effective_from, created_by, approved_by, reason)
         VALUES ($1, 1, NULL, 'CASH', $2, 0, NULL, now(), 'admin-a', 'admin-b', 'race test rule')`,
        [ruleId, rakeBps]
      );
    }

    test("1. FEE CONFIGURATION RACE: pairing many CASH duels while an admin commits a new rule concurrently -- every duel ends up priced, never NULL, and only ever at a rate that was actually configured", async () => {
      // economy_rule is append-only -- this cannot delete the seeded launch
      // rule (1000 bps) to start from a clean slate. Instead it adds a rule
      // with a later effective_from, which wins the specificity tie-break
      // against the launch rule (same specificity, later effective_from),
      // exactly as a real admin rate change would.
      await cashRule("race-old", 1500);

      const PAIRS = 8;
      const players = [];
      for (let i = 0; i < PAIRS * 2; i++) {
        const p = id("frp");
        players.push(p);
        await seedPlayer(p);
      }

      const pairer = await connection();
      for (const p of players) {
        await pairer.mm.enqueue({
          playerId: p, gameId: "chess", tier: "CASH", stakeMinor: u(10),
          ratingX100: 150000, timeControl: TC, ttlSeconds: 120,
        });
      }

      const admin2 = await connection();

      const pairAllDuels = async () => {
        const created = [];
        for (let i = 0; i < PAIRS; i++) {
          const res = await pairer.mm.pair({
            gameId: "chess", tier: "CASH", stakeMinor: u(10), initialState: INITIAL, timeControl: TC,
          });
          if (res.paired) created.push(res.duelId);
        }
        return created;
      };

      const changeRuleMidway = async () => {
        // No artificial sleep: the point is that this commit can land at ANY
        // point relative to the pairing loop above, and the result must be
        // correct regardless of exactly when it lands.
        await admin2.client.query(
          `INSERT INTO economy_rule
             (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
              effective_from, created_by, approved_by, reason)
           VALUES ('race-new', 1, NULL, 'CASH', 2500, 0, NULL, now(), 'admin-a', 'admin-b', 'raised to 25%')`
        );
      };

      const [duelIds] = await Promise.all([pairAllDuels(), changeRuleMidway()]);

      assert.equal(duelIds.length, PAIRS, "every pool of two waiting tickets was successfully paired");

      const rows = await admin.client.query(
        `SELECT priced_rake_bps, priced_economy_rule_id FROM duel WHERE id = ANY($1)`,
        [duelIds]
      );
      assert.equal(rows.rows.length, PAIRS);
      for (const row of rows.rows) {
        assert.ok(row.priced_rake_bps !== null, "no duel was created unpriced");
        assert.ok(
          [1500, 2500].includes(row.priced_rake_bps),
          `priced_rake_bps ${row.priced_rake_bps} must be a rate that was actually configured, never a third value`
        );
        assert.ok(
          ["race-old", "race-new"].includes(row.priced_economy_rule_id),
          "the stamped rule reference names a rule that genuinely existed"
        );
      }

      // Stamped once, never revisited -- re-reading immediately after must
      // agree with itself (the immutability trigger is exercised elsewhere;
      // this just confirms nothing here silently reprices on a second read).
      const firstRead = new Map(
        (await admin.client.query(`SELECT id, priced_rake_bps FROM duel WHERE id = ANY($1)`, [duelIds])).rows
          .map((r) => [r.id, r.priced_rake_bps])
      );
      const secondRead = await admin.client.query(`SELECT id, priced_rake_bps FROM duel WHERE id = ANY($1)`, [duelIds]);
      for (const row of secondRead.rows) {
        assert.equal(row.priced_rake_bps, firstRead.get(row.id), "re-reading the same row twice must be perfectly stable");
      }

      await pairer.client.end();
      await admin2.client.end();
    });

    test("2. MATCH CREATION RACE: two connections racing to pair the SAME two waiting tickets produce exactly one duel", async () => {
      await cashRule("race-solo", 1000);

      const alice = id("mcra");
      const bob = id("mcrb");
      await seedPlayer(alice);
      await seedPlayer(bob);

      const A = await connection();
      const B = await connection();

      await A.mm.enqueue({ playerId: alice, gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC });
      await A.mm.enqueue({ playerId: bob, gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC });

      const pairOnce = (conn) => conn.mm.pair({
        gameId: "chess", tier: "CASH", stakeMinor: u(10), initialState: INITIAL, timeControl: TC,
      });

      const [ra, rb] = await Promise.all([pairOnce(A), pairOnce(B)]);

      const actuallyCreated = [ra, rb].filter((r) => r.paired && r.created);
      assert.equal(actuallyCreated.length, 1, "exactly one of the two concurrent pairing attempts actually created a duel");

      const both = [ra, rb].filter((r) => r.paired);
      if (both.length === 2) {
        // If the loser observed the winner's row via the idempotent
        // pairing_key lookup rather than finding nothing to pair, it must
        // report the SAME duel, never a second one.
        assert.equal(both[0].duelId, both[1].duelId);
      }

      const count = await admin.client.query(
        `SELECT count(*)::int c FROM duel WHERE seat_0 = $1 OR seat_1 = $1`, [alice]
      );
      assert.equal(count.rows[0].c, 1, "exactly one duel row exists for this pair, never two");

      await A.client.end();
      await B.client.end();
    });
  }
);
