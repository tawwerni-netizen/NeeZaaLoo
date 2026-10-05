import { loadEnv } from "./load-env.mjs";
loadEnv();

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Supabase on port 6543!');

  const appliedRes = await client.query('SELECT filename FROM schema_migration');
  const applied = new Set(appliedRes.rows.map(r => r.filename));
  console.log('Currently applied migrations count:', applied.size);

  const migrationsToRun = [
    '0075_guest_mode.sql'
  ];

  for (const filename of migrationsToRun) {
    if (applied.has(filename)) {
      console.log(`Migration ${filename} already applied. Skipping.`);
      continue;
    }

    console.log(`Applying migration ${filename}...`);
    const filePath = path.join(process.cwd(), 'db', 'migrations', filename);
    const sql = fs.readFileSync(filePath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Successfully applied ${filename}!`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Failed to apply ${filename}:`, err);
      throw err;
    }
  }

  await client.end();
}

run().catch(console.error);
