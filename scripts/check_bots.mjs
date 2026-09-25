import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, handle, disabled_at FROM player WHERE handle ILIKE '%bot%' OR handle ILIKE '%trimmed%' LIMIT 20`);
  console.log(res.rows);
  await client.end();
}
run();
