/**
 * BEP20 USDT / USDC / DAI through the real payment flow.
 *
 * The verifier is the production BSC reader behind the production
 * multi-chain router, talking to a scripted JSON-RPC node that returns
 * receipts in the exact shape BNB Smart Chain does (18-decimal amounts).
 * What is under test is that money lands in the right coin's balance at the
 * right size, and that a payout on BSC reaches COMPLETED.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createSandboxProvider, ProviderPayoutState } from "../../payments/src/provider.mjs";
import { createMockChainReader, createMultiChainReader } from "../../chain/src/reader.mjs";
import { createBscChainReader, BSC_TOKENS, ERC20_TRANSFER_TOPIC } from "../../chain/src/bsc.mjs";

const PASSWORD = "correct horse battery staple";
const E18 = 10n ** 18n;
const PLAYER_BSC_ADDR = "0x" + "ab".repeat(20);
const PAYOUT_DEST = "0x" + "cd".repeat(20);
const SENDER = "0x" + "12".repeat(20);

const hex = (n) => "0x" + BigInt(n).toString(16);
const topic = (a) => "0x" + a.slice(2).padStart(64, "0");

/** A scripted BSC node: receipts by hash, a fixed head block. */
const receipts = new Map();
function seedReceipt(hash, { token, to, amount, block = 1000, status = "0x1" }) {
  receipts.set(hash, {
    status, blockNumber: hex(block),
    logs: [{
      address: BSC_TOKENS[token].contract,
      topics: [ERC20_TRANSFER_TOPIC, topic(SENDER), topic(to)],
      data: "0x" + amount.toString(16).padStart(64, "0"),
      logIndex: "0x0", blockNumber: hex(block), transactionHash: hash,
    }],
  });
}
const bscRpc = {
  async call(method, params) {
    if (method === "eth_getTransactionReceipt") return receipts.get(params[0]) ?? null;
    if (method === "eth_blockNumber") return hex(5000);
    if (method === "eth_chainId") return hex(56);
    if (method === "eth_getLogs") return [];
    throw new Error(`unscripted ${method}`);
  },
};

let db, auth, api, provider, paymentSvc, token;

