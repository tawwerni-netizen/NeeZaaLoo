import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
const client = new pg.Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
await client.connect();

const challengesByGame = await client.query(`
  SELECT c.game_id, count(*)::int as count,
         count(CASE WHEN c.tier = 'FREE' THEN 1 END)::int as free_count,
         count(CASE WHEN c.tier = 'CASH' THEN 1 END)::int as cash_count
  FROM lobby_open_challenge c
  WHERE c.status = 'OPEN' AND c.expires_at > now()
  GROUP BY c.game_id
  ORDER BY c.game_id ASC
`);
console.table(challengesByGame.rows);

const ludoChallenges = await client.query(`
  SELECT c.id, c.game_id, c.tier, c.stake_minor, p.handle, p.avatar_key
  FROM lobby_open_challenge c
  JOIN player p ON p.id = c.creator_id
  WHERE c.game_id = 'ludo' AND c.status = 'OPEN' AND c.expires_at > now()
`);
console.log("Ludo open challenges count:", ludoChallenges.rowCount);
console.table(ludoChallenges.rows);

await client.end();
