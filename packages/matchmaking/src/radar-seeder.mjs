/**
 * 1v1 Live Challenges Radar Seeder & Auto-Matcher.
 *
 * Keeps the 1v1 Live Challenges Radar active 24/7:
 * 1. Ensures 22-33 live open challenges are continuously available in lobby_open_challenge
 *    across ALL 11 games (especially Ludo, Seega, etc.) and stakes ($2, $5, $10, $25, $50, Free)
 *    from the realistic human personas.
 * 2. When a human player broadcasts an open challenge, if no other human accepts it within
 *    `humanWaitThresholdSeconds` (default: 4-8s), a matching persona accepts it and launches the duel.
 * 3. Sweeps expired challenges cleanly so the radar remains fresh.
 */
import { randomUUID } from "node:crypto";
import { STANDING_BY_BOT_IDS } from "./standing-by.mjs";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";
import { resolveTimeControl } from "../../duel-engine/src/time-profiles.mjs";

const RADAR_GAMES = [
  "chess",
  "dominoes",
  "backgammon",
  "checkers",
  "connect-four",
  "xo",
  "speed-math",
  "reversi",
  "gomoku",
  "seega",
  "ludo",
];

const STAKE_LADDER = [
  { tier: "FREE", stakeMinor: "0" },
  { tier: "CASH", stakeMinor: "2000000" },   // $2
  { tier: "CASH", stakeMinor: "5000000" },   // $5 (Popular)
  { tier: "CASH", stakeMinor: "5000000" },   // $5 (Popular)
  { tier: "CASH", stakeMinor: "10000000" },  // $10
  { tier: "CASH", stakeMinor: "25000000" },  // $25
  { tier: "CASH", stakeMinor: "50000000" },  // $50
];

