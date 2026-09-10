/**
 * Stablecoin USD valuation and the payment rail it can pause
 * (db/migrations/0037_stablecoin_valuation.sql, 0038_payment_rail.sql).
 *
 * The claim under test: a depeg beyond the configured tolerance is NEVER
 * silently absorbed -- it moves the rail into a risk-paused state, according
 * to that rail's own configuration, in the same atomic step that records the
 * observation. A nominal observation never touches a rail at all.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createValuationService, createRailService } from "../src/valuation.mjs";
import { createPaymentService, DepositError, WithdrawalError } from "../src/payments.mjs";
import { createSandboxProvider } from "../src/provider.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  return { db, valuation: createValuationService(db), rails: createRailService(db) };
}

describe("record_valuation_snapshot()", () => {
  test("a nominal observation (within tolerance) never touches any rail", async () => {
    const { db, valuation } = await fresh();
    const res = await valuation.record({
      asset: "USDT", usdRateX1e8: 100_050_000, source: "MANUAL",
      observedAt: new Date().toISOString(), createdBy: "admin-1", reason: "routine check",
    });
    assert.equal(res.status, "NOMINAL");
    assert.equal(res.railsPaused, 0);
    const rail = await db.query("SELECT status, deposits_enabled FROM payment_rail WHERE id='USDT_TRON'");
    assert.equal(rail.rows[0].status, "ACTIVE");
    assert.equal(rail.rows[0].deposits_enabled, true);
  });

  test("a depeg beyond the configured tolerance risk-pauses every ACTIVE rail for that asset", async () => {
    const { db, valuation } = await fresh();
    // Default tolerance is 100 bps (1%). 0.90 USD is a 10% deviation.
    const res = await valuation.record({
      asset: "USDT", usdRateX1e8: 90_000_000, source: "MANUAL",
      observedAt: new Date().toISOString(), createdBy: "admin-1", reason: "observed depeg",
    });
    assert.equal(res.status, "DEPEGGED");
    assert.equal(res.railsPaused, 1);

    const rail = await db.query("SELECT status, deposits_enabled, withdrawals_enabled FROM payment_rail WHERE id='USDT_TRON'");
    assert.equal(rail.rows[0].status, "RISK_PAUSED");
    assert.equal(rail.rows[0].deposits_enabled, false, "deposits always pause on a depeg");
    assert.equal(rail.rows[0].withdrawals_enabled, true,
      "withdrawals stay open by default -- users can always exit a depegging asset");

    const enabled = await db.query(
      "SELECT rail_enabled_for('USDT','TRON','DEPOSIT') AS d, rail_enabled_for('USDT','TRON','WITHDRAWAL') AS w"
    );
    assert.equal(enabled.rows[0].d, false);
    assert.equal(enabled.rows[0].w, true);
  });

  test("pause_withdrawals_on_depeg = TRUE also pauses withdrawals on that specific rail", async () => {
    const { db, valuation } = await fresh();
    await db.query("UPDATE payment_rail SET pause_withdrawals_on_depeg = TRUE WHERE id='USDT_TRON'");
    const res = await valuation.record({
      asset: "USDT", usdRateX1e8: 80_000_000, source: "MANUAL",
      observedAt: new Date().toISOString(), createdBy: "admin-1", reason: "severe depeg",
    });
    assert.equal(res.status, "DEPEGGED");
    const rail = await db.query("SELECT withdrawals_enabled FROM payment_rail WHERE id='USDT_TRON'");
    assert.equal(rail.rows[0].withdrawals_enabled, false);
  });

  test("calling record() again while already RISK_PAUSED does not double-pause or double-audit", async () => {
    const { db, valuation, rails } = await fresh();
    await valuation.record({ asset: "USDT", usdRateX1e8: 80_000_000, source: "MANUAL", observedAt: new Date().toISOString(), createdBy: "a", reason: "r1" });
    const second = await valuation.record({ asset: "USDT", usdRateX1e8: 79_000_000, source: "MANUAL", observedAt: new Date().toISOString(), createdBy: "a", reason: "r2" });
    assert.equal(second.status, "DEPEGGED");
    assert.equal(second.railsPaused, 0, "already paused -- the UPDATE matches nothing the second time");

    const history = await rails.history("USDT_TRON");
    const pauseEvents = history.filter((h) => h.new_value === "RISK_PAUSED");
    assert.equal(pauseEvents.length, 1, "exactly one audit row for the one real transition");
  });

  test("a MANUAL source without an actor and a reason is refused", async () => {
    const { valuation } = await fresh();
    await assert.rejects(
      () => valuation.record({ asset: "USDT", usdRateX1e8: 100_000_000, source: "MANUAL", observedAt: new Date().toISOString() }),
      /valuation_manual_is_accountable|violates check constraint/
    );
  });

  test("asset_is_depegged() / valuation_current() reflect the latest observation", async () => {
    const { valuation } = await fresh();
    assert.equal(await valuation.isDepegged("USDT"), false, "the launch peg-assumed snapshot is nominal");
    await valuation.record({ asset: "USDT", usdRateX1e8: 90_000_000, source: "MANUAL", observedAt: new Date().toISOString(), createdBy: "a", reason: "r" });
    assert.equal(await valuation.isDepegged("USDT"), true);
    const current = await valuation.current("USDT");
    assert.equal(Number(current.usd_rate_x1e8), 90_000_000);
  });

  test("valuation_snapshot is append-only", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query("UPDATE valuation_snapshot SET usd_rate_x1e8 = 1 WHERE id = 1"),
      /append-only/
    );
  });
});

describe("an admin can flip a rail explicitly, audited", () => {
  test("set_rail_status requires an actor and a reason for an ADMIN change", async () => {
    const { rails } = await fresh();
    const res = await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", reason: undefined });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "REASON_REQUIRED");
  });

  test("a paused rail is reflected by rail_enabled_for() immediately", async () => {
    const { rails } = await fresh();
    await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-1", reason: "scheduled maintenance" });
    assert.equal(await rails.enabledFor("USDT", "TRON", "DEPOSIT"), false);
    assert.equal(await rails.enabledFor("USDT", "TRON", "WITHDRAWAL"), false);
  });
});

describe("the rail model actually gates the live deposit/withdrawal paths", () => {
  async function fundedDb() {
    const { db } = await fresh();
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query("SELECT ledger_open_user_wallet('alice')");
    await db.query(
      `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('fin-1','f1@n','F1',TRUE)`
    );
    // DEPOSITS/WITHDRAWALS default OFF (0006_admin_rbac_and_controls.sql) --
    // these tests are about the per-rail switch, not the global one, so the
    // global switch is turned on the same way payments.test.mjs's own
    // fixture does.
    await db.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='fin-1', reason='test setup' WHERE key IN ('DEPOSITS','WITHDRAWALS')`
    );
    await db.query(
      `SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(1000) },
        { account: "user:alice:available", amount: "-" + u(1000) },
      ])]
    );
    return db;
  }

  test("a rail with deposits disabled refuses a new deposit intent", async () => {
    const db = await fundedDb();
    await db.query("UPDATE payment_rail SET deposits_enabled = FALSE WHERE id='USDT_TRON'");
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: { async verifyIncoming() { return { outcome: "NOT_FOUND" }; } } });
    const res = await svc.createDeposit({ playerId: "alice" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, DepositError.CONTROL_DISABLED);
  });

  test("a rail with withdrawals disabled refuses a new withdrawal request, but deposits are unaffected", async () => {
    const db = await fundedDb();
    await db.query("UPDATE payment_rail SET withdrawals_enabled = FALSE WHERE id='USDT_TRON'");
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: { async verifyIncoming() { return { outcome: "NOT_FOUND" }; } } });

    const dep = await svc.createDeposit({ playerId: "alice" });
    assert.equal(dep.ok, true, "deposits are a separate switch from withdrawals");

    const addr = "T" + "9".repeat(33);
    await svc.addPayoutAddress({ playerId: "alice", address: addr });
    await db.query(`UPDATE payout_address SET added_at = now() - interval '48 hours', usable_from = now() - interval '24 hours'`);
    const wd = await svc.request({ playerId: "alice", destination: addr, amountMinor: u(10), authorised: true });
    assert.equal(wd.ok, false);
    assert.equal(wd.reason, WithdrawalError.CONTROL_DISABLED);
  });

  test("a withdrawal above the rail's configured maximum is refused", async () => {
    const db = await fundedDb();
    await db.query("UPDATE payment_rail SET max_withdrawal_minor = $1 WHERE id='USDT_TRON'", [u(50)]);
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: { async verifyIncoming() { return { outcome: "NOT_FOUND" }; } } });
    const addr = "T" + "9".repeat(33);
    await svc.addPayoutAddress({ playerId: "alice", address: addr });
    await db.query(`UPDATE payout_address SET added_at = now() - interval '48 hours', usable_from = now() - interval '24 hours'`);
    const wd = await svc.request({ playerId: "alice", destination: addr, amountMinor: u(100), authorised: true });
    assert.equal(wd.reason, WithdrawalError.ABOVE_MAXIMUM);
  });

  test("a depeg's rail pause flows all the way through to a refused deposit", async () => {
    const db = await fundedDb();
    const valuation = createValuationService(db);
    await valuation.record({ asset: "USDT", usdRateX1e8: 90_000_000, source: "MANUAL", observedAt: new Date().toISOString(), createdBy: "admin-1", reason: "observed depeg" });
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: { async verifyIncoming() { return { outcome: "NOT_FOUND" }; } } });
    const res = await svc.createDeposit({ playerId: "alice" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, DepositError.CONTROL_DISABLED);
  });
});

describe("the Admin Payment & Stablecoin Control Center's rail service", () => {
  test("list() returns every rail joined with its asset/network display data and its current risk status", async () => {
    const { rails } = await fresh();
    const list = await rails.list();
    assert.equal(list.length, 1);
    const usdtTron = list[0];
    assert.equal(usdtTron.id, "USDT_TRON");
    assert.equal(usdtTron.network_display_name, "TRON (TRC20)");
    assert.equal(usdtTron.asset_kind, "STABLECOIN");
    assert.equal(usdtTron.risk_status, "NOMINAL", "the launch peg-assumed snapshot is the current risk status");
  });

  test("RAIL-SPECIFIC PAUSE: setStatus(ADMIN_PAUSED) blocks new deposits and withdrawals for that rail alone", async () => {
    const { db, rails } = await fresh();
    const res = await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-1", reason: "scheduled maintenance window" });
    assert.equal(res.ok, true);
    assert.equal(await rails.enabledFor("USDT", "TRON", "DEPOSIT"), false);
    assert.equal(await rails.enabledFor("USDT", "TRON", "WITHDRAWAL"), false);
    const row = await db.query("SELECT status FROM payment_rail WHERE id='USDT_TRON'");
    assert.equal(row.rows[0].status, "ADMIN_PAUSED");
  });

  test("EMERGENCY HOLD blocks both operations, exactly like ADMIN_PAUSED, but is recorded as its own distinct state", async () => {
    const { rails } = await fresh();
    const res = await rails.setStatus("USDT_TRON", "EMERGENCY_HOLD", { actorType: "ADMIN", actorId: "admin-1", reason: "suspected incident" });
    assert.equal(res.ok, true);
    assert.equal(res.rail.status, "EMERGENCY_HOLD");
    assert.equal(await rails.enabledFor("USDT", "TRON", "DEPOSIT"), false);
    assert.equal(await rails.enabledFor("USDT", "TRON", "WITHDRAWAL"), false);
  });

  test("setStatus() refuses a change with no reason -- every change requires one", async () => {
    const { rails } = await fresh();
    const res = await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-1", reason: "" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "REASON_REQUIRED");
  });

  test("updateLimits() changes only the fields given, and logs ONLY the fields that actually changed", async () => {
    const { db, rails } = await fresh();
    const res = await rails.updateLimits("USDT_TRON", {
      maxWithdrawalMinor: u(500),
      minWithdrawalMinor: u(5), // unchanged from the seeded default -- must NOT be logged
    }, { actorType: "ADMIN", actorId: "admin-1", reason: "tightening the payout ceiling" });
    assert.equal(res.ok, true);
    assert.deepEqual(res.changedFields, ["max_withdrawal_minor"]);

    const history = await rails.history("USDT_TRON");
    const maxChange = history.find((h) => h.field === "max_withdrawal_minor");
    assert.ok(maxChange);
    assert.equal(maxChange.new_value, u(500));
    assert.equal(maxChange.actor_id, "admin-1");
    assert.equal(maxChange.reason, "tightening the payout ceiling");
    assert.ok(!history.some((h) => h.field === "min_withdrawal_minor"), "an unchanged field is never logged");
  });

  test("updateLimits() rejects a value that violates the rail's own CHECK constraints", async () => {
    const { rails } = await fresh();
    const res = await rails.updateLimits("USDT_TRON", {
      minWithdrawalMinor: u(1000), maxWithdrawalMinor: u(10), // min > max
    }, { actorType: "ADMIN", actorId: "admin-1", reason: "bad input" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "INVALID_VALUE");
  });

  test("updateLimits() refuses a request with no editable fields and no reason", async () => {
    const { rails } = await fresh();
    assert.equal((await rails.updateLimits("USDT_TRON", {}, { actorType: "ADMIN", actorId: "a", reason: "x" })).reason, "NO_EDITABLE_FIELDS");
    assert.equal((await rails.updateLimits("USDT_TRON", { enabled: false }, { actorType: "ADMIN", actorId: "a", reason: "" })).reason, "REASON_REQUIRED");
  });

  test("updateLimits() cannot touch asset, network, or id -- a rail's identity is never editable", async () => {
    const { db, rails } = await fresh();
    await rails.updateLimits("USDT_TRON", { asset: "USDC", network: "ETHEREUM", id: "OTHER" }, { actorType: "ADMIN", actorId: "a", reason: "attempted identity change" });
    const row = await db.query("SELECT asset, network, id FROM payment_rail WHERE id='USDT_TRON'");
    assert.equal(row.rows[0].asset, "USDT");
    assert.equal(row.rows[0].network, "TRON");
  });

  test("DISABLED (enabled=false) blocks both operations without erasing anything", async () => {
    const { db, rails } = await fresh();
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query("SELECT ledger_open_user_wallet('alice')");
    await db.query(`SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(100) },
        { account: "user:alice:available", amount: "-" + u(100) },
      ]),
    ]);
    const res = await rails.updateLimits("USDT_TRON", { enabled: false }, { actorType: "ADMIN", actorId: "admin-1", reason: "disabling for future asset config" });
    assert.equal(res.ok, true);
    assert.equal(await rails.enabledFor("USDT", "TRON", "DEPOSIT"), false);
    // NOT ALTER SETTLED BALANCES: existing balances are completely untouched.
    const bal = await db.query(
      `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
         FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:alice:available'`
    );
    assert.equal(bal.rows[0].n, u(100), "a rail toggle never touches a single ledger entry");
  });

  test("AUDIT INTEGRITY: rail_configuration_change is append-only -- no edit, no delete, ever", async () => {
    const { db, rails } = await fresh();
    await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-1", reason: "test" });
    await assert.rejects(
      () => db.query("UPDATE rail_configuration_change SET reason='rewritten' WHERE rail_id='USDT_TRON'"),
      /append-only/
    );
    await assert.rejects(
      () => db.query("DELETE FROM rail_configuration_change WHERE rail_id='USDT_TRON'"),
      /append-only/
    );
  });

  test("AUDIT INTEGRITY: every change records actor, previous state, new state, reason, and timestamp", async () => {
    const { rails } = await fresh();
    await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "admin-9", reason: "planned maintenance" });
    const history = await rails.history("USDT_TRON");
    const entry = history.find((h) => h.field === "status");
    assert.equal(entry.old_value, "ACTIVE");
    assert.equal(entry.new_value, "ADMIN_PAUSED");
    assert.equal(entry.actor_type, "ADMIN");
    assert.equal(entry.actor_id, "admin-9");
    assert.equal(entry.reason, "planned maintenance");
    assert.ok(entry.at, "a real timestamp, not merely present in the row but readable back");
  });
});

describe("EXISTING TRANSACTION DURING PAUSE: a rail turning off never touches an operation already in flight", () => {
  async function fundedDb() {
    const db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
    await db.query("SELECT ledger_open_user_wallet('alice')");
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('fin-1','f1@n','F1',TRUE)");
    await db.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='fin-1', reason='test setup' WHERE key IN ('DEPOSITS','WITHDRAWALS')`
    );
    await db.query(`SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(1000) },
        { account: "user:alice:available", amount: "-" + u(1000) },
      ]),
    ]);
    return db;
  }

  test("a deposit already AWAITING_PAYMENT still verifies and credits after its rail is paused", async () => {
    const db = await fundedDb();
    const rails = createRailService(db);
    const chainState = {};
    const chain = {
      async verifyIncoming({ address, requiredConfirmations }) {
        const observed = chainState[address];
        if (!observed) return { outcome: "NOT_FOUND" };
        return { outcome: "VERIFIED", txHash: observed.txHash, network: "TRON", asset: "USDT", to: address, amountRaw: observed.amountMinor, confirmations: requiredConfirmations };
      },
    };
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain });
    const created = await svc.createDeposit({ playerId: "alice" });
    assert.equal(created.ok, true, "the deposit was created while the rail was still active");
    const depRow = await db.query("SELECT address, provider_ref FROM deposit WHERE id=$1", [created.depositId]);
    const dep = { ...created, address: depRow.rows[0].address, providerRef: depRow.rows[0].provider_ref };

    // NOW the rail is paused, exactly as the brief requires: turning it off
    // must not change an EXISTING deposit's own state machine.
    await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "fin-1", reason: "incident" });

    chainState[dep.address] = { txHash: "0xexisting", amountMinor: u(100) };
    const result = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(result.credited, true, "an already-open deposit intent still runs its own verification to completion");
    assert.equal(await natural(db, "user:alice:available"), u(1100));
  });

  test("a withdrawal already APPROVED still processes and completes after its rail is paused", async () => {
    const db = await fundedDb();
    const rails = createRailService(db);
    const provider = createSandboxProvider();
    const chain = {
      async verifyTransfer({ txHash, expectedNetwork, expectedRecipient, requiredConfirmations }) {
        return { outcome: "VERIFIED", txHash, network: expectedNetwork, asset: "USDT", to: expectedRecipient, amountRaw: "0", blockNumber: 1, confirmations: requiredConfirmations ?? 20 };
      },
    };
    const svc = createPaymentService(db, { provider, chain });
    const addr = "T" + "9".repeat(33);
    await svc.addPayoutAddress({ playerId: "alice", address: addr });
    await db.query(`UPDATE payout_address SET added_at = now() - interval '48 hours', usable_from = now() - interval '24 hours'`);
    const w = await svc.request({ playerId: "alice", destination: addr, amountMinor: u(100), authorised: true });
    await svc.assess(w.withdrawalId);

    // Since the LAUNCH POSTURE security fix, assess() always routes to
    // PENDING_REVIEW -- reaching APPROVED requires the real four-eyes
    // ceremony, exactly as production requires.
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('fin-2','f2@n','F2',TRUE)");
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
       ('fin-1','FINANCE_ADMIN','fin-2','test setup'),
       ('fin-2','FINANCE_ADMIN','fin-1','test setup')`
    );
    const digest = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [w.withdrawalId]);
    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by, reason, status, decided_by, decided_at)
       VALUES ('apr-rail-pause','admin.withdrawal.approve','withdrawal',$1,$2::jsonb,'fin-1','test approval','APPROVED','fin-2', now())`,
      [w.withdrawalId, JSON.stringify({ digest: digest.rows[0].digest })]
    );
    const approved = await svc.approve(w.withdrawalId, { approvalRequestId: "apr-rail-pause", adminId: "fin-1", stepUpVerified: true });
    assert.equal(approved.status, "APPROVED");

    // The rail is paused AFTER the withdrawal is already APPROVED.
    await rails.setStatus("USDT_TRON", "ADMIN_PAUSED", { actorType: "ADMIN", actorId: "fin-1", reason: "incident" });

    const processed = await svc.process(w.withdrawalId);
    assert.equal(processed.ok, true, "an already-approved withdrawal still broadcasts -- the pause only blocks NEW requests");
    const payout = provider._payouts.get(processed.providerRef);
    payout.state = (await import("../src/provider.mjs")).ProviderPayoutState.CONFIRMED;
    payout.txHash = "0xexistingwd";
    const done = await svc.reconcile(w.withdrawalId);
    assert.equal(done.status, "COMPLETED");
  });
});

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key=$1`,
    [key]
  );
  return r.rows[0].n;
}
