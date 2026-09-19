import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const id = 'Guest_f4fca95e';
try {
  const r2 = await pool.query("SELECT * FROM rating WHERE player_id = $1", [id]);
  console.log('Rating rows:', r2.rows.length);
  const r3 = await pool.query("SELECT * FROM exp_event WHERE player_id = $1", [id]);
  console.log('Exp rows:', r3.rows.length);
  const r4 = await pool.query("SELECT * FROM player_achievement WHERE player_id = $1", [id]);
  console.log('Achiev rows:', r4.rows.length);
  
  // Try tournament stats
  const r5 = await pool.query(
    "SELECT count(*)::int AS played, count(*) FILTER (WHERE rank = 1)::int AS won FROM tournament_settlement WHERE player_id = $1",
    [id]
  );
  console.log('Tournaments:', r5.rows[0]);
} catch (e) {
  console.error("Error:", e);
}

pool.end();
