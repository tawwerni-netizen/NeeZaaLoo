/**
 * Automated Tournament Engine.
 *
 * Keeps ongoing 16-player single-elimination cash tournaments continuously running
 * across 8 stake tiers ($10, $20, $50, $100, $200, $500, $1000, $2000 USDT)
 * for all live, cash-enabled games where auto_tournaments_enabled is active.
 *
 * Economics:
 *   - Capacity: 16 players
 *   - Format: Single Elimination
 *   - Platform Fee: 12% rake
 *   - Winner Prize: 88% of total pot
 *
 * Lifecycle:
 *   - Ensures an open tournament in status 'REGISTRATION' is ALWAYS available for each tier.
 *   - As soon as the 16th player registers, starts the tournament (moves to 'LIVE'),
 *     sends start notifications (mobile / browser / email with 1-min countdown),
 *     and immediately spawns the next tournament for that game & tier.
 *   - Automatically settles prizes once the final is decided (moves to 'SETTLED').
 */

export const TOURNAMENT_TIERS = [
  { feeUsd: 0, minor: 0n, pot: 0, rakeUsd: "0.00", winnerUsd: "0.00", isFree: true },
  { feeUsd: 10, minor: 10_000_000n, pot: 160, rakeUsd: "19.20", winnerUsd: "140.80" },
  { feeUsd: 20, minor: 20_000_000n, pot: 320, rakeUsd: "38.40", winnerUsd: "281.60" },
  { feeUsd: 50, minor: 50_000_000n, pot: 800, rakeUsd: "96.00", winnerUsd: "704.00" },
  { feeUsd: 100, minor: 100_000_000n, pot: 1600, rakeUsd: "192.00", winnerUsd: "1,408.00" },
  { feeUsd: 200, minor: 200_000_000n, pot: 3200, rakeUsd: "384.00", winnerUsd: "2,816.00" },
  { feeUsd: 500, minor: 500_000_000n, pot: 8000, rakeUsd: "960.00", winnerUsd: "7,040.00" },
  { feeUsd: 1000, minor: 1000_000_000n, pot: 16000, rakeUsd: "1,920.00", winnerUsd: "14,080.00" },
  { feeUsd: 2000, minor: 2000_000_000n, pot: 32000, rakeUsd: "3,840.00", winnerUsd: "28,160.00" },
];

export const GAME_TIME_CONTROLS = {
  chess: { initialSeconds: 300, incrementSeconds: 3 },
  dominoes: { initialSeconds: 120, incrementSeconds: 2 },
  backgammon: { initialSeconds: 180, incrementSeconds: 2 },
  checkers: { initialSeconds: 120, incrementSeconds: 2 },
  "speed-math": { initialSeconds: 60, incrementSeconds: 0 },
  "connect-four": { initialSeconds: 120, incrementSeconds: 2 },
  xo: { initialSeconds: 60, incrementSeconds: 1 },
  seega: { initialSeconds: 180, incrementSeconds: 2 },
  reversi: { initialSeconds: 180, incrementSeconds: 2 },
  gomoku: { initialSeconds: 180, incrementSeconds: 2 },
};

export function createAutomatedTournamentEngine(db, tournamentService) {
  async function spawnTournament(gameId, gameName, tier) {
    const closesAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const timeControl = GAME_TIME_CONTROLS[gameId] || { initialSeconds: 180, incrementSeconds: 2 };
    const isFree = Boolean(tier.isFree || tier.feeUsd === 0);
    const title = isFree
      ? `${gameName} 16 Championship [Free Entry]`
      : `${gameName} 16 Championship [$${tier.feeUsd} USDT]`;
    const description = isFree
      ? `16-Player Single Elimination. Free entry to prove skill, climb ratings, and win ranking points.`
      : `16-Player Single Elimination. Winner takes 88% ($${tier.winnerUsd} USDT). 12% Platform Fee.`;

    const created = await tournamentService.create({
      gameId,
      format: "SINGLE_ELIMINATION",
      tier: isFree ? "FREE" : "CASH",
      entryFeeMinor: tier.minor,
      asset: "USDT",
      capacity: 16,
      minPlayers: 16,
      timeControl,
      registrationClosesAt: closesAt,
      scheduledStartsAt: closesAt,
      title,
      description,
      prizeStructure: isFree ? [] : [{ rank: 1, bps: 10000 }],
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

    // Query games where auto_tournaments_enabled = TRUE, is_live = TRUE, and cash_enabled = TRUE.
    // Deliberately fails CLOSED (no games, nothing spawned) on a genuine query
    // error, never falls back to a hardcoded list -- a silent fallback here
    // previously spawned real cash tournaments for five specific games no
    // matter what an admin had actually set their live/cash-enabled/
    // auto-tournament flags to.
    let activeGames;
    try {
      const gRes = await db.query(
        `SELECT id, display_name FROM game
          WHERE auto_tournaments_enabled = TRUE
            AND is_live = TRUE
            AND cash_enabled = TRUE
          ORDER BY id ASC`
      );
      activeGames = gRes.rows;
    } catch {
      activeGames = [];
    }

    for (const game of activeGames) {
      for (const tier of TOURNAMENT_TIERS) {
        try {
          const tierType = tier.isFree ? "FREE" : "CASH";
          const existing = await db.query(
            `SELECT t.id, t.status,
                    (SELECT count(*)::int FROM tournament_registration tr
                      WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS registered_count
               FROM tournament t
              WHERE t.game_id = $1 
                AND t.tier = $2 
                AND t.entry_fee_minor = $3 
                AND t.capacity = 16 
                AND t.status = 'REGISTRATION'
              ORDER BY t.created_at DESC LIMIT 1`,
            [game.id, tierType, String(tier.minor)]
          );

          if (existing.rows.length === 0) {
            // No open tournament exists for this game and tier -- spawn one!
            const newId = await spawnTournament(game.id, game.display_name || game.name || game.id, tier);
            if (newId) spawned.push({ gameId: game.id, tier: tier.feeUsd, tournamentId: newId });
          } else {
            const row = existing.rows[0];
            // If full (16/16), start it and immediately spawn the next tournament!
            if (row.registered_count >= 16) {
              const startRes = await tournamentService.start(row.id);
              if (startRes.ok) {
                started.push(row.id);
                const nextId = await spawnTournament(game.id, game.display_name || game.name || game.id, tier);
                if (nextId) spawned.push({ gameId: game.id, tier: tier.feeUsd, tournamentId: nextId });
              }
            }
          }
        } catch {
          // Continue to next tier/game
        }
      }
    }

    // Auto-settle completed 16-player cash tournaments
    try {
      const completed = await db.query(
        `SELECT id FROM tournament
          WHERE status = 'COMPLETED' AND tier = 'CASH' AND capacity = 16
          ORDER BY completed_at ASC LIMIT 10`
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

  return { tick, spawnTournament, tiers: TOURNAMENT_TIERS };
}

