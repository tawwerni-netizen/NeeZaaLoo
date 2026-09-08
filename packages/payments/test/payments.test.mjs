/**
 * Payments.
 *
 * Gate 5 evidence. The mandatory test is the forged webhook: it must fail
 * closed. The rest of this file is the deposit and withdrawal edge cases that
 * the payment architecture names as expected traffic rather than exceptions --
 * underpayment, wrong network, dust, replay, ambiguous provider responses.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createPaymentService, WithdrawalError, DepositError, isValidTronAddress } from "../src/payments.mjs";
import {
  createSandboxProvider, createNowPaymentsProvider, verifyHmacSignature,
  canonicalNowPaymentsBody, ProviderPayoutState, ProviderPaymentState, SigError,
} from "../src/provider.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const ADDR = "TQ2GJmMHV9y5cMHfmvvKZaMPmGxxxxxxxx".slice(0, 34);
const GOOD_ADDR = "T" + "9".repeat(33);

/** A stub chain reader. This is what the provider is checked AGAINST. */
function fakeChain(incoming = {}) {
  return { async getIncoming({ address }) { return incoming[address] ?? null; } };
}

async function fresh({ fund = 0, controls = {} } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
  await db.query("SELECT ledger_open_user_wallet('alice')");
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('fin-1','f1@n','F1',TRUE),('fin-2','f2@n','F2',TRUE)`
  );
  if (fund) {
    await db.query(`SELECT ledger_post('seed','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(fund) },
        { account: "user:alice:available", amount: "-" + u(fund) },
      ]),
    ]);
  }
  for (const [key, on] of Object.entries({ DEPOSITS: true, WITHDRAWALS: true, ...controls })) {
    await db.query(
      `UPDATE platform_control SET enabled=$2, changed_by='fin-1', reason=$3 WHERE key=$1`,
      [key, on, `test setup: ${key}=${on}`]
    );
  }
  return db;
}

// ---------------------------------------------------------------------------

describe("webhook signature verification", () => {
  const secret = "top-secret";
  const body = Buffer.from(JSON.stringify({ payment_id: 1, payment_status: "finished" }));
  const sig = createHmac("sha512", secret).update(body).digest("hex");

  test("a correct signature passes", () => {
    assert.equal(verifyHmacSignature(body, sig, secret).ok, true);
  });

  test("a forged signature fails", () => {
    assert.equal(verifyHmacSignature(body, "00".repeat(64), secret).error, SigError.INVALID);
  });

  test("a missing signature fails", () => {
    assert.equal(verifyHmacSignature(body, undefined, secret).error, SigError.MISSING);
  });

  test("a signature of the wrong length fails without comparing", () => {
    assert.equal(verifyHmacSignature(body, "abcd", secret).error, SigError.INVALID);
    assert.equal(verifyHmacSignature(body, "", secret).error, SigError.MISSING);
  });

  test("a tampered body fails even with a previously valid signature", () => {
    const tampered = Buffer.from(JSON.stringify({ payment_id: 1, payment_status: "finished", extra: 1 }));
    assert.equal(verifyHmacSignature(tampered, sig, secret).ok, false);
  });

  test("the NOWPayments adapter refuses to exist without an IPN secret", () => {
    assert.throws(
      () => createNowPaymentsProvider({ apiKey: "k", http: async () => ({}) }),
      /requires an IPN secret/
    );
  });

  test("the NOWPayments adapter verifies its own canonical form", () => {
    const provider = createNowPaymentsProvider({
      apiKey: "k", ipnSecret: "ipn", http: async () => ({}),
    });
    const payload = { payment_status: "finished", payment_id: 42, actually_paid: 10 };
    const canonical = canonicalNowPaymentsBody(payload);
    const signature = createHmac("sha512", "ipn").update(canonical).digest("hex");

    // Sent with keys in a different order: the adapter must still verify,
    // because it re-canonicalises rather than signing the bytes as they arrived.
    const shuffled = Buffer.from(JSON.stringify({ actually_paid: 10, payment_id: 42, payment_status: "finished" }));
    const ok = provider.verifyWebhook(shuffled, { "x-nowpayments-sig": signature });
    assert.equal(ok.ok, true);
    assert.equal(ok.event.state, ProviderPaymentState.CONFIRMED);

    const bad = provider.verifyWebhook(shuffled, { "x-nowpayments-sig": "ff".repeat(64) });
    assert.equal(bad.ok, false);
  });
});

