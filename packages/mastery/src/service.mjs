import { masteryLevel } from "./mastery.mjs";

/**
 * Reads exactly the two tables mastery.mjs needs and nothing else --
 * `rating` for volume, `game_rating_percentile` for the established-skill
 * signal (LEFT JOIN, since that view only contains established rows: its
 * absence for a game IS "not established", not a value to special-case).
 */
export function createMasteryService(db) {
  async function masteryFor(playerId) {
    const r = await db.query(
      `SELECT rt.game_id, g.display_name, rt.rating_x100, rt.games_played,
              grp.percentile
         FROM rating rt
         JOIN game g ON g.id = rt.game_id
         LEFT JOIN game_rating_percentile grp
           ON grp.player_id = rt.player_id AND grp.game_id = rt.game_id
        WHERE rt.player_id = $1
        ORDER BY rt.games_played DESC`,
      [playerId]
    );
    return r.rows.map((row) => {
      const established = row.percentile !== null;
      const percentile = established ? Number(row.percentile) : null;
      return {
        gameId: row.game_id,
        displayName: row.display_name,
        rating: row.rating_x100 / 100,
        gamesPlayed: row.games_played,
        established,
        percentile,
        level: masteryLevel({ gamesPlayed: row.games_played, established, percentile }),
      };
    });
  }

  /** One game's mastery, or null if the player has never played it. */
  async function masteryForGame(playerId, gameId) {
    const all = await masteryFor(playerId);
    return all.find((m) => m.gameId === gameId) ?? null;
  }

  return { masteryFor, masteryForGame };
}
