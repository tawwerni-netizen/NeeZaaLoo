import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
async function run() {
  const { rows } = await pool.query(`SELECT id, game_id, seat_0, seat_1, status, created_at, is_vs_computer FROM duel WHERE seat_0 NOT LIKE 'bot_%' OR seat_1 NOT LIKE 'bot_%' ORDER BY created_at DESC LIMIT 5`);
  console.log(JSON.stringify(rows, null, 2));
  pool.end();
}
run();
