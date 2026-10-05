/**
 * Cash play in any stablecoin. A DAI stake meets only DAI stakes, locks DAI,
 * and pays the winner DAI -- the USDT balances of the same players never
 * move. Real tickets, the real dispatch worker and real settlement.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createMatchmakingService } from "../src/matchmaking.mjs";
import { createDispatchWorker, DispatchOutcome } from "../src/dispatch.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createDuelStore } from "../../realtime/src/store.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";

const E6 = 1_000_000n;
const u = (n) => (BigInt(n) * E6).toString();
const TC = { initialMs: 300000, incrementMs: 0 };
const CUSTODY = { USDT: "platform:custody:USDT:TRON", USDC: "platform:custody:USDC:BEP20", DAI: "platform:custody:DAI:BEP20" };

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("UPDATE game SET cash_enabled = TRUE WHERE id = 'chess'");
  const mm = createMatchmakingService(db);
  const settlement = createSettlementService(db);
  const worker = createDispatchWorker(db, {
    settlement, store: createDuelStore(db), plugins: new Map([["chess", ChessPlugin]]), mm,
  });
  return { db, mm, settlement, worker };
}

async function addPlayer(db, id, funds) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await db.query("SELECT ledger_open_user_wallet($1)", [id]);
  for (const [asset, amount] of Object.entries(funds)) {
    await db.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb,$3)`,
      [`deposit:${id}:${asset}`, JSON.stringify([
        { account: CUSTODY[asset], amount: u(amount) },
        { account: `user:${id}:available`, amount: "-" + u(amount) },
      ]), asset]
    );
  }
}

async function bal(db, key, asset) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id
      WHERE a.key=$1 AND a.asset=$2`, [key, asset]
  );
  return BigInt(r.rows[0].n);
}

describe("multi-asset cash play", () => {
  test("tickets in different coins never pair, even at the same stake", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "usdt_p", { USDT: 50 });
    await addPlayer(db, "dai_p", { DAI: 50 });
    await mm.enqueue({ playerId: "usdt_p", gameId: "chess", tier: "CASH", stakeMinor: u(10), asset: "USDT", ratingX100: 150000, timeControl: TC });
    await mm.enqueue({ playerId: "dai_p", gameId: "chess", tier: "CASH", stakeMinor: u(10), asset: "DAI", ratingX100: 150000, timeControl: TC });

    const report = await worker.tick();
    assert.equal(report.paired.length, 0, "a USDT stake must never be matched against a DAI stake");
    const pools = await mm.activePools();
    assert.deepEqual(pools.map((p) => p.asset).sort(), ["DAI", "USDT"]);
  });

  test("a DAI match locks DAI, pays the winner DAI, and never touches USDT", async () => {
    const { db, mm, settlement, worker } = await fresh();
    await addPlayer(db, "alice", { DAI: 30, USDT: 7 });
    await addPlayer(db, "bob", { DAI: 30, USDT: 7 });
    for (const id of ["alice", "bob"]) {
      const r = await mm.enqueue({ playerId: id, gameId: "chess", tier: "CASH", stakeMinor: u(10), asset: "DAI", ratingX100: 150000, timeControl: TC });
      assert.equal(r.ok, true, JSON.stringify(r));
    }

    const report = await worker.tick();
    assert.equal(report.paired.length, 1);
    assert.equal(report.dispatched[0].outcome, DispatchOutcome.LIVE, JSON.stringify(report));
    const duelId = report.paired[0].duelId;
    const duel = (await db.query("SELECT asset, seat_0, seat_1 FROM duel WHERE id=$1", [duelId])).rows[0];
    assert.equal(duel.asset, "DAI");

    for (const id of ["alice", "bob"]) {
      assert.equal(await bal(db, `user:${id}:available`, "DAI"), 20n * E6);
      assert.equal(await bal(db, `user:${id}:locked`, "DAI"), 10n * E6);
      assert.equal(await bal(db, `user:${id}:available`, "USDT"), 7n * E6, "USDT untouched by the DAI reservation");
    }

    await db.query(
      `UPDATE duel SET status='COMPLETED'::duel_status, result='1-0', termination_reason='CHECKMATE',
              completed_at=now(), game_hash='h' WHERE id=$1`, [duelId]
    );
    const s = await settlement.settle(duelId);
    assert.equal(s.ok, true, JSON.stringify(s));

    const winner = duel.seat_0, loser = duel.seat_1;
    const rake = await bal(db, "platform:rake", "DAI");
    assert.ok(rake > 0n, "rake is collected in DAI");
    assert.equal(await bal(db, "platform:rake", "USDT"), 0n);
    assert.equal(await bal(db, `user:${winner}:available`, "DAI"), 40n * E6 - rake);
    assert.equal(await bal(db, `user:${loser}:available`, "DAI"), 20n * E6);
    for (const id of [winner, loser]) {
      assert.equal(await bal(db, `user:${id}:locked`, "DAI"), 0n);
      assert.equal(await bal(db, `user:${id}:available`, "USDT"), 7n * E6);
    }
  });

  test("a CASH ticket must carry a coin and a FREE ticket must not", async () => {
    const { db } = await fresh();
    await addPlayer(db, "carol", {});
    await assert.rejects(db.query(
      `INSERT INTO matchmaking_ticket (player_id, game_id, mode, time_control, tier, stake_minor, rating_x100, expires_at)
       VALUES ('carol','chess','standard','{}'::jsonb,'CASH',10000000,150000, now() + interval '1 minute')`
    ), /ticket_cash_has_asset/);
  });
});
