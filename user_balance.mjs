import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function run() {
  const { rows } = await pool.query(`SELECT * FROM "user" WHERE handle = 'x0code0x'`);
  console.log('User:', rows[0].id, rows[0].handle);
  
  const balances = await pool.query(`SELECT currency, balance_type, balance, ledger_balance, locked_balance FROM user_balance WHERE user_id = $1`, [rows[0].id]);
  console.log('Balances:', balances.rows);
  
  const matches = await pool.query(`SELECT * FROM duel WHERE player1_id = $1 OR player2_id = $1 ORDER BY created_at DESC LIMIT 5`, [rows[0].id]);
  console.log('Recent matches:');
  for (const m of matches.rows) {
    console.log(`- ${m.id} [${m.status}] wager:${m.wager} p1:${m.player1_id} p2:${m.player2_id} reserved:${m.reservation_tx_id} completed_at:${m.completed_at}`);
  }
  
  pool.end();
}
run();