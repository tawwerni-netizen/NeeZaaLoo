import pg from 'pg';
const { Client } = pg;
const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  for (let i = 0; i < 20; i++) {
    try {
      const client = new Client({ connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' });
      await client.connect();
      const res = await client.query("UPDATE rating SET rating_x100 = (150000 + FLOOR(RANDOM() * 110000))::int WHERE player_id IN (SELECT id FROM player WHERE is_ai = TRUE OR id LIKE 'bot_%') AND rating_x100 >= 280000");
      console.log('Updated', res.rowCount, 'rows');
      process.exit(0);
    } catch (e) {
      console.log('Failed:', e.message);
      await delay(1000);
    }
  }
}
run();
