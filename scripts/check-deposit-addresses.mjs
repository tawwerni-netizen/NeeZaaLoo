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

    // `provider` is written from provider.id at creation time, so it names
    // exactly which adapter was live in the API process for each row --
    // "sandbox" vs the real one. That is the decisive field: an address can
    // be guessed at by shape, but this was recorded by the code itself.
    const recent = await client.query(`
      SELECT id, player_id, asset, network, address, status, provider, created_at
        FROM deposit
       ORDER BY created_at DESC
       LIMIT 12
    `);

    console.log(`Deposit rows: ${t.total} total, ${t.sandbox} with a sandbox address (${t.sandbox_last_7d} in the last 7 days)\n`);
    console.log("Most recent deposit addresses:");
    console.log("  created            provider    status              address");
    for (const r of recent.rows) {
      const fake = r.address?.startsWith(SANDBOX_PREFIX);
      const when = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
      console.log(
        `  ${when}   ${String(r.provider ?? "?").padEnd(10)} ${String(r.status).padEnd(18)} ${r.address}` +
        (fake ? "   <-- SANDBOX" : "")
      );
    }

    console.log("");
    if (t.sandbox_last_7d > 0) {
      const newestSandbox = recent.rows.find((r) => r.address?.startsWith(SANDBOX_PREFIX));
      const newestReal = recent.rows.find((r) => r.address && !r.address.startsWith(SANDBOX_PREFIX));

      console.log("RESULT: production is STILL minting sandbox addresses.");
      console.log("  The API process cannot see OXAPAY_MERCHANT_API_KEY. Setting it in the");
      console.log("  hosting panel is not enough on its own -- environment variables are read");
      console.log("  once, when the process starts, so the app has to be RESTARTED.");

      if (newestReal && newestSandbox && new Date(newestReal.created_at) < new Date(newestSandbox.created_at)) {
        console.log("");
        console.log("  Note: a REAL address was minted at " +
          new Date(newestReal.created_at).toISOString().slice(0, 16).replace("T", " ") +
          ", before the sandbox ones above.");
        console.log("  So the key reached the process at some point and was lost again -- which is");
        console.log("  what a restart or redeploy that did not carry the variable through looks like.");
      }
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
