/**
 * One-off seed for a throwaway local review database (see this repo's own
 * memory note "nizalo-smoke-test-pglite-socket" for the pattern this
 * follows). NEVER pointed at production -- DATABASE_URL below is always the
 * local `nizalo_review_smoke` database created for this review session.
 *
 * Creates: one SUPER_ADMIN admin/player account, two ordinary player
 * accounts funded in USDT/USDC/DAI, cash play enabled on a couple of games
 * (off by default platform-wide pending compliance -- flipped ON here only
 * for this local review), deposits/withdrawals/cash-matches unpaused, and
 * one open cash tournament to review the tournament flows against.
 */
import pg from "pg";
import { createPgAdapter } from "../packages/ledger/src/pg-adapter.mjs";
import { migrate } from "../packages/ledger/src/migrate.mjs";
import { createAuthService } from "../packages/auth/src/service.mjs";
import { createTournamentService } from "../packages/tournament/src/tournament.mjs";

const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/nizalo_review_smoke";
const PASSWORD = "Review!2026Smoke";
const E6 = 1_000_000n;
const u = (n) => (BigInt(n) * E6).toString();

async function fund(db, playerId, asset, wholeAmount) {
  const custody = asset === "USDT" ? "platform:custody:USDT:TRON" : `platform:custody:${asset}:BEP20`;
  await db.query(
    `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb,$3)`,
    [
      `smoke:${playerId}:${asset}`,
      JSON.stringify([
        { account: custody, amount: u(wholeAmount) },
        { account: `user:${playerId}:available`, amount: "-" + u(wholeAmount) },
      ]),
      asset,
    ]
  );
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  const db = createPgAdapter(pool);
  console.log("Migrating...");
  await migrate(db);

  const signingKey = Buffer.from(process.argv[2], "base64");
  const encryptionKey = Buffer.from(process.argv[3], "base64");
  const auth = createAuthService(db, {
    signingKey, encryptionKey,
    argon: { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 },
  });

  console.log("Registering accounts...");
  for (const [id, email] of [["reviewadmin", "reviewadmin@nizalo.test"], ["amira", "amira@nizalo.test"], ["yusuf", "yusuf@nizalo.test"]]) {
    const r = await auth.register({ playerId: id, handle: id, password: PASSWORD, email });
    if (!r.ok) console.log(`  ${id}: ${r.reason} (may already exist)`);
  }

  console.log("Granting SUPER_ADMIN...");
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
       ('bootstrap','bootstrap@nizalo.test','Bootstrap',TRUE),
       ('reviewadmin','reviewadmin@nizalo.test','Review Admin',TRUE)
     ON CONFLICT (id) DO NOTHING`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id,role,granted_by,reason)
     SELECT 'reviewadmin','SUPER_ADMIN','bootstrap','local review session'
     WHERE NOT EXISTS (
       SELECT 1 FROM admin_role_grant WHERE admin_id='reviewadmin' AND role='SUPER_ADMIN' AND revoked_at IS NULL
     )`
  );

  console.log("Funding wallets...");
  for (const id of ["amira", "yusuf"]) {
    await db.query("SELECT ledger_open_user_wallet($1)", [id]);
    await fund(db, id, "USDT", 250);
    await fund(db, id, "USDC", 120);
    await fund(db, id, "DAI", 75);
  }
  await db.query("SELECT ledger_open_user_wallet($1)", ["reviewadmin"]);

  console.log("Unpausing controls (local review only)...");
  await db.query(
    `UPDATE platform_control SET enabled = TRUE, changed_by = 'reviewadmin', reason = 'local review session'
      WHERE key IN ('REGISTRATION','MATCHMAKING','CASH_MATCHES','TOURNAMENTS','DEPOSITS','WITHDRAWALS','PROMOTIONS')`
  );

  console.log("Enabling cash play on chess and backgammon (off by default in production)...");
  await db.query("UPDATE game SET cash_enabled = TRUE WHERE id IN ('chess','backgammon')");

  console.log("Opening a cash tournament (chess, USDT)...");
  const tournament = createTournamentService(db);
  const closesAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await tournament.create({
    gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH",
    entryFeeMinor: u(5), asset: "USDT", capacity: 16, minPlayers: 2,
    timeControl: { initialMs: 300000, incrementMs: 0 },
    registrationClosesAt: closesAt, scheduledStartsAt: closesAt,
    title: "Review Session Cup", description: "Seeded for a local UI review.",
    prizeStructure: [{ rank: 1, bps: 10000 }],
    createdBy: "reviewadmin", visibility: "PUBLIC",
  });
  if (created.ok) {
    await tournament.openRegistration(created.tournamentId);
    console.log("  tournament:", created.tournamentId);
  } else {
    console.log("  tournament create failed:", created.reason);
  }

  console.log("\nDone.");
  console.log("Admin login:  reviewadmin / " + PASSWORD);
  console.log("Player login: amira / " + PASSWORD);
  console.log("Player login: yusuf / " + PASSWORD);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
