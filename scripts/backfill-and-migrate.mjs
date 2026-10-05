/**
 * One-time reconciliation, run after check-migration-state.mjs confirmed
 * (by checking a real object per file, not by assumption) that every
 * migration 0001-0051 is genuinely present and only 0052 is missing.
 *
 * Backfills schema_migration with those 51 filenames -- so it finally
 * matches reality -- then runs the normal migrate() to apply whatever is
 * genuinely still missing (0052, and correctly nothing else).
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";
import { createPgAdapter } from "../packages/ledger/src/pg-adapter.mjs";
import { migrate } from "../packages/ledger/src/migrate.mjs";

const CONFIRMED_APPLIED = [
  "0001_ledger_core.sql", "0002_ledger_roles_and_platform_accounts.sql",
  "0003_players_ratings_matchmaking_duels.sql", "0004_economy_and_settlement.sql",
  "0005_authentication.sql", "0006_admin_rbac_and_controls.sql", "0007_payments.sql",
  "0008_compliance.sql", "0009_risk_and_fairplay.sql", "0010_tournaments.sql",
  "0011_global_skill.sql", "0012_duel_lease.sql", "0013_reconciliation.sql",
  "0014_i18n.sql", "0015_rbac_foundation.sql", "0016_email_identity.sql",
  "0017_locale_realignment.sql", "0018_email_challenges.sql", "0019_oauth_identity.sql",
  "0020_profile.sql", "0021_nickname_case_insensitive_unique.sql", "0022_support_tickets.sql",
  "0023_chat.sql", "0024_chat_lifecycle_and_spectator.sql", "0025_progression.sql",
  "0026_vs_computer.sql", "0027_duel_challenges.sql", "0028_checkers_and_connect_four.sql",
  "0029_xo_and_speed_math.sql", "0030_dominoes_and_backgammon.sql", "0031_seega_and_reversi.sql",
  "0032_gomoku.sql", "0033_tournament_lifecycle_v2.sql", "0034_engagement_and_identity.sql",
  "0035_rake_ladder.sql", "0036_fee_snapshot.sql", "0037_stablecoin_valuation.sql",
  "0038_payment_rail.sql", "0039_deposit_verification.sql", "0040_withdrawal_hardening.sql",
  "0041_rail_emergency_hold.sql", "0042_rail_emergency_hold_enforcement.sql",
  "0043_withdrawal_fee_immutability.sql", "0044_replay_mismatch_category.sql",
  "0045_challenge_stakes_and_system_events.sql", "0046_evidence_lifecycle_and_replay_removal.sql",
  "0047_referral_and_attribution.sql", "0048_legal_consent_and_support_config.sql",
  "0049_friends_and_direct_chat.sql", "0050_admin_moderation_and_ban.sql",
  "0051_lobby_open_challenges_and_presence.sql",
];

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
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    console.log(`Backfilling ${CONFIRMED_APPLIED.length} confirmed-applied migrations into schema_migration...`);
    for (const f of CONFIRMED_APPLIED) {
      await client.query(
        "INSERT INTO schema_migration (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
        [f]
      );
    }
    console.log("Backfill done.\n");

    const db = createPgAdapter(client);
    const ran = await migrate(db, { log: true });
    if (ran.length === 0) {
      console.log("\nNothing new to apply (unexpected -- 0052 should have run).");
    } else {
      console.log(`\nApplied ${ran.length} migration(s):`);
      for (const f of ran) console.log(`  - ${f}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Backfill/migrate failed:", err);
  process.exit(1);
});
