/**
 * Read-only: prints every game's is_live / cash_enabled / auto_tournaments_enabled
 * flags. Run this right after scripts/run-migration.mjs applies 0053 --
 * that column turned out to already exist in production (added outside any
 * tracked migration, at some unknown point with unknown values), so this is
 * the only way to actually see what state each game is really in before
 * relying on the now-working admin Games Control toggle.
 *
 * Usage (DATABASE_URL must already be set in the SAME shell):
 *   node scripts/check-game-flags.mjs
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

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
  try {
    const r = await client.query(
      "SELECT id, display_name, is_live, cash_enabled, auto_tournaments_enabled FROM game ORDER BY id"
    );
    console.log("game id            live   cash   auto-tournaments");
    for (const row of r.rows) {
      console.log(
        `${row.id.padEnd(18)} ${String(row.is_live).padEnd(6)} ${String(row.cash_enabled).padEnd(6)} ${row.auto_tournaments_enabled}`
      );
    }
    console.log(
      "\nOnly a game with ALL THREE = true gets automated cash tournaments spawned."
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
