import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl });

async function run() {
  console.log('Migrating personas to players...');
  
  const res = await pool.query("SELECT id, handle, avatar_key, created_at FROM persona");
  const personas = res.rows;
  
  for (const p of personas) {
    let cleanHandle = p.handle.replace(/_\d+$/, '').replace(/_/g, ' ').trim();
    if (cleanHandle === p.handle) {
       cleanHandle = p.handle.replace(/_/g, ' ').trim();
    }
    
    await pool.query("UPDATE persona SET handle = $1 WHERE id = $2", [cleanHandle, p.id]);
    
    const pCheck = await pool.query("SELECT id FROM player WHERE id = $1", [p.id]);
    if (pCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO player (id, handle, avatar_key, created_at)
        VALUES ($1, $2, $3, $4)
      `, [p.id, cleanHandle, p.avatar_key, p.created_at || new Date()]);
    } else {
      await pool.query(`
        UPDATE player SET handle = $1 WHERE id = $2
      `, [cleanHandle, p.id]);
    }
  }
  
  console.log(`Updated ${personas.length} personas.`);
  pool.end();
}

run().catch(err => {
  console.error(err);
  pool.end();
});
