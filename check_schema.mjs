import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
async function run() {
  const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'duel'`);
  console.log(rows.map(r => r.column_name));
  pool.end();
}
run();
