import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function check() {
  try {
    const res = await pool.query("SELECT id FROM player WHERE handle = 'x0code0x'");
    if (res.rows.length === 0) { console.log("User not found"); return; }
    const playerId = res.rows[0].id;
    
    console.log("Player ID:", playerId);
    const bals = await pool.query(`
      SELECT la.key, lb.balance, ledger_natural_balance(la.normal_side, lb.balance) as nat
      FROM ledger_account la 
      LEFT JOIN ledger_balance lb ON lb.account_id = la.id 
      WHERE la.key LIKE 'user:' || $1 || '%'
    `, [playerId]);
    console.log(bals.rows);
  } finally {
    pool.end();
  }
}
check();
