/**
 * Background Bot ELO Match Simulator.
 *
 * Periodically simulates lightweight rated matches between bots across all 11 games.
 * Updates the `rating` table so that live leaderboards and ranks shift realistically
 * over time without burning platform rake or straining game engines.
 */
const SIMULATOR_GAMES = [
  "chess", "checkers", "backgammon", "dominoes", "billiards",
  "connect-four", "gomoku", "reversi", "seega", "speed-math", "xo",
];

export function createBotMatchSimulator(db, { emit = () => {} } = {}) {
  return async function tick() {
    try {
      // 1. Pick a random game
      const gameId = SIMULATOR_GAMES[Math.floor(Math.random() * SIMULATOR_GAMES.length)];

      // 2. Select two distinct AI bots with ratings in that game
      const botsRes = await db.query(
        `SELECT r.player_id, r.rating_x100, r.games_played
           FROM rating r
           JOIN player p ON p.id = r.player_id
          WHERE r.game_id = $1 AND p.is_ai = TRUE
          ORDER BY random()
          LIMIT 2`,
        [gameId]
      );

      if (botsRes.rows.length < 2) return { simulated: false };

      const botA = botsRes.rows[0];
      const botB = botsRes.rows[1];

      const rA = botA.rating_x100 / 100;
      const rB = botB.rating_x100 / 100;

      // 3. Calculate expected score (Standard ELO formula)
      const expectedA = 1 / (1 + 10 ** ((rB - rA) / 400));
      const roll = Math.random();

      // Determine outcome: 1 (A wins), 0.5 (draw), 0 (B wins)
      let scoreA = 0;
      let scoreB = 1;
      if (roll < expectedA * 0.85) {
        scoreA = 1;
        scoreB = 0;
      } else if (roll < expectedA * 0.85 + 0.15) {
        scoreA = 0.5;
        scoreB = 0.5;
      }

      // 4. Update ratings with K = 20
      const K = 20;
      const deltaA = Math.round(K * (scoreA - expectedA));
      const deltaB = Math.round(K * (scoreB - (1 - expectedA)));

      const newRatingA = Math.max(120000, Math.min(295000, botA.rating_x100 + deltaA * 100));
      const newRatingB = Math.max(120000, Math.min(295000, botB.rating_x100 + deltaB * 100));

      await db.query(
        `UPDATE rating
            SET rating_x100 = $1, games_played = games_played + 1, last_played_at = now()
          WHERE player_id = $2 AND game_id = $3`,
        [newRatingA, botA.player_id, gameId]
      );

      await db.query(
        `UPDATE rating
            SET rating_x100 = $1, games_played = games_played + 1, last_played_at = now()
          WHERE player_id = $2 AND game_id = $3`,
        [newRatingB, botB.player_id, gameId]
      );

      emit("simulator.bot_match_completed", {
        gameId,
        botA: botA.player_id,
        botB: botB.player_id,
        scoreA,
        scoreB,
        newRatingA,
        newRatingB,
      });

      return { simulated: true, gameId, botA: botA.player_id, botB: botB.player_id };
    } catch {
      return { simulated: false };
    }
  };
}
