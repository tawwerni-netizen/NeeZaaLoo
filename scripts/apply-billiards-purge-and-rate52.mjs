import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './load-env.mjs';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    console.log('Connected to Neon Postgres.');

    // 1. Run 0070_remove_billiards.sql
    console.log('Applying 0070_remove_billiards.sql...');
    const migration0070 = fs.readFileSync(path.join(__dirname, '../db/migrations/0070_remove_billiards.sql'), 'utf8');
    await client.query(migration0070);
    console.log('0070_remove_billiards.sql applied successfully.');

    // 2. Insert EGP valuation snapshot for 52 EGP (usd_rate_x1e8 = 1923077)
    console.log('Recording valuation snapshot for 52 EGP...');
    await client.query(`
      SELECT record_valuation_snapshot(
        'EGP',
        1923077,
        'MANUAL',
        now(),
        10000,
        'admin_system',
        'Updated EGP exchange rate (1 USD = 52 EGP)'
      );
    `);
    console.log('Valuation snapshot recorded.');

    // 3. Verify current valuation
    const currentRate = await client.query(`
      SELECT asset, usd_rate_x1e8, source, status, observed_at, reason
      FROM valuation_current('EGP');
    `);
    console.log('\nCurrent EGP valuation:');
    console.table(currentRate.rows);
    const egpPerUsd = 1e8 / Number(currentRate.rows[0].usd_rate_x1e8);
    console.log(`Calculated rate: 1 USD = ${egpPerUsd.toFixed(2)} EGP`);

    // 4. Verify games in database
    const games = await client.query('SELECT id, display_name, is_live, cash_enabled, auto_tournaments_enabled FROM game ORDER BY id');
    console.log('\n--- Active Games in database (Total:', games.rows.length, ') ---');
    console.table(games.rows);

    // 5. Verify no billiards rows exist in any table
    const tablesToCheck = ['rating', 'tournament', 'duel', 'duel_challenge', 'matchmaking_ticket', 'economy_rule'];
    for (const tbl of tablesToCheck) {
      const res = await client.query(`SELECT count(*)::int as c FROM ${tbl} WHERE game_id = 'billiards'`);
      console.log(`Billiards in ${tbl}:`, res.rows[0].c);
    }
    const inGame = await client.query("SELECT count(*)::int as c FROM game WHERE id = 'billiards'");
    console.log('Billiards in game table:', inGame.rows[0].c);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error applying changes to Neon:', err);
  process.exit(1);
});
