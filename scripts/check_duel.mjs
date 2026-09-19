import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'duel'").then(res => {
  console.log(res.rows.map(r => r.column_name).join(', '));
  pool.end();
}).catch(console.error);
