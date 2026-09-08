/**
 * The DB-facing half of the Global Skill Score: pulls each player's
 * established-game percentiles from `game_rating_percentile` (0011) and
 * hands them to the pure algorithm in global-skill.mjs. Kept thin
 * deliberately -- every decision that shapes the score lives in the pure
 * module, where it can be tested without a database.
 */
import { globalSkillScore, assignTiers } from "./global-skill.mjs";

export function createGlobalSkillService(db) {
  return {
    /** One player's score, with the full explainable breakdown. */
    async scoreFor(playerId) {
      const r = await db.query(
        `SELECT game_id, rating_x100, rd_x100, games_played, percentile
           FROM game_rating_percentile WHERE player_id = $1`,
        [playerId]
      );
      const entries = r.rows.map((row) => ({
        gameId: row.game_id,
        ratingX100: row.rating_x100,
        rdX100: row.rd_x100,
        gamesPlayed: row.games_played,
        percentile: Number(row.percentile),
      }));
      return globalSkillScore(entries);
    },

    /**
     * Every player who has at least one established game, scored and tiered
     * against each other. Used for the leaderboard and for tier assignment,
     * since a tier is a percentile of THIS population, not a fixed number.
     */
    async leaderboard() {
      const players = await db.query(
        `SELECT DISTINCT player_id FROM game_rating_percentile`
      );
      const scores = [];
      for (const row of players.rows) {
        const result = await this.scoreFor(row.player_id);
        scores.push({ playerId: row.player_id, score: result.score, breakdown: result.breakdown });
      }
      const tiered = assignTiers(scores.map((s) => ({ playerId: s.playerId, score: s.score })));
      const byId = new Map(scores.map((s) => [s.playerId, s]));
      return tiered
        .map((t) => ({ ...t, breakdown: byId.get(t.playerId).breakdown }))
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    },

    async tierFor(playerId) {
      const board = await this.leaderboard();
      return board.find((b) => b.playerId === playerId) ?? { playerId, score: null, percentile: null, tier: "UNRANKED" };
    },
  };
}
