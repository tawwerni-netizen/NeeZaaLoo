const { Pool } = require("pg");
async function run() {
  const pool = new Pool({ connectionString: "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" });
  const r = await pool.query(`
    SELECT d.id, d.game_id, d.status,
           (SELECT count(*) FROM duel_event de WHERE de.duel_id = d.id AND de.type = 'ACTION') as action_count,
           (SELECT count(*) FROM duel_event de WHERE de.duel_id = d.id AND de.type = 'INTENT_ACCEPTED') as intent_count
      FROM duel d
     WHERE d.id LIKE 'duel_live_%'
     ORDER BY d.created_at DESC
     LIMIT 10
  `);
  console.table(r.rows);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