async function req(method, path, { token: t, body, headers = {} } = {}) {
  const res = await fetch(new URL(path, api.url).href, {
    method,
    headers: { ...headers, ...(t ? { authorization: `Bearer ${t}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

async function balance(key, asset) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS bal
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id
      WHERE a.key=$1 AND a.asset=$2`, [key, asset]
  );
  return r.rows[0]?.bal ?? null;
}

describe("BEP20 stablecoins, end to end", () => {
  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root','root@n.test','Root',TRUE)");
    await db.query("UPDATE platform_control SET enabled=TRUE, changed_by='root', reason='test' WHERE key IN ('DEPOSITS','WITHDRAWALS')");

    auth = createAuthService(db, {
      signingKey: Buffer.alloc(32, 61), encryptionKey: Buffer.alloc(32, 62),
      argon: { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 },
    });
    await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
    token = (await auth.login({ identifier: "alice", password: PASSWORD })).accessToken;

    provider = createSandboxProvider();
    const chain = createMultiChainReader([
      createMockChainReader({ network: "TRON" }),
      createBscChainReader({ rpc: bscRpc }),
    ]);
    paymentSvc = createPaymentService(db, { provider, chain, config: { reviewThresholdMinor: 500_000_000n } });
    api = createApi({ db, auth, paymentSvc, paymentProvider: provider, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
    await api.listen();
  });

  after(async () => { await api.close(); });

  test("the wallet is offered USDT on Tron and USDT, USDC and DAI on BEP20 -- and nothing else", async () => {
    const res = await req("GET", "/v1/payments/rails");
    assert.deepEqual(
      res.body.rails.map((r) => `${r.asset}:${r.network}`).sort(),
      ["DAI:BEP20", "USDC:BEP20", "USDT:BEP20", "USDT:TRON"]
    );
  });

  test("a DAI deposit on BEP20 credits the player's DAI balance at the right size", async () => {
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ('dep_dai','alice','DAI','BEP20',$1,'ref_dai',$2,'AWAITING_PAYMENT', now() + interval '1 year')`,
      [provider.id, PLAYER_BSC_ADDR]
    );
    const hash = "0x" + "d".repeat(64);
    seedReceipt(hash, { token: "DAI", to: PLAYER_BSC_ADDR, amount: 25n * E18 });

    const r = await paymentSvc.verifyAndCredit("ref_dai", { txHash: hash });
    assert.equal(r.credited, true, JSON.stringify(r));

    assert.equal(await balance("user:alice:available", "DAI"), "25000000", "$25.00 in 6-decimal units, not 25e18");
    assert.equal(await balance("user:alice:available", "USDT"), "0", "a DAI deposit must not touch the USDT balance");
    assert.equal(await balance("platform:custody:DAI:BEP20", "DAI"), "25000000");
  });

  test("a USDC transfer to that same address does NOT credit a DAI deposit", async () => {
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ('dep_dai2','alice','DAI','BEP20',$1,'ref_dai2',$2,'AWAITING_PAYMENT', now() + interval '1 year')`,
      [provider.id, PLAYER_BSC_ADDR]
    );
    const hash = "0x" + "e".repeat(64);
    seedReceipt(hash, { token: "USDC", to: PLAYER_BSC_ADDR, amount: 40n * E18 });
    const before = await balance("user:alice:available", "DAI");

    const r = await paymentSvc.verifyAndCredit("ref_dai2", { txHash: hash });
    assert.equal(r.credited, false, JSON.stringify(r));
    assert.equal(await balance("user:alice:available", "DAI"), before);
  });

  test("a USDC withdrawal on BEP20 is sent, confirmed on-chain, and reaches COMPLETED", async () => {
    await db.query(
      `SELECT ledger_post('seed-usdc','DEPOSIT','SYSTEM',NULL,$1::jsonb,'USDC')`,
      [JSON.stringify([
        { account: "platform:custody:USDC:BEP20", amount: "60000000" },
        { account: "user:alice:available", amount: "-60000000" },
      ])]
    );
    const step = await req("POST", "/v1/auth/step-up", { token, body: { action: "wallet.withdraw", password: PASSWORD } });
    assert.equal(step.status, 200);

    const res = await req("POST", "/v1/players/alice/withdrawals", {
      token, headers: { "x-step-up-token": step.body.stepUpToken },
      body: { amount: 30, network: "BEP20", asset: "USDC", destination: PAYOUT_DEST },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.withdrawal.id;

    const row = await db.query("SELECT provider_ref, network, fee_minor::text FROM withdrawal WHERE id=$1", [id]);
    assert.equal(row.rows[0].network, "BEP20");
    const payout = provider._payouts.get(row.rows[0].provider_ref);
    const hash = "0x" + "c".repeat(64);
    payout.state = ProviderPayoutState.BROADCASTED;
    payout.txHash = hash;
    const fee = BigInt(row.rows[0].fee_minor);
    seedReceipt(hash, { token: "USDC", to: PAYOUT_DEST, amount: (30_000_000n - fee) * 10n ** 12n });

    const result = await paymentSvc.reconcile(id);
    const final = await db.query("SELECT status::text FROM withdrawal WHERE id=$1", [id]);
    assert.equal(final.rows[0].status, "COMPLETED", JSON.stringify(result));
    assert.equal(await balance("user:alice:locked", "USDC"), "0", "nothing left locked once the payout settles");
  });

  test("USDC on Tron stays closed -- no verifier covers it", async () => {
    const res = await req("POST", "/v1/players/alice/deposits", { token, body: { asset: "USDC", network: "TRC20" } });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, "UNSUPPORTED_RAIL");
  });
});
