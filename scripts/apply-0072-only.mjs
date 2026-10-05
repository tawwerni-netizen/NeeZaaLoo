/**
 * One-off: apply db/migrations/0072_payment_receiver_integrity.sql ALONE to
 * the database in .env, and record it in schema_migration.
 *
 * Why alone: production's automatic migration has been stuck since
 * 2026-09-19 on 0067_clans_and_guilds.sql, whose objects already exist but
 * were never recorded. Unblocking that would also run 0067-0071 (bot renames,
 * permanent billiards data deletion) for the first time -- a separate
 * decision. 0072 has no dependency on any of them.
 *
 *   node scripts/apply-0072-only.mjs            # dry run: apply, verify, ROLL BACK
 *   node scripts/apply-0072-only.mjs --apply    # apply, verify, COMMIT
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env.mjs";

loadEnv();
const APPLY = process.argv.includes("--apply");
const FILE = "0072_payment_receiver_integrity.sql";
const sql = readFileSync(fileURLToPath(new URL(`../db/migrations/${FILE}`, import.meta.url)), "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log(`Connected to ${new URL(process.env.DATABASE_URL).host} -- ${APPLY ? "APPLY" : "DRY RUN (will roll back)"}`);

try {
  const recorded = await client.query("SELECT 1 FROM schema_migration WHERE filename = $1", [FILE]);
  if (recorded.rows.length) {
    console.log(`${FILE} is already recorded. Nothing to do.`);
    process.exit(0);
  }

  await client.query("BEGIN");
  // A dedicated connection, not the API pool: wait up to 15 s for the table
  // lock instead of the pool's 3 s, and give the statements room to run.
  await client.query("SET LOCAL lock_timeout = '15s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query(sql);
  await client.query("INSERT INTO schema_migration (filename) VALUES ($1)", [FILE]);

  const checks = await client.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'local_transfer_observed'
          AND column_name IN ('client_idempotency_key','message_fingerprint','review_reason','sms_sender'))::int AS columns,
      (SELECT count(*) FROM information_schema.tables WHERE table_name = 'payment_receiver_withdrawal_confirmation')::int AS confirmation_table,
      (SELECT count(*) FROM pg_proc WHERE proname = 'device_confirm_local_withdrawal')::int AS confirm_function`);
  const c = checks.rows[0];
  console.log("verify:", c);
  if (c.columns !== 4 || c.confirmation_table !== 1 || c.confirm_function !== 1) throw new Error("verification failed");

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`${FILE} applied and recorded.`);
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run OK: everything applied cleanly and was rolled back. Re-run with --apply.");
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED, nothing was changed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
