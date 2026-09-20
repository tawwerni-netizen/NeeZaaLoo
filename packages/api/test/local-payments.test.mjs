import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createLocalPaymentsService } from "../../payments/src/local-payments.mjs";

const SIGNING_KEY = Buffer.alloc(32, 7);
const ENCRYPTION_KEY = Buffer.alloc(32, 8);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const PASSWORD = "correct horse battery staple";

let db, auth, api;

async function req(method, path, { token, body, headers = {} } = {}) {
  const url = new URL(path, api.url);
  const reqHeaders = { ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) reqHeaders["content-type"] = "application/json";
  const res = await fetch(url.href, {
    method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, text };
}

async function stepUp(token, action) {
  const r = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(r.status, 200, `step-up for ${action} failed: ${JSON.stringify(r.body)}`);
  return r.body.stepUpToken;
}

describe("Local EGP payment rails (Vodafone Cash / InstaPay)", () => {
  let tokenAlice, tokenRoot;

  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root','root@nizalo.com','Root',TRUE),('bootstrap','bootstrap@nizalo.com','Bootstrap',TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test deposits' WHERE key='DEPOSITS'");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test withdrawals' WHERE key='WITHDRAWALS'");

    auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });

    const regAlice = await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
    assert.equal(regAlice.ok, true, JSON.stringify(regAlice));
    tokenAlice = (await auth.login({ identifier: "alice", password: PASSWORD })).accessToken;

    const regRoot = await auth.register({ playerId: "root", handle: "root_admin", password: PASSWORD });
    assert.equal(regRoot.ok, true, JSON.stringify(regRoot));
    await db.query(`INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('root','SUPER_ADMIN','bootstrap','test bootstrap')`);
    tokenRoot = (await auth.login({ identifier: "root_admin", password: PASSWORD })).accessToken;

    const paymentSvc = createPaymentService(db, {
      chain: { supportedRails: [] }, // no crypto rail declared -- irrelevant to local rails
      config: { reviewThresholdMinor: 500_000_000n },
    });
    const localPayments = createLocalPaymentsService(db);

    api = createApi({
      db, auth, paymentSvc, localPayments,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await api.listen();
  });

  after(async () => {
    await api?.close();
    await db?.close?.();
  });

  test("GET /v1/payments/local-rails lists the seeded numbers with initial rate set", async () => {
    const res = await req("GET", "/v1/payments/local-rails");
    assert.equal(res.status, 200);
    assert.equal(res.body.numbers.length, 4);
    assert.equal(res.body.rate.egpPerUsd, 50);
  });

  test("setting the EGP rate requires step-up and rail.manage capability", async () => {
    const noAuth = await req("POST", "/v1/admin/payments/local/rate", {
      token: tokenRoot, body: { egpPerUsd: 50, reason: "launch rate" },
    });
    assert.equal(noAuth.status, 401, JSON.stringify(noAuth.body));

    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("POST", "/v1/admin/payments/local/rate", {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { egpPerUsd: 50, reason: "launch rate" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.rate.usdRateX1e8, "2000000");
    assert.equal(res.body.rate.egpPerUsd, 50);

    const rails = await req("GET", "/v1/payments/local-rails");
    assert.equal(rails.body.rate.egpPerUsd, 50);
  });

  let intentId;

  test("a player creates a local deposit intent, choosing one of the operator's numbers", async () => {
    const numbers = await req("GET", "/v1/payments/local-rails");
    const vfNumber = numbers.body.numbers.find((n) => n.network === "VODAFONE_CASH");
    assert.ok(vfNumber, "should have a Vodafone Cash number available");

    const res = await req("POST", "/v1/players/alice/local-deposits", {
      token: tokenAlice,
      body: {
        network: "VODAFONE_CASH", receivingNumberId: vfNumber.id,
        senderName: "Alice Ahmed", senderPhone: "01011112222",
        amountEgpMinor: 100000, // 1000.00 EGP -> 20.000000 USDT at 1:50
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.intent.status, "PENDING");
    intentId = res.body.intent.id;

    const mine = await req("GET", "/v1/players/alice/local-deposits", { token: tokenAlice });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.intents.some((i) => i.id === intentId), true);
  });

  test("a deposit intent below the rail's minimum is refused", async () => {
    const numbers = await req("GET", "/v1/payments/local-rails");
    const vfNumber = numbers.body.numbers.find((n) => n.network === "VODAFONE_CASH");
    const res = await req("POST", "/v1/players/alice/local-deposits", {
      token: tokenAlice,
      body: {
        network: "VODAFONE_CASH", receivingNumberId: vfNumber.id,
        senderName: "Alice Ahmed", senderPhone: "01011112222",
        amountEgpMinor: 10, // 0.10 EGP -> far below the 1.000000 USDT rail minimum
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "BELOW_MINIMUM");
  });

  test("crediting a deposit without four-eyes approval is refused", async () => {
    const token = await stepUp(tokenRoot, "admin.local_deposit.credit");
    const res = await req("POST", `/v1/admin/payments/local/deposits/${intentId}/credit`, {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { senderName: "Alice Ahmed", senderPhone: "01011112222", amountEgpMinor: 100000, note: "seen on my phone" },
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
  });

  test("the solo credit path: admin manually logs the observed transfer and it is credited to USDT", async () => {
    const token = await stepUp(tokenRoot, "admin.local_deposit.credit_solo");
    const res = await req("POST", `/v1/admin/payments/local/deposits/${intentId}/credit-solo`, {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { senderName: "Alice Ahmed", senderPhone: "01011112222", amountEgpMinor: 100000, note: "seen on my phone" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.intent.status, "CREDITED");
    assert.equal(Number(res.body.intent.credited_amount_usdt_minor), 20_000_000);

    const bal = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id WHERE a.key = 'user:alice:available'"
    );
    assert.equal(BigInt(bal.rows[0]?.bal), 20_000_000n);
  });

  test("crediting the same intent again is a no-op, not a double credit", async () => {
    const token = await stepUp(tokenRoot, "admin.local_deposit.credit_solo");
    const res = await req("POST", `/v1/admin/payments/local/deposits/${intentId}/credit-solo`, {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { amountEgpMinor: 100000 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.intent.status, "CREDITED");
    const bal = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id WHERE a.key = 'user:alice:available'"
    );
    assert.equal(BigInt(bal.rows[0]?.bal), 20_000_000n, "no second credit");
  });

  let localWithdrawalId;

  test("a player requests a withdrawal to Vodafone Cash, reusing the ordinary withdrawal route", async () => {
    const step = await stepUp(tokenAlice, "wallet.withdraw");
    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice, headers: { "x-step-up-token": step },
      body: { amount: 10, asset: "USDT", network: "VODAFONE_CASH", destination: "01011112222" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    // Below the $500 review threshold and a local rail -- assess() clears it
    // to APPROVED, and process() (crypto-only) never runs, so it should sit
    // exactly where the admin's manual completion expects to find it.
    assert.equal(res.body.withdrawal.status, "APPROVED");
    localWithdrawalId = res.body.withdrawal.id;
  });

  test("GET /v1/admin/payments/local/withdrawals lists it for the operator", async () => {
    const res = await req("GET", "/v1/admin/payments/local/withdrawals", { token: tokenRoot });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.withdrawals.some((w) => w.id === localWithdrawalId), true);
  });

  test("the solo complete path: admin attests to having sent the EGP by hand", async () => {
    const token = await stepUp(tokenRoot, "admin.local_withdrawal.complete_solo");
    const res = await req("POST", `/v1/admin/payments/local/withdrawals/${localWithdrawalId}/complete-solo`, {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { reference: "VF-REF-99887" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.withdrawal.status, "COMPLETED");
    assert.equal(res.body.withdrawal.reference, "VF-REF-99887");

    const stillPending = await req("GET", "/v1/admin/payments/local/withdrawals", { token: tokenRoot });
    assert.equal(stillPending.body.withdrawals.some((w) => w.id === localWithdrawalId), false);
  });

  test("an admin can disable a receiving number and it disappears from the public list", async () => {
    const numbers = await req("GET", "/v1/admin/payments/local/numbers", { token: tokenRoot });
    assert.equal(numbers.status, 200, JSON.stringify(numbers.body));
    const target = numbers.body.numbers.find((n) => n.id === "vf_2");
    assert.ok(target);

    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("POST", `/v1/admin/payments/local/numbers/${target.id}/status`, {
      token: tokenRoot, headers: { "x-step-up-token": token }, body: { enabled: false },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const rails = await req("GET", "/v1/payments/local-rails");
    assert.equal(rails.body.numbers.some((n) => n.id === "vf_2"), false);
  });

  test("an admin can add a new receiving number and it appears immediately", async () => {
    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("POST", "/v1/admin/payments/local/numbers", {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { network: "INSTAPAY", phoneNumber: "01099998888", label: "backup" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const rails = await req("GET", "/v1/payments/local-rails");
    assert.equal(rails.body.numbers.some((n) => n.phoneNumber === "01099998888"), true);
  });

  test("an admin rejects a bogus deposit intent with no four-eyes, no step-up", async () => {
    const numbers = await req("GET", "/v1/payments/local-rails");
    const vfNumber = numbers.body.numbers.find((n) => n.network === "VODAFONE_CASH");
    const created = await req("POST", "/v1/players/alice/local-deposits", {
      token: tokenAlice,
      body: {
        network: "VODAFONE_CASH", receivingNumberId: vfNumber.id,
        senderName: "Mallory", senderPhone: "01000000000", amountEgpMinor: 25000,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const res = await req("POST", `/v1/admin/payments/local/deposits/${created.body.intent.id}/reject`, {
      token: tokenRoot, body: { reason: "no matching transfer ever arrived" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.intent.status, "REJECTED");
  });
});
