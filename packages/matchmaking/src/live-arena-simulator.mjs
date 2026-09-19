/**
 * Live Arena Match Simulator.
 *
 * Ensures the Live Arena (/watch and home page) always features 8-10 active,
 * ongoing matches between official personas across all 11 games.
 *
 * Ephemeral by design:
 * - Ongoing matches update their move counts in memory/events.
 * - When a match finishes, it is marked COMPLETED and cleanly leaves the live
 *   spectator feed. No heavy logs or videos are saved, keeping server load minimal.
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";
import { resolveTimeControl } from "../../duel-engine/src/time-profiles.mjs";

const SIM_GAMES = [
  "chess",
  "billiards",
  "dominoes",
  "backgammon",
  "checkers",
  "connect-four",
  "xo",
  "speed-math",
  "reversi",
  "gomoku",
  "seega",
];

const SIM_STAKES = [
  { tier: "CASH", stakeMinor: "5000000", asset: "USDT" },   // $5
  { tier: "CASH", stakeMinor: "10000000", asset: "USDT" },  // $10
  { tier: "CASH", stakeMinor: "25000000", asset: "USDT" },  // $25
  { tier: "CASH", stakeMinor: "50000000", asset: "USDT" },  // $50
  { tier: "FREE", stakeMinor: "0", asset: null },
];

export function createLiveArenaSimulator(db, { targetMatches = 10, emit = () => {} } = {}) {
  return async function tick() {
    let simulatorEnabled = true;
    try {
      const cfgRes = await db.query(
        `SELECT value FROM bot_platform_config WHERE key = 'simulator'`
      );
      if (cfgRes.rows.length > 0 && cfgRes.rows[0].value?.enabled === false) {
        simulatorEnabled = false;
      }
    } catch {
      // fallback to enabled
    }

    if (!simulatorEnabled) return { spawnedCount: 0, completedCount: 0 };

    // 1. Complete long-running simulated duels (> 2 minutes)
    const completedRes = await db.query(
      `UPDATE duel
          SET status = 'COMPLETED'::duel_status,
              result = CASE WHEN random() > 0.5 THEN '1-0' ELSE '0-1' END,
              termination_reason = 'NORMAL',
              completed_at = now()
        WHERE id LIKE 'duel_live_%'
          AND status = 'LIVE'
          AND started_at <= now() - interval '2 minutes'
        RETURNING id`
    );
    const completedCount = completedRes.rowCount || 0;

    // 2. Count current live duels
    const countRes = await db.query(
      `SELECT count(*)::int AS count
         FROM duel
        WHERE status IN ('LIVE', 'READY')
          AND spectator_policy = 'OPEN'`
    );
    const currentLive = countRes.rows[0]?.count || 0;

    let spawnedCount = 0;

    // 3. Spawn simulated matches up to targetMatches
    if (currentLive < targetMatches) {
      const needed = Math.min(targetMatches - currentLive, 3);

      for (let i = 0; i < needed; i++) {
        // Pick 2 distinct personas
        const botsRes = await db.query(
          `SELECT id, handle
             FROM player
            WHERE is_ai IS TRUE OR id LIKE 'bot_%'
            ORDER BY random()
            LIMIT 2`
        );

        if (botsRes.rows.length < 2) break;
        const [botA, botB] = botsRes.rows;

        const gameId = SIM_GAMES[Math.floor(Math.random() * SIM_GAMES.length)];
        const stakeItem = SIM_STAKES[Math.floor(Math.random() * SIM_STAKES.length)];
        const spawn = DEFAULT_SPAWNERS[gameId] || (() => ({ initialState: {}, seed: null }));
        const { initialState, seed } = spawn();
        const timeControl = resolveTimeControl(gameId);
        const duelId = `duel_live_${randomUUID().slice(0, 8)}`;
        const pairingKey = `sim:live:${duelId}`;

        await db.query(
          `INSERT INTO duel
             (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
              tier, stake_minor, asset, initial_state, seed, time_control,
              status, is_vs_computer, spectator_policy, started_at)
           VALUES ($1, $2,
             (SELECT plugin_version FROM game WHERE id = $2),
             $3, $4, $5, $6::entry_tier, $7, $8, $9::jsonb, $10, $11::jsonb,
             'LIVE'::duel_status, FALSE, 'OPEN', now() - (random() * 30 || ' seconds')::interval)
           ON CONFLICT (id) DO NOTHING`,
          [
            duelId,
            gameId,
            pairingKey,
            botA.id,
            botB.id,
            stakeItem.tier,
            stakeItem.stakeMinor,
            stakeItem.asset,
            JSON.stringify(initialState),
            seed,
            JSON.stringify(timeControl),
          ]
        );

        // Add 1 to 3 simulated move events so spectators see realistic progression
        const initialMoves = Math.floor(Math.random() * 4) + 1;
        for (let m = 0; m < initialMoves; m++) {
          await db.query(
            `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms)
             VALUES ($1, $2, 'ACTION', '{"simulated": true}'::jsonb, $3)
             ON CONFLICT DO NOTHING`,
            [duelId, m + 1, Date.now()]
          );
        }

        spawnedCount++;
      }
    }

    return { spawnedCount, completedCount };
  };
}
