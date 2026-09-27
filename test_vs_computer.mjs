import pg from "pg";
import { createVsComputerService } from "./packages/matchmaking/src/vs-computer.mjs";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const userRes = await client.query(`
      INSERT INTO "player" (id, handle, is_guest) 
      VALUES (gen_random_uuid(), 'bot_tester', true) 
      RETURNING id
    `);
    const playerId = userRes.rows[0].id;
    
    const aiRes = await client.query("SELECT id FROM player WHERE id LIKE 'ai-%'");
    console.log("AI players:", aiRes.rows);
    
    // Ensure ai-easy-2 and ai-easy-3 exist
    await client.query(`
      INSERT INTO player (id, handle, is_guest) VALUES
      ('ai-easy-2', 'bot_easy_2', true),
      ('ai-easy-3', 'bot_easy_3', true)
      ON CONFLICT DO NOTHING
    `);
    
    const svc = createVsComputerService(client);
    const result = await svc.createDuel({
      gameId: "ludo",
      playerId: playerId,
      difficulty: "EASY",
      mode: "standard-4p"
    });
    
    console.log("Create Duel Result:", result);
    
    if (result.ok) {
      const duelRes = await client.query("SELECT id, seat_0, seat_1, seat_2, seat_3, is_vs_computer, initial_state FROM duel WHERE id = $1", [result.duelId]);
      console.log("Duel Row:", duelRes.rows[0]);
    }
    
    await client.query("ROLLBACK");
  } catch(e) {
    console.error("Failed:", e);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    pool.end();
  }
}

run();
