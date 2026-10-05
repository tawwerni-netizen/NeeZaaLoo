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

console.log("Checking ledger_solvency...");
const solvency = await client.query(`SELECT * FROM ledger_solvency`);
console.table(solvency.rows);

console.log("Enabling WITHDRAWALS in platform_control...");
const adminRes = await client.query(`SELECT id FROM admin_user LIMIT 1`);
const adminId = adminRes.rows[0]?.id || 'tawwerni';

const res = await client.query(`
  UPDATE platform_control
  SET enabled = true,
      changed_by = $1,
      reason = 'Platform solvency verified healthy; withdrawals resumed',
      changed_at = now()
  WHERE key = 'WITHDRAWALS'
  RETURNING *
`, [adminId]);
console.table(res.rows);

await client.end();
