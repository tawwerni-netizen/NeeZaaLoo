/**
 * One-off correction: retire sandbox deposit addresses that are still sitting
 * in AWAITING_PAYMENT.
 *
 * While the API was falling back to the sandbox payment provider it minted
 * `Tsbx_...` addresses and stored them like any other deposit. Two are still
 * in AWAITING_PAYMENT, which every wallet renders as "waiting for your
 * payment" beside a copyable address -- an address that leads nowhere and
 * where any USDT sent is lost. They are already barred from reuse and from
 * the wallet listing, but leaving them marked as awaiting payment is leaving
 * a live-looking invoice in the record.
 *
 * This ONLY moves sandbox rows that are still AWAITING_PAYMENT to EXPIRED.
 * It touches no real deposit, no credited row, no balance and no ledger
 * entry -- deposits in this state have credited nothing by definition.
 *
 * Usage (DATABASE_URL comes from .env automatically):
 *   node scripts/expire-sandbox-deposits.mjs           # show what would change
 *   node scripts/expire-sandbox-deposits.mjs --apply   # make the change
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

  const apply = process.argv.includes("--apply");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const candidates = await client.query(`
      SELECT id, player_id, asset, network, address, status::text, created_at
        FROM deposit
       WHERE address LIKE 'Tsbx\\_%'
         AND status = 'AWAITING_PAYMENT'
       ORDER BY created_at DESC
    `);

    if (candidates.rows.length === 0) {
      console.log("Nothing to do: no sandbox address is still awaiting payment.");
      return;
    }

    console.log(`${candidates.rows.length} sandbox deposit(s) still marked AWAITING_PAYMENT:\n`);
    for (const r of candidates.rows) {
      const when = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
      console.log(`  ${when}   ${r.player_id.padEnd(16)} ${r.address}`);
    }

    if (!apply) {
      console.log("\nDry run -- nothing changed.");
      console.log("Re-run with --apply to move these to EXPIRED:");
      console.log("  node scripts/expire-sandbox-deposits.mjs --apply");
      return;
    }

    const updated = await client.query(`
      UPDATE deposit
         SET status = 'EXPIRED'
       WHERE address LIKE 'Tsbx\\_%'
         AND status = 'AWAITING_PAYMENT'
      RETURNING id
    `);
    console.log(`\nDone: ${updated.rowCount} row(s) moved to EXPIRED. No balance or ledger entry was touched.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
