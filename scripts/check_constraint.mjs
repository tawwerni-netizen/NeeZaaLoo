import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const res = await pool.query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'player_handle_shape'");
console.log(res.rows[0]);

pool.end();
