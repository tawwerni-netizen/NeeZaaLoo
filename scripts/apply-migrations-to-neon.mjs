import { loadEnv } from "./load-env.mjs";
loadEnv();

import dns from "dns";
import pg from "pg";
import { createPgAdapter } from "../packages/ledger/src/pg-adapter.mjs";
import { migrate } from "../packages/ledger/src/migrate.mjs";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectionString = process.env.DATABASE_URL;

async function main() {
  console.log("Connecting to new Neon database...");
  let client;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
      await client.connect();
      break;
    } catch (e) {
      console.warn(`Connection attempt ${attempt} failed: ${e.message}`);
      if (attempt === 5) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log("Connected! Applying migrations from db/migrations/...");
  const db = createPgAdapter(client);

  try {
    const ran = await migrate(db, { log: true });
    console.log(`Successfully applied ${ran.length} migration(s) to new Neon database!`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
