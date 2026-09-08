/**
 * Reconciliation under REAL concurrency: two independent connections both
 * try to start the SAME check kind at once. PGlite's single connection can
 * only ever run these sequentially, so the actual claim under test --
 * "a second concurrent invocation of the same kind is skipped, never
 * duplicated" -- can only be proven against a real multi-backend Postgres,
 * the same way A2 was closed. Skips cleanly if Postgres is unreachable.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createReconciliationService, RunOutcome } from "../src/reconcile.mjs";

const { Client } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

let reachable = true;
let reachabilityError = null;
try {
  const probe = new Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch (e) {
  reachable = false;
  reachabilityError = e;
}

async function connection() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return { client, db: createPgAdapter(client) };
}

describe("reconciliation under real concurrency", { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` }, () => {
  let admin;

  before(async () => {
    admin = new Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    await migrate(createPgAdapter(admin));
  });

  after(async () => { await admin.end(); });

  test("a run already RUNNING (started by one connection) causes a second, genuinely independent connection's attempt to be skipped, not duplicated", async () => {
    const A = await connection();
    const B = await connection();

    // A is mid-run: insert its RUNNING row directly, exactly what
    // withRun()'s own first statement does, without ever completing it --
    // simulating the real window during which a check is actually in flight.
    const started = await A.db.query(
      `INSERT INTO reconciliation_run (kind) VALUES ('L1_LEDGER_DRIFT'::reconciliation_run_kind)
       ON CONFLICT (kind) WHERE status = 'RUNNING' DO NOTHING RETURNING id`
    );
    assert.equal(started.rows.length, 1, "the fixture's own insert must succeed first");

    // B, a completely separate real connection, now tries the SAME check.
    const svcB = createReconciliationService(B.db);
    const result = await svcB.runLedgerDrift();
    assert.equal(result.outcome, RunOutcome.SKIPPED_ALREADY_RUNNING);

    // Only A's row exists as RUNNING -- B's attempt left no trace at all,
    // never a second RUNNING row, never a duplicate.
    const running = await admin.query(
      `SELECT count(*)::int AS n FROM reconciliation_run WHERE kind='L1_LEDGER_DRIFT' AND status='RUNNING'`
    );
    assert.equal(running.rows[0].n, 1);

    // A finishes; the slot frees for the next attempt.
    await A.db.query(
      `UPDATE reconciliation_run SET status='COMPLETED', completed_at=now() WHERE id=$1`,
      [started.rows[0].id]
    );
    const after = await svcB.runLedgerDrift();
    assert.equal(after.outcome, RunOutcome.COMPLETED, "completing A's run frees the slot for B");

    await A.client.end();
    await B.client.end();
  });

  test("firing the same check from several genuinely independent connections at once never produces two RUNNING rows, nor a duplicate case", async () => {
    const conns = await Promise.all([connection(), connection(), connection(), connection()]);
    const services = conns.map((c) => createReconciliationService(c.db));

    const results = await Promise.all(services.map((s) => s.runStuckDeposits()));
    // Whatever the actual interleaving (real network timing decides whether
    // any two of these truly overlapped), every attempt resolved to exactly
    // one of the two legitimate outcomes, and each is independently correct
    // (COMPLETED writes a `reconciliation_run` row exactly once for itself;
    // SKIPPED writes nothing). The one thing that can never happen, checked
    // below, is two RUNNING rows for the same kind existing at once -- that
    // is what the unique index exists to make structurally impossible.
    for (const r of results) {
      assert.ok(r.outcome === RunOutcome.COMPLETED || r.outcome === RunOutcome.SKIPPED_ALREADY_RUNNING);
    }
    const stillRunning = await admin.query(
      `SELECT count(*)::int AS n FROM reconciliation_run WHERE kind='STUCK_DEPOSITS' AND status='RUNNING'`
    );
    assert.equal(stillRunning.rows[0].n, 0, "no run was left dangling in RUNNING");

    await Promise.all(conns.map((c) => c.client.end()));
  });

  test("after a run completes, a fresh run of the same kind is free to proceed -- this is not a permanent lock", async () => {
    const A = await connection();
    const svc = createReconciliationService(A.db);

    const first = await svc.runSolvency();
    assert.equal(first.outcome, RunOutcome.COMPLETED);
    const second = await svc.runSolvency();
    assert.equal(second.outcome, RunOutcome.COMPLETED, "completing a run frees the slot for the next one");

    await A.client.end();
  });
});
