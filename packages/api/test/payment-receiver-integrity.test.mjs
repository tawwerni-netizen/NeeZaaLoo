/**
 * Payment Receiver device API: the guarantees the Android app relies on.
 *
 * - A report is credited at most once, however many times the device sends
 *   it (lost responses, retries, reinstalls, SMS delivered twice).
 * - The amount credited is the server's own reading of the receipt.
 * - A payout is debited at most once, however many times "confirm" is hit.
 *
 * PGlite is single-connection, so the "concurrent" cases here interleave at
 * statement boundaries rather than truly in parallel; the SQL functions they
 * exercise take row locks that make real Postgres behave the same way.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createLocalPaymentsService, normalizeReceiptText, receiptFingerprint } from "../../payments/src/local-payments.mjs";

const SIGNING_KEY = Buffer.alloc(32, 7);
const ENCRYPTION_KEY = Buffer.alloc(32, 8);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const PASSWORD = "correct horse battery staple";

let db, auth, api, localPayments;
let tokenRoot;
let vfNumberId, ipnNumberId;

async function req(method, path, { token, body, headers = {} } = {}) {
  const url = new URL(path, api.url);
  const reqHeaders = { ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) reqHeaders["content-type"] = "application/json";
  const res = await fetch(url.href, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json };
}

async function stepUp(token, action) {
  const r = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(r.status, 200, `step-up for ${action} failed: ${JSON.stringify(r.body)}`);
  return r.body.stepUpToken;
}

async function issueDevice(label) {
  const step = await stepUp(tokenRoot, "admin.local_rail.manage");
  const r = await req("POST", "/v1/admin/payments/local/devices", {
    token: tokenRoot, headers: { "x-step-up-token": step }, body: { label },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.device;
}

async function newPlayer(id) {
  await auth.register({ playerId: id, handle: id, password: PASSWORD });
  return (await auth.login({ identifier: id, password: PASSWORD })).accessToken;
}

async function available(playerId) {
  const r = await db.query(
    `SELECT ledger_natural_balance(normal_side, balance)::text AS bal
       FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id
      WHERE a.key = $1`,
    [`user:${playerId}:available`]
  );
  return BigInt(r.rows[0]?.bal ?? "0");
}

async function transferCount() {
  return Number((await db.query("SELECT count(*)::int AS n FROM local_transfer_observed")).rows[0].n);
}

async function intent(playerId, { amountEgp, name, phone, network = "VODAFONE_CASH", numberId = vfNumberId }) {
  const r = await localPayments.createDepositIntent({
    playerId, network, receivingNumberId: numberId,
    senderName: name, senderPhone: phone, amountEgpMinor: amountEgp * 100,
  });
  assert.ok(r.ok, JSON.stringify(r));
  return r.intent.id;
}

/** A Vodafone Cash receipt in the real captured format (see sms-parsers.test.mjs). */
function vfReceipt({ amount, phone, name, ref, balance }) {
  const lines = [
    `تم استلام مبلغ ${amount}.00 جنيه من رقم ${phone} المسجل بإسم ${name} على رقم محفظتك  01069999557.`,
    `رصيدك الحالي: ${balance} جنيه`,
    `تاريخ العملية: 21:50 26-08-19`,
  ];
  if (ref) lines.push(`رقم العملية: ${ref}`);
  lines.push("تابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash");
  return lines.join("\n");
}

let keyCounter = 0;
const newKey = () => `test-key-${String(++keyCounter).padStart(8, "0")}-${Date.now()}`;

function report(device, body) {
  return req("POST", "/v1/payment-receiver/transactions", {
    headers: { "x-device-api-key": device.apiKey },
    body: { network: "VODAFONE_CASH", receivingNumberId: vfNumberId, observedAt: new Date().toISOString(), smsSender: "VF-Cash", ...body },
  });
}