describe("deposits: a webhook never credits", () => {
  async function setup(chainState = {}) {
    const db = await fresh();
    const provider = createSandboxProvider();
    const svc = createPaymentService(db, { provider, chain: fakeChain(chainState) });
    return { db, provider, svc, chainState };
  }

  async function openDeposit(svc, db) {
    const d = await svc.createDeposit({ playerId: "alice" });
    assert.equal(d.ok, true);
    assert.match(d.display, /USDT — TRON \(TRC20\)/, "asset and network always travel together");
    const row = await db.query("SELECT address, provider_ref FROM deposit WHERE id=$1", [d.depositId]);
    return { ...d, address: row.rows[0].address, providerRef: row.rows[0].provider_ref };
  }

  test("a FORGED webhook is rejected and credits nothing", async () => {
    // The mandatory Gate 5 test.
    const { db, svc } = await setup();
    await openDeposit(svc, db);
    const res = await svc.ingestWebhook(
      Buffer.from(JSON.stringify({ eventId: "e1", state: "CONFIRMED", amount: u(1000) })),
      { "x-sandbox-sig": "00".repeat(32) }
    );
    assert.equal(res.ok, false);
    assert.equal(res.reason, SigError.INVALID);
    assert.equal(await natural(db, "user:alice:available"), "0", "no credit from a forged webhook");
  });

  test("a VALID webhook alone still credits nothing when the chain shows nothing", async () => {
    const { db, provider, svc } = await setup();
    const dep = await openDeposit(svc, db);
    const { raw, signature } = provider.sign({
      eventId: "e2", type: "payment.status", providerRef: dep.providerRef,
      state: "CONFIRMED", amount: u(1000),
    });
    const res = await svc.ingestWebhook(raw, { "x-sandbox-sig": signature });
    assert.equal(res.ok, true);
    assert.equal(res.credited, false);
    assert.equal(res.reason, "NOTHING_ON_CHAIN");
    assert.equal(await natural(db, "user:alice:available"), "0",
      "the provider claimed 1000 USDT; the chain did not, so nothing moved");
  });

  test("a confirmed on-chain deposit credits exactly once", async () => {
    const state = {};
    const { db, provider, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0xabc", outputIndex: 0, amountMinor: u(100),
      asset: "USDT", network: "TRON", address: dep.address, confirmations: 25,
    };
    const { raw, signature } = provider.sign({
      eventId: "e3", providerRef: dep.providerRef, state: "CONFIRMED",
    });
    const res = await svc.ingestWebhook(raw, { "x-sandbox-sig": signature });
    assert.equal(res.credited, true);
    assert.equal(await natural(db, "user:alice:available"), u(100));
  });

  test("a REPLAYED webhook is a no-op", async () => {
    const state = {};
    const { db, provider, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0xdef", outputIndex: 0, amountMinor: u(50),
      asset: "USDT", network: "TRON", address: dep.address, confirmations: 30,
    };
    const signed = provider.sign({ eventId: "same-event", providerRef: dep.providerRef, state: "CONFIRMED" });

    const first = await svc.ingestWebhook(signed.raw, { "x-sandbox-sig": signed.signature });
    const second = await svc.ingestWebhook(signed.raw, { "x-sandbox-sig": signed.signature });
    const third = await svc.ingestWebhook(signed.raw, { "x-sandbox-sig": signed.signature });

    assert.equal(first.credited, true);
    assert.equal(second.replayed, true);
    assert.equal(third.replayed, true);
    assert.equal(await natural(db, "user:alice:available"), u(50), "credited once");

    const n = await db.query("SELECT count(*)::int c FROM ledger_transaction WHERE kind='DEPOSIT'");
    assert.equal(n.rows[0].c, 1);
  });

  test("insufficient confirmations do not credit", async () => {
    const state = {};
    const { db, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0x1", outputIndex: 0, amountMinor: u(100),
      asset: "USDT", network: "TRON", address: dep.address, confirmations: 3,
    };
    const res = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(res.reason, DepositError.NOT_FINAL);
    assert.equal(await natural(db, "user:alice:available"), "0");
  });

  test("a wrong-asset send is quarantined, never credited", async () => {
    const state = {};
    const { db, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0x2", outputIndex: 0, amountMinor: u(100),
      asset: "USDC", network: "TRON", address: dep.address, confirmations: 30,
    };
    assert.equal((await svc.verifyAndCredit(dep.providerRef)).reason, DepositError.WRONG_ASSET);
    const row = await db.query("SELECT status, quarantine_reason FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(row.rows[0].status, "QUARANTINED");
    assert.equal(await natural(db, "user:alice:available"), "0");
  });

  test("a wrong-network send is quarantined", async () => {
    const state = {};
    const { db, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0x3", outputIndex: 0, amountMinor: u(100),
      asset: "USDT", network: "ETHEREUM", address: dep.address, confirmations: 30,
    };
    assert.equal((await svc.verifyAndCredit(dep.providerRef)).reason, DepositError.WRONG_NETWORK);
    assert.equal(await natural(db, "user:alice:available"), "0");
  });

  test("dust is quarantined rather than credited", async () => {
    const state = {};
    const { db, svc } = await setup(state);
    const dep = await openDeposit(svc, db);
    state[dep.address] = {
      txHash: "0x4", outputIndex: 0, amountMinor: "100",
      asset: "USDT", network: "TRON", address: dep.address, confirmations: 30,
    };
    assert.equal((await svc.verifyAndCredit(dep.providerRef)).reason, DepositError.DUST);
    assert.equal(await natural(db, "user:alice:available"), "0");
  });

  test("a sanctions hit quarantines the funds", async () => {
    const state = {};
    const db = await fresh();
    const provider = createSandboxProvider();
    const svc = createPaymentService(db, {
      provider, chain: fakeChain(state),
      screening: async () => ({ ok: false, reason: "SANCTIONED_SOURCE" }),
    });
    const d = await svc.createDeposit({ playerId: "alice" });
    const row = await db.query("SELECT address, provider_ref FROM deposit WHERE id=$1", [d.depositId]);
    state[row.rows[0].address] = {
      txHash: "0x5", outputIndex: 0, amountMinor: u(100),
      asset: "USDT", network: "TRON", address: row.rows[0].address, confirmations: 30,
    };
    assert.equal((await svc.verifyAndCredit(row.rows[0].provider_ref)).reason, DepositError.SCREENING_HIT);
    assert.equal(await natural(db, "user:alice:available"), "0", "tainted funds never reach a balance");
  });

  test("deposits are refused while the control is off", async () => {
    const db = await fresh({ controls: { DEPOSITS: false } });
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: fakeChain() });
    assert.equal((await svc.createDeposit({ playerId: "alice" })).reason, DepositError.CONTROL_DISABLED);
  });

  test("the same on-chain output can never credit twice", async () => {
    const db = await fresh();
    await db.query(
      `INSERT INTO deposit (id,player_id,asset,network,provider,address,status,
                            observed_tx_hash,observed_output_index,observed_network,expires_at)
       VALUES ('d1','alice','USDT','TRON','sandbox','T1','DETECTED','0xdup',0,'TRON', now()+interval '1 day')`
    );
    await assert.rejects(
      () => db.query(
        `INSERT INTO deposit (id,player_id,asset,network,provider,address,status,
                              observed_tx_hash,observed_output_index,observed_network,expires_at)
         VALUES ('d2','alice','USDT','TRON','sandbox','T2','DETECTED','0xdup',0,'TRON', now()+interval '1 day')`
      ),
      /deposit_one_credit_per_output|duplicate key/
    );
  });
});

