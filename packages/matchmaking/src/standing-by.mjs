/**
 * Standing-By Bot Matcher.
 *
 * Ensures zero-wait-time for human players entering matchmaking.
 * When a human player waits more than `timeoutSeconds` (default: 5s) without
 * finding another human player, this service matches them with one of the 200
 * Standing-By bots (funded with 10,000 USDT each) for FREE or CASH games.
 */
import { DEFAULT_SPAWNERS } from "./spawn.mjs";

// Top 200 Standing-By bot IDs (100 Arabic + 50 English + 25 Spanish + 25 French)
export const STANDING_BY_BOT_IDS = [
  ...Array.from({ length: 100 }, (_, i) => `bot_ar_${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 50 }, (_, i) => `bot_en_${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 25 }, (_, i) => `bot_es_${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 25 }, (_, i) => `bot_fr_${String(i + 1).padStart(3, "0")}`),
];

export function createStandingByWorker(db, mm, { timeoutSeconds = 5, emit = () => {} } = {}) {
  return async function tick() {
    let effectiveTimeout = timeoutSeconds;
    try {
      const cfgRes = await db.query(
        `SELECT value FROM bot_platform_config WHERE key = 'standing_by'`
      );
      if (cfgRes.rows.length > 0) {
        const val = cfgRes.rows[0].value;
        if (val.enabled === false) return { pairedCount: 0, disabled: true };
        if (val.wait_seconds != null) effectiveTimeout = Number(val.wait_seconds);
      }
    } catch {
      // fallback to constructor parameter
    }

    // 1. Find active human tickets waiting >= effectiveTimeout
    const ticketsRes = await db.query(
      `SELECT t.id, t.player_id, t.game_id, t.mode, t.time_control, t.tier,
              t.stake_minor, t.rating_x100, t.asset
         FROM matchmaking_ticket t
         JOIN player p ON p.id = t.player_id
        WHERE t.status = 'ACTIVE'
          AND t.expires_at > now()
          AND (p.is_ai IS FALSE OR p.is_ai IS NULL)
          AND t.enqueued_at <= now() - ($1 || ' seconds')::interval
        ORDER BY t.enqueued_at ASC
        LIMIT 5`,
      [effectiveTimeout]
    );

    if (ticketsRes.rows.length === 0) return { pairedCount: 0 };

    let pairedCount = 0;

    for (const t of ticketsRes.rows) {
      const stakeMinor = BigInt(t.stake_minor || 0);
      const asset = t.tier === "CASH" ? (t.asset || "USDT") : null;

      // 2. Find the best available standing-by bot with sufficient balance (if CASH)
      const botRes = await db.query(
        `SELECT b.id, COALESCE(r.rating_x100, 150000) AS rating_x100
           FROM player b
           LEFT JOIN rating r ON r.player_id = b.id AND r.game_id = $1
           LEFT JOIN matchmaking_ticket at ON at.player_id = b.id AND at.status = 'ACTIVE'
           LEFT JOIN ledger_account la ON la.key = 'user:' || b.id || ':available' AND la.asset = COALESCE($3, 'USDT')
           LEFT JOIN ledger_balance lb ON lb.account_id = la.id
          WHERE b.id = ANY($2::text[])
            AND at.id IS NULL
            AND ($4 = 0 OR COALESCE(lb.balance, 0) >= $4)
          ORDER BY ABS(COALESCE(r.rating_x100, 150000) - $5) ASC
          LIMIT 1`,
        [t.game_id, STANDING_BY_BOT_IDS, asset, stakeMinor.toString(), t.rating_x100]
      );

      if (botRes.rows.length === 0) continue;
      const bot = botRes.rows[0];

      // 3. Enqueue bot ticket
      const botEnq = await mm.enqueue({
        playerId: bot.id,
        gameId: t.game_id,
        mode: t.mode,
        tier: t.tier,
        stakeMinor,
        asset: t.asset,
        ratingX100: Number(bot.rating_x100),
        timeControl: t.time_control,
        ttlSeconds: 60,
      });

      if (!botEnq.ok) continue;

      // 4. Pair immediately
      const spawn = DEFAULT_SPAWNERS[t.game_id];
      const spawned = spawn ? spawn() : { initialState: {}, seed: null };

      const pairRes = await mm.pair({
        gameId: t.game_id,
        mode: t.mode,
        tier: t.tier,
        stakeMinor,
        asset: t.asset,
        initialState: spawned.initialState,
        timeControl: t.time_control,
        seed: spawned.seed,
      });

      if (pairRes.paired) {
        pairedCount++;
        emit("matchmaking.standing_by_paired", {
          duelId: pairRes.duelId,
          humanPlayerId: t.player_id,
          botId: bot.id,
          gameId: t.game_id,
          tier: t.tier,
          stakeMinor: stakeMinor.toString(),
        });
      }
    }

    return { pairedCount };
  };
}
