import { loadEnv } from "./load-env.mjs";
loadEnv();

import pg from 'pg';
const { Client } = pg;

async function checkSizes() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT
      relname AS table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'm')
    ORDER BY bytes DESC
    LIMIT 20;
  `);

  console.log('Top tables by size:');
  for (const row of res.rows) {
    console.log(`  ${row.table_name.padEnd(30)} ${row.total_size}`);
  }

  await client.end();
}

checkSizes().catch(console.error);
