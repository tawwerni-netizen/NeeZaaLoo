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
import { configForDifficulty as speedMathConfigForDifficulty } from "../../game-speed-math/src/plugin.mjs";
import { resolveTimeControl } from "../../duel-engine/src/time-profiles.mjs";

export const VsComputerError = Object.freeze({
  UNSUPPORTED_GAME: "UNSUPPORTED_GAME",
  UNKNOWN_DIFFICULTY: "UNKNOWN_DIFFICULTY",
});

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

// Only a game with a REAL registered AI adapter may be played this way.
// Adding a game here without a matching adapter wired into
// apps/gateway|worker's own aiAdapters map would create a duel no bot
// ever moves in, silently expiring on time instead of erroring loudly.
const AI_SUPPORTED_GAMES = new Set([
  "chess", "checkers", "connect-four", "xo", "speed-math", "dominoes", "backgammon",
  "seega", "reversi", "gomoku",
]);

/**
 * Most games' difficulty only changes how well the BOT plays -- the
 * position/board itself is the same fixed starting point regardless of
 * who you're playing (a chess opening, an empty checkers/XO/Connect Four
 * board). Speed Math is the one launch game where difficulty changes the
 * CONTENT itself (see game-speed-math/src/plugin.mjs's own "CHALLENGE
 * RULES" section) -- harder operations, larger operands -- and needs a
 * matching round length, not the ALTERNATING default clock. This is the
 * one place that distinction is resolved, explicitly, rather than
 * quietly baked into the generic zero-argument spawner every ordinary
 * ticket-paired duel also calls.
 */
function resolveChallengeFor(gameId, difficulty, spawned, requestedTimeControl) {
  if (gameId === "speed-math") {
    const config = speedMathConfigForDifficulty(difficulty);
    return {
      initialState: { seed: spawned.seed, config },
      timeControl: { durationMs: config.durationMs },
    };
  }
  return { initialState: spawned.initialState, timeControl: requestedTimeControl };
}

export function createVsComputerService(db) {
  return {
    async createDuel({
      gameId, playerId, difficulty, timeControl, timeProfile = "STANDARD",
    }) {
      if (!AI_SUPPORTED_GAMES.has(gameId)) {
        return { ok: false, reason: VsComputerError.UNSUPPORTED_GAME };
      }
      timeControl ??= resolveTimeControl(gameId, timeProfile || "STANDARD");
      if (!Object.values(Difficulty).includes(difficulty)) {
        return { ok: false, reason: VsComputerError.UNKNOWN_DIFFICULTY };
      }

      const spawn = DEFAULT_SPAWNERS[gameId];
      const spawned = spawn();
      const { initialState, timeControl: resolvedTimeControl } =
        resolveChallengeFor(gameId, difficulty, spawned, timeControl);
      const botId = `ai-${difficulty.toLowerCase()}`;
      const duelId = `vc_${randomUUID()}`;

      const g = await db.query("SELECT plugin_version FROM game WHERE id = $1", [gameId]);
      const pluginVersion = g.rows[0]?.plugin_version ?? 1;

      await db.query(
        `INSERT INTO duel
           (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
            tier, stake_minor, initial_state, seed, time_control, status, started_at, is_vs_computer)
         VALUES ($1,$2,$3,$4,$5,$6,'FREE'::entry_tier,0,$7::jsonb,$8,$9::jsonb,'LIVE'::duel_status,now(),TRUE)`,
        [duelId, gameId, pluginVersion, `vs-computer:${duelId}`, playerId, botId,
          JSON.stringify(initialState), spawned.seed, JSON.stringify(resolvedTimeControl)]
      );
      return { ok: true, duelId, botId };
    },
  };
}
