import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function fundBots() {
  try {
    const bots = await pool.query("SELECT id FROM player WHERE id LIKE 'bot_%' LIMIT 5");
    for (const bot of bots.rows) {
      console.log(`Funding ${bot.id}...`);
      try {
        await pool.query("SELECT ledger_open_user_wallet($1)", [bot.id]);
        console.log(`Opened wallet for ${bot.id}`);
      } catch (e) {
        console.log(`Wallet open error (maybe duplicate):`, e.message);
      }
      
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
        console.log(`Funded ${bot.id} successfully.`);
      } catch (e) {
        console.log(`Funding error for ${bot.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("Global Error:", e);
  } finally {
    pool.end();
  }
}
fundBots();
