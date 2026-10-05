/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/ledger/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * The Friend Challenge invitation's own explicit test list names two races
 * that only mean something under genuine concurrency:
 *
 *   CONCURRENT ACCEPT/DECLINE -- the opponent's own two tabs, or a client
 *     retry racing a real click, both acting on the SAME challenge at once.
 *     Exactly one must win; the other must see a clean, real refusal, never
 *     a second duel and never both a duel AND a decline.
 *
 *   DUPLICATE CHALLENGE under concurrency -- two near-simultaneous "send a
 *     challenge to this opponent" clicks (a slow network, a double-tap)
 *     must never create two live PENDING rows for the same pair.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createChallengeService, ChallengeError } from "../src/challenge.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return { client, db, challenge: createChallengeService(db) };
}

describe(
  "Friend Challenge concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
      await admin.client.query(
        "INSERT INTO player (id, handle) VALUES ('alice','alice'),('bob','bob') ON CONFLICT DO NOTHING"
      );
    });

    after(async () => { await admin.client.end(); await drop(); });

    test("CONCURRENT ACCEPT/DECLINE: exactly one of the two takes effect, never both and never neither", async () => {
      const created = await admin.challenge.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
      assert.equal(created.ok, true);

      const A = await connection();
      const B = await connection();

      const [a, b] = await Promise.all([
        A.challenge.accept(created.challengeId, "bob"),
        B.challenge.decline(created.challengeId, "bob"),
      ]);

      const outcomes = [a, b].filter((r) => r.ok);
      assert.equal(outcomes.length, 1, "exactly one of accept/decline actually took effect");

      const row = await admin.client.query("SELECT status FROM duel_challenge WHERE id=$1", [created.challengeId]);
      assert.ok(["ACCEPTED", "DECLINED"].includes(row.rows[0].status));

      const duelCount = await admin.client.query("SELECT count(*)::int c FROM duel WHERE pairing_key=$1", [`challenge:${created.challengeId}`]);
      assert.equal(duelCount.rows[0].c, row.rows[0].status === "ACCEPTED" ? 1 : 0, "a duel exists if and only if ACCEPTED won the race");

      const events = await admin.client.query(
        "SELECT event_type FROM duel_challenge_event WHERE challenge_id=$1 ORDER BY id", [created.challengeId]
      );
      assert.deepEqual(events.rows.map((r) => r.event_type), ["SENT", row.rows[0].status]);

      await A.client.end();
      await B.client.end();
    });

    test("DUPLICATE CHALLENGE under concurrency: two near-simultaneous sends to the same opponent/game create exactly one PENDING row", async () => {
      const A = await connection();
      const B = await connection();

      const [ra, rb] = await Promise.all([
        A.challenge.create({ gameId: "checkers", challengerId: "alice", opponentNickname: "bob" }),
        B.challenge.create({ gameId: "checkers", challengerId: "alice", opponentNickname: "bob" }),
      ]);

      const wins = [ra, rb].filter((r) => r.ok);
      const losses = [ra, rb].filter((r) => !r.ok);
      assert.equal(wins.length, 1, "exactly one of the two concurrent sends actually created a challenge");
      assert.equal(losses.length, 1);
      assert.equal(losses[0].reason, ChallengeError.ALREADY_PENDING);

      const count = await admin.client.query(
        `SELECT count(*)::int c FROM duel_challenge
          WHERE challenger_id='alice' AND opponent_id='bob' AND game_id='checkers' AND status='PENDING'`
      );
      assert.equal(count.rows[0].c, 1);

      await A.client.end();
      await B.client.end();
    });
  }
);
