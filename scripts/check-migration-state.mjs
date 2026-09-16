/**
 * Diagnostic only -- makes no changes. schema_migration is empty in
 * production despite most of the schema clearly already existing (it was
 * applied some other way, outside this tracking table). Before trusting
 * ANY backfill of schema_migration, this checks a real, distinctive object
 * from every one of the 52 migration files individually -- not just a
 * sample -- because a silently-skipped migration in the middle of the
 * ledger/payments sequence is exactly the kind of gap this project's own
 * rules say must never be auto-repaired or assumed away.
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const CHECKS = [
  ["0001_ledger_core.sql", "type", "ledger_owner_type"],
  ["0002_ledger_roles_and_platform_accounts.sql", "function", "ledger_open_user_wallet"],
  ["0003_players_ratings_matchmaking_duels.sql", "table", "game"],
  ["0004_economy_and_settlement.sql", "table", "economy_rule"],
  ["0005_authentication.sql", "table", "credential"],
  ["0006_admin_rbac_and_controls.sql", "table", "admin_role_grant"],
  ["0007_payments.sql", "table", "provider_event"],
  ["0008_compliance.sql", "type", "legal_status"],
  ["0009_risk_and_fairplay.sql", "type", "signal_kind"],
  ["0010_tournaments.sql", "type", "tournament_format"],
  ["0011_global_skill.sql", "view", "game_rating_percentile"],
  ["0012_duel_lease.sql", "column", "duel.lease_owner"],
  ["0013_reconciliation.sql", "type", "reconciliation_run_kind"],
  ["0014_i18n.sql", "column", "player.locale"],
  ["0015_rbac_foundation.sql", "table", "permission"],
  ["0016_email_identity.sql", "table", "email_identity"],
  ["0017_locale_realignment.sql", "constraint", "player.player_locale_supported"],
  ["0018_email_challenges.sql", "type", "email_challenge_purpose"],
  ["0019_oauth_identity.sql", "table", "oauth_identity"],
  ["0020_profile.sql", "table", "exp_event"],
  ["0021_nickname_case_insensitive_unique.sql", "index", "player_handle_lower_unique"],
  ["0022_support_tickets.sql", "type", "support_ticket_category"],
  ["0023_chat.sql", "type", "chat_channel_type"],
  ["0024_chat_lifecycle_and_spectator.sql", "column", "chat_channel.post_game_deadline"],
  ["0025_progression.sql", "column", "duel.progression_processed_at"],
  ["0026_vs_computer.sql", "column", "player.is_ai"],
  ["0027_duel_challenges.sql", "type", "duel_challenge_status"],
  ["0028_checkers_and_connect_four.sql", "row", "game.checkers"],
  ["0029_xo_and_speed_math.sql", "row", "game.xo"],
  ["0030_dominoes_and_backgammon.sql", "row", "game.dominoes"],
  ["0031_seega_and_reversi.sql", "row", "game.seega"],
  ["0032_gomoku.sql", "row", "game.gomoku"],
  ["0033_tournament_lifecycle_v2.sql", "type", "tournament_status"],
  ["0034_engagement_and_identity.sql", "table", "frame"],
  ["0035_rake_ladder.sql", "constraint", "economy_rule.economy_rule_rake_sane"],
  ["0036_fee_snapshot.sql", "function", "duel_pricing_immutable"],
  ["0037_stablecoin_valuation.sql", "type", "network"],
  ["0038_payment_rail.sql", "table", "payment_rail"],
  ["0039_deposit_verification.sql", "type", "deposit_status"],
  ["0040_withdrawal_hardening.sql", "type", "withdrawal_status"],
  ["0041_rail_emergency_hold.sql", "enumvalue", "rail_status.EMERGENCY_HOLD"],
  ["0042_rail_emergency_hold_enforcement.sql", "function", "rail_enabled_for"],
  ["0043_withdrawal_fee_immutability.sql", "function", "withdrawal_payload_digest"],
  ["0044_replay_mismatch_category.sql", "enumvalue", "reconciliation_case_category.REPLAY_MISMATCH"],
  ["0045_challenge_stakes_and_system_events.sql", "type", "duel_challenge_event_type"],
  ["0046_evidence_lifecycle_and_replay_removal.sql", "enumvalue", "reconciliation_run_kind.EVIDENCE_CLEANUP"],
  ["0047_referral_and_attribution.sql", "table", "referral_code"],
  ["0048_legal_consent_and_support_config.sql", "table", "legal_policy"],
  ["0049_friends_and_direct_chat.sql", "table", "friendship"],
  ["0050_admin_moderation_and_ban.sql", "column", "player.disabled_at"],
  ["0051_lobby_open_challenges_and_presence.sql", "table", "lobby_open_challenge"],
  ["0052_fairplay_sanction_and_seizure.sql", "column", "player.disabled_category"],
  ["0053_game_auto_tournaments_column.sql", "column", "game.auto_tournaments_enabled"],
  ["0054_rail_auto_approve_threshold.sql", "column", "payment_rail.auto_approve_threshold_minor"],
];

async function objectExists(client, kind, name) {
  switch (kind) {
    case "type":
      return (await client.query("SELECT 1 FROM pg_type WHERE typname = $1", [name])).rows.length > 0;
    case "table":
    case "view":
      return (await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = $1", [name]
      )).rows.length > 0;
    case "function":
      return (await client.query("SELECT 1 FROM pg_proc WHERE proname = $1", [name])).rows.length > 0;
    case "index":
      return (await client.query("SELECT 1 FROM pg_indexes WHERE indexname = $1", [name])).rows.length > 0;
    case "column": {
      const [table, col] = name.split(".");
      return (await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2", [table, col]
      )).rows.length > 0;
    }
    case "constraint": {
      const [table, cons] = name.split(".");
      return (await client.query(
        "SELECT 1 FROM information_schema.table_constraints WHERE table_name = $1 AND constraint_name = $2",
        [table, cons]
      )).rows.length > 0;
    }
    case "enumvalue": {
      const [enumType, value] = name.split(".");
      return (await client.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 AND e.enumlabel = $2`,
        [enumType, value]
      )).rows.length > 0;
    }
    case "row": {
      const [table, id] = name.split(".");
      return (await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rows.length > 0;
    }
    default:
      return null;
  }
}

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

  console.log(`Checking all ${CHECKS.length} migrations against a real, distinctive object each...\n`);
  const missing = [];
  for (const [file, kind, name] of CHECKS) {
    let present;
    try {
      present = await objectExists(client, kind, name);
    } catch (e) {
      present = `ERROR: ${e.message}`;
    }
    console.log(`  ${present === true ? "[present]" : present === false ? "[MISSING]" : present}  ${file}  (${kind}: ${name})`);
    if (present !== true) missing.push(file);
  }

  console.log("");
  if (missing.length === 0) {
    console.log("Every migration's signature object is present. Safe to backfill schema_migration with all files except any still missing, then run the real migration script for the rest.");
  } else {
    console.log(`${missing.length} migration(s) appear NOT applied:`);
    for (const f of missing) console.log(`  - ${f}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
