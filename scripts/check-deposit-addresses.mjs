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
    // This reads HISTORY. It can say what the last deposit attempt got; it
    // cannot say what the next one would get, because a restart since then
    // changes the answer and leaves no row behind. Saying otherwise is how
    // a diagnostic starts being trusted past what it actually knows.
    const newest = recent.rows[0];
    const ageMinutes = newest ? Math.round((Date.now() - new Date(newest.created_at)) / 60000) : null;
    const staleAfterMinutes = 30;

    if (t.sandbox_last_7d > 0) {
      const newestSandbox = recent.rows.find((r) => r.address?.startsWith(SANDBOX_PREFIX));
      const newestReal = recent.rows.find((r) => r.address && !r.address.startsWith(SANDBOX_PREFIX));
      const lastWasSandbox = newest?.address?.startsWith(SANDBOX_PREFIX);

      if (lastWasSandbox && ageMinutes !== null && ageMinutes > staleAfterMinutes) {
        const hours = (ageMinutes / 60).toFixed(1);
        console.log(`RESULT: unknown -- the last deposit attempt was ${hours}h ago, and it got a sandbox address.`);
        console.log("  Nothing has been attempted since, so this says nothing about the process");
        console.log("  running right now. To settle it, either check GET /v1/health (it reports");
        console.log('  "payments":"configured" or "unavailable"), or open the wallet and request');
        console.log("  a deposit address, then run this again.");
      } else if (lastWasSandbox) {
        console.log("RESULT: the most recent deposit attempt got a SANDBOX address.");
        console.log("  The API process cannot see OXAPAY_MERCHANT_API_KEY. Environment variables");
        console.log("  are read once, at process start, so the app has to be RESTARTED after");
        console.log("  setting it -- or the value placed in a .env file next to server.js.");
      } else {
        console.log("RESULT: the most recent deposit attempt got a REAL address -- the provider is live.");
      }

      if (newestReal && newestSandbox && new Date(newestReal.created_at) < new Date(newestSandbox.created_at)) {
        console.log("");
        console.log("  History note: a REAL address was minted at " +
          new Date(newestReal.created_at).toISOString().slice(0, 16).replace("T", " ") +
          ", before the sandbox ones above.");
        console.log("  So the key did reach the process once and was lost again -- which is what a");
        console.log("  restart or redeploy that did not carry the variable through looks like.");
      }
      if (lastWasSandbox) process.exitCode = 1;
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
