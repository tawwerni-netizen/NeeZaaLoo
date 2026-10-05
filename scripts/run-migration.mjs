/**
 * One-off operational script: applies every not-yet-applied migration in
 * db/migrations/ against process.env.DATABASE_URL, using the exact same
 * migrate() the test suite runs against PGlite -- forward-only, numbered,
 * idempotent (already-applied files are skipped via schema_migration).
 *
 * Usage -- DATABASE_URL is read from the project's .env automatically
 * (an already-exported variable still wins, see scripts/load-env.mjs):
 *   node scripts/run-migration.mjs
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";
import { createPgAdapter } from "../packages/ledger/src/pg-adapter.mjs";
import { migrate } from "../packages/ledger/src/migrate.mjs";

async function main() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error(
      "FATAL: DATABASE_URL is not set.\n" +
      "  Expected it in the project's .env file (DATABASE_URL=postgres://...),\n" +
      "  or exported in this shell. .env is gitignored and is the normal place for it."
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);

  try {
    const ran = await migrate(db, { log: true });
    if (ran.length === 0) {
      console.log("Already up to date -- nothing new to apply.");
    } else {
      console.log(`Applied ${ran.length} migration(s):`);
      for (const f of ran) console.log(`  - ${f}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
