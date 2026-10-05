import pg from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

async function check() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const games = await pool.query('SELECT id, is_live FROM game ORDER BY id');
    console.log('--- Games in database ---');
    console.table(games.rows);

    const ratings = await pool.query('SELECT game_id, count(player_id)::int as players FROM rating GROUP BY game_id ORDER BY game_id');
    console.log('\n--- Ratings by game ---');
    console.table(ratings.rows);

    const billiardsCheck = await pool.query("SELECT count(id)::int as c FROM game WHERE id = 'billiards'");
    console.log('\nBilliards in game table:', billiardsCheck.rows[0].c);

    const billiardsRatings = await pool.query("SELECT count(player_id)::int as c FROM rating WHERE game_id = 'billiards'");
    console.log('Billiards in rating table:', billiardsRatings.rows[0].c);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);
