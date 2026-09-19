import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const id = 'bot_hi_063';
const p = await pool.query("SELECT id, handle, bio, avatar_key, selected_badge_code, selected_frame_code, created_at FROM player WHERE id = $1", [id]);
console.log('Player row:', p.rows[0]);

const r1 = await pool.query("SELECT count(*)::int as wins FROM duel WHERE (seat_0 = $1 AND result = '1-0')", [id]);
console.log('Duel row:', r1.rows[0]);

const r2 = await pool.query("SELECT * FROM rating WHERE player_id = $1", [id]);
console.log('Rating rows:', r2.rows.length);

const r3 = await pool.query("SELECT * FROM exp_event WHERE player_id = $1", [id]);
console.log('Exp rows:', r3.rows.length);

const r4 = await pool.query("SELECT * FROM player_achievement WHERE player_id = $1", [id]);
console.log('Achiev rows:', r4.rows.length);

pool.end();
