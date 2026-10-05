import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createDirectChatService } from "../../chat/src/direct.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createSandboxProvider } from "../../payments/src/provider.mjs";
import { createMockChainReader } from "../../chain/src/reader.mjs";

const SIGNING_KEY = Buffer.alloc(32, 7);
const ENCRYPTION_KEY = Buffer.alloc(32, 8);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, tokenAlice, tokenBob, tokenAdmin, directChat;

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

describe("AML Playthrough and Search-Only Members API", () => {
  before(async () => {
    db = await PGlite.create();
    await migrate(db);

    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root', 'root@nizalo.com', 'Root', TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test withdrawals' WHERE key='WITHDRAWALS'");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test deposits' WHERE key='DEPOSITS'");

    auth = createAuthService(db, {
      signingKey: SIGNING_KEY,
      encryptionKey: ENCRYPTION_KEY,
      argon: FAST_ARGON,
    });

    const PASS = "correct horse battery staple";
    const regAlice = await auth.register({ playerId: "alice", handle: "alice", password: PASS });
    assert.equal(regAlice.ok, true, `alice register: ${JSON.stringify(regAlice)}`);
    const logAlice = await auth.login({ identifier: "alice", password: PASS });
    assert.equal(logAlice.ok, true, `alice login: ${JSON.stringify(logAlice)}`);
    tokenAlice = logAlice.accessToken;

    const regBob = await auth.register({ playerId: "bob", handle: "bob", password: PASS });
    assert.equal(regBob.ok, true, `bob register: ${JSON.stringify(regBob)}`);
    const logBob = await auth.login({ identifier: "bob", password: PASS });
    assert.equal(logBob.ok, true, `bob login: ${JSON.stringify(logBob)}`);
    tokenBob = logBob.accessToken;

    const regAdmin = await auth.register({ playerId: "admin_user", handle: "admin_user", password: PASS });
    assert.equal(regAdmin.ok, true, `admin register: ${JSON.stringify(regAdmin)}`);
    await db.query(
      `INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES
       ('admin_user', 'admin@nizalo.com', 'Admin', TRUE)`
    );
    await db.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
       ('admin_user', 'SUPER_ADMIN', 'root', 'test')`
    );
    const logAdmin = await auth.login({ identifier: "admin_user", password: PASS });
    assert.equal(logAdmin.ok, true, `admin login: ${JSON.stringify(logAdmin)}`);
    tokenAdmin = logAdmin.accessToken;

    directChat = createDirectChatService(db);

    // A real payment service, as every deployment that can take a
    // withdrawal has. Without one the route now refuses outright rather
    // than locking a player's funds into a withdrawal nothing will process.
    const paymentSvc = createPaymentService(db, {
      provider: createSandboxProvider(),
      chain: createMockChainReader({ network: "TRON" }),
      config: { reviewThresholdMinor: 500_000_000n },
    });
    api = createApi({
      db,
      auth,
      directChat,
      paymentSvc,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await api.listen();
  });

  after(async () => {
    await api?.close();
    await db?.close?.();
  });

  test("1. Deposit credited creates available balance but 0 withdrawable balance before playing", async () => {
    await db.query("SELECT ledger_open_user_wallet('alice')");

    const depId = "dep_test_100";
    const postedDep = await db.query(
      `SELECT * FROM ledger_post($1, 'DEPOSIT', 'SYSTEM', NULL, $2::jsonb, 'USDT', NULL, 'deposit', $3)`,
      [
        `deposit:${depId}`,
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: "100000000" },
          { account: "user:alice:available", amount: "-100000000" },
        ]),
        depId,
      ]
    );

    await db.query(
      `INSERT INTO deposit (
         id, player_id, asset, network, provider, provider_ref, address, status,
         observed_amount_minor, observed_tx_hash, observed_asset, observed_network,
         expires_at, credited_at, credited_tx_id
       ) VALUES (
         $1, 'alice', 'USDT', 'TRC20', 'oxapay', 'ref_100', 'TAddr123', 'CREDITED',
         100000000, '0xtx123', 'USDT', 'TRC20',
         now() + interval '1 hour', now(), $2
       )`,
      [depId, postedDep.rows[0].transaction_id]
    );

    const walletRes = await req("GET", "/v1/players/alice/wallet", { token: tokenAlice });
    assert.equal(walletRes.status, 200);
    const aml = walletRes.body.amlSummary;
    assert.ok(aml, "amlSummary should be present");
    assert.equal(aml.totalDepositedMinor, "100000000");
    assert.equal(aml.totalPlayedMinor, "0");
    assert.equal(aml.unplayedDepositMinor, "100000000");
    assert.equal(aml.availableMinor, "100000000");
    assert.equal(aml.withdrawableMinor, "0");
    assert.equal(aml.playthroughRequired, true);
    assert.equal(aml.playthroughCompleted, false);
  });

  test("2. Attempting to withdraw unplayed deposit fails with AML_PLAYTHROUGH_REQUIRED (400)", async () => {
    const step = await req("POST", "/v1/auth/step-up", {
      token: tokenAlice,
      body: { action: "wallet.withdraw", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200, `step-up failed: ${JSON.stringify(step.body)}`);

    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: {
        amount: 25,
        network: "TRC20",
        destination: "TMockWithdrawalAddressValidLength12345",
        asset: "USDT",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body?.error?.code, "AML_PLAYTHROUGH_REQUIRED");
    assert.equal(res.body?.error?.withdrawableMinor, "0");
    assert.equal(res.body?.error?.unplayedDepositMinor, "100000000");
  });

  test("3. After playing duels, wagered funds and winnings become withdrawable", async () => {
    await db.query("SELECT ledger_open_user_wallet('bob')");
    await db.query(
      `SELECT * FROM ledger_post($1, 'DEPOSIT', 'SYSTEM', NULL, $2::jsonb, 'USDT', NULL, 'deposit', $3)`,
      [
        "deposit:bob:1",
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: "50000000" },
          { account: "user:bob:available", amount: "-50000000" },
        ]),
        "dep_bob_1",
      ]
    );

    const duelId = "duel_aml_1";
    const posted = await db.query(
      `SELECT * FROM ledger_post($1, 'DUEL_SETTLE', 'SYSTEM', NULL, $2::jsonb, 'USDT', NULL, 'duel', $3)`,
      [
        `duel:${duelId}:settle`,
        JSON.stringify([
          { account: "platform:rake", amount: "-8000000" },
          { account: "user:alice:available", amount: "-32000000" },
          { account: "user:bob:available", amount: "40000000" },
        ]),
        duelId,
      ]
    );

    await db.query(
      `INSERT INTO duel (
         id, pairing_key, game_id, plugin_version, initial_state, time_control, tier,
         stake_minor, asset, seat_0, seat_1, status, result, termination_reason,
         settlement_tx_id, rake_minor, economy_rule_id, economy_rule_version, completed_at, settled_at
       ) VALUES (
         $1, 'chess:alice:bob:1', 'chess', 1, '{}'::jsonb, '{"initial_ms": 300000}'::jsonb, 'CASH',
         40000000, 'USDT', 'alice', 'bob', 'SETTLED', '1-0', 'CHECKMATE',
         $2, 8000000, 'standard', 1, now(), now()
       )`,
      [duelId, posted.rows[0].transaction_id]
    );

    const walletRes = await req("GET", "/v1/players/alice/wallet", { token: tokenAlice });
    assert.equal(walletRes.status, 200);
    const aml = walletRes.body.amlSummary;

    assert.equal(aml.totalDepositedMinor, "100000000");
    assert.equal(aml.totalPlayedMinor, "40000000");
    assert.equal(aml.unplayedDepositMinor, "60000000");
    assert.equal(aml.availableMinor, "132000000");
    assert.equal(aml.withdrawableMinor, "72000000");

    const step = await req("POST", "/v1/auth/step-up", {
      token: tokenAlice,
      body: { action: "wallet.withdraw", password: "correct horse battery staple" },
    });
    assert.equal(step.status, 200);

    const withRes = await req("POST", "/v1/players/alice/withdrawals", {
      token: tokenAlice,
      headers: { "x-step-up-token": step.body.stepUpToken },
      body: {
        amount: 20,
        network: "TRC20",
        destination: "TMockWithdrawalAddressValidLength12345",
        asset: "USDT",
      },
    });

    assert.equal(withRes.status, 201);
    assert.equal(withRes.body.ok, true);
    // Below the review threshold the route assesses and hands it to the
    // provider in the same request, exactly as in production.
    assert.equal(withRes.body.withdrawal.status, "PROCESSING");
  });

  test("4. GET /v1/admin/players/:id returns comprehensive AML breakdown and history", async () => {
    const res = await req("GET", "/v1/admin/players/alice", { token: tokenAdmin });
    assert.equal(res.status, 200);
    assert.equal(res.body.handle, "alice");
    assert.ok(res.body.amlSummary, "amlSummary should be present for admin");
    assert.equal(res.body.amlSummary.totalDepositedMinor, "100000000");
    assert.equal(res.body.amlSummary.totalPlayedMinor, "40000000");
    assert.ok(Array.isArray(res.body.deposits), "deposits array present");
    assert.ok(Array.isArray(res.body.withdrawals), "withdrawals array present");
    assert.ok(Array.isArray(res.body.duels), "duels array present");
    assert.equal(res.body.deposits.length, 1);
    assert.equal(res.body.withdrawals.length, 1);
    assert.equal(res.body.duels.length, 1);
  });

  test("5. GET /v1/members returns empty array without search query, returns results when query is provided", async () => {
    const emptyRes = await req("GET", "/v1/members", { token: tokenAlice });
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(emptyRes.body.members, [], "should return empty list when no search query is passed");

    const searchRes = await req("GET", "/v1/members?q=bob", { token: tokenAlice });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.members.length >= 1, "should find Bob");
    assert.equal(searchRes.body.members[0].handle, "bob");
  });
});
