import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const client = new pg.Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
      await client.connect();
      return client;
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const client = await connectWithRetry();

const bal = await client.query(`
  SELECT 
    count(p.id)::int as total,
    count(CASE WHEN ledger_natural_balance(la.normal_side, COALESCE(lb.balance, 0)) >= 500000000 THEN 1 END)::int as funded_500usdt,
    count(CASE WHEN ledger_natural_balance(la.normal_side, COALESCE(lb.balance, 0)) >= 2000000 THEN 1 END)::int as funded_2usdt
  FROM player p
  LEFT JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = 'USDT'
  LEFT JOIN ledger_balance lb ON lb.account_id = la.id
  WHERE (p.is_ai = TRUE OR p.id LIKE 'bot_%' OR p.id LIKE 'top_p_%')
    AND p.id NOT LIKE 'ai-%'
`);
console.table(bal.rows);

await client.end();
