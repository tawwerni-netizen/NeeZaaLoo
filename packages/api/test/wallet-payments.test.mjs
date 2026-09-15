import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createOxapayProvider } from "../../payments/src/oxapay.mjs";

const SIGNING_KEY = Buffer.alloc(32, 5);
const ENCRYPTION_KEY = Buffer.alloc(32, 6);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const MERCHANT_KEY = "oxapay_merchant_secret_key_123";

let db, auth, api, tokenAlice, provider;

async function req(method, path, { token, body, headers = {} } = {}) {
  const url = new URL(path, api.url);
  const reqHeaders = { ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) reqHeaders["content-type"] = "application/json";

  const res = await fetch(url.href, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, text, headers: res.headers };
}

describe("Wallet & OxaPay Payments API", () => {
  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root', 'root@nizalo.com', 'Root', TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test deposits' WHERE key='DEPOSITS'");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test withdrawals' WHERE key='WITHDRAWALS'");

    auth = createAuthService(db, {
      signingKey: SIGNING_KEY,
      encryptionKey: ENCRYPTION_KEY,
      argon: FAST_ARGON,
    });

    const regRes = await auth.register({ playerId: "alice", handle: "alice", password: "correct horse battery staple" });
    assert.equal(regRes.ok, true, `register should succeed: ${JSON.stringify(regRes)}`);
    const loginRes = await auth.login({ identifier: "alice", password: "correct horse battery staple" });
    assert.equal(loginRes.ok, true, `login should succeed: ${JSON.stringify(loginRes)}`);
    tokenAlice = loginRes.accessToken;

    provider = createOxapayProvider({
      merchantApiKey: MERCHANT_KEY,
      payoutApiKey: "payout_key_123",
      http: async (method, url, opts) => {
        return {
          result: 100,
          trackId: 11223344,
          address: "TRealOxapayDepositAddressTRC20Official",
          qrCode: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        };
      },
    });

    api = createApi({
      db,
      auth,
      paymentProvider: provider,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await api.listen();
  });

  after(async () => {
    await api?.close();
    await db?.close?.();
  });
  test("GET /v1/players/:id/wallet returns accounts, withdrawals, and deposits", async () => {
    const res = await req("GET", "/v1/players/alice/wallet", { token: tokenAlice });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.accounts), "accounts should be array");
    assert.ok(Array.isArray(res.body.withdrawals), "withdrawals should be array");
    assert.ok(Array.isArray(res.body.deposits), "deposits should be array");
  });

  test("POST /v1/players/:id/deposits generates dynamic OxaPay deposit address and record", async () => {
    const res = await req("POST", "/v1/players/alice/deposits", {
      token: tokenAlice,
      body: { asset: "USDT", network: "TRC20", amount: 20 },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.deposit.address, "TRealOxapayDepositAddressTRC20Official");
    assert.equal(res.body.deposit.network, "TRC20");
    assert.equal(res.body.deposit.asset, "USDT");
    assert.ok(res.body.deposit.qrCodeUrl);

    // Verify row in deposit table
    const depCheck = await db.query("SELECT * FROM deposit WHERE player_id = 'alice'");
    assert.equal(depCheck.rows.length, 1);
    assert.equal(depCheck.rows[0].address, "TRealOxapayDepositAddressTRC20Official");
    assert.equal(depCheck.rows[0].status, "AWAITING_PAYMENT");
  });

  test("POST /v1/payments/oxapay/webhook verifies HMAC and marks deposit as CREDITED", async () => {
    const webhookPayload = {
      trackId: "11223344",
      status: "Paid",
      amount: "20.00",
      pay_currency: "USDT",
      currency: "USD",
      txID: "0xblockchain_tx_hash_123456",
    };
    const rawBody = Buffer.from(JSON.stringify(webhookPayload));
    const hmacSig = createHmac("sha512", MERCHANT_KEY).update(rawBody).digest("hex");

    const res = await req("POST", "/v1/payments/oxapay/webhook", {
      body: webhookPayload,
      headers: {
        HMAC: hmacSig,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.text, "ok");

    // Verify deposit was credited in DB
    const dep = await db.query("SELECT * FROM deposit WHERE provider_ref = '11223344'");
    assert.equal(dep.rows[0].status, "CREDITED");
    assert.equal(BigInt(dep.rows[0].observed_amount_minor), 20_000_000n);

    // Verify Alice's available balance in ledger was credited
    const bal = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id WHERE a.key = 'user:alice:available'"
    );
    assert.equal(BigInt(bal.rows[0]?.bal), 20_000_000n);
  });
});
