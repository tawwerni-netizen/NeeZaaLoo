import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl, max: 20 });

async function run() {
  const res = await pool.query("SELECT id, handle FROM player WHERE id LIKE 'bot_%' ORDER BY id");
  let count = 0;
  for (const row of res.rows) {
    const newHandle = row.handle.replace(/_\d+$/, '');
    if (newHandle !== row.handle) {
      try {
        await pool.query("UPDATE player SET handle = $1 WHERE id = $2", [newHandle, row.id]);
        console.log(`Renamed ${row.handle} -> ${newHandle}`);
        count++;
        // Delay to avoid pool exhaustion
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error renaming ${row.handle}: ${err.message}`);
      }
    }
  }
  console.log(`Renamed ${count} bots.`);
}

run().finally(() => pool.end());
