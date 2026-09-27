import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    console.log("Creating 4 users...");
    const users = [];
    for (let i = 1; i <= 4; i++) {
      const res = await client.query(`
        INSERT INTO "player" (id, handle, is_guest) 
        VALUES (gen_random_uuid(), 'user_' || substr(gen_random_uuid()::text, 1, 8), true) 
        RETURNING id
      `);
      users.push(res.rows[0].id);
    }
    
    console.log("Enqueuing 4 tickets for Ludo (standard-4p)...");
    for (const userId of users) {
      await client.query(`
        INSERT INTO matchmaking_ticket (player_id, game_id, mode, tier, rating_x100, time_control, expires_at)
        VALUES ($1, 'ludo', 'standard-4p', 'FREE', 100000, '{"durationMs":300000}'::jsonb, now() + interval '5 minutes')
      `, [userId]);
    }
    
    console.log("Running mm_pair()...");
    const pairRes = await client.query(`
      SELECT * FROM mm_pair(
        'ludo',
        'standard-4p',
        'FREE'::entry_tier,
        0,
        gen_random_uuid()::text,
        '{}'::jsonb,
        '{"durationMs": 300000}'::jsonb,
        'randomseed123',
        NULL
      )
    `);
    console.log("mm_pair() returned:", pairRes.rows);
    
    const duelRes = await client.query(`
      SELECT id, game_id, seat_0, seat_1, seat_2, seat_3, status 
      FROM duel 
      WHERE seat_0 = ANY($1) OR seat_1 = ANY($1) OR seat_2 = ANY($1) OR seat_3 = ANY($1)
      ORDER BY created_at DESC LIMIT 1
    `, [users]);
    
    if (duelRes.rows.length > 0) {
      console.log("Created Duel:", duelRes.rows[0]);
      if (duelRes.rows[0].seat_2 && duelRes.rows[0].seat_3) {
        console.log("SUCCESS: 4-Player Duel matched correctly!");
      } else {
        console.log("FAIL: Duel does not have 4 seats filled.");
      }
    } else {
      console.log("FAIL: No duel created.");
    }
    
    await client.query("ROLLBACK");
  } catch (e) {
    console.error("Test failed:", e);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    pool.end();
  }
}

run();
