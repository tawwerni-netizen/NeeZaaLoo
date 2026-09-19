import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

async function run() {
  const res = await pool.query("SELECT id, handle FROM player WHERE id LIKE 'bot_%'");
  const bots = res.rows;
  
  console.log(`Found ${bots.length} bots to rename.`);
  
  let success = 0;
  for (const b of bots) {
    let cleanHandle = b.handle.replace(/_\d+$/, ''); // Remove _99
    
    // Fallback if the cleanHandle is already taken or invalid
    if (cleanHandle.length < 3) cleanHandle += '_Bot';
    
    try {
      await pool.query("UPDATE player SET handle = $1 WHERE id = $2", [cleanHandle, b.id]);
      success++;
    } catch (e) {
      console.log(`Failed to rename ${b.handle} to ${cleanHandle}: ${e.message}`);
    }
  }
  
  console.log(`Successfully renamed ${success} bots.`);
  pool.end();
}

run().catch(console.error);