export function createRadarSeederWorker(db, { minChallenges = 22, maxChallenges = 33, emit = () => {} } = {}) {
  return async function tick() {
    let standingByEnabled = true;
    // Fast response: between 4 and 8 seconds
    let waitSeconds = 4 + Math.floor(Math.random() * 5);
    try {
      const cfgRes = await db.query(
        `SELECT value FROM bot_platform_config WHERE key = 'standing_by'`
      );
      if (cfgRes.rows.length > 0) {
        const val = cfgRes.rows[0].value;
        if (val.enabled === false) standingByEnabled = false;
        if (val.wait_seconds != null) waitSeconds = Math.min(8, Math.max(4, Number(val.wait_seconds)));
      }
    } catch {
      // fallback to defaults
    }

    // 1. Auto-expire old open challenges
    await db.query(
      `UPDATE lobby_open_challenge
          SET status = 'EXPIRED', responded_at = now()
        WHERE status = 'OPEN' AND expires_at <= now()`
    );

    let createdCount = 0;
    let acceptedCount = 0;

    if (standingByEnabled) {
      // 2. Check active challenges grouped by game to guarantee coverage for EVERY game (including Ludo)
      const gamesWithOpen = await db.query(
        `SELECT game_id, count(*)::int AS count
           FROM lobby_open_challenge
          WHERE status = 'OPEN' AND expires_at > now() + interval '30 seconds'
          GROUP BY game_id`
      );
      const activeByGame = new Map(gamesWithOpen.rows.map(r => [r.game_id, r.count]));

      // Identify games with 0 or only 1 challenge
      const gamesToSeed = [];
      for (const gid of RADAR_GAMES) {
        const c = activeByGame.get(gid) || 0;
        if (c < 2) {
          for (let i = 0; i < (2 - c); i++) {
            gamesToSeed.push(gid);
          }
        }
      }

      // Check overall count
      const countRes = await db.query(
        `SELECT count(*)::int AS count
           FROM lobby_open_challenge
          WHERE status = 'OPEN' AND expires_at > now() + interval '30 seconds'`
      );
      const currentOpen = countRes.rows[0]?.count || 0;

      if (currentOpen < minChallenges && gamesToSeed.length < (minChallenges - currentOpen)) {
        const extra = Math.min(maxChallenges - (currentOpen + gamesToSeed.length), 6);
        for (let i = 0; i < extra; i++) {
          gamesToSeed.push(RADAR_GAMES[Math.floor(Math.random() * RADAR_GAMES.length)]);
        }
      }

      // 3. Seed new challenges
      if (gamesToSeed.length > 0) {
        // Pick bots that don't currently have an active open challenge and have USDT funds
        const botRes = await db.query(
          `SELECT p.id, p.handle
             FROM player p
             LEFT JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = 'USDT'
             LEFT JOIN ledger_balance lb ON lb.account_id = la.id
            WHERE (p.is_ai IS TRUE OR p.id LIKE 'bot_%' OR p.id LIKE 'top_p_%')
              AND p.id NOT LIKE 'ai-%'
              AND p.handle NOT LIKE 'ai_%'
              AND p.handle NOT LIKE 'bot_%'
              AND p.handle NOT LIKE 'test_%'
              AND p.disabled_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM lobby_open_challenge c
                 WHERE c.creator_id = p.id AND c.status = 'OPEN' AND c.expires_at > now()
              )
              AND ledger_natural_balance(la.normal_side, COALESCE(lb.balance, 0)) >= 50000000
            ORDER BY random()
            LIMIT $1`,
          [gamesToSeed.length]
        );

        for (let i = 0; i < botRes.rows.length; i++) {
          const bot = botRes.rows[i];
          const gameId = gamesToSeed[i] || RADAR_GAMES[Math.floor(Math.random() * RADAR_GAMES.length)];
          const stakeItem = STAKE_LADDER[Math.floor(Math.random() * STAKE_LADDER.length)];
          const challengeId = `open_bot_${randomUUID().slice(0, 8)}`;
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15m stable TTL

          await db.query(
            `INSERT INTO lobby_open_challenge
               (id, creator_id, game_id, tier, stake_minor, asset, time_control, status, expires_at)
             VALUES ($1, $2, $3, $4::entry_tier, $5, $6, 'BLITZ', 'OPEN', $7)
             ON CONFLICT (id) DO NOTHING`,
            [
              challengeId,
              bot.id,
              gameId,
              stakeItem.tier,
              stakeItem.stakeMinor,
              stakeItem.tier === "CASH" ? "USDT" : null,
              expiresAt.toISOString(),
            ]
          );
          createdCount++;
        }
      }

      // 4. Auto-accept pending human challenges waiting > waitSeconds
      const humanChallengesRes = await db.query(
        `SELECT c.id, c.creator_id, c.game_id, c.tier, c.stake_minor, c.asset
           FROM lobby_open_challenge c
           JOIN player p ON p.id = c.creator_id
          WHERE c.status = 'OPEN'
            AND c.expires_at > now()
            AND (p.is_ai IS FALSE OR p.is_ai IS NULL)
            AND c.created_at <= now() - ($1 || ' seconds')::interval
          ORDER BY c.created_at ASC
          LIMIT 2`,
        [waitSeconds]
      );

      for (const ch of humanChallengesRes.rows) {
        const stakeMinor = BigInt(ch.stake_minor || "0");
        const asset = ch.tier === "CASH" ? (ch.asset || "USDT") : null;

        // Pick an eligible bot with balance from all persona bots
        const botRes = await db.query(
          `SELECT b.id
             FROM player b
             LEFT JOIN ledger_account la ON la.key = 'user:' || b.id || ':available' AND la.asset = COALESCE($1, 'USDT')
             LEFT JOIN ledger_balance lb ON lb.account_id = la.id
            WHERE (b.is_ai IS TRUE OR b.id LIKE 'bot_%' OR b.id LIKE 'top_p_%')
              AND b.id NOT LIKE 'ai-%'
              AND b.disabled_at IS NULL
              AND b.id <> $2
              AND ($3 = 0 OR ledger_natural_balance(la.normal_side, COALESCE(lb.balance, 0)) >= $3)
            ORDER BY random()
            LIMIT 1`,
          [asset, ch.creator_id, stakeMinor.toString()]
        );

        if (botRes.rows.length === 0) continue;
        const botId = botRes.rows[0].id;

        // Accept in transaction
        await db.transaction(async (tx) => {
          const spawn = DEFAULT_SPAWNERS[ch.game_id] || (() => ({ initialState: {}, seed: null }));
          const { initialState, seed } = spawn();
          const duelId = `ch_${randomUUID()}`;
          const timeControl = resolveTimeControl(ch.game_id);

          await tx.query(
            `INSERT INTO duel
               (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                tier, stake_minor, asset, initial_state, seed, time_control, status, is_vs_computer)
             VALUES ($1, $2,
               (SELECT plugin_version FROM game WHERE id = $2),
               $3, $4, $5, $6::entry_tier, $7, $8, $9::jsonb, $10, $11::jsonb, $12::duel_status, FALSE)`,
            [
              duelId, ch.game_id, `challenge:open:${ch.id}`, ch.creator_id, botId,
              ch.tier, ch.stake_minor, asset,
              JSON.stringify(initialState), seed, JSON.stringify(timeControl),
              ch.tier === "CASH" ? "RESERVED" : "READY"
            ]
          );

          await tx.query(
            `UPDATE lobby_open_challenge
                SET status = 'ACCEPTED', accepted_by = $2, duel_id = $3, responded_at = now()
              WHERE id = $1 AND status = 'OPEN'`,
            [ch.id, botId, duelId]
          );

          acceptedCount++;
          emit("radar.challenge_accepted", {
            challengeId: ch.id,
            duelId,
            humanPlayerId: ch.creator_id,
            botId,
            gameId: ch.game_id,
          });
        });
      }
    }

    return { createdCount, acceptedCount };
  };
}
