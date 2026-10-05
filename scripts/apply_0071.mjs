import { loadEnv } from "./load-env.mjs";
loadEnv();

import pg from 'pg';
import fs from 'node:fs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();
  const sql = fs.readFileSync('db/migrations/0071_seed_egp_valuation.sql', 'utf8');

  await client.query('BEGIN');
  await client.query(sql);
  
  const exists = await client.query("SELECT 1 FROM schema_migration WHERE filename = '0071_seed_egp_valuation.sql'");
  if (exists.rows.length === 0) {
    await client.query("INSERT INTO schema_migration (filename) VALUES ('0071_seed_egp_valuation.sql')");
  }
  await client.query('COMMIT');
  console.log('Migration 0071 applied successfully to Neon!');

  const snapshot = await client.query("SELECT * FROM valuation_snapshot WHERE asset = 'EGP'");
  console.log('EGP snapshot in Neon:', snapshot.rows);

  await client.end();
}

main().catch(console.error);
