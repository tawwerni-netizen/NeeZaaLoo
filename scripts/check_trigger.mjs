import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

const res = await pool.query("SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'ledger_entry'::regclass OR tgrelid = 'ledger_transaction'::regclass");
console.log(res.rows);

pool.end();
