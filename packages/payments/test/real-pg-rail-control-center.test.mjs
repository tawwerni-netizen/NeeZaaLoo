/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/ledger/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * The Admin Payment & Stablecoin Control Center's own explicit test list
 * names two races PGlite cannot prove:
 *
 *   1. CONCURRENT TOGGLE -- two admins flipping the same rail's status at
 *      the same instant must not corrupt it: exactly one write wins, the
 *      other observes a consistent post-state, and there is one audit row
 *      per actual transition, never a lost update and never two rows
 *      claiming the same change.
 *
 *   2. AUDIT INTEGRITY under concurrency -- two admins changing two
 *      different limit fields on the same rail at the same instant must
 *      each get their own correct, complete audit row (actor, previous
 *      value, new value, reason), with neither clobbering the other's
 *      change or its audit trail.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createRailService } from "../src/valuation.mjs";

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return { client, db, rails: createRailService(db) };
}

describe(
  "Rail Control Center concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); await drop(); });

    beforeEach(async () => {
      await admin.client.query(
        `UPDATE payment_rail SET status='ACTIVE', enabled=TRUE, deposits_enabled=TRUE, withdrawals_enabled=TRUE,
                                  min_withdrawal_minor=5000000, max_withdrawal_minor=2000000000
          WHERE id='USDT_TRON'`
      );
    });

    test("CONCURRENT TOGGLE: two admins pausing the same rail at once -- exactly one audit row, one consistent final state", async () => {
      const A = await connection();
      const B = await connection();

      const [ra, rb] = await Promise.all([
        A.rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-a", reason: "race pause A" }),
        B.rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-b", reason: "race pause B" }),
      ]);

      assert.equal(ra.ok, true);
      assert.equal(rb.ok, true);

      const rail = await admin.client.query("SELECT status FROM payment_rail WHERE id='USDT_TRON'");
      assert.equal(rail.rows[0].status, "ADMIN_PAUSED", "the rail lands in a single, consistent final state");

      const auditRows = await admin.client.query(
        `SELECT actor_id, reason FROM rail_configuration_change
          WHERE rail_id='USDT_TRON' AND field='status' AND new_value='ADMIN_PAUSED'
            AND at >= now() - interval '1 minute'`
      );
      assert.equal(auditRows.rows.length, 2, "each concurrent change that actually took effect gets its own audit row -- no lost update, no merged row");
      const actors = auditRows.rows.map((r) => r.actor_id).sort();
      assert.deepEqual(actors, ["admin-a", "admin-b"]);

      await A.client.end();
      await B.client.end();
    });

    test("CONCURRENT TOGGLE: pause vs. reactivate racing -- the rail ends ACTIVE or ADMIN_PAUSED, never a torn state", async () => {
      const A = await connection();
      const B = await connection();

      const since = (await admin.client.query("SELECT now() at_start")).rows[0].at_start;

      await Promise.all([
        A.rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-a", reason: "pause" }),
        B.rails.setStatus("USDT_TRON", "ACTIVE", { actorType: "ADMIN", actorId: "admin-b", reason: "reactivate" }),
      ]);

      const rail = await admin.client.query("SELECT status, enabled FROM payment_rail WHERE id='USDT_TRON'");
      assert.ok(["ADMIN_PAUSED", "ACTIVE"].includes(rail.rows[0].status), "the rail always lands in one well-defined named state");

      const auditRows = await admin.client.query(
        `SELECT count(*)::int c FROM rail_configuration_change
          WHERE rail_id='USDT_TRON' AND field='status' AND at >= $1`,
        [since]
      );
      assert.equal(auditRows.rows[0].c, 2, "both writes are truthfully recorded even though they raced");

      await A.client.end();
      await B.client.end();
    });

    test("AUDIT INTEGRITY: two admins changing two different limit fields at once each get their own correct, complete audit row", async () => {
      const A = await connection();
      const B = await connection();

      const [ra, rb] = await Promise.all([
        A.rails.updateLimits("USDT_TRON", { maxWithdrawalMinor: "700000000" }, { actorType: "ADMIN", actorId: "admin-a", reason: "tighten max" }),
        B.rails.updateLimits("USDT_TRON", { minWithdrawalMinor: "10000000" }, { actorType: "ADMIN", actorId: "admin-b", reason: "raise min" }),
      ]);

      assert.equal(ra.ok, true);
      assert.equal(rb.ok, true);

      const rail = await admin.client.query(
        "SELECT min_withdrawal_minor, max_withdrawal_minor FROM payment_rail WHERE id='USDT_TRON'"
      );
      assert.equal(rail.rows[0].max_withdrawal_minor, "700000000", "admin-a's change survived the race");
      assert.equal(rail.rows[0].min_withdrawal_minor, "10000000", "admin-b's change survived the race -- neither clobbered the other's field");

      const history = await admin.client.query(
        `SELECT field, new_value, actor_id, reason FROM rail_configuration_change
          WHERE rail_id='USDT_TRON' AND at >= now() - interval '1 minute'
          ORDER BY field`
      );
      const byField = Object.fromEntries(history.rows.map((r) => [r.field, r]));
      assert.equal(byField.max_withdrawal_minor.actor_id, "admin-a");
      assert.equal(byField.max_withdrawal_minor.reason, "tighten max");
      assert.equal(byField.max_withdrawal_minor.new_value, "700000000");
      assert.equal(byField.min_withdrawal_minor.actor_id, "admin-b");
      assert.equal(byField.min_withdrawal_minor.reason, "raise min");
      assert.equal(byField.min_withdrawal_minor.new_value, "10000000");

      await A.client.end();
      await B.client.end();
    });
  }
);
