import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createPgAdapter } from '../packages/ledger/src/pg-adapter.mjs';
import { createTournamentService } from '../packages/tournament/src/tournament.mjs';
import { DEFAULT_SPAWNERS } from '../packages/matchmaking/src/spawn.mjs';
import { resolveTimeControl } from '../packages/duel-engine/src/time-profiles.mjs';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify',
  ssl: { rejectUnauthorized: false }
});

const db = createPgAdapter(pool);
const tournamentService = createTournamentService(db);

// Desired realistic, diverse targets for each game & tier (all different, between 4 and 14)
const TARGET_COUNTS = {
  chess: { FREE: 14, CASH: 11 },
  dominoes: { FREE: 9, CASH: 13 },
  backgammon: { FREE: 6, CASH: 10 },
  'speed-math': { FREE: 13, CASH: 7 },
  'connect-four': { FREE: 11, CASH: 5 },
  checkers: { FREE: 13, CASH: 8 },
  xo: { FREE: 14, CASH: 12 },
  reversi: { FREE: 5, CASH: 9 },
  gomoku: { FREE: 8, CASH: 6 },
  seega: { FREE: 7, CASH: 10 },
};

async function randomizeTournaments() {
  console.log('=== STEP 1: Verifying & Adjusting Tournament Player Counts ===');

  const tournaments = await pool.query(`
    SELECT t.id, t.game_id, t.tier, t.entry_fee_minor,
           (SELECT count(*)::int FROM tournament_registration tr
             WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS current_count
      FROM tournament t
     WHERE t.status = 'REGISTRATION'
     ORDER BY t.game_id, t.tier
  `);

  for (const t of tournaments.rows) {
    const target = TARGET_COUNTS[t.game_id]?.[t.tier] ?? 10;
    const current = t.current_count;

    if (current > target) {
      const toRemove = current - target;
      const regsToRemove = await pool.query(`
        SELECT player_id FROM tournament_registration
         WHERE tournament_id = $1 AND status = 'REGISTERED'
         ORDER BY registered_at DESC
         LIMIT $2
      `, [t.id, toRemove]);

      for (const reg of regsToRemove.rows) {
        await tournamentService.withdraw({
          tournamentId: t.id,
          playerId: reg.player_id
        });
      }
      console.log(`  -> ${t.game_id} [${t.tier}]: Withdrew ${regsToRemove.rows.length} bots (Now: ${target}/16)`);
    } else if (current < target) {
      const toAdd = target - current;
      const eligibleBots = await pool.query(`
        SELECT p.id, COALESCE(r.rating_x100, 185000) AS rating_x100
          FROM player p
          LEFT JOIN rating r ON r.player_id = p.id AND r.game_id = $1
          ${t.tier === 'CASH' ? `
          JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = 'USDT'
          JOIN ledger_balance lb ON lb.account_id = la.id AND ledger_natural_balance(la.normal_side, lb.balance) >= $3
          ` : ''}
         WHERE p.is_ai = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM tournament_registration tr
              WHERE tr.tournament_id = $2 AND tr.player_id = p.id
           )
         ORDER BY random()
         LIMIT ${t.tier === 'CASH' ? '$4' : '$3'}
      `, t.tier === 'CASH' ? [t.game_id, t.id, t.entry_fee_minor, toAdd] : [t.game_id, t.id, toAdd]);

      for (const bot of eligibleBots.rows) {
        await tournamentService.register({
          tournamentId: t.id,
          playerId: bot.id,
          ratingX100: Number(bot.rating_x100)
        });
      }
      console.log(`  -> ${t.game_id} [${t.tier}]: Registered ${eligibleBots.rows.length} bots (Now: ${target}/16)`);
    } else {
      console.log(`  -> ${t.game_id} [${t.tier}]: At target ${target}/16.`);
    }
  }
}

const LIVE_GAMES = [
  { gameId: 'chess', tier: 'CASH', stakeMinor: '50000000', moves: 24 },     // $50 USDT
  { gameId: 'dominoes', tier: 'CASH', stakeMinor: '25000000', moves: 14 },  // $25 USDT
  { gameId: 'backgammon', tier: 'CASH', stakeMinor: '10000000', moves: 18 },// $10 USDT
  { gameId: 'xo', tier: 'FREE', stakeMinor: '0', moves: 6 },
  { gameId: 'connect-four', tier: 'CASH', stakeMinor: '10000000', moves: 12 },
  { gameId: 'checkers', tier: 'CASH', stakeMinor: '25000000', moves: 16 },
  { gameId: 'speed-math', tier: 'CASH', stakeMinor: '5000000', moves: 8 },  // $5 USDT
  { gameId: 'reversi', tier: 'CASH', stakeMinor: '10000000', moves: 20 },
  { gameId: 'gomoku', tier: 'FREE', stakeMinor: '0', moves: 15 },
  { gameId: 'seega', tier: 'CASH', stakeMinor: '10000000', moves: 11 },
];

