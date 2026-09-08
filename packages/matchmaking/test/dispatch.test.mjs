/**
 * The matchmaking dispatch worker.
 *
 * These tests exercise the worker exactly as production would run it: real
 * tickets, `tick()` calls, and the real settlement/store services underneath
 * -- never a mock of the pairing SQL or the ledger. The properties under
 * test are the ones the phase asked for by name: double matching, double
 * reservation, worker retry duplication, stale queue entries, crash
 * recovery, and genericity across game types.
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
import { SpeedMathPlugin } from "../../game-speed-math/src/plugin.mjs";
import { START_FEN } from "../../game-chess/src/chess.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const TC_CHESS = { initialMs: 300000, incrementMs: 0 };
const TC_SPEED = { durationMs: 30000 };

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query(
    "INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES ('speed-math','Speed Math',1,TRUE,TRUE)"
  );
  await db.query("UPDATE game SET cash_enabled = TRUE WHERE id = 'chess'");

  const mm = createMatchmakingService(db);
  const settlement = createSettlementService(db);
  const store = createDuelStore(db);
  const plugins = new Map([["chess", ChessPlugin], ["speed-math", SpeedMathPlugin]]);
  const worker = createDispatchWorker(db, { settlement, store, plugins, mm });
  return { db, mm, settlement, store, plugins, worker };
}

async function addPlayer(db, id, fund = null) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  if (fund !== null) {
    await db.query("SELECT ledger_open_user_wallet($1)", [id]);
    if (fund > 0) {
      await db.query(
        `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
        [`deposit:${id}`, JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: u(fund) },
          { account: `user:${id}:available`, amount: "-" + u(fund) },
        ])]
      );
    }
  }
}

async function duelRow(db, id) {
  const r = await db.query("SELECT * FROM duel WHERE id=$1", [id]);
  return r.rows[0] ?? null;
}

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id
      WHERE a.key=$1`, [key]
  );
  return r.rows[0].n;
}

describe("dispatch worker: free-tier pairing", () => {
  test("pairs a FREE chess pool and brings it all the way to LIVE", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice");
    await addPlayer(db, "bob");
    await mm.enqueue({ playerId: "alice", gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", ratingX100: 150200, timeControl: TC_CHESS });

    const report = await worker.tick();
    assert.equal(report.paired.length, 1);
    assert.equal(report.dispatched.length, 1);
    assert.equal(report.dispatched[0].outcome, DispatchOutcome.LIVE);
    assert.equal(report.failed.length, 0);

    const row = await duelRow(db, report.paired[0].duelId);
    assert.equal(row.status, "LIVE");
    assert.ok(row.started_at);
  });

  test("pairs multiple independent pools in one tick -- proven generic with a structurally different game", async () => {
    const { db, mm, worker } = await fresh();
    for (const id of ["cp1", "cp2", "sp1", "sp2"]) await addPlayer(db, id);
    await mm.enqueue({ playerId: "cp1", gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "cp2", gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "sp1", gameId: "speed-math", ratingX100: 150000, timeControl: TC_SPEED });
    await mm.enqueue({ playerId: "sp2", gameId: "speed-math", ratingX100: 150000, timeControl: TC_SPEED });

    const report = await worker.tick();
    assert.equal(report.paired.length, 2);
    assert.equal(report.dispatched.filter((d) => d.outcome === DispatchOutcome.LIVE).length, 2);

    const gameIds = new Set();
    for (const d of report.dispatched) gameIds.add(d.gameId);
    assert.deepEqual(gameIds, new Set(["chess", "speed-math"]));
  });

  test("an odd player out is left queued, not force-paired", async () => {
    const { db, mm, worker } = await fresh();
    for (const id of ["ply1", "ply2", "ply3"]) await addPlayer(db, id);
    for (const id of ["ply1", "ply2", "ply3"]) {
      await mm.enqueue({ playerId: id, gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    }

    const report = await worker.tick();
    assert.equal(report.paired.length, 1);

    const stillQueued = await db.query(
      "SELECT count(*)::int AS n FROM matchmaking_ticket WHERE status='ACTIVE'"
    );
    assert.equal(stillQueued.rows[0].n, 1);
  });
});

describe("dispatch worker: stale queue entries", () => {
  test("a stale ticket is swept before pairing and never matched", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice");
    await addPlayer(db, "bob");
    await mm.enqueue({ playerId: "alice", gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", ratingX100: 150000, timeControl: TC_CHESS });
    // Simulate alice's ticket having gone stale (no heartbeat, TTL elapsed).
    await db.query(
      "UPDATE matchmaking_ticket SET expires_at = now() - interval '1 second' WHERE player_id='alice'"
    );

    const report = await worker.tick();
    assert.ok(report.expiredTickets >= 1);
    assert.equal(report.paired.length, 0, "bob has nobody left to pair with");

    const alice = await db.query("SELECT status FROM matchmaking_ticket WHERE player_id='alice'");
    assert.equal(alice.rows[0].status, "EXPIRED");
    const bob = await db.query("SELECT status FROM matchmaking_ticket WHERE player_id='bob'");
    assert.equal(bob.rows[0].status, "ACTIVE");
  });
});

describe("dispatch worker: cash reservation", () => {
  test("a funded CASH duel is reserved and marked LIVE in one tick", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice", 100);
    await addPlayer(db, "bob", 100);
    await mm.enqueue({ playerId: "alice", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });

    const report = await worker.tick();
    assert.equal(report.dispatched[0].outcome, DispatchOutcome.LIVE);

    const row = await duelRow(db, report.paired[0].duelId);
    assert.equal(row.status, "LIVE");
    assert.ok(row.reservation_tx_id);
    assert.equal(await natural(db, "user:alice:locked"), u(10));
    assert.equal(await natural(db, "user:bob:locked"), u(10));
  });

  test("an underfunded CASH duel is voided, not left stuck in RESERVED", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice", 100);
    await addPlayer(db, "bob", 0);
    await mm.enqueue({ playerId: "alice", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });

    const report = await worker.tick();
    assert.equal(report.dispatched[0].outcome, DispatchOutcome.VOIDED_INSUFFICIENT_FUNDS);
    assert.equal(report.failed.length, 0, "an expected funding failure is not a worker crash");

    const row = await duelRow(db, report.paired[0].duelId);
    assert.equal(row.status, "VOIDED");
    assert.equal(row.reservation_tx_id, null, "nothing was ever locked");
    assert.equal(await natural(db, "user:alice:available"), u(100), "alice's funds were never touched");
  });
});

describe("dispatch worker: crash recovery and retry safety", () => {
  test("a duel left RESERVED by an earlier, unfinished run is picked up and finished later -- not just ones paired this tick", async () => {
    const { db, mm, settlement, store, plugins, worker } = await fresh();
    await addPlayer(db, "alice", 100);
    await addPlayer(db, "bob", 100);
    await mm.enqueue({ playerId: "alice", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });

    // Pair directly, bypassing the worker entirely -- simulating a worker
    // process that paired the duel and then crashed before reserving funds
    // or marking it live.
    const paired = await mm.pair({
      gameId: "chess", tier: "CASH", stakeMinor: u(10),
      initialState: { fen: START_FEN }, timeControl: TC_CHESS,
    });
    assert.equal(paired.paired, true);
    assert.equal((await duelRow(db, paired.duelId)).status, "RESERVED");

    const report = await worker.tick();
    const mine = report.dispatched.find((d) => d.duelId === paired.duelId);
    assert.equal(mine.outcome, DispatchOutcome.LIVE);
    assert.equal((await duelRow(db, paired.duelId)).status, "LIVE");

    // A second, independent call -- as if a second worker instance also
    // reached this duel -- must not move money twice or error.
    const again = await worker.finishDispatch(paired.duelId);
    assert.equal(again.outcome, DispatchOutcome.ALREADY_LIVE);
    assert.equal(await natural(db, "user:alice:locked"), u(10), "locked exactly once");
  });

  test("calling tick() twice in a row does not double-pair or double-reserve the same two players", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice", 100);
    await addPlayer(db, "bob", 100);
    await mm.enqueue({ playerId: "alice", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });

    const first = await worker.tick();
    const second = await worker.tick();

    assert.equal(first.paired.length, 1);
    assert.equal(second.paired.length, 0, "both tickets are already MATCHED; there is nothing left to pair");

    const count = await db.query("SELECT count(*)::int AS n FROM duel");
    assert.equal(count.rows[0].n, 1);
    assert.equal(await natural(db, "user:alice:locked"), u(10), "one reservation, not two");
  });

  test("re-running finishDispatch on an already-VOIDED duel does not attempt a second void", async () => {
    const { db, mm, worker } = await fresh();
    await addPlayer(db, "alice", 0);
    await addPlayer(db, "bob", 0);
    await mm.enqueue({ playerId: "alice", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });
    await mm.enqueue({ playerId: "bob", gameId: "chess", tier: "CASH", stakeMinor: u(10), ratingX100: 150000, timeControl: TC_CHESS });

    const report = await worker.tick();
    const duelId = report.paired[0].duelId;
    assert.equal((await duelRow(db, duelId)).status, "VOIDED");

    // VOIDED is neither RESERVED nor READY -- a later tick must skip it
    // cleanly rather than re-attempt settlement on a duel that is already done.
    const again = await worker.finishDispatch(duelId);
    assert.equal(again.outcome, DispatchOutcome.SKIPPED);
  });
});

describe("dispatch worker: unknown games are reported, never silently paired", () => {
  test("a pool for an unregistered plugin is skipped and surfaced, without crashing the tick", async () => {
    const { db, mm, worker } = await fresh();
    await db.query(
      "INSERT INTO game (id, display_name, plugin_version, is_live) VALUES ('memory-grid','Memory Grid',1,TRUE)"
    );
    await addPlayer(db, "alice");
    await addPlayer(db, "bob");
    await mm.enqueue({ playerId: "alice", gameId: "memory-grid", ratingX100: 150000, timeControl: {} });
    await mm.enqueue({ playerId: "bob", gameId: "memory-grid", ratingX100: 150000, timeControl: {} });

    const report = await worker.tick();
    assert.equal(report.unknownGamePools.length, 1);
    assert.equal(report.unknownGamePools[0].gameId, "memory-grid");
    assert.equal(report.paired.length, 0);
    assert.equal(report.failed.length, 0);

    const count = await db.query("SELECT count(*)::int AS n FROM duel");
    assert.equal(count.rows[0].n, 0);
  });

  test("a caller-supplied spawner map extends the worker to a third game with no change to worker code", async () => {
    const { db, mm, settlement, store, plugins } = await fresh();
    await db.query(
      "INSERT INTO game (id, display_name, plugin_version, is_live) VALUES ('future-game','Future Game',1,TRUE)"
    );
    // A minimal stand-in plugin, registered only for this test, proving the
    // worker consults the spawner map rather than any hardcoded game list.
    plugins.set("future-game", { id: "future-game", version: 1, turnModel: "SIMULTANEOUS",
      rehydrate: () => ({ state: {} }) });
    const worker = createDispatchWorker(db, {
      settlement, store, plugins, mm,
      spawners: { "future-game": () => ({ initialState: { ok: true }, seed: null }) },
    });

    await addPlayer(db, "alice");
    await addPlayer(db, "bob");
    await mm.enqueue({ playerId: "alice", gameId: "future-game", ratingX100: 150000, timeControl: {} });
    await mm.enqueue({ playerId: "bob", gameId: "future-game", ratingX100: 150000, timeControl: {} });

    const report = await worker.tick();
    assert.equal(report.paired.length, 1);
    assert.equal(report.dispatched[0].outcome, DispatchOutcome.LIVE);
  });
});