describe("withdrawals", () => {
  async function setup({ fund = 1000, controls = {}, risk, config } = {}) {
    const db = await fresh({ fund, controls });
    const provider = createSandboxProvider();
    const svc = createPaymentService(db, {
      provider, chain: fakeChain(), risk: risk ?? (async () => ({ score: 0 })), config,
    });
    return { db, provider, svc };
  }

  async function allowlisted(svc, db, { instant = true } = {}) {
    await svc.addPayoutAddress({ playerId: "alice", address: GOOD_ADDR, label: "ledger" });
    if (instant) {
      // Simulate an address added yesterday, rather than back-dating usable_from
      // past added_at -- which the time-lock constraint rightly refuses.
      await db.query(
        `UPDATE payout_address
            SET added_at = now() - interval '48 hours',
                usable_from = now() - interval '24 hours'`
      );
    }
    return GOOD_ADDR;
  }

  test("an address is time-locked when added", async () => {
    const { db, svc } = await setup();
    await allowlisted(svc, db, { instant: false });
    const r = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: true,
    });
    assert.equal(r.reason, WithdrawalError.ADDRESS_TIME_LOCKED,
      "an attacker cannot add an address and drain it in the same session");
  });

  test("an address that was never allowlisted is refused", async () => {
    const { svc } = await setup();
    const r = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: true,
    });
    assert.equal(r.reason, WithdrawalError.ADDRESS_NOT_ALLOWLISTED);
  });

  test("an unauthorised request is refused before anything is locked", async () => {
    const { db, svc } = await setup();
    await allowlisted(svc, db);
    const r = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: false,
    });
    assert.equal(r.reason, "NOT_AUTHORISED");
    assert.equal(await natural(db, "user:alice:locked"), "0");
  });

  test("requesting locks the funds immediately", async () => {
    const { db, svc } = await setup();
    await allowlisted(svc, db);
    const r = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    assert.equal(r.ok, true);
    assert.equal(await natural(db, "user:alice:available"), u(900));
    assert.equal(await natural(db, "user:alice:locked"), u(100));
  });

  test("SIMULTANEOUS withdrawals cannot both take the same balance", async () => {
    // The second request cannot lock funds the first already holds: the ledger
    // refuses to let a user account go negative.
    const { db, svc } = await setup({ fund: 100 });
    await allowlisted(svc, db);
    const first = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(80), authorised: true,
    });
    assert.equal(first.ok, true);

    await assert.rejects(
      () => svc.request({
        playerId: "alice", destination: GOOD_ADDR, amountMinor: u(80), authorised: true,
      }),
      /INSUFFICIENT_FUNDS/
    );
    assert.equal(await natural(db, "user:alice:locked"), u(80), "only one lock exists");
    assert.equal(await natural(db, "user:alice:available"), u(20));
  });

  test("a small clean withdrawal is auto-approved; a large one goes to a human", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);

    const small = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: true,
    });
    assert.equal((await svc.assess(small.withdrawalId)).status, "APPROVED");

    const big = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    assert.equal((await svc.assess(big.withdrawalId)).status, "PENDING_REVIEW");
  });

  test("a risky withdrawal goes to a human regardless of size", async () => {
    const { db, svc } = await setup({ fund: 1000, risk: async () => ({ score: 80 }) });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: true,
    });
    const a = await svc.assess(w.withdrawalId);
    assert.equal(a.status, "PENDING_REVIEW");
    assert.equal(a.riskScore, 80);
  });

  test("approval requires a real four-eyes record", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);

    assert.equal((await svc.approve(w.withdrawalId, { approvalRequestId: "nope" })).reason,
      WithdrawalError.NEEDS_APPROVAL);

    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, requested_by,
                                     reason, status, decided_by, decided_at)
       VALUES ('ap1','admin.withdrawal.approve','withdrawal',$1,'fin-1','large payout',
               'APPROVED','fin-2', now())`,
      [w.withdrawalId]
    );
    assert.equal((await svc.approve(w.withdrawalId, { approvalRequestId: "ap1" })).status, "APPROVED");
  });

  test("the full happy path pays out once and the books balance", async () => {
    const { db, provider, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const processed = await svc.process(w.withdrawalId);
    assert.equal(processed.ok, true);

    // Provider confirms.
    const payout = provider._payouts.get(processed.providerRef);
    payout.state = ProviderPayoutState.CONFIRMED;
    payout.txHash = "0xpayout";

    const done = await svc.reconcile(w.withdrawalId);
    assert.equal(done.status, "COMPLETED");

    assert.equal(await natural(db, "user:alice:available"), u(900));
    assert.equal(await natural(db, "user:alice:locked"), "0", "the lock is gone");
    assert.equal(await natural(db, "platform:custody:USDT:TRON"), u(900), "custody paid out 100");

    const drift = await db.query(
      "SELECT count(*)::int c FROM ledger_balance_verification WHERE drift <> 0"
    );
    assert.equal(drift.rows[0].c, 0);
  });

  test("DOUBLE withdrawal is impossible — completing twice pays once", async () => {
    const { db, provider, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const p = await svc.process(w.withdrawalId);
    const payout = provider._payouts.get(p.providerRef);
    payout.state = ProviderPayoutState.CONFIRMED;
    payout.txHash = "0xonce";

    await svc.reconcile(w.withdrawalId);
    const again = await svc.complete(w.withdrawalId);
    const thrice = await svc.reconcile(w.withdrawalId);

    assert.equal(again.alreadyDone, true);
    assert.ok(thrice.ok);
    assert.equal(await natural(db, "user:alice:available"), u(900), "paid exactly once");
    const n = await db.query("SELECT count(*)::int c FROM ledger_transaction WHERE kind='WITHDRAWAL'");
    assert.equal(n.rows[0].c, 1);
  });

  test("a retried broadcast returns the original payout, never a second one", async () => {
    const { db, provider, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const first = await svc.process(w.withdrawalId);
    // A second process() is refused by state, but the provider itself is also
    // idempotent on the external id -- belt and braces on the one operation
    // that actually moves money out of the building.
    const direct = await provider.createPayout({
      withdrawalId: w.withdrawalId, destination: GOOD_ADDR, amountMinor: u(100),
      idempotencyKey: `withdrawal:${w.withdrawalId}`,
    });
    assert.equal(direct.providerRef, first.providerRef);
    assert.equal(provider._payouts.size, 1);
  });

  test("a failed payout returns the money", async () => {
    const { db, provider, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const p = await svc.process(w.withdrawalId);
    provider._payouts.get(p.providerRef).state = ProviderPayoutState.FAILED;

    const res = await svc.reconcile(w.withdrawalId);
    assert.equal(res.status, "FAILED");
    assert.equal(await natural(db, "user:alice:available"), u(1000), "fully refunded");
    assert.equal(await natural(db, "user:alice:locked"), "0");
  });

  test("rejecting returns the money before the state moves", async () => {
    const { db, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    await svc.reject(w.withdrawalId, "risk review declined");
    assert.equal(await natural(db, "user:alice:available"), u(1000));
    assert.equal(await natural(db, "user:alice:locked"), "0");
  });

  test("withdrawals are refused while the control is off", async () => {
    const { db, svc } = await setup({ controls: { WITHDRAWALS: false } });
    await allowlisted(svc, db);
    assert.equal(
      (await svc.request({
        playerId: "alice", destination: GOOD_ADDR, amountMinor: u(10), authorised: true,
      })).reason,
      WithdrawalError.CONTROL_DISABLED
    );
  });

  test("a below-minimum withdrawal is refused", async () => {
    const { db, svc } = await setup();
    await allowlisted(svc, db);
    assert.equal(
      (await svc.request({
        playerId: "alice", destination: GOOD_ADDR, amountMinor: "1", authorised: true,
      })).reason,
      WithdrawalError.BELOW_MINIMUM
    );
  });

  test("an invalid TRON address is refused at allowlisting", async () => {
    const { svc } = await setup();
    assert.equal((await svc.addPayoutAddress({ playerId: "alice", address: "nope" })).reason,
      "INVALID_ADDRESS");
    assert.equal(isValidTronAddress(GOOD_ADDR), true);
    assert.equal(isValidTronAddress("0x1234"), false);
  });
});

describe("the withdrawal state machine is enforced by the database", () => {
  async function withOne() {
    const db = await fresh({ fund: 1000 });
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor)
       VALUES ('w1','alice','USDT','TRON',$1,$2)`, [GOOD_ADDR, u(10)]
    );
    // Lock the funds for real. withdrawal_moving_states_are_locked refuses to
    // advance a withdrawal whose money was never locked -- correctly, so the
    // fixture has to do what the service does rather than fake the row.
    const posted = await db.query(
      `SELECT * FROM ledger_post('w1:lock','WITHDRAWAL_LOCK','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "user:alice:available", amount: u(10) },
        { account: "user:alice:locked", amount: "-" + u(10) },
      ])]
    );
    await db.query("UPDATE withdrawal SET lock_tx_id=$1 WHERE id='w1'",
      [posted.rows[0].transaction_id]);
    return db;
  }

  test("an illegal jump is refused", async () => {
    const db = await withOne();
    await assert.rejects(
      () => db.query("UPDATE withdrawal SET status='COMPLETED'::withdrawal_status WHERE id='w1'"),
      /illegal withdrawal transition/
    );
  });

  test("skipping review is refused", async () => {
    const db = await withOne();
    await assert.rejects(
      () => db.query("UPDATE withdrawal SET status='PROCESSING'::withdrawal_status WHERE id='w1'"),
      /illegal withdrawal transition/
    );
  });

  test("the amount and destination are immutable after creation", async () => {
    const db = await withOne();
    await assert.rejects(
      () => db.query("UPDATE withdrawal SET amount_minor = 999999999 WHERE id='w1'"),
      /immutable/
    );
    await assert.rejects(
      () => db.query("UPDATE withdrawal SET destination = 'TOTHERADDRESS' WHERE id='w1'"),
      /immutable/
    );
  });

  test("every transition is recorded and cannot be edited", async () => {
    const db = await withOne();
    await db.query("UPDATE withdrawal SET status='VALIDATING'::withdrawal_status WHERE id='w1'");
    const t = await db.query(
      "SELECT from_status, to_status FROM withdrawal_transition WHERE withdrawal_id='w1' ORDER BY id"
    );
    assert.deepEqual(t.rows.map((r) => r.to_status), ["REQUESTED", "VALIDATING"]);
    await assert.rejects(
      () => db.query("UPDATE withdrawal_transition SET to_status='COMPLETED'"), /append-only/
    );
  });

  test("a broadcast without a transaction hash is refused", async () => {
    const db = await withOne();
    await db.query("UPDATE withdrawal SET status='VALIDATING'::withdrawal_status WHERE id='w1'");
    await db.query("UPDATE withdrawal SET status='RISK_CHECK'::withdrawal_status WHERE id='w1'");
    await db.query("UPDATE withdrawal SET status='APPROVED'::withdrawal_status WHERE id='w1'");
    await db.query("UPDATE withdrawal SET status='PROCESSING'::withdrawal_status WHERE id='w1'");
    await assert.rejects(
      () => db.query("UPDATE withdrawal SET status='BROADCASTED'::withdrawal_status WHERE id='w1'"),
      /withdrawal_broadcast_has_hash|violates check constraint/
    );
  });

  test("two withdrawals cannot share one on-chain transaction", async () => {
    const db = await withOne();
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, tx_hash)
       VALUES ('w2','alice','USDT','TRON',$1,$2,'0xshared')`, [GOOD_ADDR, u(10)]
    );
    await assert.rejects(
      () => db.query(
        `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, tx_hash)
         VALUES ('w3','alice','USDT','TRON',$1,$2,'0xshared')`, [GOOD_ADDR, u(10)]
      ),
      /withdrawal_one_tx_per_payout|duplicate key/
    );
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
