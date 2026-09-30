import fs from "fs";
import pg from "pg";
import dns from "dns";
import { createRadarSeederWorker } from "../packages/matchmaking/src/radar-seeder.mjs";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
const pool = new pg.Pool({ connectionString: match[1], ssl: { rejectUnauthorized: false } });

// Match db adapter interface used by packages/matchmaking
const db = {
  query: (text, params) => pool.query(text, params),
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = { query: (t, p) => client.query(t, p) };
      const res = await fn(tx);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};

console.log("Running radar seeder tick...");
const worker = createRadarSeederWorker(db, {
  minChallenges: 22,
  maxChallenges: 33,
  emit: (event, data) => console.log(`[Event] ${event}:`, data),
});

const result = await worker();
console.log("Seeder tick completed:", result);

// Verify current status
const challengesByGame = await pool.query(`
  SELECT c.game_id, count(*)::int as count,
         count(CASE WHEN c.tier = 'FREE' THEN 1 END)::int as free_count,
         count(CASE WHEN c.tier = 'CASH' THEN 1 END)::int as cash_count
  FROM lobby_open_challenge c
  WHERE c.status = 'OPEN' AND c.expires_at > now()
  GROUP BY c.game_id
  ORDER BY c.game_id ASC
`);
console.table(challengesByGame.rows);

await pool.end();
