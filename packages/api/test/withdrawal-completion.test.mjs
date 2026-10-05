/**
 * A withdrawal requested from the website, driven all the way to COMPLETED.
 *
 * No existing test went past PROCESSING. The wallet test's chain double has
 * no verifyTransfer at all, so reconcile() always stopped at
 * NO_CHAIN_VERIFIER and "withdrawals work" was asserted without the one step
 * that actually releases a payout ever running. This drives the full path
 * with the mock chain reader, which applies the SAME network check as the
 * real Tron reader (`expectedNetwork !== network` -> WRONG_NETWORK).
 *
 * The wallet sends network "TRC20". The Tron reader speaks "TRON". A row
 * that stored the raw label could never be confirmed on-chain, so every
 * website withdrawal would sit in BROADCASTED forever -- money sent by the
 * provider, the player's funds locked, the ledger never settled.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createSandboxProvider, ProviderPayoutState } from "../../payments/src/provider.mjs";
import { createMockChainReader } from "../../chain/src/reader.mjs";

const PASSWORD = "correct horse battery staple";
const DEST = "TXyz1234567890ABCDEFGHJKLMNPQRSTUV"; // 34 chars, base58-shaped

let db, auth, api, provider, chain, paymentSvc, token;

async function req(method, path, { token: t, body, headers = {} } = {}) {
  const res = await fetch(new URL(path, api.url).href, {
    method,
    headers: {
      ...headers,
      ...(t ? { authorization: `Bearer ${t}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

async function fund(playerId, key, minor) {
  await db.query(
    `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
    [key, JSON.stringify([
      { account: "platform:custody:USDT:TRON", amount: String(minor) },
      { account: `user:${playerId}:available`, amount: String(-minor) },
    ])]
  );
}

async function withdrawFromWebsite(body) {
  const step = await req("POST", "/v1/auth/step-up", {
    token, body: { action: "wallet.withdraw", password: PASSWORD },
  });
  assert.equal(step.status, 200, JSON.stringify(step.body));
  return req("POST", "/v1/players/alice/withdrawals", {
    token, headers: { "x-step-up-token": step.body.stepUpToken }, body,
  });
}

describe("website withdrawal, requested to completed", () => {
  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root','root@n.test','Root',TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test' WHERE key IN ('DEPOSITS','WITHDRAWALS')");

    auth = createAuthService(db, {
      signingKey: Buffer.alloc(32, 41), encryptionKey: Buffer.alloc(32, 42),
      argon: { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 },
    });
    await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
    token = (await auth.login({ identifier: "alice", password: PASSWORD })).accessToken;

    provider = createSandboxProvider();
    chain = createMockChainReader({ network: "TRON" });
    paymentSvc = createPaymentService(db, { provider, chain, config: { reviewThresholdMinor: 500_000_000n } });

    api = createApi({ db, auth, paymentSvc, paymentProvider: provider, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
    await api.listen();
  });

  after(async () => { await api.close(); });

  test("a USDT withdrawal sent as network TRC20 is confirmed on-chain and reaches COMPLETED", async () => {
    await fund("alice", "seed-complete", 50_000_000);

    const res = await withdrawFromWebsite({ amount: 20, network: "TRC20", asset: "USDT", destination: DEST });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.withdrawal.id;

    const row = await db.query("SELECT network, provider_ref, status::text FROM withdrawal WHERE id=$1", [id]);
    assert.equal(row.rows[0].status, "PROCESSING");
    assert.equal(row.rows[0].network, "TRON",
      "the row must store the chain the verifier speaks, not the wallet's display label");

    // The provider broadcasts and reports a tx hash...
    const payout = provider._payouts.get(row.rows[0].provider_ref);
    payout.state = ProviderPayoutState.BROADCASTED;
    payout.txHash = "tx_real_payout_20usdt";

    // ...and the chain independently shows that exact transfer, confirmed.
    chain._seed({
      txHash: "tx_real_payout_20usdt", network: "TRON", to: DEST,
      amountRaw: "19000000", status: "SUCCESS", confirmations: 9999,
    });

    const first = await paymentSvc.reconcile(id);
    assert.notEqual(first.reason, "WRONG_NETWORK", "the verifier refused its own chain");

    const final = await db.query("SELECT status::text FROM withdrawal WHERE id=$1", [id]);
    assert.equal(final.rows[0].status, "COMPLETED", `stuck at ${final.rows[0].status}: ${JSON.stringify(first)}`);
  });

  test("a withdrawal on a pair no verifier can read is refused, and no funds are locked", async () => {
    await fund("alice", "seed-bep20", 30_000_000);
    const before = await db.query(
      `SELECT ledger_natural_balance(a.normal_side, b.balance)::text AS bal
         FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id
        WHERE a.key='user:alice:locked' AND a.asset='USDT'`
    );

    for (const body of [
      { amount: 20, network: "BEP20", asset: "USDT", destination: "0x" + "a".repeat(40) },
      { amount: 20, network: "TRC20", asset: "USDC", destination: DEST },
      { amount: 20, network: "ERC20", asset: "DAI", destination: "0x" + "b".repeat(40) },
    ]) {
      const res = await withdrawFromWebsite(body);
      assert.equal(res.status, 422, `${body.asset}/${body.network}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.error.code, "UNSUPPORTED_RAIL");
    }

    const after = await db.query(
      `SELECT ledger_natural_balance(a.normal_side, b.balance)::text AS bal
         FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id
        WHERE a.key='user:alice:locked' AND a.asset='USDT'`
    );
    assert.equal(after.rows[0]?.bal, before.rows[0]?.bal, "a refused withdrawal must not lock anything");
  });

  test("no deposit address is issued on a pair no verifier can read -- not even a previously issued one", async () => {
    // An address issued before the gate existed, on BEP20.
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ('dep_old_bep20','alice','USDT','BEP20','oxapay','ref_old','0x${"c".repeat(40)}','AWAITING_PAYMENT', now() + interval '1 year')`
    );
    const res = await req("POST", "/v1/players/alice/deposits", {
      token, body: { asset: "USDT", network: "BEP20" },
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.equal(res.body.error.code, "UNSUPPORTED_RAIL");
    assert.equal(res.body.deposit, undefined, "the old address must not be handed back");
  });

  test("GET /v1/payments/rails lists exactly what can move end to end", async () => {
    const res = await req("GET", "/v1/payments/rails");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.rails, [{ asset: "USDT", network: "TRON" }]);
  });
});
