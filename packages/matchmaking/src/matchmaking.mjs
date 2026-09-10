/**
 * The matchmaking service.
 *
 * This is deliberately a thin JS wrapper over the SQL already proven in
 * migration 0003: `mm_pair()` and `mm_expire_stale()`. Double-joining,
 * duplicate matches, stale tickets and rating-band widening are ALL enforced
 * in the database (a partial unique index, an idempotent pairing key, a
 * TTL/heartbeat sweep) -- this file exists to give the API and background
 * workers a clean, generic entry point, and to map SQL-level constraint
 * violations to stable error codes. It adds no new invariants of its own.
 *
 * Generic across games by construction: every call takes `gameId` and
 * touches nothing chess-specific. The same service seats a Speed Math ticket
 * as readily as a chess one.
 */
import { randomUUID } from "node:crypto";
import { isValidStakeMinor } from "./stakes.mjs";

export const MatchmakingError = {
  ALREADY_QUEUED: "ALREADY_QUEUED",
  UNKNOWN_GAME: "UNKNOWN_GAME",
  INVALID_STAKE: "INVALID_STAKE",
};

export function createMatchmakingService(db, { now = () => Date.now() } = {}) {
  return {
    /**
     * Join the queue for one (game, mode, tier, stake) pool. A player may
     * hold at most one active ticket across the whole platform -- not one
     * per pool -- which is what the partial unique index on
     * matchmaking_ticket(player_id) enforces.
     */
    async enqueue({
      playerId, gameId, mode = "standard", tier = "FREE", stakeMinor = 0n,
      ratingX100, timeControl, ttlSeconds = 60,
    }) {
      // RANDOM OPPONENT, Competitive: the UI offers only the fixed preset
      // ladder, but this is the actual enforcement -- a client that is
      // compromised, stale, or simply wrong about the ladder can never
      // queue a stake this platform does not recognise. FREE is exempt:
      // its only legal stake is exactly 0, checked structurally by the
      // tier itself (mm_pair/duel's own CASH-has-stake shape), not by the
      // competitive ladder.
      if (tier === "CASH" && !isValidStakeMinor(stakeMinor)) {
        return { ok: false, reason: MatchmakingError.INVALID_STAKE };
      }
      try {
        const r = await db.query(
          `INSERT INTO matchmaking_ticket
             (player_id, game_id, mode, time_control, tier, stake_minor, rating_x100, expires_at)
           VALUES ($1,$2,$3,$4::jsonb,$5::entry_tier,$6,$7, now() + ($8 || ' seconds')::interval)
           RETURNING id, expires_at`,
          [playerId, gameId, mode, JSON.stringify(timeControl), tier,
           stakeMinor.toString(), ratingX100, String(ttlSeconds)]
        );
        return { ok: true, ticketId: String(r.rows[0].id), expiresAt: r.rows[0].expires_at };
      } catch (e) {
        if (/matchmaking_one_active_per_player|duplicate key/.test(e.message)) {
          return { ok: false, reason: MatchmakingError.ALREADY_QUEUED };
        }
        if (/violates foreign key constraint.*game/.test(e.message)) {
          return { ok: false, reason: MatchmakingError.UNKNOWN_GAME };
        }
        throw e;
      }
    },

    /** Cancel a player's own ticket, freeing them to queue again. */
    async cancel(playerId) {
      const r = await db.query(
        `UPDATE matchmaking_ticket SET status='CANCELLED'::ticket_status
          WHERE player_id=$1 AND status='ACTIVE' RETURNING id`,
        [playerId]
      );
      return { ok: true, cancelled: r.rows.length > 0 };
    },

    /**
     * Attempt one pairing in a pool. Idempotent on the pairing key: a retry
     * after an ambiguous failure returns the SAME duel rather than creating
     * a second one.
     */
    async pair({ gameId, mode = "standard", tier = "FREE", stakeMinor = 0n, initialState, timeControl, seed = null }) {
      const duelId = `duel_${randomUUID()}`;
      const r = await db.query(
        `SELECT * FROM mm_pair($1,$2,$3::entry_tier,$4,$5,$6::jsonb,$7::jsonb,$8)`,
        [gameId, mode, tier, stakeMinor.toString(), duelId,
         JSON.stringify(initialState), JSON.stringify(timeControl), seed]
      );
      if (!r.rows.length) return { ok: true, paired: false };
      const row = r.rows[0];
      return { ok: true, paired: true, duelId: row.duel_id, seat0: row.seat_0, seat1: row.seat_1, created: row.created };
    },

    /**
     * Run pairing repeatedly for one pool until the queue is exhausted (or a
     * cap is hit). This is what a background worker calls on a timer; each
     * individual pairing is still the same idempotent `mm_pair()` call.
     */
    async pairAll(pool, { maxPairings = 1000 } = {}) {
      const results = [];
      for (let i = 0; i < maxPairings; i++) {
        const res = await this.pair(pool);
        if (!res.paired) break;
        results.push(res);
      }
      return results;
    },

    /** Sweep stale tickets across every pool. Safe to run on any schedule. */
    async sweepStale(heartbeatGraceSeconds = 30) {
      const r = await db.query(
        `SELECT mm_expire_stale(($1 || ' seconds')::interval) AS n`,
        [String(heartbeatGraceSeconds)]
      );
      return { ok: true, expired: r.rows[0].n };
    },

    /** Keep a ticket alive. A client calls this periodically while queued. */
    async heartbeat(playerId) {
      const r = await db.query(
        `UPDATE matchmaking_ticket SET heartbeat_at=now()
          WHERE player_id=$1 AND status='ACTIVE' RETURNING id`,
        [playerId]
      );
      return { ok: r.rows.length > 0 };
    },

    async status(playerId) {
      const r = await db.query(
        `SELECT id, game_id, mode, tier, status, enqueued_at, expires_at, duel_id
           FROM matchmaking_ticket WHERE player_id=$1 AND status='ACTIVE'`,
        [playerId]
      );
      return r.rows[0] ?? null;
    },

    /**
     * Every pool that currently has at least one ACTIVE ticket, one row per
     * (game, mode, tier, stake) with the time control taken from the OLDEST
     * ticket in that pool -- the same ticket `mm_pair()` itself will pick as
     * its first candidate (identical ORDER BY). A dispatch worker uses this
     * to know which pools to attempt pairing in, without guessing.
     *
     * `mode` is the only thing that distinguishes two pools of the same
     * (game, tier, stake) with different time controls -- `mm_pair()` does
     * not itself filter on `time_control`. Callers of `enqueue()` MUST pick a
     * `mode` string that already encodes the desired time control (e.g.
     * "blitz-180000-0"), or two tickets queued with different time controls
     * but the same `mode` can be paired into a duel that honors only the
     * older ticket's preference. This is a pre-existing pooling convention,
     * not something this method can fix on its own.
     */
    async activePools() {
      const r = await db.query(
        `SELECT DISTINCT ON (game_id, mode, tier, stake_minor)
                game_id, mode, tier, stake_minor::text AS stake_minor, time_control
           FROM matchmaking_ticket
          WHERE status = 'ACTIVE' AND expires_at > now()
          ORDER BY game_id, mode, tier, stake_minor, enqueued_at, id`
      );
      return r.rows.map((row) => ({
        gameId: row.game_id,
        mode: row.mode,
        tier: row.tier,
        stakeMinor: BigInt(row.stake_minor),
        timeControl: row.time_control,
      }));
    },
  };
}
