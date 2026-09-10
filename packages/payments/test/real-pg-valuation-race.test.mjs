/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/ledger/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * Two races the Financial Architecture Reconciliation names explicitly:
 *
 *   1. VALUATION SNAPSHOT -- two independent observations of the same
 *      asset's rate landing at the same moment must both be recorded (each
 *      is a genuine, distinct data point -- neither is a duplicate of the
 *      other), and valuation_current() must resolve to a single, sane
 *      answer afterward rather than an ambiguous or corrupted one.
 *
 *   2. RAIL PAUSE RACE -- two concurrent DEPEGGED observations for the same
 *      asset must pause every affected rail EXACTLY ONCE, never twice, and
 *      never leave a rail half-transitioned.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createValuationService, createRailService } from "../src/valuation.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return { client, db, valuation: createValuationService(db), rails: createRailService(db) };
}

describe(
  "Valuation snapshot and rail pause races, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); await drop(); });

    test("1. VALUATION SNAPSHOT: two concurrent observations for the same asset both persist as distinct, complete rows", async () => {
      const A = await connection();
      const B = await connection();

      const now = new Date().toISOString();
      const [ra, rb] = await Promise.all([
        A.valuation.record({ asset: "USDT", usdRateX1e8: 100_010_000, source: "MANUAL", observedAt: now, createdBy: "admin-a", reason: "race observation A" }),
        B.valuation.record({ asset: "USDT", usdRateX1e8: 100_020_000, source: "MANUAL", observedAt: now, createdBy: "admin-b", reason: "race observation B" }),
      ]);

      assert.notEqual(ra.snapshotId, rb.snapshotId, "two genuinely distinct observations, neither overwrote the other");
      assert.equal(ra.status, "NOMINAL");
      assert.equal(rb.status, "NOMINAL");

      const rows = await admin.client.query(
        "SELECT count(*)::int c FROM valuation_snapshot WHERE id = ANY($1)", [[ra.snapshotId, rb.snapshotId]]
      );
      assert.equal(rows.rows[0].c, 2, "both rows genuinely exist, not one clobbering the other");

      const current = await admin.valuation.current("USDT");
      assert.ok(current, "there is always a well-defined current valuation after concurrent writes");
      assert.ok(
        [ra.snapshotId, rb.snapshotId].includes(current.id),
        "current() resolves to one of the two just-recorded rows, not the stale launch snapshot"
      );

      await A.client.end();
      await B.client.end();
    });

    test("2. RAIL PAUSE RACE: two concurrent DEPEGGED observations pause the rail EXACTLY ONCE", async () => {
      // Reset to a known ACTIVE state in case an earlier test in this file
      // already paused it.
      await admin.client.query(
        `UPDATE payment_rail SET status='ACTIVE', deposits_enabled=TRUE, withdrawals_enabled=TRUE WHERE id='USDT_TRON'`
      );

      const A = await connection();
      const B = await connection();

      const now = new Date().toISOString();
      const [ra, rb] = await Promise.all([
        A.valuation.record({ asset: "USDT", usdRateX1e8: 85_000_000, source: "MANUAL", observedAt: now, createdBy: "admin-a", reason: "depeg race A" }),
        B.valuation.record({ asset: "USDT", usdRateX1e8: 84_000_000, source: "MANUAL", observedAt: now, createdBy: "admin-b", reason: "depeg race B" }),
      ]);

      assert.equal(ra.status, "DEPEGGED");
      assert.equal(rb.status, "DEPEGGED");

      // The two calls' railsPaused counts must sum to exactly 1 across the
      // pair: whichever commits first does the real transition (reports 1),
      // the other finds the rail already RISK_PAUSED and does nothing
      // (reports 0) -- never both reporting 1, which would mean the rail
      // was "paused" twice, and never both reporting 0, which would mean
      // neither actually paused it.
      assert.equal(ra.railsPaused + rb.railsPaused, 1,
        "exactly one of the two concurrent depeg observations performed the real transition");

      const rail = await admin.client.query("SELECT status, deposits_enabled FROM payment_rail WHERE id='USDT_TRON'");
      assert.equal(rail.rows[0].status, "RISK_PAUSED");
      assert.equal(rail.rows[0].deposits_enabled, false);

      const auditRows = await admin.client.query(
        `SELECT count(*)::int c FROM rail_configuration_change
          WHERE rail_id='USDT_TRON' AND new_value='RISK_PAUSED'
            AND at >= now() - interval '1 minute'`
      );
      assert.equal(auditRows.rows[0].c, 1, "exactly one audit row for the one real pause transition");

      await A.client.end();
      await B.client.end();
    });
  }
);
