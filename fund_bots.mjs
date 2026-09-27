import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function fundBots() {
  try {
    const bots = await pool.query("SELECT id FROM player WHERE (id LIKE 'bot_%' OR id LIKE 'top_p_%')");
    let count = 0;
    for (const bot of bots.rows) {
      try {
        await pool.query("SELECT ledger_open_user_wallet($1)", [bot.id]);
      } catch (e) {}
      
      const depositId = `deposit:${bot.id}:system_standing_by_3`;
      try {
        await pool.query(
          `SELECT ledger_post($1, 'DEPOSIT', 'SYSTEM', NULL, $2::jsonb)`,
          [
            depositId,
            JSON.stringify([
              { account: "platform:custody:USDT:TRON", amount: "10000000000" },
              { account: `user:${bot.id}:available`, amount: "-10000000000" }
            ])
          ]
        );
        count++;
      } catch (e) {
        if (!e.message.includes('unique constraint') && !e.message.includes('duplicate key')) {
          console.error(e.message);
        }
      }
    }
    console.log(`Funded ${count} bots successfully.`);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
fundBots();
