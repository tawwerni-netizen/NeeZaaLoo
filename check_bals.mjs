import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });
async function check() {
  const res = await pool.query("SELECT b.id, lb.balance FROM player b JOIN ledger_account la ON la.key = 'user:' || b.id || ':available' AND la.asset = 'USDT' JOIN ledger_balance lb ON lb.account_id = la.id WHERE b.id LIKE 'bot_%' AND lb.balance > 0 LIMIT 10");
  console.log(res.rows);
  pool.end();
}
check();
