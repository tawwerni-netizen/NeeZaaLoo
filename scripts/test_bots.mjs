import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const id = 'bot_p_001';
const p = await pool.query("SELECT id, handle, bio, avatar_key, selected_badge_code, selected_frame_code, created_at FROM player WHERE id = $1", [id]);
console.log('Player row:', p.rows[0]);

pool.end();
