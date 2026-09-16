/**
 * Rail health -- "Never fabricate health status. Health must come from real
 * system checks." Every test here proves the service reports what a real
 * check actually found (via an injected chain double, never a live
 * network call) rather than an assumption, and that an UNCONFIGURED check
 * reports UNKNOWN rather than a comforting default.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createHealthService, HealthStatus } from "../src/health.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  return db;
}

function chainThatPings(result) {
  return { async ping() { if (result.fail) throw new Error(result.fail); return { ok: true, latencyMs: result.latencyMs ?? 5, blockNumber: 100 }; } };
}

describe("the chain reachability check", () => {
  test("a healthy, fast chain reports OK", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 20 }) });
    const result = await health.checkRail("USDT", "TRON");
    const chainCheck = result.checks.find((c) => c.name === "CHAIN_REACHABLE");
    assert.equal(chainCheck.status, HealthStatus.OK);
    assert.equal(result.status, HealthStatus.OK);
  });

  test("a slow (but successful) chain response is DEGRADED, not silently OK", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 5000 }) });
    const result = await health.checkRail("USDT", "TRON");
    const chainCheck = result.checks.find((c) => c.name === "CHAIN_REACHABLE");
    assert.equal(chainCheck.status, HealthStatus.DEGRADED);
    assert.equal(result.status, HealthStatus.DEGRADED, "the worst individual check sets the overall status");
  });

  test("a genuinely unreachable chain is DOWN, with the real error recorded", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: chainThatPings({ fail: "ECONNREFUSED (simulated)" }) });
    const result = await health.checkRail("USDT", "TRON");
    const chainCheck = result.checks.find((c) => c.name === "CHAIN_REACHABLE");
    assert.equal(chainCheck.status, HealthStatus.DOWN);
    assert.match(chainCheck.detail, /ECONNREFUSED/);
    assert.equal(result.status, HealthStatus.DOWN);
  });

  test("NEVER FABRICATE: no chain reader configured reports UNKNOWN, never OK", async () => {
    const db = await fresh();
    const health = createHealthService({ db }); // no `chain` at all
    const result = await health.checkRail("USDT", "TRON");
    const chainCheck = result.checks.find((c) => c.name === "CHAIN_REACHABLE");
    assert.equal(chainCheck.status, HealthStatus.UNKNOWN);
    assert.notEqual(result.status, HealthStatus.OK, "the overall status must not claim health nothing actually verified");
  });

  test("a reader with no ping() method (an older or partial mock) is also UNKNOWN, not a crash", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: {} });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "CHAIN_REACHABLE").status, HealthStatus.UNKNOWN);
  });
});

describe("the solvency check", () => {
  const USDT = 1_000_000n;
  const u = (n) => (BigInt(n) * USDT).toString();

  test("custody covering liabilities is OK", async () => {
    const db = await fresh();
    await db.query("SELECT ledger_open_user_wallet('alice')");
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query(`SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(100) },
        { account: "user:alice:available", amount: "-" + u(100) },
      ]),
    ]);
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "SOLVENCY").status, HealthStatus.OK);
  });

  test("a genuine shortfall (custody < liabilities) is DOWN -- a real, not fabricated, finding", async () => {
    const db = await fresh();
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query("SELECT ledger_open_user_wallet('alice')");
    await db.query(`SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(100) },
        { account: "user:alice:available", amount: "-" + u(100) },
      ]),
    ]);
    // Simulate an impossible state directly, the same way reconciliation's
    // own tests do: drain custody without touching what is owed.
    await db.query(`SELECT ledger_post('drain','TEST_DRAIN','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: "-" + u(50) },
        { account: "platform:suspense", amount: u(50) },
      ]),
    ]);
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "SOLVENCY").status, HealthStatus.DOWN);
    assert.equal(result.status, HealthStatus.DOWN);
  });

  test("an asset with no ledger activity yet is UNKNOWN, not OK", async () => {
    const db = await fresh();
    // USDC stopped qualifying once 0055 seeded accounts for it; the case
    // under test is a coin with no ledger rows at all.
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("NO_LEDGER_COIN", "TRON");
    assert.equal(result.checks.find((c) => c.name === "SOLVENCY").status, HealthStatus.UNKNOWN);
  });
});

describe("the open-incidents check", () => {
  test("no open critical case is OK", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "OPEN_INCIDENTS").status, HealthStatus.OK);
  });

  test("an open CRITICAL reconciliation case pulls the whole rail DOWN", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO reconciliation_case (id, category, severity, status, subject_type, subject_id, detail)
       VALUES ('case-1','LEDGER_DRIFT','CRITICAL','OPEN','ledger_account','acct-1','{}'::jsonb)`
    );
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "OPEN_INCIDENTS").status, HealthStatus.DOWN);
    assert.equal(result.status, HealthStatus.DOWN);
  });

  test("a RESOLVED case (even a critical one) does not affect health", async () => {
    const db = await fresh();
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('admin-1','a@n','A',TRUE)");
    await db.query(
      `INSERT INTO reconciliation_case (id, category, severity, status, subject_type, subject_id, detail, resolved_by, resolved_at, resolution, resolution_note)
       VALUES ('case-2','LEDGER_DRIFT','CRITICAL','RESOLVED','ledger_account','acct-1','{}'::jsonb,'admin-1',now(),'RESOLVED','fixed')`
    );
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.equal(result.checks.find((c) => c.name === "OPEN_INCIDENTS").status, HealthStatus.OK);
  });
});

describe("checkRail() shape", () => {
  test("returns a timestamp and the full list of individual checks, not just the summary", async () => {
    const db = await fresh();
    const health = createHealthService({ db, chain: chainThatPings({ latencyMs: 10 }) });
    const result = await health.checkRail("USDT", "TRON");
    assert.ok(result.checkedAt);
    assert.ok(result.checks.length >= 3);
    for (const c of result.checks) {
      assert.ok(c.name);
      assert.ok(Object.values(HealthStatus).includes(c.status));
    }
  });
});