async function seedLiveArena() {
  console.log('=== STEP 2: Seeding Active Live Matches in Live Arena ===');

  // 1. Mark any old stale simulated duels as completed
  await pool.query(`
    UPDATE duel
       SET status = 'COMPLETED',
           result = '1-0',
           termination_reason = 'NORMAL',
           completed_at = now()
     WHERE id LIKE 'duel_live_%' AND status = 'LIVE'
  `);

  // 2. Spawn fresh active live matches for all 10 games
  for (const item of LIVE_GAMES) {
    const gameId = item.gameId;

    // Pick 2 top bots with human-like handles
    const bots = await pool.query(`
      SELECT p.id, p.handle
        FROM player p
       WHERE p.is_ai = TRUE
         AND p.handle NOT LIKE 'ai_%'
         AND p.handle NOT LIKE 'bot_%'
         AND p.handle NOT LIKE 'test_%'
         AND p.handle NOT LIKE 'trimmed_%'
       ORDER BY random()
       LIMIT 2
    `);

    if (bots.rows.length < 2) continue;
    const [botA, botB] = bots.rows;

    const spawn = DEFAULT_SPAWNERS[gameId] || (() => ({ initialState: {}, seed: null }));
    const { initialState, seed } = spawn();
    const timeControl = resolveTimeControl(gameId);
    const duelId = `duel_live_${randomUUID().slice(0, 8)}`;
    const pairingKey = `sim:live:${duelId}`;
    const startedAgoSeconds = Math.floor(30 + Math.random() * 120); // started 30s - 150s ago

    await pool.query(`
      INSERT INTO duel
        (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
         tier, stake_minor, asset, initial_state, seed, time_control,
         status, is_vs_computer, spectator_policy, started_at)
      VALUES
        ($1, $2,
         (SELECT plugin_version FROM game WHERE id = $2),
         $3, $4, $5, $6::entry_tier, $7, $8, $9::jsonb, $10, $11::jsonb,
         'LIVE'::duel_status, FALSE, 'OPEN', now() - ($12 || ' seconds')::interval)
    `, [
      duelId,
      gameId,
      pairingKey,
      botA.id,
      botB.id,
      item.tier,
      item.stakeMinor,
      item.tier === 'CASH' ? 'USDT' : null,
      JSON.stringify(initialState),
      seed,
      JSON.stringify(timeControl),
      startedAgoSeconds
    ]);

    // Insert move events into duel_event
    for (let m = 1; m <= item.moves; m++) {
      const actorId = m % 2 === 1 ? botA.id : botB.id;
      const serverTimeMs = Date.now() - (startedAgoSeconds - Math.floor((m / item.moves) * (startedAgoSeconds - 5))) * 1000;
      await pool.query(`
        INSERT INTO duel_event
          (duel_id, seq, type, payload, server_time_ms, created_at)
        VALUES
          ($1, $2, 'move', $3::jsonb, $4, to_timestamp($5 / 1000.0))
      `, [
        duelId,
        m,
        JSON.stringify({ moveNumber: m, actorId }),
        serverTimeMs,
        serverTimeMs
      ]);
    }

    console.log(`Spawned LIVE match: ${gameId} | ${botA.handle} vs ${botB.handle} | ${item.tier} ($${Number(item.stakeMinor)/1_000_000} USDT) | ${item.moves} moves | ID: ${duelId}`);
  }
}

async function verify() {
  console.log('=== STEP 3: Verifying Results ===');

  const tourSummary = await pool.query(`
    SELECT t.game_id, t.tier,
           (SELECT count(*)::int FROM tournament_registration tr WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') as registered_count
      FROM tournament t
     WHERE t.status = 'REGISTRATION'
     ORDER BY t.game_id, t.tier
  `);
  console.log('\n--- TOURNAMENTS (Organic Player Counts) ---');
  console.table(tourSummary.rows);

  const liveDuels = await pool.query(`
    SELECT d.id, d.game_id, d.tier, d.stake_minor,
           pa.handle as player_1, pb.handle as player_2,
           (SELECT count(*)::int FROM duel_event de WHERE de.duel_id = d.id) as move_count,
           d.started_at
      FROM duel d
      JOIN player pa ON pa.id = d.seat_0
      LEFT JOIN player pb ON pb.id = d.seat_1
     WHERE d.status = 'LIVE'
     ORDER BY d.started_at DESC
  `);
  console.log('\n--- LIVE ARENA MATCHES (/watch) ---');
  console.table(liveDuels.rows);
}

async function main() {
  await randomizeTournaments();
  await seedLiveArena();
  await verify();
  await pool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
