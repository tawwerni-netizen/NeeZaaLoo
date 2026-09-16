/**
 * Staking any enabled coin through the HTTP routes: a radar challenge is
 * recorded at the real 6-decimal stake in the chosen coin, the balance
 * check reads THAT coin, and a coin the platform does not hold is refused.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";

const PASSWORD = "correct horse battery staple";
const E6 = 1_000_000n;
let db, api, alice, bob;

async function req(method, path, { token, body } = {}) {
  const res = await fetch(new URL(path, api.url).href, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

async function fund(id, asset, whole) {
  const custody = asset === "USDT" ? "platform:custody:USDT:TRON" : `platform:custody:${asset}:BEP20`;
  await db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb,$3)`, [
    `seed:${id}:${asset}`,
    JSON.stringify([{ account: custody, amount: String(BigInt(whole) * E6) }, { account: `user:${id}:available`, amount: "-" + String(BigInt(whole) * E6) }]),
    asset,
  ]);
}

describe("staking any coin over HTTP", () => {
  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    await db.query("UPDATE game SET cash_enabled = TRUE, is_live = TRUE WHERE id = 'chess'");
    const auth = createAuthService(db, {
      signingKey: Buffer.alloc(32, 71), encryptionKey: Buffer.alloc(32, 72),
      argon: { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 },
    });
    for (const h of ["alice", "bob"]) await auth.register({ playerId: h, handle: h, password: PASSWORD });
    alice = (await auth.login({ identifier: "alice", password: PASSWORD })).accessToken;
    bob = (await auth.login({ identifier: "bob", password: PASSWORD })).accessToken;
    await fund("alice", "DAI", 30);
    await fund("bob", "USDT", 30);
    api = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
    await api.listen();
  });
  after(async () => { await api.close(); });

  test("a DAI radar challenge is stored at the real stake, in DAI", async () => {
    const r = await req("POST", "/v1/challenges/open", {
      token: alice, body: { gameId: "chess", tier: "CASH", stakeMinor: String(10n * E6), asset: "DAI", timeControl: "BLITZ" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = (await db.query("SELECT stake_minor::text, asset FROM lobby_open_challenge WHERE id=$1", [r.body.challengeId])).rows[0];
    assert.equal(row.stake_minor, String(10n * E6));
    assert.equal(row.asset, "DAI");

    const list = await req("GET", "/v1/challenges/open?gameId=chess");
    const listed = list.body.challenges.find((c) => c.id === r.body.challengeId);
    assert.equal(listed.stakeAmount, 10);
    assert.equal(listed.asset, "DAI");
  });

  test("the acceptor needs the challenge's coin -- a USDT balance does not cover a DAI stake", async () => {
    const open = await req("GET", "/v1/challenges/open?gameId=chess");
    const r = await req("POST", `/v1/challenges/open/${open.body.challenges[0].id}/accept`, { token: bob, body: {} });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INSUFFICIENT_FUNDS");
  });

  test("a stake in a coin the player lacks is refused, even with enough of another coin", async () => {
    const r = await req("POST", "/v1/challenges/open", {
      token: alice, body: { gameId: "chess", tier: "CASH", stakeMinor: String(10n * E6), asset: "USDC", timeControl: "BLITZ" },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INSUFFICIENT_FUNDS");
  });

  test("an unknown coin and an off-ladder stake are refused", async () => {
    const coin = await req("POST", "/v1/challenges/open", {
      token: alice, body: { gameId: "chess", tier: "CASH", stakeMinor: String(10n * E6), asset: "SHIB", timeControl: "BLITZ" },
    });
    assert.equal(coin.status, 400);
    assert.equal(coin.body.error.code, "UNSUPPORTED_ASSET");
    const odd = await req("POST", "/v1/challenges/open", {
      token: alice, body: { gameId: "chess", tier: "CASH", stakeMinor: "1000", asset: "DAI", timeControl: "BLITZ" },
    });
    assert.equal(odd.status, 400);
    assert.equal(odd.body.error.code, "INVALID_STAKE");
  });
});
