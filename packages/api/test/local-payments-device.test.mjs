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

describe("Local EGP payment rails - Device App", () => {
  let tokenAlice, tokenRoot, deviceKey, deviceId;
  let intentId, transferId;

  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root','root@nizalo.com','Root',TRUE),('bootstrap','bootstrap@nizalo.com','Bootstrap',TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test deposits' WHERE key='DEPOSITS'");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test withdrawals' WHERE key='WITHDRAWALS'");

    auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });

    const regAlice = await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
    tokenAlice = (await auth.login({ identifier: "alice", password: PASSWORD })).accessToken;

    const regRoot = await auth.register({ playerId: "root", handle: "root_admin", password: PASSWORD });
    await db.query(`INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('root','SUPER_ADMIN','bootstrap','test bootstrap')`);
    tokenRoot = (await auth.login({ identifier: "root_admin", password: PASSWORD })).accessToken;

    const paymentSvc = createPaymentService(db, {
      chain: { supportedRails: [] }, // no crypto rail declared
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

  test("issue a new device key for the android app", async () => {
    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("POST", "/v1/admin/payments/local/devices", {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { label: "Operator Phone 1" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.device.label, "Operator Phone 1");
    assert.ok(res.body.device.apiKey);
    deviceKey = res.body.device.apiKey;
    deviceId = res.body.device.id;
  });

  test("list devices", async () => {
    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("GET", "/v1/admin/payments/local/devices", { 
      token: tokenRoot,
      headers: { "x-step-up-token": token }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.devices.length, 1);
    assert.equal(res.body.devices[0].label, "Operator Phone 1");
    assert.equal(res.body.devices[0].id, deviceId);
  });

  test("set the EGP rate", async () => {
    const token = await stepUp(tokenRoot, "admin.local_rail.manage");
    const res = await req("POST", "/v1/admin/payments/local/rate", {
      token: tokenRoot, headers: { "x-step-up-token": token },
      body: { egpPerUsd: 50, reason: "launch rate" },
    });
    assert.equal(res.status, 200);
  });

  test("device reporting an unmatched transfer", async () => {
    const numbers = await req("GET", "/v1/payments/local-rails");
    const vfNumber = numbers.body.numbers.find((n) => n.network === "VODAFONE_CASH");

    const res = await req("POST", "/v1/payment-receiver/transfers", {
      headers: { "x-device-api-key": deviceKey },
      body: {
        network: "VODAFONE_CASH",
        receivingNumberId: vfNumber.id,
        rawSenderName: "Bob",
        rawSenderPhone: "01099999999",
        amountEgpMinor: 150000,
        rawMessage: "You received 1500.00 EGP from Bob",
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "UNMATCHED");
    assert.ok(res.body.transferId);
    transferId = res.body.transferId;
  });

  test("list unmatched transfers as admin", async () => {
    const res = await req("GET", "/v1/admin/payments/local/transfers/unmatched", { token: tokenRoot });
    assert.equal(res.status, 200);
    assert.equal(res.body.transfers.length, 1);
    assert.equal(res.body.transfers[0].id, transferId);
    assert.equal(res.body.transfers[0].rawSenderName, "Bob");
  });

  test("player creates a deposit intent", async () => {
    const numbers = await req("GET", "/v1/payments/local-rails");
    const vfNumber = numbers.body.numbers.find((n) => n.network === "VODAFONE_CASH");

    const res = await req("POST", "/v1/players/alice/local-deposits", {
      token: tokenAlice,
      body: {
        network: "VODAFONE_CASH", receivingNumberId: vfNumber.id,
        senderName: "Alice Ahmed", senderPhone: "01011112222",
        amountEgpMinor: 150000,
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    intentId = res.body.intent.id;
  });

  test("admin manually matches transfer to intent", async () => {
    const token = await stepUp(tokenRoot, "admin.local_deposit.credit_solo");
    const res = await req("POST", `/v1/admin/payments/local/deposits/${intentId}/match/${transferId}`, {
      token: tokenRoot,
      headers: { "x-step-up-token": token },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.intent.status, "CREDITED");
    
    // Check unmatched list is empty
    const un = await req("GET", "/v1/admin/payments/local/transfers/unmatched", { token: tokenRoot });
    assert.equal(un.body.transfers.length, 0);

    // Check balance
    const bal = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id WHERE a.key = 'user:alice:available'"
    );
    assert.equal(BigInt(bal.rows[0]?.bal), 30_000_000n); // 1500 EGP / 50 = 30 USD = 30,000,000 USDT minor
  });
});
