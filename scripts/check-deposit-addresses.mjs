/**
 * Read-only: is production actually minting REAL deposit addresses?
 *
 * The live wallet was found serving `Tsbx_36cb24e2530` -- a sandbox address
 * that looks real enough to paste into a wallet, and that any USDT sent to
 * is simply gone. That happens whenever the API process cannot see
 * OXAPAY_MERCHANT_API_KEY and falls back to the in-process sandbox
 * provider. Setting the key in a hosting panel is not proof the running
 * process received it -- this is.
 *
 * Every sandbox address starts with `Tsbx_`; a genuine TRON address is a
 * 34-character base58 string starting with `T`. So the rows themselves say
 * which provider was live when each was created.
 *
 * Usage (DATABASE_URL comes from .env automatically):
 *   node scripts/check-deposit-addresses.mjs
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const SANDBOX_PREFIX = "Tsbx_";

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
    const totals = await client.query(`
      SELECT
        count(*)::int                                                         AS total,
        count(*) FILTER (WHERE address LIKE 'Tsbx\\_%')::int                   AS sandbox,
        count(*) FILTER (WHERE address LIKE 'Tsbx\\_%'
                           AND created_at > now() - interval '7 days')::int   AS sandbox_last_7d
      FROM deposit
    `);
    const t = totals.rows[0];

    const recent = await client.query(`
      SELECT id, player_id, asset, network, address, status, created_at
        FROM deposit
       ORDER BY created_at DESC
       LIMIT 10
    `);

    console.log(`Deposit rows: ${t.total} total, ${t.sandbox} with a sandbox address (${t.sandbox_last_7d} in the last 7 days)\n`);
    console.log("Most recent deposit addresses:");
    console.log("  created                    status              address");
    for (const r of recent.rows) {
      const fake = r.address?.startsWith(SANDBOX_PREFIX);
      const when = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
      console.log(
        `  ${when}   ${String(r.status).padEnd(18)} ${r.address}` +
        (fake ? "   <-- SANDBOX, money sent here is lost" : "")
      );
    }

    console.log("");
    if (t.sandbox_last_7d > 0) {
      console.log("RESULT: production is STILL minting sandbox addresses.");
      console.log("  The API process cannot see OXAPAY_MERCHANT_API_KEY. Setting it in the");
      console.log("  hosting panel is not enough on its own -- the app has to be restarted so");
      console.log("  the running process picks it up.");
      process.exitCode = 1;
    } else if (t.sandbox > 0) {
      console.log("RESULT: no NEW sandbox addresses in the last 7 days -- the real provider is live.");
      console.log(`  ${t.sandbox} older sandbox row(s) remain in history. They are excluded from reuse,`);
      console.log("  so no player will be handed one again, but do not pay into them.");
    } else {
      console.log("RESULT: clean -- no sandbox address has ever been issued.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