describe("Payment Receiver device API integrity", () => {
  let device, otherDevice;

  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root','root@nizalo.com','Root',TRUE),('bootstrap','bootstrap@nizalo.com','Bootstrap',TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test' WHERE key IN ('DEPOSITS','WITHDRAWALS')");

    auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
    await auth.register({ playerId: "root", handle: "root_admin", password: PASSWORD });
    await db.query(`INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('root','SUPER_ADMIN','bootstrap','test bootstrap')`);
    tokenRoot = (await auth.login({ identifier: "root_admin", password: PASSWORD })).accessToken;

    const paymentSvc = createPaymentService(db, {
      chain: { supportedRails: [] },
      config: { reviewThresholdMinor: 500_000_000n },
    });
    localPayments = createLocalPaymentsService(db);
    api = createApi({ db, auth, paymentSvc, localPayments, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
    await api.listen();

    const rate = await localPayments.setEgpRate({ egpPerUsd: 50, adminId: "root", reason: "test rate" });
    assert.ok(rate.ok);
    const numbers = await localPayments.listNumbers();
    vfNumberId = numbers.find((n) => n.network === "VODAFONE_CASH" && n.enabled).id;
    ipnNumberId = numbers.find((n) => n.network === "INSTAPAY" && n.enabled).id;

    device = await issueDevice("Operator Phone A");
    otherDevice = await issueDevice("Operator Phone B");
  });

  after(async () => {
    await api?.close();
    await db?.close?.();
  });

  describe("health", () => {
    test("a valid key answers ONLINE and names the device", async () => {
      const r = await req("GET", "/v1/payment-receiver/health", { headers: { "x-device-api-key": device.apiKey } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.server, "ONLINE");
      assert.equal(r.body.device.label, "Operator Phone A");
    });

    test("a wrong key is 401, not ONLINE -- the app must not show 'connected'", async () => {
      const r = await req("GET", "/v1/payment-receiver/health", { headers: { "x-device-api-key": "prk_definitely_not_a_real_key_000" } });
      assert.equal(r.status, 401);
    });

    test("a disabled device is 401", async () => {
      const temp = await issueDevice("Temp");
      const step = await stepUp(tokenRoot, "admin.local_rail.manage");
      await req("POST", `/v1/admin/payments/local/devices/${temp.id}/status`, {
        token: tokenRoot, headers: { "x-step-up-token": step }, body: { enabled: false },
      });
      const r = await req("GET", "/v1/payment-receiver/health", { headers: { "x-device-api-key": temp.apiKey } });
      assert.equal(r.status, 401);
    });
  });

  describe("reporting a receipt", () => {
    test("a receipt matching exactly one intent is credited once, at the server's amount", async () => {
      await newPlayer("p_success");
      await intent("p_success", { amountEgp: 500, name: "أمنيه محمد شقره", phone: "01515339319" });
      const before = await available("p_success");

      const r = await report(device, {
        clientTransactionId: newKey(),
        amountEgpMinor: 1, // what the device claims is ignored: the server reads the receipt itself
        rawMessage: vfReceipt({ amount: 500, phone: "01515339319", name: "أمنيه محمد شقره", ref: "022857190001", balance: "1000.00" }),
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.outcome, "SUCCESS");
      assert.equal(r.body.transaction.credited, true);
      assert.equal(r.body.transaction.amountEgpMinor, "50000");
      assert.equal(r.body.transaction.playerHandle, "p_success");
      assert.equal((await available("p_success")) - before, 10_000_000n, "500 EGP at 50/USD = 10 USDT");
    });

    test("the same report retried under the same key is ALREADY_PROCESSED and credits nothing", async () => {
      await newPlayer("p_retry");
      await intent("p_retry", { amountEgp: 600, name: "Retry Person", phone: "01011110001" });
      const key = newKey();
      const body = {
        clientTransactionId: key,
        rawMessage: vfReceipt({ amount: 600, phone: "01011110001", name: "Retry Person", ref: "022857190002", balance: "1600.00" }),
      };
      const first = await report(device, body);
      assert.equal(first.body.outcome, "SUCCESS");
      const afterFirst = await available("p_retry");
      const rows = await transferCount();

      const again = await report(device, body);
      assert.equal(again.status, 200);
      assert.equal(again.body.outcome, "ALREADY_PROCESSED");
      assert.equal(again.body.transaction.id, first.body.transaction.id);
      assert.equal(again.body.transaction.credited, true, "the retry still reports the original result");
      assert.equal(await available("p_retry"), afterFirst);
      assert.equal(await transferCount(), rows);
    });

    test("the same receipt under a NEW key is DUPLICATE and credits nothing", async () => {
      await newPlayer("p_dup");
      await intent("p_dup", { amountEgp: 700, name: "Dup Person", phone: "01011110002" });
      const rawMessage = vfReceipt({ amount: 700, phone: "01011110002", name: "Dup Person", ref: "022857190003", balance: "2300.00" });
      const first = await report(device, { clientTransactionId: newKey(), rawMessage });
      assert.equal(first.body.outcome, "SUCCESS");
      const afterFirst = await available("p_dup");

      // A reinstalled app, or the other phone, sees the same SMS.
      const second = await report(otherDevice, { clientTransactionId: newKey(), rawMessage });
      assert.equal(second.body.outcome, "DUPLICATE");
      assert.equal(second.body.transaction.id, first.body.transaction.id);
      assert.equal(await available("p_dup"), afterFirst);
    });

    test("REGRESSION: a receipt with no reference, retried after a lost response, cannot pay a second intent", async () => {
      // The hole 0072 closes: UNIQUE(network, transaction_ref) admits any
      // number of NULL refs, so before client keys and fingerprints a retry
      // of a reference-less receipt was a brand new transfer.
      await newPlayer("p_noref");
      await intent("p_noref", { amountEgp: 800, name: "No Ref Person", phone: "01011110003" });
      const rawMessage = vfReceipt({ amount: 800, phone: "01011110003", name: "No Ref Person", ref: null, balance: "3100.00" });
      const key = newKey();

      const first = await report(device, { clientTransactionId: key, rawMessage });
      assert.equal(first.body.outcome, "SUCCESS");
      assert.equal(first.body.transaction.transactionRef, null);
      const credited = await available("p_noref");

      // The player now declares a SECOND identical deposit they never paid.
      const secondIntent = await intent("p_noref", { amountEgp: 800, name: "No Ref Person", phone: "01011110003" });

      const retry = await report(device, { clientTransactionId: key, rawMessage });
      assert.equal(retry.body.outcome, "ALREADY_PROCESSED");
      const reinstall = await report(device, { clientTransactionId: newKey(), rawMessage });
      assert.equal(reinstall.body.outcome, "DUPLICATE");

      assert.equal(await available("p_noref"), credited, "one real payment, one credit");
      const pending = await db.query("SELECT status FROM local_deposit_intent WHERE id = $1", [secondIntent]);
      assert.equal(pending.rows[0].status, "PENDING");
    });

    test("a receipt the server cannot read is recorded for review and never credited, even when an intent would fit", async () => {
      await newPlayer("p_unparsed");
      await intent("p_unparsed", { amountEgp: 900, name: "Unparsed Person", phone: "01011110004" });
      const before = await available("p_unparsed");

      const r = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: "You received 900.00 EGP from 01011110004 Unparsed Person",
        amountEgpMinor: 90000, senderPhone: "01011110004", senderName: "Unparsed Person",
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "UNPARSEABLE");
      assert.equal(r.body.transaction.credited, false);
      assert.equal(await available("p_unparsed"), before);
    });

    test("SECURITY: a perfect receipt texted from a personal number is recorded but never credited", async () => {
      // The forgery: the attacker declares an intent, then texts the
      // operator's phone the exact receipt wording from their own SIM.
      await newPlayer("p_forger");
      await intent("p_forger", { amountEgp: 5000, name: "Forger", phone: "01012340000" });
      const r = await report(device, {
        clientTransactionId: newKey(),
        smsSender: "+201012340000",
        rawMessage: vfReceipt({ amount: 5000, phone: "01012340000", name: "Forger", ref: "022857190099", balance: "9999.00" }),
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "UNTRUSTED_SENDER");
      assert.equal(r.body.transaction.smsSender, "+201012340000");
      assert.equal(await available("p_forger"), 0n);
    });

    test("a receipt whose sender the phone could not capture ('unknown') is held for review", async () => {
      await newPlayer("p_unknown");
      await intent("p_unknown", { amountEgp: 4000, name: "Unknown Sender", phone: "01012340001" });
      const r = await report(device, {
        clientTransactionId: newKey(), smsSender: "unknown",
        rawMessage: vfReceipt({ amount: 4000, phone: "01012340001", name: "Unknown Sender", ref: "022857190097", balance: "8888.00" }),
      });
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "UNTRUSTED_SENDER");
      assert.equal(await available("p_unknown"), 0n);
    });

    test("the typed route requires the SMS sender", async () => {
      const r = await report(device, {
        clientTransactionId: newKey(), smsSender: undefined,
        rawMessage: vfReceipt({ amount: 5, phone: "01011110099", name: "X", ref: "022857190098", balance: "1.00" }),
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "INVALID_SENDER");
    });

    test("a receipt that reads as the other provider is not credited", async () => {
      const r = await report(device, {
        clientTransactionId: newKey(),
        network: "INSTAPAY", receivingNumberId: ipnNumberId, amountEgpMinor: 50000,
        rawMessage: vfReceipt({ amount: 500, phone: "01011110005", name: "Mismatch", ref: "022857190005", balance: "10.00" }),
      });
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "NETWORK_MISMATCH");
    });

    test("two intents that both fit leave the receipt for a human, crediting neither", async () => {
      await newPlayer("p_amb1");
      await newPlayer("p_amb2");
      await intent("p_amb1", { amountEgp: 1000, name: "Same Name", phone: "01099990001" });
      await intent("p_amb2", { amountEgp: 1000, name: "Same Name", phone: "01099990002" });

      const r = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: vfReceipt({ amount: 1000, phone: "01088880000", name: "Same Name", ref: "022857190006", balance: "20.00" }),
      });
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "AMBIGUOUS_MATCH");
      assert.equal(await available("p_amb1"), 0n);
      assert.equal(await available("p_amb2"), 0n);
    });

    test("a phone declared with +20 and spaces still matches the receipt's 01... number", async () => {
      await newPlayer("p_phone");
      await intent("p_phone", { amountEgp: 1100, name: "Different Declared Name", phone: "+20 10 1111 0007" });
      const r = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: vfReceipt({ amount: 1100, phone: "01011110007", name: "Wallet Registered Name", ref: "022857190007", balance: "30.00" }),
      });
      assert.equal(r.body.outcome, "SUCCESS", JSON.stringify(r.body));
    });

    test("no fitting intent: recorded as NEEDS_REVIEW with a reason", async () => {
      const r = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: vfReceipt({ amount: 1234, phone: "01011110008", name: "Nobody", ref: "022857190008", balance: "40.00" }),
      });
      assert.equal(r.body.outcome, "NEEDS_REVIEW");
      assert.equal(r.body.transaction.reviewReason, "NO_MATCHING_INTENT");
    });

    test("malformed requests are refused before anything is stored", async () => {
      const rows = await transferCount();
      const rawMessage = vfReceipt({ amount: 5, phone: "01011110009", name: "X", ref: "022857190009", balance: "1.00" });

      const badKey = await report(device, { clientTransactionId: "short", rawMessage });
      assert.equal(badKey.status, 400);
      assert.equal(badKey.body.error.code, "INVALID_IDEMPOTENCY_KEY");

      const future = await report(device, {
        clientTransactionId: newKey(), rawMessage,
        observedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      assert.equal(future.status, 400);
      assert.equal(future.body.error.code, "INVALID_OBSERVED_AT");

      const empty = await report(device, { clientTransactionId: newKey(), rawMessage: "   " });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.error.code, "INVALID_MESSAGE");

      const badNumber = await report(device, { clientTransactionId: newKey(), rawMessage, receivingNumberId: "nope" });
      assert.equal(badNumber.status, 422);

      const noKey = await req("POST", "/v1/payment-receiver/transactions", { body: { rawMessage } });
      assert.equal(noKey.status, 401);

      assert.equal(await transferCount(), rows);
    });

    test("the legacy /transfers route (installed APKs) gets the same duplicate protection", async () => {
      const rawMessage = vfReceipt({ amount: 1300, phone: "01011110010", name: "Legacy", ref: null, balance: "50.00" });
      const body = { network: "VODAFONE_CASH", receivingNumberId: vfNumberId, amountEgpMinor: 130000, rawMessage };
      const first = await req("POST", "/v1/payment-receiver/transfers", { headers: { "x-device-api-key": device.apiKey }, body });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(first.body.status, "UNMATCHED");
      const second = await req("POST", "/v1/payment-receiver/transfers", { headers: { "x-device-api-key": device.apiKey }, body });
      assert.equal(second.body.status, "IGNORED");
    });
  });

  describe("status and statistics", () => {
    test("a device can read the current status of its own reports, and only its own", async () => {
      const r = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: vfReceipt({ amount: 1400, phone: "01011110011", name: "Status", ref: "022857190011", balance: "60.00" }),
      });
      const id = r.body.transaction.id;

      const mine = await req("GET", `/v1/payment-receiver/transactions?ids=${id}`, { headers: { "x-device-api-key": device.apiKey } });
      assert.equal(mine.status, 200);
      assert.equal(mine.body.transactions.length, 1);
      assert.equal(mine.body.transactions[0].status, "UNMATCHED");

      const theirs = await req("GET", `/v1/payment-receiver/transactions?ids=${id}`, { headers: { "x-device-api-key": otherDevice.apiKey } });
      assert.equal(theirs.body.transactions.length, 0);
    });

    test("statistics count today's reports for this device", async () => {
      const r = await req("GET", "/v1/payment-receiver/statistics", { headers: { "x-device-api-key": device.apiKey } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const s = r.body.statistics;
      assert.ok(s.received >= 10, `received=${s.received}`);
      assert.ok(s.credited >= 4, `credited=${s.credited}`);
      assert.equal(s.received, s.credited + s.needsReview);
      assert.equal(typeof s.pendingWithdrawals, "number");
      assert.equal(typeof s.pendingDeposits, "number");
    });
  });

  describe("confirming a payout", () => {
    let playerToken, withdrawalId;

    before(async () => {
      playerToken = await newPlayer("p_payout");
      await intent("p_payout", { amountEgp: 1500, name: "Payout Person", phone: "01011110020" });
      const dep = await report(device, {
        clientTransactionId: newKey(),
        rawMessage: vfReceipt({ amount: 1500, phone: "01011110020", name: "Payout Person", ref: "022857190020", balance: "70.00" }),
      });
      assert.equal(dep.body.outcome, "SUCCESS");

      const step = await stepUp(playerToken, "wallet.withdraw");
      const w = await req("POST", "/v1/players/p_payout/withdrawals", {
        token: playerToken, headers: { "x-step-up-token": step },
        body: { amount: 10, asset: "USDT", network: "VODAFONE_CASH", destination: "01033334444" },
      });
      assert.equal(w.status, 201, JSON.stringify(w.body));
      withdrawalId = w.body.withdrawal.id;
    });

    async function settledDebits() {
      const r = await db.query(
        `SELECT count(*)::int AS n FROM ledger_transaction WHERE idempotency_key = $1`,
        [`withdrawal:${withdrawalId}:debit`]
      );
      return r.rows[0].n;
    }

    test("the detail shows what to send, in pounds, and that it is actionable", async () => {
      const r = await req("GET", `/v1/payment-receiver/withdrawals/${withdrawalId}`, { headers: { "x-device-api-key": device.apiKey } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const w = r.body.withdrawal;
      assert.equal(w.playerHandle, "p_payout");
      assert.equal(w.destination, "01033334444");
      assert.equal(w.receiverStatus, "PENDING");
      assert.equal(w.actionable, true);
      assert.equal(w.amountEgpMinor, "50000", "10 USDT at 50 EGP/USD");
      assert.equal(w.amountEgpToSend, "500");
    });

    test("a double-tap sends two confirmations with one key: exactly one debit", async () => {
      const key = newKey();
      const send = () => req("POST", `/v1/payment-receiver/withdrawals/${withdrawalId}/confirm`, {
        headers: { "x-device-api-key": device.apiKey }, body: { idempotencyKey: key },
      });
      const results = await Promise.all([send(), send(), send(), send(), send()]);
      for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
      const outcomes = results.map((r) => r.body.outcome).sort();
      assert.deepEqual(outcomes, ["ALREADY_PROCESSED", "ALREADY_PROCESSED", "ALREADY_PROCESSED", "ALREADY_PROCESSED", "COMPLETED"]);
      assert.equal(results[0].body.withdrawal.receiverStatus, "COMPLETED");
      assert.equal(await settledDebits(), 1);
    });

    test("a confirmation under a fresh key after completion is ALREADY_PROCESSED, still one debit", async () => {
      const r = await req("POST", `/v1/payment-receiver/withdrawals/${withdrawalId}/confirm`, {
        headers: { "x-device-api-key": otherDevice.apiKey }, body: { idempotencyKey: newKey(), reference: "VF-999" },
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.outcome, "ALREADY_PROCESSED");
      assert.equal(await settledDebits(), 1);
    });

    test("a key already used for one payout cannot confirm a different one", async () => {
      const used = (await db.query(
        "SELECT idempotency_key FROM payment_receiver_withdrawal_confirmation WHERE withdrawal_id = $1", [withdrawalId]
      )).rows[0].idempotency_key;

      const step = await stepUp(playerToken, "wallet.withdraw");
      const w2 = await req("POST", "/v1/players/p_payout/withdrawals", {
        token: playerToken, headers: { "x-step-up-token": step },
        body: { amount: 10, asset: "USDT", network: "VODAFONE_CASH", destination: "01033335555" },
      });
      assert.equal(w2.status, 201, JSON.stringify(w2.body));

      const r = await req("POST", `/v1/payment-receiver/withdrawals/${w2.body.withdrawal.id}/confirm`, {
        headers: { "x-device-api-key": device.apiKey }, body: { idempotencyKey: used },
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "INVALID_IDEMPOTENCY_KEY");
      const still = await db.query("SELECT status::text AS s FROM withdrawal WHERE id = $1", [w2.body.withdrawal.id]);
      assert.equal(still.rows[0].s, "APPROVED");
    });

    test("an unknown payout is 404; a missing key is 400", async () => {
      const unknown = await req("POST", "/v1/payment-receiver/withdrawals/wd_nope/confirm", {
        headers: { "x-device-api-key": device.apiKey }, body: { idempotencyKey: newKey() },
      });
      assert.equal(unknown.status, 404);
      const noKey = await req("POST", `/v1/payment-receiver/withdrawals/${withdrawalId}/confirm`, {
        headers: { "x-device-api-key": device.apiKey }, body: {},
      });
      assert.equal(noKey.status, 400);
    });
  });

  describe("rate limiting", () => {
    test("each device has its own budget, and exhausting one never blocks another", async () => {
      const noisy = await issueDevice("Noisy");
      let limited = 0;
      for (let i = 0; i < 150; i++) {
        const r = await req("GET", "/v1/payment-receiver/health", { headers: { "x-device-api-key": noisy.apiKey } });
        if (r.status === 429) limited++;
      }
      assert.ok(limited > 0, "a device hammering the API is eventually refused");
      const calm = await req("GET", "/v1/payment-receiver/health", { headers: { "x-device-api-key": device.apiKey } });
      assert.equal(calm.status, 200);
    });
  });

  describe("receipt fingerprint", () => {
    test("whitespace, bidi marks and Arabic-Indic digits do not change it", () => {
      const a = "تم استلام مبلغ 500.00 جنيه\nرقم العملية: 123";
      const b = "  تم  استلام مبلغ ٥٠٠.٠٠ جنيه ‏\r\nرقم العملية: ١٢٣ ";
      assert.equal(normalizeReceiptText(a), normalizeReceiptText(b));
      assert.equal(receiptFingerprint("VODAFONE_CASH", a), receiptFingerprint("VODAFONE_CASH", b));
    });

    test("a different amount or network is a different receipt", () => {
      const a = "تم استلام مبلغ 500.00 جنيه";
      assert.notEqual(receiptFingerprint("VODAFONE_CASH", a), receiptFingerprint("VODAFONE_CASH", a.replace("500", "501")));
      assert.notEqual(receiptFingerprint("VODAFONE_CASH", a), receiptFingerprint("INSTAPAY", a));
    });
  });
});
