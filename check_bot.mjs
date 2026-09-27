import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
async function check() {
  const res = await pool.query("SELECT lb.balance FROM ledger_account la JOIN ledger_balance lb ON lb.account_id = la.id WHERE la.key = 'user:bot_ar_048:available'");
  console.log(res.rows);
  pool.end();
}
check();
