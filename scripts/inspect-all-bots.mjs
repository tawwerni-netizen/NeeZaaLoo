import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const client = new pg.Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
      await client.connect();
      return client;
    } catch (e) {
      console.log(`Connection attempt ${attempt} failed (${e.message}), retrying in ${attempt}s...`);
      if (attempt === 10) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const client = await connectWithRetry();

const countRes = await client.query(`
  SELECT 
    count(*)::int as total_bots,
    count(CASE WHEN id LIKE 'ai-%' THEN 1 END)::int as ai_prefix_bots,
    count(CASE WHEN id NOT LIKE 'ai-%' THEN 1 END)::int as persona_bots
  FROM player
  WHERE is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%'
`);
console.table(countRes.rows);

const handleSample = await client.query(`
  SELECT id, handle, avatar_key, bio
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
  ORDER BY id
  LIMIT 25
`);
console.table(handleSample.rows);

// Check if any personas have numbers, or bot keywords
const withDigits = await client.query(`
  SELECT count(*)::int as count
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
    AND handle ~ '[0-9]'
`);
console.log("Personas with numbers in handle:", withDigits.rows[0].count);

const withBotWord = await client.query(`
  SELECT count(*)::int as count
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
    AND (handle ILIKE '%bot%' OR handle ILIKE '%robot%' OR bio ILIKE '%بوت%' OR bio ILIKE '%روبوت%')
`);
console.log("Personas with 'bot' in handle or bio:", withBotWord.rows[0].count);

await client.end();
