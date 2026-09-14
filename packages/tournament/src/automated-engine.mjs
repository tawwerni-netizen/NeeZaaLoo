/**
 * Automated Tournament Engine.
 *
 * Keeps ongoing 16-player single-elimination cash tournaments continuously running
 * for 5 official games: Chess, Dominoes, Backgammon, Checkers, and Speed Math.
 *
 * Economics:
 *   - Entry fee: 10 USDT
 *   - Capacity: 16 players
 *   - Total Pot: 160 USDT
 *   - Platform Fee (12%): 19.20 USDT
 *   - Winner Prize (88%): 140.80 USDT
 *
 * Lifecycle:
 *   - Ensures an open tournament in status 'REGISTRATION' is ALWAYS available for each game.
 *   - As soon as the 16th player registers, starts the tournament (moves to 'LIVE') and
 *     immediately spawns the next tournament for that game.
 *   - Automatically settles prizes once the final is decided (moves to 'SETTLED').
 */

export const AUTOMATED_TOURNAMENT_GAMES = [
  {
    gameId: "chess",
    title: "Chess 16 Championship [10 USDT]",
    description: "16-Player Single Elimination. Winner takes 88% ($140.80 USDT). 12% Platform Fee.",
    initialSeconds: 300,
    incrementSeconds: 3,
  },
  {
    gameId: "dominoes",
    title: "Dominoes 16 Grand Prix [10 USDT]",
    description: "16-Player Single Elimination. Winner takes 88% ($140.80 USDT). 12% Platform Fee.",
    initialSeconds: 120,
    incrementSeconds: 2,
  },
  {
    gameId: "backgammon",
    title: "Backgammon 16 Classic [10 USDT]",
    description: "16-Player Single Elimination. Winner takes 88% ($140.80 USDT). 12% Platform Fee.",
    initialSeconds: 180,
    incrementSeconds: 2,
  },
  {
    gameId: "checkers",
    title: "Checkers 16 Open [10 USDT]",
    description: "16-Player Single Elimination. Winner takes 88% ($140.80 USDT). 12% Platform Fee.",
    initialSeconds: 120,
    incrementSeconds: 2,
  },
  {
    gameId: "speed-math",
    title: "Speed Math 16 Sprint [10 USDT]",
    description: "16-Player Single Elimination. Winner takes 88% ($140.80 USDT). 12% Platform Fee.",
    initialSeconds: 60,
    incrementSeconds: 0,
  },
];

export function createAutomatedTournamentEngine(db, tournamentService) {
  async function spawnTournament(gameDef) {
    const closesAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const created = await tournamentService.create({
      gameId: gameDef.gameId,
      format: "SINGLE_ELIMINATION",
      tier: "CASH",
      entryFeeMinor: 10000000n, // 10 USDT
      asset: "USDT",
      capacity: 16,
      minPlayers: 16,
      timeControl: { initialSeconds: gameDef.initialSeconds, incrementSeconds: gameDef.incrementSeconds },
      registrationClosesAt: closesAt,
      scheduledStartsAt: closesAt,
      title: gameDef.title,
      description: gameDef.description,
      prizeStructure: [{ place: 1, percent: 100 }],
      createdBy: "system-automation",
      visibility: "PUBLIC",
    });

    if (created.ok) {
      await tournamentService.openRegistration(created.tournamentId);
      return created.tournamentId;
    }
    return null;
  }

  async function tick() {
    const started = [];
    const spawned = [];
    const settled = [];

    for (const gameDef of AUTOMATED_TOURNAMENT_GAMES) {
      try {
        const existing = await db.query(
          `SELECT t.id, t.status,
                  (SELECT count(*)::int FROM tournament_registration tr
                    WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS registered_count
             FROM tournament t
            WHERE t.game_id = $1 AND t.tier = 'CASH' AND t.capacity = 16 AND t.status = 'REGISTRATION'
            ORDER BY t.created_at DESC LIMIT 1`,
          [gameDef.gameId]
        );

        if (existing.rows.length === 0) {
          // No open tournament exists for this game -- spawn one!
          const newId = await spawnTournament(gameDef);
          if (newId) spawned.push({ gameId: gameDef.gameId, tournamentId: newId });
        } else {
          const row = existing.rows[0];
          // If full (16/16), start it and immediately spawn the next tournament!
          if (row.registered_count >= 16) {
            const startRes = await tournamentService.start(row.id);
            if (startRes.ok) {
              started.push(row.id);
              const nextId = await spawnTournament(gameDef);
              if (nextId) spawned.push({ gameId: gameDef.gameId, tournamentId: nextId });
            }
          }
        }
      } catch (err) {
        // Continue processing other games
      }
    }

    // Auto-settle completed 16-player cash tournaments
    try {
      const completed = await db.query(
        `SELECT id FROM tournament
          WHERE status = 'COMPLETED' AND tier = 'CASH' AND capacity = 16
          ORDER BY completed_at ASC LIMIT 5`
      );
      for (const row of completed.rows) {
        const sRes = await tournamentService.settlePrizes(row.id);
        if (sRes.ok) settled.push(row.id);
      }
    } catch {
      // ignore
    }

    return { started, spawned, settled };
  }

  return { tick, spawnTournament, games: AUTOMATED_TOURNAMENT_GAMES };
}
