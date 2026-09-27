import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function check() {
  try {
    const cfg = await pool.query("SELECT value FROM bot_platform_config WHERE key = 'standing_by'");
    console.log("Bot Config:", cfg.rows[0]?.value);
    
    const count = await pool.query("SELECT count(*) FROM player WHERE id LIKE 'bot_%'");
    console.log("Total Bots:", count.rows[0].count);
    
    const bals = await pool.query(`
      SELECT b.id, lb.balance
      FROM player b
      LEFT JOIN ledger_account la ON la.key = 'user:' || b.id || ':available' AND la.asset = 'USDT'
      LEFT JOIN ledger_balance lb ON lb.account_id = la.id
      WHERE b.id LIKE 'bot_%'
      ORDER BY lb.balance DESC NULLS LAST
      LIMIT 10
    `);
    console.log("Top 10 Bot Balances:", bals.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
check();
