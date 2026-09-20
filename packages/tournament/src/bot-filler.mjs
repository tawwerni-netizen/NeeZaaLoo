/**
 * Tournament Bot Filler Service.
 *
 * Gradually populates open 16-player tournaments with official AI bots.
 * Features:
 *   - Realistic pacing: Registers bots at deliberate intervals (e.g. every 30s)
 *     so the tournament registration feels organic and vibrant.
 *   - Human-First Reserved Slots: Leaves 2-3 slots open (up to 14/16 bots) so
 *     any human visiting the tournament lobby always finds open seats to join.
 *   - Max-Wait Catchup: If no human joins after a configurable timeout (e.g. 10m),
 *     fills the remaining spots with bots so the tournament starts and doesn't stall.
 *   - Configurable: Reads live settings from `bot_platform_config` if present.
 */

export function createTournamentBotFiller(db, tournamentService, options = {}) {
  const defaultFillIntervalMs = 10000;
  const defaultReservedSeats = 2;
  const defaultMaxWaitMs = 5 * 60 * 1000;

  async function loadConfig() {
    let dbCfg = {};
    try {
      const res = await db.query(
        `SELECT value FROM bot_platform_config WHERE key = 'tournaments'`
      );
      if (res.rows.length > 0) {
        dbCfg = res.rows[0].value || {};
      }
    } catch {
      // Fallback if table doesn't exist yet
    }
    return {
      enabled: options.enabled !== undefined ? options.enabled : (dbCfg.enabled !== false),
      reservedSeats: Number(options.reservedSeats ?? dbCfg.reserved_seats ?? defaultReservedSeats),
      fillIntervalMs: Number(options.fillIntervalMs ?? (dbCfg.fill_interval_seconds != null ? Number(dbCfg.fill_interval_seconds) * 1000 : defaultFillIntervalMs)),
      maxWaitMs: Number(options.maxWaitMs ?? (dbCfg.max_wait_minutes != null ? Number(dbCfg.max_wait_minutes) * 60 * 1000 : defaultMaxWaitMs)),
    };
  }

  async function tick() {
    const config = await loadConfig();
    if (!config.enabled) return { filled: 0, reason: "DISABLED" };

    const now = Date.now();
    let registeredCount = 0;
    const startedTournaments = [];

    try {
      const openTournaments = await db.query(
        `SELECT t.id, t.game_id, t.tier, t.capacity, t.created_at, t.entry_fee_minor, t.asset,
                (SELECT count(*)::int FROM tournament_registration tr
                  WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS registered_count,
                (SELECT max(tr.registered_at) FROM tournament_registration tr
                  WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS last_registered_at
           FROM tournament t
          WHERE t.status = 'REGISTRATION'
          ORDER BY registered_count DESC, t.created_at ASC
          LIMIT 200`
      );

      for (const t of openTournaments.rows) {
        const capacity = t.capacity || 16;
        let currentCount = t.registered_count || 0;

        // If tournament already has enough players, ensure it starts
        if (currentCount >= capacity) {
          const startRes = await tournamentService.start(t.id);
          if (startRes.ok) startedTournaments.push(t.id);
          continue;
        }

        // Pacing check: wait at least fillIntervalMs since last registration
        if (t.last_registered_at && config.fillIntervalMs > 0) {
          const elapsedSinceLast = now - new Date(t.last_registered_at).getTime();
          if (elapsedSinceLast < config.fillIntervalMs) {
            continue;
          }
        }

        // Check reserved seats for human players
        const maxBotSeats = capacity - config.reservedSeats;
        const tournamentAgeMs = now - new Date(t.created_at).getTime();

        if (currentCount >= maxBotSeats && tournamentAgeMs < config.maxWaitMs) {
          // Keep the remaining seats open for human participants
          continue;
        }

        // Determine how many bots to add in this tick for this tournament
        const targetBotSeats = tournamentAgeMs >= config.maxWaitMs ? capacity : maxBotSeats;
        const remainingBotsNeeded = targetBotSeats - currentCount;
        if (remainingBotsNeeded <= 0) continue;

        const batchLimit = options.botsPerTick ?? 1;

        // Select random eligible bot personas with rating for this game
        const isCash = t.tier === "CASH";
        const fee = BigInt(t.entry_fee_minor || "0");
        const candidateBots = await db.query(
          `SELECT p.id, COALESCE(r.rating_x100, 180000) AS rating_x100
             FROM player p
             LEFT JOIN rating r ON r.player_id = p.id AND r.game_id = $1
             ${isCash ? `
             JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = COALESCE($3, 'USDT')
             JOIN ledger_balance lb ON lb.account_id = la.id AND ledger_natural_balance(la.normal_side, lb.balance) >= $4
             ` : ''}
            WHERE p.is_ai = TRUE
              AND (p.id LIKE 'bot_%' OR p.id LIKE 'top_p_%' OR p.id LIKE 'standing_by_%')
              AND NOT EXISTS (
                SELECT 1 FROM tournament_registration tr
                 WHERE tr.tournament_id = $2 AND tr.player_id = p.id
              )
            ORDER BY random()
            LIMIT ${isCash ? '$5' : '$3'}`,
          isCash ? [t.game_id, t.id, t.asset || 'USDT', fee.toString(), batchLimit] : [t.game_id, t.id, batchLimit]
        );

        for (const bot of candidateBots.rows) {
          const regRes = await tournamentService.register({
            tournamentId: t.id,
            playerId: bot.id,
            ratingX100: Number(bot.rating_x100),
          });

          if (regRes.ok) {
            registeredCount++;
            currentCount++;
            if (currentCount >= capacity) {
              const startRes = await tournamentService.start(t.id);
              if (startRes.ok) startedTournaments.push(t.id);
              break;
            }
          }
        }
      }
    } catch (err) {
      // Return partial progress on error
      return { filled: registeredCount, started: startedTournaments, error: err.message };
    }

    return { filled: registeredCount, started: startedTournaments };
  }

  return { tick, loadConfig };
}
