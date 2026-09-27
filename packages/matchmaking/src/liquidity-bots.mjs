/**
 * Liquidity Bots Engine (Matchmaking Simulator).
 * 
 * Monitors the matchmaking queue. If a human player waits more than N seconds,
 * this engine automatically injects an AI bot into the exact same pool to ensure
 * instantaneous matching (Zero-Friction experience).
 */
export function createLiquidityBotEngine(db, mm, options = {}) {
  const waitThresholdMs = options.waitThresholdMs || 15000;
  
  async function tick() {
    // 1. Find tickets that are ACTIVE, belong to human players, and are waiting > waitThresholdMs
    const waitingRes = await db.query(
      `SELECT t.* 
       FROM matchmaking_ticket t
       JOIN player p ON p.id = t.player_id
       WHERE t.status = 'ACTIVE'
         AND p.is_ai = FALSE
         AND t.enqueued_at < NOW() - INTERVAL '${waitThresholdMs / 1000} seconds'`
    );

    let injected = 0;
    for (const ticket of waitingRes.rows) {
      // 2. Find an available AI bot with a rating as close as possible to the waiting player
      const botRes = await db.query(
        `SELECT p.id, COALESCE(r.rating_x100, 150000) as rating_x100
         FROM player p
         LEFT JOIN rating r ON r.player_id = p.id AND r.game_id = $1
         WHERE p.is_ai = TRUE
           -- Ensure this bot isn't already sitting in the active queue
           AND NOT EXISTS (
             SELECT 1 FROM matchmaking_ticket mt 
             WHERE mt.player_id = p.id AND mt.status = 'ACTIVE'
           )
         ORDER BY ABS(COALESCE(r.rating_x100, 150000) - $2) ASC
         LIMIT 1`,
        [ticket.game_id, ticket.rating_x100]
      );
      
      if (botRes.rows.length > 0) {
        const bot = botRes.rows[0];
        
        // 3. Enqueue the bot in the EXACT same pool so mm_pair() will seat them together
        try {
          await mm.enqueue({
            playerId: bot.id,
            gameId: ticket.game_id,
            mode: ticket.mode,
            tier: ticket.tier,
            stakeMinor: BigInt(ticket.stake_minor),
            asset: ticket.asset,
            ratingX100: bot.rating_x100,
            timeControl: ticket.time_control,
            ttlSeconds: 60
          });
          injected++;
        } catch (err) {
          console.error(`[LiquidityBots] Failed to inject bot ${bot.id} for pool:`, err);
        }
      }
    }
    
    return { injected };
  }
  
  return { tick };
}
