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

/**
 * A stub chain reader. This is what the provider is checked AGAINST --
 * `incoming[address]` describes exactly what an independent, real
 * BlockchainProvider (packages/chain/src/provider.mjs) would have
 * ALREADY re-derived from a transaction's own raw event log: no `chain`
 * consumer, including payments.mjs, ever sees anything less verified than
 * this shape in production either.
 */
function fakeChain(incoming = {}) {
  return {
    async verifyIncoming({ network, address, requiredConfirmations }) {
      const observed = incoming[address];
      if (!observed) return { outcome: "NOT_FOUND" };
      if (observed.network !== network) return { outcome: "WRONG_NETWORK" };
      if (observed.asset !== "USDT") return { outcome: "NO_TRANSFER_EVENT" };
      const base = {
        txHash: observed.txHash, outputIndex: observed.outputIndex ?? 0,
        network: observed.network, asset: observed.asset,
        from: observed.from ?? null, to: address, amountRaw: String(observed.amountMinor),
        confirmations: observed.confirmations,
      };
      return observed.confirmations >= requiredConfirmations
        ? { outcome: "VERIFIED", ...base }
        : { outcome: "NOT_CONFIRMED", ...base };
    },
    // The OUTBOUND mirror of verifyIncoming(): what an independent
    // BlockchainProvider would report for a payout that genuinely landed.
    // Every withdrawal test in this file that expects COMPLETED depends on
    // this -- exactly as it would in production, where reconcile() never
    // advances BROADCASTED -> CONFIRMED without exactly this kind of answer.
    async verifyTransfer({ txHash, expectedNetwork, expectedRecipient, requiredConfirmations }) {
      if (expectedNetwork !== "TRON") return { outcome: "WRONG_NETWORK" };
      return {
        outcome: "VERIFIED", txHash, network: expectedNetwork, asset: "USDT",
        to: expectedRecipient, from: "Tplatformcustody00000000000000000",
        amountRaw: "0", blockNumber: 12345, confirmations: requiredConfirmations ?? 20,
      };
    },
  };
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
  // Both hold the real FINANCE_ADMIN capability set (withdrawal.review,
  // withdrawal.approve, ...) -- granted by EACH OTHER, since
  // admin_role_grant_not_self forbids self-granting. This is what makes
  // authorize() actually ALLOW the admin-action tests below, the same way
  // a real deployment's role-grant flow would.
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('fin-1','FINANCE_ADMIN','fin-2','test setup'),
     ('fin-2','FINANCE_ADMIN','fin-1','test setup')`
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

  test("F-6: a second deposit intent racing the SAME on-chain output as an already-credited one is ORPHANED, not an unhandled crash", async () => {
    // Two intents sharing one address (a provider address reuse, or a
    // shared house address with memos) both observe the SAME real transfer.
    // The first legitimately credits it. verifyAndCredit() for the second
    // must never throw deposit_one_credit_per_output up through
    // ingestWebhook() as an unhandled exception -- it must recognise "this
    // output already belongs to someone else's intent" and ORPHAN this
    // deposit for a human, exactly like any other unattributable transfer.
    const db = await fresh();
    const provider = createSandboxProvider();
    const SHARED_ADDR = "T" + "7".repeat(33);
    const chain = fakeChain({
      [SHARED_ADDR]: { network: "TRON", asset: "USDT", txHash: "0xshared", amountMinor: u(50), confirmations: 50 },
    });
    const svc = createPaymentService(db, { provider, chain });

    await db.query("INSERT INTO player (id, handle) VALUES ('bob','bob') ON CONFLICT DO NOTHING");
    await db.query("SELECT ledger_open_user_wallet('bob')");
    await db.query(
      `INSERT INTO deposit (id,player_id,asset,network,provider,provider_ref,address,status,expires_at)
       VALUES ('dep-first','alice','USDT','TRON','sandbox','ref-first',$1,'AWAITING_PAYMENT', now()+interval '1 day')`,
      [SHARED_ADDR]
    );
    await db.query(
      `INSERT INTO deposit (id,player_id,asset,network,provider,provider_ref,address,status,expires_at)
       VALUES ('dep-second','bob','USDT','TRON','sandbox','ref-second',$1,'AWAITING_PAYMENT', now()+interval '1 day')`,
      [SHARED_ADDR]
    );

    const first = await svc.verifyAndCredit("ref-first");
    assert.equal(first.credited, true);

    const second = await svc.verifyAndCredit("ref-second");
    assert.equal(second.credited, false);
    assert.equal(second.reason, DepositError.OUTPUT_ALREADY_CLAIMED, "never an unhandled exception -- a real, named outcome");

    const row = await db.query("SELECT status, observed_tx_hash, quarantine_reason FROM deposit WHERE id='dep-second'");
    assert.equal(row.rows[0].status, "QUARANTINED");
    assert.equal(row.rows[0].observed_tx_hash, "0xshared", "the real transfer it observed is recorded, not discarded");
    assert.equal(row.rows[0].quarantine_reason, "OUTPUT_ALREADY_CLAIMED");

    assert.equal(await natural(db, "user:alice:available"), u(50), "the legitimate first credit stands");
    assert.equal(await natural(db, "user:bob:available"), "0", "the second player is never credited for someone else's output");

    const ledgerTx = await db.query("SELECT count(*)::int c FROM ledger_transaction WHERE kind='DEPOSIT'");
    assert.equal(ledgerTx.rows[0].c, 1, "exactly one deposit credit was ever posted, never two");
  });

});

describe("the real blockchain verification layer's deposit flow", () => {
  /** A chain stub that returns one fixed, discriminated outcome regardless of address. */
  function fixedOutcomeChain(result) {
    return { async verifyIncoming() { return result; } };
  }

  async function openDeposit(svc, db) {
    const d = await svc.createDeposit({ playerId: "alice" });
    const row = await db.query("SELECT address, provider_ref FROM deposit WHERE id=$1", [d.depositId]);
    return { ...d, address: row.rows[0].address, providerRef: row.rows[0].provider_ref };
  }

  test("FAILED TX: a reverted on-chain transaction is never credited, and is not quarantined as if it were suspicious", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: fixedOutcomeChain({ outcome: "TX_FAILED", txHash: "0xreverted" }),
    });
    const dep = await openDeposit(svc, db);
    const res = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(res.credited, false);
    assert.equal(res.reason, DepositError.TX_FAILED);
    const row = await db.query("SELECT status FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(row.rows[0].status, "AWAITING_PAYMENT", "unchanged -- a reverted tx is not evidence of anything suspicious about the intent itself");
    assert.equal(await natural(db, "user:alice:available"), "0");
  });

  test("WRONG RECIPIENT: an independently-decoded transfer to a different address than expected is quarantined, never credited", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: fixedOutcomeChain({ outcome: "WRONG_RECIPIENT", observedRecipients: ["Tsomeoneelse"] }),
    });
    const dep = await openDeposit(svc, db);
    const res = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(res.credited, false);
    assert.equal(res.reason, "WRONG_DESTINATION");
    const row = await db.query("SELECT status FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(row.rows[0].status, "QUARANTINED");
  });

  test("ORPHAN: a genuinely valid, confirmed transfer arrives for an intent that already expired -- real money, never auto-credited, never silently dropped", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: fakeChain() });
    const dep = await openDeposit(svc, db);
    // The intent expired before the chain transfer was ever seen.
    await db.query(`UPDATE deposit SET status='EXPIRED' WHERE id=$1`, [dep.depositId]);

    const late = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: fixedOutcomeChain({
        outcome: "VERIFIED", txHash: "0xlate", network: "TRON", asset: "USDT",
        from: "Tsender", to: dep.address, amountRaw: u(50), confirmations: 30,
      }),
    });
    const res = await late.verifyAndCredit(dep.providerRef);
    assert.equal(res.credited, false);
    assert.equal(res.reason, DepositError.ORPHANED);
    assert.equal(res.txHash, "0xlate");

    const row = await db.query(
      "SELECT status, observed_tx_hash, observed_amount_minor FROM deposit WHERE id=$1", [dep.depositId]
    );
    assert.equal(row.rows[0].status, "ORPHANED");
    assert.equal(row.rows[0].observed_tx_hash, "0xlate", "the real transaction is on record, not discarded");
    assert.equal(String(row.rows[0].observed_amount_minor), u(50));
    assert.equal(await natural(db, "user:alice:available"), "0", "never auto-credited onto a dead intent");
  });

  test("an already-ORPHANED deposit is not re-processed or revived by a later verification pass", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, { provider: createSandboxProvider(), chain: fakeChain() });
    const dep = await openDeposit(svc, db);
    await db.query(
      `UPDATE deposit SET status='ORPHANED', observed_tx_hash='0xold' WHERE id=$1`, [dep.depositId]
    );
    const nothingNow = createPaymentService(db, { provider: createSandboxProvider(), chain: fakeChain() });
    const res = await nothingNow.verifyAndCredit(dep.providerRef);
    assert.equal(res.reason, "NOTHING_ON_CHAIN");
    const row = await db.query("SELECT status FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(row.rows[0].status, "ORPHANED", "never revived back to AWAITING_PAYMENT");
  });

  test("PROVIDER UNAVAILABLE / RETRY: an RPC outage is PENDING/RETRYABLE, never a rejection and never a credit", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: fixedOutcomeChain({ outcome: "PROVIDER_UNAVAILABLE", error: new Error("simulated RPC outage") }),
    });
    const dep = await openDeposit(svc, db);

    const res = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(res.credited, false);
    assert.equal(res.reason, DepositError.PROVIDER_UNAVAILABLE);
    assert.equal(res.retryable, true);

    const row = await db.query(
      "SELECT status, verification_attempts, last_verification_error FROM deposit WHERE id=$1", [dep.depositId]
    );
    assert.equal(row.rows[0].status, "AWAITING_PAYMENT", "unchanged by a mere network blip");
    assert.equal(row.rows[0].verification_attempts, 1);
    assert.match(row.rows[0].last_verification_error, /simulated RPC outage/);

    // RETRY: calling again (as a worker's next tick would) increments the
    // counter again -- and once the provider recovers, the SAME deposit
    // proceeds normally, proving the outage left nothing behind that
    // blocks a later real credit.
    await svc.verifyAndCredit(dep.providerRef);
    const again = await db.query("SELECT verification_attempts FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(again.rows[0].verification_attempts, 2);

    const recovered = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: fakeChain({ [dep.address]: { txHash: "0xrecovered", amountMinor: u(75), asset: "USDT", network: "TRON", confirmations: 30 } }),
    });
    const finalResult = await recovered.verifyAndCredit(dep.providerRef);
    assert.equal(finalResult.credited, true);
    assert.equal(await natural(db, "user:alice:available"), u(75));
  });

  test("a chain reader that throws directly (rather than returning PROVIDER_UNAVAILABLE) is still never treated as a rejection", async () => {
    const db = await fresh();
    const svc = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: { async verifyIncoming() { throw new Error("reader bug: unhandled exception"); } },
    });
    const dep = await openDeposit(svc, db);
    const res = await svc.verifyAndCredit(dep.providerRef);
    assert.equal(res.reason, DepositError.PROVIDER_UNAVAILABLE);
    assert.equal(res.retryable, true);
    const row = await db.query("SELECT status FROM deposit WHERE id=$1", [dep.depositId]);
    assert.equal(row.rows[0].status, "AWAITING_PAYMENT");
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

  /**
   * Since the LAUNCH POSTURE fix below, assess() always routes to
   * PENDING_REVIEW -- there is no size or risk score that skips human
   * review. Every test that needs to reach APPROVED (to then process() a
   * payout) goes through this real four-eyes ceremony: a second admin
   * decides the SAME approval_request proposeApproval() would have
   * created, and the original requester executes it -- exactly the
   * production path, not a shortcut around it.
   */
  async function fourEyesApprove(db, svc, withdrawalId) {
    const digest = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [withdrawalId]);
    const approvalId = `apr_${withdrawalId}`;
    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by,
                                     reason, status, decided_by, decided_at)
       VALUES ($1,'admin.withdrawal.approve','withdrawal',$2,$3::jsonb,'fin-1','test approval',
               'APPROVED','fin-2', now())`,
      [approvalId, withdrawalId, JSON.stringify({ digest: digest.rows[0].digest })]
    );
    const res = await svc.approve(withdrawalId, { approvalRequestId: approvalId, adminId: "fin-1", stepUpVerified: true });
    assert.equal(res.status, "APPROVED", `four-eyes approval unexpectedly failed: ${JSON.stringify(res)}`);
    return res;
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

  test("LAUNCH POSTURE: every withdrawal reaches a human, at any clean amount -- there is no auto-approval today", async () => {
    // A security review found reviewThresholdMinor defaulting to 500 USDT,
    // silently auto-approving every smaller, risk-clean withdrawal with no
    // four-eyes and no human ever seeing it -- directly contradicting this
    // module's own header ("above a threshold -- currently EVERY
    // withdrawal -- a second human"). This is that claim, proven for real,
    // across the full range from the minimum up to the platform maximum.
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);

    for (const dollars of [10, 499, 500, 900, 2000]) {
      const w = await svc.request({
        playerId: "alice", destination: GOOD_ADDR, amountMinor: u(dollars), authorised: true,
      });
      const assessed = await svc.assess(w.withdrawalId);
      assert.equal(assessed.status, "PENDING_REVIEW", `a $${dollars} withdrawal must reach a human, not auto-approve`);
    }
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

    assert.equal(
      (await svc.approve(w.withdrawalId, { approvalRequestId: "nope", adminId: "fin-1", stepUpVerified: true })).reason,
      WithdrawalError.NEEDS_APPROVAL
    );

    // The digest must cover the SAME payload approve() will re-derive at
    // execution time (G9) -- computed here through the same DB function
    // proposeApproval() itself would call, not hand-typed, so this test
    // fails loudly if the two ever disagree.
    const digest = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [w.withdrawalId]);
    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by,
                                     reason, status, decided_by, decided_at)
       VALUES ('ap1','admin.withdrawal.approve','withdrawal',$1,$2::jsonb,'fin-1','large payout',
               'APPROVED','fin-2', now())`,
      [w.withdrawalId, JSON.stringify({ digest: digest.rows[0].digest })]
    );
    assert.equal(
      (await svc.approve(w.withdrawalId, { approvalRequestId: "ap1", adminId: "fin-1", stepUpVerified: true })).status,
      "APPROVED"
    );
  });

  test("F-5: fee_minor is covered by the approval digest, and is immutable like amount/destination", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const before = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [w.withdrawalId]);

    await assert.rejects(
      () => db.query("UPDATE withdrawal SET fee_minor=$2 WHERE id=$1", [w.withdrawalId, u(400)]),
      /fee are immutable/
    );

    const after = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [w.withdrawalId]);
    assert.equal(before.rows[0].digest, after.rows[0].digest, "the digest is unaffected because the change was refused outright");
  });

  test("an approval whose digest no longer matches the withdrawal is refused", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by,
                                     reason, status, decided_by, decided_at)
       VALUES ('ap-stale','admin.withdrawal.approve','withdrawal',$1,'{"digest":"deadbeef"}'::jsonb,
               'fin-1','large payout','APPROVED','fin-2', now())`,
      [w.withdrawalId]
    );
    const res = await svc.approve(w.withdrawalId, { approvalRequestId: "ap-stale", adminId: "fin-1", stepUpVerified: true });
    assert.equal(res.reason, WithdrawalError.DIGEST_MISMATCH);
  });

  test("only the original requester may execute an approval they did not raise", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const digest = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [w.withdrawalId]);
    await db.query(
      `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by,
                                     reason, status, decided_by, decided_at)
       VALUES ('ap2','admin.withdrawal.approve','withdrawal',$1,$2::jsonb,'fin-1','large payout',
               'APPROVED','fin-2', now())`,
      [w.withdrawalId, JSON.stringify({ digest: digest.rows[0].digest })]
    );
    // fin-2 decided it; fin-2 may not ALSO be the one who executes it.
    const res = await svc.approve(w.withdrawalId, { approvalRequestId: "ap2", adminId: "fin-2", stepUpVerified: true });
    assert.equal(res.reason, WithdrawalError.PERMISSION_DENIED);
  });

  test("an admin without the finance capability cannot approve, hold, or reject", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await db.query(
      `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('supp-1','s1@n','S1',TRUE)`
    );
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    const rejected = await svc.reject(w.withdrawalId, "no thanks", { adminId: "supp-1", stepUpVerified: true });
    assert.equal(rejected.reason, WithdrawalError.PERMISSION_DENIED);
    const held = await svc.hold(w.withdrawalId, { adminId: "supp-1" });
    assert.equal(held.reason, WithdrawalError.PERMISSION_DENIED);
  });

  test("PLACE ON HOLD: defers a decision, and review can resume it", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);

    const held = await svc.hold(w.withdrawalId, { adminId: "fin-1", reason: "verifying destination" });
    assert.equal(held.status, "ON_HOLD");
    const row = await db.query("SELECT status, hold_reason FROM withdrawal WHERE id=$1", [w.withdrawalId]);
    assert.equal(row.rows[0].status, "ON_HOLD");
    assert.equal(row.rows[0].hold_reason, "verifying destination");

    // A held withdrawal cannot be approved directly -- it must resume first.
    assert.equal(
      (await svc.approve(w.withdrawalId, { approvalRequestId: "whatever", adminId: "fin-1", stepUpVerified: true })).reason,
      WithdrawalError.WRONG_STATE
    );

    const resumed = await svc.resumeFromHold(w.withdrawalId, { adminId: "fin-2" });
    assert.equal(resumed.status, "PENDING_REVIEW");
    const row2 = await db.query("SELECT hold_reason FROM withdrawal WHERE id=$1", [w.withdrawalId]);
    assert.equal(row2.rows[0].hold_reason, null);
  });

  test("a withdrawal on hold can still be rejected outright", async () => {
    const { db, svc } = await setup({ fund: 10_000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(900), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    await svc.hold(w.withdrawalId, { adminId: "fin-1", reason: "checking" });
    const rejected = await svc.reject(w.withdrawalId, "denied while on hold", { adminId: "fin-2", stepUpVerified: true });
    assert.equal(rejected.status, "REJECTED");
    assert.equal(await natural(db, "user:alice:available"), u(10_000));
  });

  test("the full happy path pays out once and the books balance", async () => {
    const { db, provider, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    await fourEyesApprove(db, svc, w.withdrawalId);
    const processed = await svc.process(w.withdrawalId);
    assert.equal(processed.ok, true);

    // Provider confirms.
    const payout = provider._payouts.get(processed.providerRef);
    payout.state = ProviderPayoutState.CONFIRMED;
    payout.txHash = "0xpayout";

    const initCustody = BigInt(await natural(db, "platform:custody:USDT:TRON"));
    const done = await svc.reconcile(w.withdrawalId);
    assert.equal(done.status, "COMPLETED");

    assert.equal(await natural(db, "user:alice:available"), u(900));
    assert.equal(await natural(db, "user:alice:locked"), "0", "the lock is gone");
    assert.equal(await natural(db, "platform:custody:USDT:TRON"), (initCustody - BigInt(u(100))).toString(), "custody paid out 100");

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
    await fourEyesApprove(db, svc, w.withdrawalId);
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
    await fourEyesApprove(db, svc, w.withdrawalId);
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
    await fourEyesApprove(db, svc, w.withdrawalId);
    const p = await svc.process(w.withdrawalId);
    provider._payouts.get(p.providerRef).state = ProviderPayoutState.FAILED;

    const res = await svc.reconcile(w.withdrawalId);
    assert.equal(res.status, "FAILED");
    assert.equal(await natural(db, "user:alice:available"), u(1000), "fully refunded");
    assert.equal(await natural(db, "user:alice:locked"), "0");
  });

  describe("a provider claiming FAILED after a real broadcast is never trusted alone", () => {
    // These reproduce the exact double-spend the security review's PROBE A
    // demonstrated before the fix: a payout is genuinely broadcast (a
    // tx_hash is recorded), and the provider LATER claims FAILED -- an
    // outage, a bad status map, a compromised provider account, or a
    // support-initiated cancel on their side. reconcile() must never
    // release the hold on that claim alone; only its own independent
    // chain.verifyTransfer() may say the payout is genuinely dead.
    async function broadcastThenClaimFailed(chain) {
      const db = await fresh({ fund: 1000 });
      const provider = createSandboxProvider();
      const svc = createPaymentService(db, { provider, chain });
      await svc.addPayoutAddress({ playerId: "alice", address: GOOD_ADDR, label: "ledger" });
      await db.query(`UPDATE payout_address SET added_at = now() - interval '48 hours', usable_from = now() - interval '24 hours'`);
      const w = await svc.request({ playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svc.assess(w.withdrawalId);
      await fourEyesApprove(db, svc, w.withdrawalId);
      const p = await svc.process(w.withdrawalId);
      const payout = provider._payouts.get(p.providerRef);
      // Recorded directly (a legal PROCESSING -> BROADCASTED transition, per
      // withdrawal_transition_allowed()) rather than via reconcile(), so
      // this fixture is not itself dependent on the chain double's
      // behaviour -- every test below starts from the exact same
      // "genuinely broadcast, real tx_hash on file" state and then supplies
      // its OWN chain answer for what happens next.
      await db.query(
        `UPDATE withdrawal SET status='BROADCASTED'::withdrawal_status, tx_hash=$2 WHERE id=$1`,
        [w.withdrawalId, "0xrealbroadcast"]
      );
      payout.state = ProviderPayoutState.FAILED;
      return { db, svc, withdrawalId: w.withdrawalId };
    }

    test("chain says NOT_CONFIRMED (inconclusive) -- the hold stays locked, nothing is refunded", async () => {
      const { db, svc, withdrawalId } = await broadcastThenClaimFailed({
        async verifyTransfer() { return { outcome: "NOT_CONFIRMED", confirmations: 3 }; },
      });
      const res = await svc.reconcile(withdrawalId);
      assert.equal(res.unchanged, true);
      const row = await db.query("SELECT status FROM withdrawal WHERE id=$1", [withdrawalId]);
      assert.equal(row.rows[0].status, "BROADCASTED", "never marked FAILED on the provider's word alone");
      assert.equal(await natural(db, "user:alice:available"), u(900), "the withdrawn amount is NOT refunded -- it may already be on-chain");
      assert.equal(await natural(db, "user:alice:locked"), u(100), "the hold is still in place");
    });

    test("chain independently confirms the transaction as VERIFIED -- the provider's FAILED claim is overridden, not trusted", async () => {
      const { db, svc, withdrawalId } = await broadcastThenClaimFailed({
        async verifyTransfer({ txHash, expectedRecipient, requiredConfirmations }) {
          return { outcome: "VERIFIED", txHash, network: "TRON", asset: "USDT", to: expectedRecipient, amountRaw: "0", blockNumber: 1, confirmations: requiredConfirmations ?? 20 };
        },
      });
      const res = await svc.reconcile(withdrawalId);
      assert.equal(res.status, "COMPLETED", "a real, chain-confirmed payout completes despite the provider's own claim of failure");
      assert.equal(await natural(db, "user:alice:available"), u(900));
      assert.equal(await natural(db, "user:alice:locked"), "0");
    });

    test("chain confirms a genuine on-chain revert (TX_FAILED) -- only then is the hold released", async () => {
      const { db, svc, withdrawalId } = await broadcastThenClaimFailed({
        async verifyTransfer() { return { outcome: "TX_FAILED", blockNumber: 1 }; },
      });
      const res = await svc.reconcile(withdrawalId);
      assert.equal(res.status, "FAILED");
      assert.equal(await natural(db, "user:alice:available"), u(1000), "refunded because the chain itself proves the payout never landed");
      assert.equal(await natural(db, "user:alice:locked"), "0");
    });

    test("no chain verifier configured at all -- FAILED-with-a-tx_hash is refused, not trusted", async () => {
      const { db, svc, withdrawalId } = await broadcastThenClaimFailed({});
      const res = await svc.reconcile(withdrawalId);
      assert.equal(res.reason, "NO_CHAIN_VERIFIER");
      const row = await db.query("SELECT status FROM withdrawal WHERE id=$1", [withdrawalId]);
      assert.equal(row.rows[0].status, "BROADCASTED");
      assert.equal(await natural(db, "user:alice:available"), u(900));
    });
  });

  test("PROVIDER LOST STATE: an unrecognised payout reference reports UNKNOWN, never FAILED, and reconcile() touches nothing", async () => {
    const db = await fresh({ fund: 1000 });
    const provider = createSandboxProvider();
    const chain = fakeChain();
    const svc = createPaymentService(db, { provider, chain });
    await svc.addPayoutAddress({ playerId: "alice", address: GOOD_ADDR, label: "ledger" });
    await db.query(`UPDATE payout_address SET added_at = now() - interval '48 hours', usable_from = now() - interval '24 hours'`);
    const w = await svc.request({ playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
    await svc.assess(w.withdrawalId);
    await fourEyesApprove(db, svc, w.withdrawalId);
    await svc.process(w.withdrawalId);

    // Simulate a restart: a brand-new provider instance, no in-memory payout map.
    const restartedProvider = createSandboxProvider();
    const svcAfterRestart = createPaymentService(db, { provider: restartedProvider, chain });
    const direct = await restartedProvider.getPayout("some-ref-nobody-restarted-with");
    assert.equal(direct.state, ProviderPayoutState.UNKNOWN);

    const res = await svcAfterRestart.reconcile(w.withdrawalId);
    assert.equal(res.unchanged, true);
    const row = await db.query("SELECT status FROM withdrawal WHERE id=$1", [w.withdrawalId]);
    assert.equal(row.rows[0].status, "PROCESSING", "still exactly where it was -- UNKNOWN never mutates state");
    assert.equal(await natural(db, "user:alice:available"), u(900), "not refunded on a lost reference");
    assert.equal(await natural(db, "user:alice:locked"), u(100), "the hold survives a restart");
  });

  test("rejecting returns the money before the state moves", async () => {
    const { db, svc } = await setup({ fund: 1000 });
    await allowlisted(svc, db);
    const w = await svc.request({
      playerId: "alice", destination: GOOD_ADDR, amountMinor: u(100), authorised: true,
    });
    await svc.assess(w.withdrawalId);
    await svc.reject(w.withdrawalId, "risk review declined", { adminId: "fin-1", stepUpVerified: true });
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
