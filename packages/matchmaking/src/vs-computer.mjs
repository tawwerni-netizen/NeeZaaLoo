/**
 * VS_COMPUTER duel creation.
 *
 * Deliberately NOT routed through matchmaking's ticket/pairing machinery
 * (mm_pair(), the matchmaking_ticket table) -- there is no opponent to
 * find, so there is nothing to queue or pair. This creates the duel row
 * directly, as READY, tier FREE, `is_vs_computer = TRUE`, and stops there:
 * the EXISTING matchmaking dispatch worker's own generic sweep (`SELECT id
 * FROM duel WHERE status IN ('RESERVED','READY')`, packages/matchmaking/
 * src/dispatch.mjs) picks it up on its next tick and marks it LIVE exactly
 * like any ticket-paired duel, and the gateway's existing claim-sweep then
 * loads it into memory exactly like any other -- no new worker, no new
 * sweep, no parallel path.
 *
 * The human is always seat_0 (White, in chess) and the bot always seat_1
 * -- a known, documented simplification (no seat/colour choice yet), not
 * an oversight.
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";

export const VsComputerError = Object.freeze({
  UNSUPPORTED_GAME: "UNSUPPORTED_GAME",
  UNKNOWN_DIFFICULTY: "UNKNOWN_DIFFICULTY",
});

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

// Only a game with a REAL registered AI adapter may be played this way.
// Today that is exactly chess (packages/game-chess/src/ai.mjs) -- adding a
// second game here without a matching adapter would create a duel no bot
// ever moves in, silently expiring on time instead of erroring loudly.
const AI_SUPPORTED_GAMES = new Set(["chess"]);

export function createVsComputerService(db) {
  return {
    async createDuel({
      gameId, playerId, difficulty, timeControl = { initialMs: 300_000, incrementMs: 0 },
    }) {
      if (!AI_SUPPORTED_GAMES.has(gameId)) {
        return { ok: false, reason: VsComputerError.UNSUPPORTED_GAME };
      }
      if (!Object.values(Difficulty).includes(difficulty)) {
        return { ok: false, reason: VsComputerError.UNKNOWN_DIFFICULTY };
      }

      const spawn = DEFAULT_SPAWNERS[gameId];
      const { initialState, seed } = spawn();
      const botId = `ai-${difficulty.toLowerCase()}`;
      const duelId = `vc_${randomUUID()}`;

      const g = await db.query("SELECT plugin_version FROM game WHERE id = $1", [gameId]);
      const pluginVersion = g.rows[0]?.plugin_version ?? 1;

      await db.query(
        `INSERT INTO duel
           (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
            tier, stake_minor, initial_state, seed, time_control, status, is_vs_computer)
         VALUES ($1,$2,$3,$4,$5,$6,'FREE'::entry_tier,0,$7::jsonb,$8,$9::jsonb,'READY'::duel_status,TRUE)`,
        [duelId, gameId, pluginVersion, `vs-computer:${duelId}`, playerId, botId,
          JSON.stringify(initialState), seed, JSON.stringify(timeControl)]
      );
      return { ok: true, duelId, botId };
    },
  };
}
