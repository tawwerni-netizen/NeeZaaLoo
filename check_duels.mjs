import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify' });

async function check() {
  try {
    const res = await pool.query(`
      SELECT id, game_id, tier, status, seat_0, seat_1, stake_minor
      FROM duel
      WHERE seat_0 = 'x0code0x' OR seat_1 = 'x0code0x'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.table(res.rows);
  } finally {
    pool.end();
  }
}
check();
