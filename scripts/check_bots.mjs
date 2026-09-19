import pg from 'pg';
import fs from 'fs';
let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });
pool.query("SELECT count(*) FROM player WHERE handle ~ '_\\d+$'").then(res => {
  console.log('Bots remaining with numbers:', res.rows[0].count);
  pool.end();
}).catch(console.error);
