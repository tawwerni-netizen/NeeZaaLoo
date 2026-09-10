/**
 * Real PostgreSQL, multiple independent connections, genuine concurrency --
 * see packages/ledger/test/real-pg-concurrency.test.mjs's own header for
 * why this matters and PGlite cannot substitute for it: a single
 * connection can never race two operations against each other.
 *
 * This file exists because that exact gap was found in
 * email-challenge.mjs's verify(): the original SELECT-then-UPDATE
 * consumption step had no re-check of `used_at IS NULL` inside the
 * UPDATE's own WHERE clause, so two genuinely concurrent verify() calls
 * against two separate Postgres backends could both read the challenge as
 * still-active before either committed its consumption. Fixed with an
 * atomic compare-and-swap (this codebase's own established idiom for
 * exactly this class of problem); this file is the evidence that fix
 * actually holds under real concurrency, not just under PGlite's
 * single-connection serialization (which cannot exhibit the race in the
 * first place, and so cannot prove its absence either).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createEmailChallengeService, ChallengePurpose } from "../src/email-challenge.mjs";

const { Client } = pg;

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

async function connection() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return { client, db: createPgAdapter(client) };
}

async function closeAll(...conns) {
  await Promise.all(conns.map((c) => c.client.end()));
}

describe(
  "email_challenge.verify() under real concurrent consumption",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = new Client({ connectionString: TEST_DATABASE_URL });
      await admin.connect();
      await migrate(createPgAdapter(admin));
    });

    after(async () => { await admin.end(); await drop(); });

    test("exactly one of two simultaneous verify() calls, on two separate connections, succeeds", async () => {
      const playerId = `r${randomUUID().replace(/-/g, "").slice(0, 15)}`;
      await admin.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const A = await connection();
      const B = await connection();
      const issuer = createEmailChallengeService(A.db);
      const issued = await issuer.issue({
        playerId, purpose: ChallengePurpose.VERIFICATION, email: "race@example.com", ttlMs: 600_000,
      });
      assert.equal(issued.ok, true);

      const challengeA = createEmailChallengeService(A.db);
      const challengeB = createEmailChallengeService(B.db);
      const [ra, rb] = await Promise.all([
        challengeA.verify({ playerId, purpose: ChallengePurpose.VERIFICATION, code: issued.code }),
        challengeB.verify({ playerId, purpose: ChallengePurpose.VERIFICATION, code: issued.code }),
      ]);

      const succeeded = [ra, rb].filter((r) => r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success, got ${JSON.stringify([ra, rb])}`);

      const rows = await admin.query(
        "SELECT used_at FROM email_challenge WHERE player_id = $1", [playerId]
      );
      assert.equal(rows.rows.length, 1, "no double row, no double state");
      assert.ok(rows.rows[0].used_at, "the row IS consumed -- by exactly one of the two callers");

      await closeAll(A, B);
    });

    test("many (10) simultaneous verify() attempts against the same code: still exactly one winner", async () => {
      const playerId = `r${randomUUID().replace(/-/g, "").slice(0, 15)}`;
      await admin.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const issuerConn = await connection();
      const issuer = createEmailChallengeService(issuerConn.db);
      const issued = await issuer.issue({
        playerId, purpose: ChallengePurpose.LOGIN_CODE, email: "race2@example.com", ttlMs: 600_000, codeLength: 6,
      });

      const conns = await Promise.all(Array.from({ length: 10 }, () => connection()));
      const results = await Promise.all(
        conns.map((c) => createEmailChallengeService(c.db).verify({
          playerId, purpose: ChallengePurpose.LOGIN_CODE, code: issued.code,
        }))
      );
      assert.equal(results.filter((r) => r.ok).length, 1, `expected exactly one winner among 10, got ${JSON.stringify(results)}`);

      await closeAll(issuerConn, ...conns);
    });
  }
);
