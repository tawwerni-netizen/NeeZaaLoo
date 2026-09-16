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

    // What a player is SERVED is not simply the newest row. Deposit
    // addresses here are permanent and reused, and the reuse query skips
    // expired/orphaned/quarantined rows and sandbox addresses -- so a dead
    // sandbox row sitting at the top by creation time says nothing about
    // what the wallet actually shows. Mirror that same filter, or the
    // verdict describes a row nobody will ever be given.
    const servable = await client.query(`
      SELECT address, provider, status::text, created_at
        FROM deposit
       WHERE status NOT IN ('EXPIRED', 'ORPHANED', 'QUARANTINED')
         AND address NOT LIKE 'Tsbx\\_%'
       ORDER BY created_at DESC
       LIMIT 1
    `);
    const live = servable.rows[0];

    if (live) {
      const when = new Date(live.created_at).toISOString().slice(0, 16).replace("T", " ");
      console.log("RESULT: the address a player would be served now is REAL.");
      console.log(`  ${live.address}  (provider: ${live.provider}, minted ${when})`);
      console.log("  Deposit addresses are permanent and reused, so this is what the wallet shows.");
    } else if (t.sandbox_last_7d > 0) {
      console.log("RESULT: no real address is available to serve, and sandbox rows exist.");
      console.log("  The API process cannot see OXAPAY_MERCHANT_API_KEY. Environment variables");
      console.log("  are read once, at process start, so the app has to be RESTARTED after");
      console.log("  setting it -- or the value placed in a .env file next to server.js.");
      console.log('  Check GET /v1/health: it reports "payments":"configured" or "unavailable".');
      process.exitCode = 1;
    } else {
      console.log("RESULT: no deposit address has been issued yet.");
      console.log('  Check GET /v1/health for whether payments are wired at all.');
    }

    if (t.sandbox > 0) {
      console.log("");
      console.log(`  ${t.sandbox} sandbox row(s) remain in history. They are barred from reuse and`);
      console.log("  hidden from the wallet, so no player is handed one -- but never pay into them.");
    }

    // Does each address match the chain it is filed under?
    //
    // USDT is one token living on several chains, and an address is only
    // valid on its own: Tron addresses are base58 starting with "T", BNB
    // Smart Chain and Ethereum are 0x-prefixed 20-byte hex. A row filed
    // under the wrong network would hand a player an address their wallet
    // sends to the wrong chain, and those funds do not come back. The
    // provider has been right about this so far -- this is here so that
    // stays true rather than being assumed.
    const SHAPES = {
      TRON:  { test: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a), label: "Tron (T..., base58, 34 chars)" },
      TRC20: { test: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a), label: "Tron (T..., base58, 34 chars)" },
      BEP20: { test: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),         label: "BNB Smart Chain (0x..., 42 chars)" },
      BSC:   { test: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),         label: "BNB Smart Chain (0x..., 42 chars)" },
      ERC20: { test: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),         label: "Ethereum (0x..., 42 chars)" },
      ETH:   { test: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),         label: "Ethereum (0x..., 42 chars)" },
    };

    const real = await client.query(`
      SELECT address, network, provider, status::text, created_at
        FROM deposit
       WHERE address NOT LIKE 'Tsbx\\_%'
       ORDER BY created_at DESC
    `);

    const mismatched = [];
    const unknownNetwork = [];
    for (const r of real.rows) {
      const shape = SHAPES[String(r.network).toUpperCase()];
      if (!shape) { unknownNetwork.push(r); continue; }
      if (!shape.test(r.address)) mismatched.push({ ...r, expected: shape.label });
    }

    console.log("");
    if (mismatched.length === 0 && unknownNetwork.length === 0) {
      console.log(`Address/network check: OK -- all ${real.rows.length} real address(es) match their chain.`);
    } else {
      for (const r of mismatched) {
        console.log(`  MISMATCH: ${r.address}`);
        console.log(`            filed under ${r.network}, which expects ${r.expected}`);
      }
      for (const r of unknownNetwork) {
        console.log(`  UNRECOGNISED NETWORK: ${r.network} (${r.address}) -- cannot verify its shape`);
      }
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
