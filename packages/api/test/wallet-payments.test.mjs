import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createOxapayProvider } from "../../payments/src/oxapay.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";

const SIGNING_KEY = Buffer.alloc(32, 5);
const ENCRYPTION_KEY = Buffer.alloc(32, 6);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const MERCHANT_KEY = "oxapay_merchant_secret_key_123";

let db, auth, api, tokenAlice, provider;

/**
 * A stub chain reader -- what verifyAndCredit() checks the webhook's claim
 * AGAINST, exactly as a real BlockchainProvider (packages/chain) would.
 * `incoming[address]` is what "independently re-derived from the chain"
 * looks like; the webhook body itself never reaches the ledger directly
 * (see payments.mjs's own header on why), so this is the thing that
 * actually authorises a credit in this test, not the HMAC-signed payload.
 */
function fakeChain(incoming = {}) {
  return {
    async verifyIncoming({ network, address, requiredConfirmations }) {
      const observed = incoming[address];
      if (!observed) return { outcome: "NOT_FOUND" };
      if (observed.network !== network) return { outcome: "WRONG_NETWORK" };
      return {
        outcome: observed.confirmations >= requiredConfirmations ? "VERIFIED" : "NOT_CONFIRMED",
        txHash: observed.txHash, outputIndex: 0, network: observed.network, asset: "USDT",
        from: observed.from ?? null, to: address, amountRaw: String(observed.amountMinor),
        confirmations: observed.confirmations,
      };
    },
  };
}

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
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root', 'root@nizalo.com', 'Root', TRUE), ('root2', 'root2@nizalo.com', 'Root2', TRUE), ('bootstrap', 'bootstrap@nizalo.com', 'Bootstrap', TRUE)");
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

    // A solo SUPER_ADMIN -- 'root' -- for the approve/reject tests below.
    // 'bootstrap' only exists to satisfy admin_role_grant's own
    // admin_id <> granted_by CHECK (no admin may grant themselves a role);
    // it never logs in or acts anywhere else in this file.
    const rootReg = await auth.register({ playerId: "root", handle: "root_admin", password: "correct horse battery staple" });
    assert.equal(rootReg.ok, true, `admin register should succeed: ${JSON.stringify(rootReg)}`);
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('root','SUPER_ADMIN','bootstrap','test bootstrap')`
    );

    // A SECOND SUPER_ADMIN -- 'root2' -- exclusively for the real four-eyes
    // ceremony test below (propose by one admin, decide by a genuinely
    // different one, execute by the original requester).
    const root2Reg = await auth.register({ playerId: "root2", handle: "root_admin_2", password: "correct horse battery staple" });
    assert.equal(root2Reg.ok, true, `second admin register should succeed: ${JSON.stringify(root2Reg)}`);
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('root2','SUPER_ADMIN','bootstrap','test bootstrap')`
    );

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

    // The deposits route normalizes "TRC20" -> "TRON" before ever calling
    // paymentSvc.createDeposit() (matching the platform's one seeded
    // custody account, platform:custody:USDT:TRON) -- "TRC20" only survives
    // as the user-facing label in the API response, not what's stored on
    // the deposit row or passed to chain.verifyIncoming().
    const chain = fakeChain({
      "TRealOxapayDepositAddressTRC20Official": {
        network: "TRON", txHash: "0xrealchaintx_20usdt", amountMinor: 20_000_000, confirmations: 30,
      },
    });
    // Matches apps/api/src/index.mjs's actual production config
    // (WITHDRAWAL_REVIEW_THRESHOLD_MINOR, defaulting to 500 USDT) -- the
    // library's own default is 0n (review everything), so leaving this out
    // would test a threshold that doesn't match what's actually deployed.
    const paymentSvc = createPaymentService(db, {
      provider, chain, config: { reviewThresholdMinor: 500_000_000n },
    });

    api = createApi({
      db,
      auth,
      paymentProvider: provider,
      paymentSvc,
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
    // No QR URL is handed out at all: the client draws the code from the
    // address itself, so no outside host sees a player's deposit address or
    // gets to decide what their scanner reads. The address IS the payload.
    assert.equal(res.body.deposit.qrCodeUrl, null);

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

  const GOOD_ADDR = "T" + "9".repeat(33);

  test("a withdrawal below the review threshold is approved and processed automatically, with no human step", async () => {
    // Funds NOT tied to a `deposit` row -- exactly like the cash-tier test
    // fixtures in api.test.mjs -- so AML playthrough sees nothing unplayed
    // and the full amount is immediately withdrawable.
    await db.query(
      `SELECT ledger_post('seed-alice-withdraw-auto','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: "50000000" },
        { account: "user:alice:available", amount: "-50000000" },
      ])]
    );

    const step = await req("POST", "/v1/auth/step-up", {
      token: tokenAlice,
      body: { action: "wallet.withdraw", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `step-up failed: ${JSON.stringify(step.body)}`);

    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { amount: 20, network: "TRC20", asset: "USDT", destination: GOOD_ADDR },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    // assess() (score 0 by default) + process() both ran synchronously in
    // the route before it responded -- PENDING_REVIEW would mean the
    // threshold gate mis-fired, and REQUESTED/VALIDATING would mean the
    // automation never ran at all.
    assert.equal(res.body.withdrawal.status, "PROCESSING");

    const row = await db.query("SELECT provider_ref, status FROM withdrawal WHERE id=$1", [res.body.withdrawal.id]);
    assert.ok(row.rows[0].provider_ref, "process() should have set a provider_ref from the (sandboxed) broadcast");
    assert.equal(row.rows[0].status, "PROCESSING");
  });

  test("a withdrawal AT the review threshold lands on PENDING_REVIEW, never auto-processed", async () => {
    await db.query(
      `SELECT ledger_post('seed-alice-withdraw-review','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: "500000000" },
        { account: "user:alice:available", amount: "-500000000" },
      ])]
    );

    const step = await req("POST", "/v1/auth/step-up", {
      token: tokenAlice,
      body: { action: "wallet.withdraw", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `step-up failed: ${JSON.stringify(step.body)}`);

    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { amount: 500, network: "TRC20", asset: "USDT", destination: GOOD_ADDR },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.withdrawal.status, "PENDING_REVIEW");

    const row = await db.query("SELECT provider_ref FROM withdrawal WHERE id=$1", [res.body.withdrawal.id]);
    assert.equal(row.rows[0].provider_ref, null, "must never broadcast a payout that hasn't cleared review");
  });

  async function createPendingReviewWithdrawal(seedKey, amountUsd) {
    const amountMinor = String(amountUsd * 1_000_000);
    await db.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
      [seedKey, JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: amountMinor },
        { account: "user:alice:available", amount: "-" + amountMinor },
      ])]
    );
    const step = await req("POST", "/v1/auth/step-up", {
      token: tokenAlice,
      body: { action: "wallet.withdraw", password: "correct horse battery staple" },
    });
    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { amount: amountUsd, network: "TRC20", asset: "USDT", destination: GOOD_ADDR },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.withdrawal.status, "PENDING_REVIEW");
    return res.body.withdrawal.id;
  }

  test("admin.withdrawal.approve_solo: a single admin approves a PENDING_REVIEW withdrawal and it processes", async () => {
    const wdId = await createPendingReviewWithdrawal("seed-alice-withdraw-approve", 600);

    const adminLogin = await auth.login({ identifier: "root_admin", password: "correct horse battery staple" });
    assert.equal(adminLogin.ok, true, `admin login: ${JSON.stringify(adminLogin)}`);
    const step = await req("POST", "/v1/auth/step-up", {
      token: adminLogin.accessToken,
      body: { action: "admin.withdrawal.approve_solo", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `admin step-up failed: ${JSON.stringify(step.body)}`);

    const res = await req("POST", `/v1/admin/withdrawals/${wdId}/approve`, {
      token: adminLogin.accessToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.withdrawal.status, "PROCESSING");
    assert.ok(res.body.withdrawal.provider_ref, "process() should have broadcast and recorded a provider_ref");

    // The real actor -- not "SYSTEM" -- is what the audit trail names.
    const transition = await db.query(
      `SELECT actor_type, actor_id FROM withdrawal_transition WHERE withdrawal_id=$1 AND to_status='APPROVED'`,
      [wdId]
    );
    assert.equal(transition.rows[0].actor_type, "ADMIN");
    assert.equal(transition.rows[0].actor_id, "root");
  });

  test("the real four-eyes ceremony: propose by one admin, decide by a different one, execute by the requester", async () => {
    const wdId = await createPendingReviewWithdrawal("seed-alice-withdraw-foureyes", 600);

    const rootLogin = await auth.login({ identifier: "root_admin", password: "correct horse battery staple" });
    const root2Login = await auth.login({ identifier: "root_admin_2", password: "correct horse battery staple" });
    assert.equal(rootLogin.ok, true);
    assert.equal(root2Login.ok, true);

    // Step 1: root proposes. review-tier, no step-up required.
    const propose = await req("POST", `/v1/admin/withdrawals/${wdId}/propose-approval`, {
      token: rootLogin.accessToken,
      body: { reason: "routine release" },
    });
    assert.equal(propose.status, 201, JSON.stringify(propose.body));
    const approvalRequestId = propose.body.approvalRequestId;
    assert.ok(approvalRequestId);

    // admin.tournament.manage (what the generic decide route runs under)
    // is itself step-up gated, independent of the withdrawal ceremony.
    const rootStepUp = await req("POST", "/v1/auth/step-up", {
      token: rootLogin.accessToken,
      body: { action: "admin.tournament.manage", password: "correct horse battery staple" },
    });
    assert.equal(rootStepUp.status, 200, JSON.stringify(rootStepUp.body));
    const root2StepUp = await req("POST", "/v1/auth/step-up", {
      token: root2Login.accessToken,
      body: { action: "admin.tournament.manage", password: "correct horse battery staple" },
    });
    assert.equal(root2StepUp.status, 200, JSON.stringify(root2StepUp.body));

    // root cannot decide its own proposal -- the DB's approval_no_self_approval
    // CHECK is the real enforcement, exercised here through the generic
    // approvals/:id/decide route.
    const selfDecide = await req("POST", `/v1/admin/approvals/${approvalRequestId}/decide`, {
      token: rootLogin.accessToken,
      headers: { "x-step-up-token": rootStepUp.body.stepUpToken },
      body: { approve: true },
    });
    assert.equal(selfDecide.status, 403, JSON.stringify(selfDecide.body));

    // Step 2: a genuinely different admin (root2) decides.
    const decide = await req("POST", `/v1/admin/approvals/${approvalRequestId}/decide`, {
      token: root2Login.accessToken,
      headers: { "x-step-up-token": root2StepUp.body.stepUpToken },
      body: { approve: true },
    });
    assert.equal(decide.status, 200, JSON.stringify(decide.body));

    // Step 3: root (the original requester) executes -- the real
    // admin.withdrawal.approve action, step-up required.
    const step = await req("POST", "/v1/auth/step-up", {
      token: rootLogin.accessToken,
      body: { action: "admin.withdrawal.approve", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `admin step-up failed: ${JSON.stringify(step.body)}`);

    const exec = await req("POST", `/v1/admin/withdrawals/${wdId}/approve-reviewed`, {
      token: rootLogin.accessToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { approvalRequestId },
    });
    assert.equal(exec.status, 200, JSON.stringify(exec.body));
    assert.equal(exec.body.withdrawal.status, "PROCESSING");
    assert.ok(exec.body.withdrawal.provider_ref);
  });

  test("approve-reviewed refuses to execute without a decided approval_request", async () => {
    const wdId = await createPendingReviewWithdrawal("seed-alice-withdraw-foureyes-missing", 600);
    const rootLogin = await auth.login({ identifier: "root_admin", password: "correct horse battery staple" });
    const step = await req("POST", "/v1/auth/step-up", {
      token: rootLogin.accessToken,
      body: { action: "admin.withdrawal.approve", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200);

    // No approvalRequestId at all -- the dispatcher's own fourEyes gate
    // (resolveApproval() finds nothing to resolve) refuses before the
    // handler's own belt-and-braces MISSING_APPROVAL_REQUEST_ID check would.
    const noId = await req("POST", `/v1/admin/withdrawals/${wdId}/approve-reviewed`, {
      token: rootLogin.accessToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(noId.status, 409, JSON.stringify(noId.body));
    assert.equal(noId.body.error.code, "SECOND_ADMIN_REQUIRED");

    // A proposal that exists but was never decided by anyone.
    const propose = await req("POST", `/v1/admin/withdrawals/${wdId}/propose-approval`, {
      token: rootLogin.accessToken,
    });
    assert.equal(propose.status, 201);
    const undecided = await req("POST", `/v1/admin/withdrawals/${wdId}/approve-reviewed`, {
      token: rootLogin.accessToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { approvalRequestId: propose.body.approvalRequestId },
    });
    // Still PENDING (nobody has decided it yet) -- resolveApproval() only
    // ever resolves an APPROVED row, so this is the same
    // SECOND_ADMIN_REQUIRED gate as having no id at all.
    assert.equal(undecided.status, 409, JSON.stringify(undecided.body));
    assert.equal(undecided.body.error.code, "SECOND_ADMIN_REQUIRED");

    const row = await db.query("SELECT status FROM withdrawal WHERE id=$1", [wdId]);
    assert.equal(row.rows[0].status, "PENDING_REVIEW", "must never advance on an undecided or missing approval");
  });

  test("a non-admin cannot call the solo-approve endpoint at all", async () => {
    const wdId = await createPendingReviewWithdrawal("seed-alice-withdraw-noauth", 600);
    const res = await req("POST", `/v1/admin/withdrawals/${wdId}/approve`, { token: tokenAlice });
    assert.equal(res.status, 403);
  });

  test("admin.withdrawal.reject: rejecting a PENDING_REVIEW withdrawal releases the locked funds back to available", async () => {
    const wdId = await createPendingReviewWithdrawal("seed-alice-withdraw-reject", 600);

    const beforeLocked = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:alice:locked'"
    );

    const adminLogin = await auth.login({ identifier: "root_admin", password: "correct horse battery staple" });
    const step = await req("POST", "/v1/auth/step-up", {
      token: adminLogin.accessToken,
      body: { action: "admin.withdrawal.reject", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `admin step-up failed: ${JSON.stringify(step.body)}`);

    const res = await req("POST", `/v1/admin/withdrawals/${wdId}/reject`, {
      token: adminLogin.accessToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: { reason: "test rejection" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await db.query("SELECT status FROM withdrawal WHERE id=$1", [wdId]);
    assert.equal(row.rows[0].status, "REJECTED");

    const afterLocked = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:alice:locked'"
    );
    assert.equal(
      BigInt(afterLocked.rows[0].bal), BigInt(beforeLocked.rows[0].bal) - 600_000_000n,
      "the 600 USDT this withdrawal had locked must be released, not stuck forever"
    );
  });
});
