import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const res = await pool.query("SELECT prosrc FROM pg_proc WHERE proname = 'ledger_post'");
console.log(res.rows[0].prosrc.substring(0, 2000));

pool.end();
