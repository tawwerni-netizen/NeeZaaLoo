import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl, max: 20 });

async function run() {
  await pool.query(`
    UPDATE duel
    SET seat_0_handle = p.handle
    FROM player p
    WHERE duel.seat_0 = p.id AND duel.seat_0_handle != p.handle
  `);
  console.log("Updated seat_0 handles.");
  
  await pool.query(`
    UPDATE duel
    SET seat_1_handle = p.handle
    FROM player p
    WHERE duel.seat_1 = p.id AND duel.seat_1_handle != p.handle
  `);
  console.log("Updated seat_1 handles.");
}

run().finally(() => pool.end());
