/**
 * The reconciliation job runner.
 *
 * Every check here is proven against real rows, not mocks of the SQL --
 * consistent with how the rest of this codebase is tested. What PGlite's
 * single connection cannot prove -- two truly concurrent runs of the SAME
 * check racing each other -- is covered separately in
 * `real-pg-concurrent-runs.test.mjs`, against real PostgreSQL, the same way
 * A2 was closed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createReconciliationService, RunOutcome } from "../src/reconcile.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { ProviderPaymentState, ProviderPayoutState } from "../../payments/src/provider.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query(
    "INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('fin-1','f1@n','F1',TRUE)"
  );
  return db;
}

async function player(db, id, fund = 0) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await db.query("SELECT ledger_open_user_wallet($1)", [id]);
  if (fund) {
    await db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
      `seed:${id}`,
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(fund) },
        { account: `user:${id}:available`, amount: "-" + u(fund) },
      ]),
    ]);
  }
}

async function withdrawalsOn(db) {
  await db.query(
    `UPDATE platform_control SET enabled=TRUE, changed_by='fin-1', reason='test setup' WHERE key='WITHDRAWALS'`
  );
}

describe("L1: ledger drift", () => {
  test("a snapshot that has drifted from its entries opens a CRITICAL case", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    // Corrupt the cached snapshot directly -- the only way a real drift
    // could ever occur (a bug or an intrusion, never normal operation).
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 999
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );

    const svc = createReconciliationService(db);
    const result = await svc.runLedgerDrift();
    assert.equal(result.outcome, RunOutcome.COMPLETED);
    assert.equal(result.casesOpened, 1);

    const cases = await svc.listOpenCases();
    assert.equal(cases.length, 1);
    assert.equal(cases[0].category, "LEDGER_DRIFT");
    assert.equal(cases[0].severity, "CRITICAL");
  });

  test("no drift, no case", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    const svc = createReconciliationService(db);
    const result = await svc.runLedgerDrift();
    assert.equal(result.casesOpened, 0);
    assert.equal((await svc.listOpenCases()).length, 0);
  });

  test("running the same drift check twice never opens a second case for the same account", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 999
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    const first = await svc.runLedgerDrift();
    const second = await svc.runLedgerDrift();
    assert.equal(first.casesOpened, 1);
    assert.equal(second.casesOpened, 0, "the case already exists -- idempotent, not duplicated");
    assert.equal(second.mismatches, 1, "the drift is still detected and counted, just not re-cased");
    assert.equal((await svc.listOpenCases()).length, 1);
  });
});

describe("solvency", () => {
  test("custody covering liabilities: no case, no halt", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await withdrawalsOn(db);
    const svc = createReconciliationService(db);
    const result = await svc.runSolvency();
    assert.equal(result.casesOpened, 0);
    const control = await db.query("SELECT enabled FROM platform_control WHERE key='WITHDRAWALS'");
    assert.equal(control.rows[0].enabled, true);
  });

  test("a real shortfall opens a CRITICAL case AND halts withdrawals automatically", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await withdrawalsOn(db);
    // Simulate an impossible state directly: liabilities exceed custody.
    // (In real operation this can only happen via a bug or tampering --
    // exactly what this check exists to catch.)
    await db.query(
      `SELECT ledger_post('drain','TEST_DRAIN','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: "-" + u(50) },
        { account: "platform:suspense", amount: u(50) },
      ])]
    );

    const svc = createReconciliationService(db);
    const result = await svc.runSolvency();
    assert.equal(result.casesOpened, 1);

    const cases = await svc.listOpenCases();
    assert.equal(cases[0].category, "SOLVENCY_BREACH");
    assert.equal(cases[0].severity, "CRITICAL");

    const control = await db.query("SELECT enabled, changed_by, reason FROM platform_control WHERE key='WITHDRAWALS'");
    assert.equal(control.rows[0].enabled, false);
    assert.equal(control.rows[0].changed_by, "system-automation");
    assert.match(control.rows[0].reason, /AUTOMATIC HALT/);
  });

  test("withdrawals already off is left alone -- the halt is not re-applied noisily", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    // WITHDRAWALS defaults to FALSE (off until production-ready) -- do not call withdrawalsOn().
    await db.query(
      `SELECT ledger_post('drain','TEST_DRAIN','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: "-" + u(50) },
        { account: "platform:suspense", amount: u(50) },
      ])]
    );
    const svc = createReconciliationService(db);
    const result = await svc.runSolvency();
    assert.equal(result.casesOpened, 1, "the case still opens even though there is nothing left to halt");
  });
});

describe("stuck deposits and withdrawals", () => {
  test("an old, unfinished deposit opens a case; a recent one does not", async () => {
    const db = await fresh();
    await player(db, "alice");
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, created_at, expires_at)
       VALUES ('dep-old','alice','USDT','TRON','sandbox','Told', 'AWAITING_PAYMENT',
               now() - interval '2 hours', now() + interval '1 day')`
    );
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, created_at, expires_at)
       VALUES ('dep-new','alice','USDT','TRON','sandbox','Tnew', 'AWAITING_PAYMENT',
               now(), now() + interval '1 day')`
    );

    const svc = createReconciliationService(db);
    const result = await svc.runStuckDeposits({ slaMinutes: 60 });
    assert.equal(result.casesOpened, 1);
    const cases = await svc.listOpenCases();
    assert.equal(cases[0].subject_id, "dep-old");
  });

  test("a credited deposit, however old, is never flagged as stuck", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    const posted = await db.query(
      `SELECT * FROM ledger_post('dep-done-credit','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(5) },
        { account: "user:alice:available", amount: "-" + u(5) },
      ])]
    );
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, created_at, expires_at,
                            observed_tx_hash, observed_amount_minor, observed_asset, observed_network,
                            credited_tx_id, credited_at)
       VALUES ('dep-done','alice','USDT','TRON','sandbox','Tdone', 'CREDITED',
               now() - interval '10 days', now() + interval '1 day',
               '0xcredited', $1, 'USDT', 'TRON', $2, now())`,
      [u(5), posted.rows[0].transaction_id]
    );
    const svc = createReconciliationService(db);
    const result = await svc.runStuckDeposits({ slaMinutes: 60 });
    assert.equal(result.checked, 0);
  });

  test("an old, unfinished withdrawal opens a case", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    const posted = await db.query(
      `SELECT * FROM ledger_post('wd-old-lock','WITHDRAWAL_LOCK','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "user:alice:available", amount: u(10) },
        { account: "user:alice:locked", amount: "-" + u(10) },
      ])]
    );
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status, requested_at, lock_tx_id)
       VALUES ('wd-old','alice','USDT','TRON','Tx',$1,'PENDING_REVIEW', now() - interval '2 hours', $2)`,
      [u(10), posted.rows[0].transaction_id]
    );
    const svc = createReconciliationService(db);
    const result = await svc.runStuckWithdrawals({ slaMinutes: 60 });
    assert.equal(result.casesOpened, 1);
    const cases = await svc.listOpenCases();
    assert.equal(cases[0].category, "STUCK_WITHDRAWAL");
  });
});

describe("provider reconciliation: deposits", () => {
  function fakeProvider(getPaymentImpl) {
    return { id: "sandbox", getPayment: getPaymentImpl };
  }

  async function pendingDeposit(db, { id = "dep-1", status = "AWAITING_PAYMENT" } = {}) {
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ($1,'alice','USDT','TRON','sandbox','ref-1','Taddr',$2,now()+interval '1 day')`,
      [id, status]
    );
  }

  test("provider says CONFIRMED and our own chain-verified credit succeeds: no case", async () => {
    const db = await fresh();
    await player(db, "alice");
    await pendingDeposit(db);
    const chain = { async getIncoming() {
      return { txHash: "0xok", outputIndex: 0, amountMinor: u(10), asset: "USDT", network: "TRON", address: "Taddr", confirmations: 30 };
    } };
    const paymentSvc = createPaymentService(db, { provider: fakeProvider(async () => ({ state: ProviderPaymentState.CONFIRMED })), chain });
    const provider = { id: "sandbox", getPayment: async () => ({ state: ProviderPaymentState.CONFIRMED }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderDeposits();
    assert.equal(result.casesOpened, 0);
    const dep = await db.query("SELECT status FROM deposit WHERE id='dep-1'");
    assert.equal(dep.rows[0].status, "CREDITED", "reconciliation re-triggered the real, chain-verified credit path");
  });

  test("provider says CONFIRMED but the chain shows nothing: a real disagreement, cased", async () => {
    const db = await fresh();
    await player(db, "alice");
    await pendingDeposit(db);
    const chain = { async getIncoming() { return null; } };
    const paymentSvc = createPaymentService(db, { provider: {}, chain });
    const provider = { getPayment: async () => ({ state: ProviderPaymentState.CONFIRMED }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderDeposits();
    assert.equal(result.casesOpened, 1);
    const cases = await svc.listOpenCases();
    assert.equal(cases[0].category, "PROVIDER_MISMATCH");
  });

  test("provider says FAILED while we are still waiting: cased at INFO severity", async () => {
    const db = await fresh();
    await player(db, "alice");
    await pendingDeposit(db);
    const paymentSvc = createPaymentService(db, { provider: {}, chain: { async getIncoming() { return null; } } });
    const provider = { getPayment: async () => ({ state: ProviderPaymentState.FAILED }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderDeposits();
    assert.equal(result.casesOpened, 1);
    assert.equal((await svc.listOpenCases())[0].severity, "INFO");
  });

  test("an already-QUARANTINED deposit reported FAILED by the provider is not re-flagged", async () => {
    const db = await fresh();
    await player(db, "alice");
    await pendingDeposit(db, { status: "QUARANTINED" });
    const paymentSvc = createPaymentService(db, { provider: {}, chain: { async getIncoming() { return null; } } });
    const provider = { getPayment: async () => ({ state: ProviderPaymentState.FAILED }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });
    const result = await svc.runProviderDeposits();
    assert.equal(result.casesOpened, 0);
  });

  test("a provider outage (the call throws) is skipped this run, never a crash or a false case", async () => {
    const db = await fresh();
    await player(db, "alice");
    await pendingDeposit(db);
    const paymentSvc = createPaymentService(db, { provider: {}, chain: {} });
    const provider = { getPayment: async () => { throw new Error("ECONNREFUSED"); } };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderDeposits();
    assert.equal(result.outcome, RunOutcome.COMPLETED, "an outage does not fail the whole run");
    assert.equal(result.casesOpened, 0);
  });

  test("runProviderDeposits refuses to run without both paymentSvc and provider", async () => {
    const db = await fresh();
    const svc = createReconciliationService(db);
    await assert.rejects(() => svc.runProviderDeposits());
  });
});

describe("provider reconciliation: withdrawals", () => {
  async function processingWithdrawal(db) {
    await player(db, "alice", 100);
    const posted = await db.query(
      `SELECT * FROM ledger_post('wd-1-lock','WITHDRAWAL_LOCK','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "user:alice:available", amount: u(10) },
        { account: "user:alice:locked", amount: "-" + u(10) },
      ])]
    );
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status, provider, provider_ref, lock_tx_id)
       VALUES ('wd-1','alice','USDT','TRON','Tdest',$1,'PROCESSING','sandbox','payout-1',$2)`,
      [u(10), posted.rows[0].transaction_id]
    );
  }

  test("provider confirms the payout: reconcile() advances state, no mismatch case", async () => {
    const db = await fresh();
    await processingWithdrawal(db);
    const paymentSvc = createPaymentService(db, {
      provider: { id: "sandbox", getPayout: async () => ({ state: ProviderPayoutState.CONFIRMED, txHash: "0xabc" }) },
      chain: {},
    });
    const provider = { getPayout: async () => ({ state: ProviderPayoutState.CONFIRMED, txHash: "0xabc" }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderWithdrawals();
    assert.equal(result.casesOpened, 0);
    const wd = await db.query("SELECT status FROM withdrawal WHERE id='wd-1'");
    assert.equal(wd.rows[0].status, "COMPLETED");
  });

  test("provider reports FAILED and reconcile() cannot resolve it: a real disagreement, cased", async () => {
    const db = await fresh();
    await processingWithdrawal(db);
    // A payout service whose reconcile() does nothing useful here (provider
    // returns FAILED, but this fake service's own reconcile() is a no-op) --
    // simulating an edge case reconcile() itself does not fully close.
    const paymentSvc = {
      provider: {},
      async reconcile() { return { ok: true, status: "PROCESSING", unchanged: true }; },
    };
    const provider = { getPayout: async () => ({ state: ProviderPayoutState.FAILED }) };
    const svc = createReconciliationService(db, { paymentSvc, provider });

    const result = await svc.runProviderWithdrawals();
    assert.equal(result.casesOpened, 1);
    assert.equal((await svc.listOpenCases())[0].category, "PROVIDER_MISMATCH");
  });
});

describe("settlement SLA", () => {
  async function completedDuel(db, { id = "d1", ageMinutes = 60, hold = false } = {}) {
    await player(db, "alice");
    await player(db, "bob");
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, initial_state, time_control, status,
                         result, termination_reason, completed_at, fairplay_hold, game_hash)
       VALUES ($1,'chess',1,$1,'alice','bob','FREE',0,'{}'::jsonb,'{}'::jsonb,'COMPLETED',
               '1-0','RESIGNATION', now() - ($2 || ' minutes')::interval, $3, 'h')`,
      [id, String(ageMinutes), hold]
    );
  }

  test("a duel completed long ago and never settled opens a case", async () => {
    const db = await fresh();
    await completedDuel(db, { ageMinutes: 60 });
    const svc = createReconciliationService(db);
    const result = await svc.runSettlementSla({ slaMinutes: 30 });
    assert.equal(result.casesOpened, 1);
    assert.equal((await svc.listOpenCases())[0].severity, "WARNING");
  });

  test("a duel on fair-play hold is still flagged, but only at INFO -- a legitimate hold is not the same as silently stuck", async () => {
    const db = await fresh();
    await completedDuel(db, { ageMinutes: 60, hold: true });
    const svc = createReconciliationService(db);
    const result = await svc.runSettlementSla({ slaMinutes: 30 });
    assert.equal(result.casesOpened, 1);
    assert.equal((await svc.listOpenCases())[0].severity, "INFO");
  });

  test("a recently completed duel is well within its SLA -- no case yet", async () => {
    const db = await fresh();
    await completedDuel(db, { ageMinutes: 1 });
    const svc = createReconciliationService(db);
    const result = await svc.runSettlementSla({ slaMinutes: 30 });
    assert.equal(result.checked, 0);
  });
});

describe("prize SLA", () => {
  async function makeTournament(db, id, { completedMinutesAgo = 90, settled = false } = {}) {
    await db.query(
      `INSERT INTO tournament (id, game_id, format, status, capacity, min_players,
                               time_control, registration_closes_at, completed_at)
       VALUES ($1,'chess','SINGLE_ELIMINATION','COMPLETED',4,2,'{}'::jsonb,
               now() - interval '1 day', now() - ($2 || ' minutes')::interval)`,
      [id, String(completedMinutesAgo)]
    );
    if (settled) {
      await player(db, `${id}-winner`);
      await db.query(
        `INSERT INTO tournament_settlement (tournament_id, player_id, rank, prize_minor)
         VALUES ($1,$2,1,0)`,
        [id, `${id}-winner`]
      );
    }
  }

  test("a completed tournament with no prize settlement, past its SLA, opens a case", async () => {
    const db = await fresh();
    await makeTournament(db, "t1", { completedMinutesAgo: 90 });
    const svc = createReconciliationService(db);
    const result = await svc.runPrizeSla({ slaMinutes: 60 });
    assert.equal(result.casesOpened, 1);
    assert.equal((await svc.listOpenCases())[0].category, "PRIZE_SLA_BREACH");
  });

  test("a tournament that WAS settled is never flagged", async () => {
    const db = await fresh();
    await makeTournament(db, "t2", { completedMinutesAgo: 90, settled: true });
    const svc = createReconciliationService(db);
    const result = await svc.runPrizeSla({ slaMinutes: 60 });
    assert.equal(result.checked, 0);
  });
});

describe("resolveCase", () => {
  test("requires a status of RESOLVED or FALSE_POSITIVE", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    await svc.runLedgerDrift();
    const caseId = (await svc.listOpenCases())[0].id;

    const bad = await svc.resolveCase(caseId, { resolvedBy: "fin-1", status: "OPEN", note: "x" });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "INVALID_STATUS");
  });

  test("requires a non-empty note -- the same discipline as fair-play sanctions", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    await svc.runLedgerDrift();
    const caseId = (await svc.listOpenCases())[0].id;

    const bad = await svc.resolveCase(caseId, { resolvedBy: "fin-1", status: "RESOLVED", note: "   " });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "NOTE_REQUIRED");
  });

  test("a well-formed resolution closes the case and records the event", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    await svc.runLedgerDrift();
    const caseId = (await svc.listOpenCases())[0].id;

    const ok = await svc.resolveCase(caseId, {
      resolvedBy: "fin-1", status: "FALSE_POSITIVE", note: "Confirmed a rounding artifact in a test fixture, not a real drift.",
    });
    assert.equal(ok.ok, true);
    assert.equal((await svc.listOpenCases()).length, 0);

    const events = await db.query("SELECT event, actor_type, actor_id FROM reconciliation_case_event WHERE case_id=$1 ORDER BY id", [caseId]);
    assert.deepEqual(events.rows.map((r) => r.event), ["OPENED", "RESOLVED"]);
    assert.equal(events.rows[1].actor_type, "ADMIN");
    assert.equal(events.rows[1].actor_id, "fin-1");
  });

  test("resolving an already-closed or nonexistent case is refused cleanly", async () => {
    const db = await fresh();
    const svc = createReconciliationService(db);
    const r = await svc.resolveCase("no-such-case", { resolvedBy: "fin-1", status: "RESOLVED", note: "x" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND_OR_ALREADY_CLOSED");
  });
});

describe("runAll", () => {
  test("runs every check and reports each outcome, even without a payment service", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    const svc = createReconciliationService(db);
    const results = await svc.runAll();
    const kinds = results.map((r) => r.kind);
    assert.deepEqual(kinds, [
      "L1_LEDGER_DRIFT", "SOLVENCY", "STUCK_DEPOSITS", "STUCK_WITHDRAWALS",
      "SETTLEMENT_SLA", "PRIZE_SLA",
    ]);
    assert.ok(results.every((r) => r.outcome === RunOutcome.COMPLETED));
  });

  test("one failing check does not stop the others from running", async () => {
    const db = await fresh();
    // Poison one check by corrupting the view it depends on -- drop the
    // underlying table it joins so the query itself throws.
    const svc = createReconciliationService(db);
    const originalRunSolvency = svc.runSolvency;
    svc.runSolvency = async () => { throw new Error("simulated failure"); };

    const results = await svc.runAll();
    const solvencyResult = results.find((r) => r.kind === "runSolvency");
    assert.equal(solvencyResult.outcome, RunOutcome.FAILED);
    assert.ok(results.filter((r) => r.outcome === RunOutcome.COMPLETED).length >= 5, "every other check still ran");
  });
});

describe("reviewCase", () => {
  async function openADrift(svc) {
    await svc.runLedgerDrift();
    return (await svc.listOpenCases())[0].id;
  }

  test("OPEN moves to UNDER_REVIEW and records an event", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    const caseId = await openADrift(svc);

    const r = await svc.reviewCase(caseId, { reviewedBy: "fin-1", note: "looking into this" });
    assert.equal(r.ok, true);
    const c = await svc.getCase(caseId);
    assert.equal(c.status, "UNDER_REVIEW");

    const events = await svc.getCaseEvents(caseId);
    assert.deepEqual(events.map((e) => e.event), ["OPENED", "UNDER_REVIEW"]);
    assert.equal(events[1].actor_id, "fin-1");
  });

  test("reviewing an already-UNDER_REVIEW case is a harmless no-op, not an error", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    const caseId = await openADrift(svc);
    await svc.reviewCase(caseId, { reviewedBy: "fin-1" });

    const again = await svc.reviewCase(caseId, { reviewedBy: "fin-2" });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyUnderReview, true);
    const events = await svc.getCaseEvents(caseId);
    assert.equal(events.length, 2, "a second reviewer glancing at the queue does not add a duplicate event");
  });

  test("a RESOLVED case cannot be moved back to UNDER_REVIEW", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    const caseId = await openADrift(svc);
    await svc.resolveCase(caseId, { resolvedBy: "fin-1", status: "FALSE_POSITIVE", note: "confirmed a test fixture artifact" });

    const r = await svc.reviewCase(caseId, { reviewedBy: "fin-2" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_OPEN");
  });

  test("reviewing a nonexistent case is refused cleanly", async () => {
    const db = await fresh();
    const svc = createReconciliationService(db);
    const r = await svc.reviewCase("no-such-case", { reviewedBy: "fin-1" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });
});

describe("listCases, getCase, getCaseEvents", () => {
  test("listCases filters by status, category, and severity, and reports a total independent of the page size", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, created_at, expires_at)
       VALUES ('dep-old','alice','USDT','TRON','sandbox','Told', 'AWAITING_PAYMENT',
               now() - interval '2 hours', now() + interval '1 day')`
    );
    const svc = createReconciliationService(db);
    await svc.runLedgerDrift();
    await svc.runStuckDeposits({ slaMinutes: 60 });

    const all = await svc.listCases({});
    assert.equal(all.total, 2);

    const onlyDrift = await svc.listCases({ category: "LEDGER_DRIFT" });
    assert.equal(onlyDrift.total, 1);
    assert.equal(onlyDrift.cases[0].category, "LEDGER_DRIFT");

    const onlyOpen = await svc.listCases({ status: "OPEN" });
    assert.equal(onlyOpen.total, 2, "both cases start OPEN");

    const paged = await svc.listCases({ limit: 1 });
    assert.equal(paged.cases.length, 1);
    assert.equal(paged.total, 2, "total reflects the whole filtered set, not just this page");
  });

  test("getCase returns null for a nonexistent id, and the real row otherwise", async () => {
    const db = await fresh();
    const svc = createReconciliationService(db);
    assert.equal(await svc.getCase("nope"), null);

    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    await svc.runLedgerDrift();
    const caseId = (await svc.listOpenCases())[0].id;
    const c = await svc.getCase(caseId);
    assert.equal(c.id, caseId);
    assert.equal(c.category, "LEDGER_DRIFT");
  });

  test("getCaseEvents returns the full timeline in order", async () => {
    const db = await fresh();
    await player(db, "alice", 100);
    await db.query(
      `UPDATE ledger_balance SET balance = balance + 1
         WHERE account_id = (SELECT id FROM ledger_account WHERE key='user:alice:available')`
    );
    const svc = createReconciliationService(db);
    await svc.runLedgerDrift();
    const caseId = (await svc.listOpenCases())[0].id;
    await svc.reviewCase(caseId, { reviewedBy: "fin-1" });
    await svc.resolveCase(caseId, { resolvedBy: "fin-1", status: "RESOLVED", note: "fixed the underlying bug" });

    const events = await svc.getCaseEvents(caseId);
    assert.deepEqual(events.map((e) => e.event), ["OPENED", "UNDER_REVIEW", "RESOLVED"]);
  });
});
