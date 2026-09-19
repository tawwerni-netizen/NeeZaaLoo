import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows: tournaments } = await pool.query(`SELECT id, capacity FROM tournament WHERE status = 'SCHEDULED'`);
  const { rows: allBots } = await pool.query(`SELECT id FROM player WHERE is_bot = true`);
  
  for (const t of tournaments) {
    const { rows: regs } = await pool.query(`SELECT user_id FROM tournament_registration WHERE tournament_id = $1`, [t.id]);
    const target = Math.floor(Math.random() * 12) + 4; // 4 to 15
    const toDelete = regs.length - target;
    
    if (toDelete > 0) {
      const shuffled = regs.sort(() => 0.5 - Math.random());
      for (let i = 0; i < toDelete; i++) {
        await pool.query(`DELETE FROM tournament_registration WHERE tournament_id = $1 AND user_id = $2`, [t.id, shuffled[i].user_id]);
      }
      console.log(`Tournament ${t.id}: reduced to ${target}`);
    } else if (toDelete < 0) {
      const toAdd = -toDelete;
      const existingUserIds = new Set(regs.map(r => r.user_id));
      const availableBots = allBots.filter(b => !existingUserIds.has(b.id)).sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < toAdd && i < availableBots.length; i++) {
        await pool.query(`INSERT INTO tournament_registration (tournament_id, user_id, status) VALUES ($1, $2, 'REGISTERED')`, [t.id, availableBots[i].id]);
      }
      console.log(`Tournament ${t.id}: increased to ${target}`);
    }
  }
  process.exit(0);
}
run();
