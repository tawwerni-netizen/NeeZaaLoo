import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
async function check() {
  const res = await pool.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'ledger_post'");
  console.log(res.rows[0]?.pg_get_functiondef);
  pool.end();
}
check();
