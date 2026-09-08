/**
 * The matchmaking dispatch worker.
 *
 * Everything that makes matching safe under concurrency already lives in the
 * database (migration 0003's `mm_pair()`/`mm_expire_stale()`, and
 * settlement's `reserve()`/`void_()` for cash stakes): a partial unique index
 * against double-joining, an idempotent pairing key, `FOR UPDATE SKIP
 * LOCKED` against two pairers racing the same ticket, and a ledger-enforced
 * reservation that either fully locks both stakes or moves nothing. This
 * file adds no new invariant of its own -- it is the thing that actually
 * CALLS those primitives on a schedule, in the right order, and finishes
 * whatever a previous, possibly-crashed run left half-done.
 *
 * A single `tick()` is deliberately the whole unit of work:
 *
 *   1. sweep stale tickets
 *   2. attempt pairing in every pool that currently has activity
 *   3. finish dispatch for EVERY duel sitting in RESERVED or READY --
 *      not just ones this tick just paired
 *
 * Step 3 is what makes a crash recoverable and a retry safe. A duel does not
 * care which tick, or which worker process, moves it from RESERVED to LIVE;
 * it only cares that the move happens exactly once in effect (reservation is
 * keyed and idempotent; `markLive` is idempotent). Run `tick()` from a
 * `setInterval`, a cron job, or three redundant worker processes -- the
 * result is the same.
 */
import { createMatchmakingService } from "./matchmaking.mjs";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";

export const DispatchOutcome = {
  LIVE: "LIVE",
  ALREADY_LIVE: "ALREADY_LIVE",
  VOIDED_INSUFFICIENT_FUNDS: "VOIDED_INSUFFICIENT_FUNDS",
  MISSING: "MISSING",
  SKIPPED: "SKIPPED",
};

export function createDispatchWorker(db, {
  settlement,
  store,
  plugins,
  mm = createMatchmakingService(db),
  spawners = DEFAULT_SPAWNERS,
  heartbeatGraceSeconds = 30,
  maxPairingsPerPool = 1000,
  now = () => Date.now(),
  onError = (err) => { throw err; },
  emit = () => {},
} = {}) {
  if (!settlement) throw new Error("createDispatchWorker requires a settlement service");
  if (!store) throw new Error("createDispatchWorker requires a duel store");
  if (!plugins) throw new Error("createDispatchWorker requires a plugin registry");

  /** Pair as many duels as possible in one pool. Stops at the first non-pairing. */
  async function pairPool(pool) {
    const spawn = spawners[pool.gameId];
    if (!spawn) return { paired: [], unknownGame: true };

    const paired = [];
    for (let i = 0; i < maxPairingsPerPool; i++) {
      const { initialState, seed } = spawn();
      const res = await mm.pair({
        gameId: pool.gameId,
        mode: pool.mode,
        tier: pool.tier,
        stakeMinor: pool.stakeMinor,
        initialState,
        timeControl: pool.timeControl,
        seed,
      });
      if (!res.paired) break;
      paired.push(res);
      emit("matchmaking.paired", { duelId: res.duelId, gameId: pool.gameId, tier: pool.tier });
    }
    return { paired, unknownGame: false };
  }

  /**
   * Bring one non-LIVE duel the rest of the way to LIVE, resuming from
   * whatever state it is actually in rather than assuming it was just
   * created. Safe to call more than once, and safe to call concurrently
   * from more than one worker on the same duelId: `reserve()` is keyed on
   * `reservation_tx_id`, and `markLive()` is a plain idempotent UPDATE.
   */
  async function finishDispatch(duelId) {
    let duel = await store.load(duelId, plugins, now());
    if (!duel) return { duelId, outcome: DispatchOutcome.MISSING };

    if (duel.status === "LIVE") return { duelId, outcome: DispatchOutcome.ALREADY_LIVE };
    if (duel.status !== "RESERVED" && duel.status !== "READY") {
      return { duelId, outcome: DispatchOutcome.SKIPPED, status: duel.status };
    }

    if (duel.status === "RESERVED") {
      try {
        await settlement.reserve(duelId);
      } catch (e) {
        if (/insufficient funds/.test(e.message)) {
          await settlement.void_(duelId, "RESERVATION_FAILED");
          return { duelId, outcome: DispatchOutcome.VOIDED_INSUFFICIENT_FUNDS };
        }
        throw e;
      }
      // reserve() may have flipped RESERVED -> READY on a row `duel` was
      // hydrated before; markLive only reads duelId/clock/startedAt, none of
      // which reservation changes, so re-marking LIVE from the object already
      // in hand is correct without a second load.
    }

    await store.markLive(duel);
    return { duelId, outcome: DispatchOutcome.LIVE, players: duel.players, gameId: duel.gameId };
  }

  async function tick() {
    emit("worker.tick_started", { worker: "matchmaking_dispatch" });
    try {
      const swept = await mm.sweepStale(heartbeatGraceSeconds);

      const pools = await mm.activePools();
      const paired = [];
      const unknownGamePools = [];
      for (const pool of pools) {
        const { paired: results, unknownGame } = await pairPool(pool);
        paired.push(...results);
        if (unknownGame) {
          unknownGamePools.push(pool);
          emit("matchmaking.unknown_game_pool", { gameId: pool.gameId, mode: pool.mode, tier: pool.tier });
        }
      }

      const pending = await db.query(
        `SELECT id FROM duel WHERE status IN ('RESERVED','READY') ORDER BY created_at`
      );
      const dispatched = [];
      const failed = [];
      for (const row of pending.rows) {
        try {
          dispatched.push(await finishDispatch(row.id));
        } catch (e) {
          failed.push({ duelId: row.id, error: e.message });
          emit("worker.job_retried", { worker: "matchmaking_dispatch", duelId: row.id, error: e.message });
          onError(e);
        }
      }

      const report = {
        expiredTickets: swept.expired,
        pools: pools.length,
        unknownGamePools,
        paired,
        dispatched,
        failed,
      };
      emit("worker.tick_completed", {
        worker: "matchmaking_dispatch", pools: report.pools, paired: paired.length,
        dispatched: dispatched.length, failed: failed.length,
      });
      return report;
    } catch (e) {
      emit("worker.tick_failed", { worker: "matchmaking_dispatch", error: e.message });
      throw e;
    }
  }

  let timer = null;
  return {
    tick,
    finishDispatch,
    start(intervalMs = 1000) {
      if (timer) return;
      timer = setInterval(() => { tick().catch(onError); }, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
