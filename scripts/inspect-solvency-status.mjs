import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

let client;
for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    client = new pg.Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
    await client.connect();
    break;
  } catch (e) {
    if (attempt === 10) throw e;
    await new Promise(r => setTimeout(r, 1000));
  }
}

console.log("=== Checking Solvency ===");
const solvency = await client.query(`
  SELECT
    a.asset,
    SUM(CASE WHEN a.owner_type = 'PLATFORM' AND a.account_type = 'ASSET'
             THEN ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
             ELSE 0 END)::text AS custody,
    SUM(CASE WHEN a.owner_type = 'USER' AND p.is_ai IS NOT TRUE
             THEN ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
             ELSE 0 END)::text AS liabilities,
    SUM(CASE WHEN a.owner_type = 'USER' AND p.is_ai IS TRUE
             THEN ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
             ELSE 0 END)::text AS bot_liquidity
  FROM ledger_account a
  LEFT JOIN ledger_balance b ON b.account_id = a.id
  LEFT JOIN player p ON p.id = a.owner_id
  GROUP BY a.asset
`);
console.table(solvency.rows);

console.log("\n=== Checking Open Reconciliation Cases ===");
const cases = await client.query(`
  SELECT id, category, status, severity, opened_at, resolved_at
  FROM reconciliation_case
  WHERE status IN ('OPEN', 'UNDER_REVIEW')
  ORDER BY opened_at DESC LIMIT 10
`);
console.table(cases.rows);

console.log("\n=== Checking platform_control history or scripts ===");
// Check scripts in repo for resolve_stale_reconciliation_cases or similar
await client.end();
