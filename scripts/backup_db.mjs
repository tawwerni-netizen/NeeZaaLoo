#!/usr/bin/env node
/**
 * Automated Production Database Backup Script.
 *
 * Backs up core platform tables and financial ledgers into compressed, timestamped
 * JSON backups in the backups/ directory with automatic 14-day retention rotation.
 *
 * Usage:
 *   node scripts/backup_db.mjs
 * Or via crontab:
 *   0 3 * * * node /var/www/nizalo/scripts/backup_db.mjs >> /var/log/nizalo-backup.log 2>&1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import zlib from "node:zlib";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, "../backups");

const CORE_TABLES = [
  "player",
  "credential",
  "admin_user",
  "admin_role_grant",
  "ledger_account",
  "ledger_balance",
  "ledger_transaction",
  "ledger_entry",
  "deposit",
  "withdrawal",
  "duel",
  "tournament",
  "tournament_registration",
  "tournament_standing",
  "clan",
  "clan_member",
  "badge",
  "frame",
  "player_badge",
  "player_frame",
  "season",
  "battle_pass_tier",
  "battle_pass_claim",
  "referral_code",
  "referral_attribution",
  "referral_reward",
  "local_payment_number",
  "local_deposit_intent",
  "support_ticket",
  "support_ticket_message",
  "platform_control",
  "economy_rule"
];

async function main() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `nizalo_backup_${timestamp}.json.gz`);

  console.log(`[backup] Starting database backup at ${new Date().toISOString()}...`);

  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      tables: {}
    };

    let totalRows = 0;
    for (const table of CORE_TABLES) {
      try {
        const res = await client.query(`SELECT * FROM ${table};`);
        backupData.tables[table] = res.rows;
        totalRows += res.rows.length;
        console.log(`  ✓ Backed up table ${table}: ${res.rows.length} rows`);
      } catch (err) {
        console.warn(`  ⚠️ Could not export table ${table}: ${err.message}`);
      }
    }

    const jsonString = JSON.stringify(backupData);
    const compressed = zlib.gzipSync(jsonString);
    fs.writeFileSync(backupFile, compressed);

    const sizeMb = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log(`[backup] ✅ Backup completed successfully! Saved to: ${backupFile} (${sizeMb} MB, ${totalRows} rows)`);

    // Retention: prune backups older than 14 days
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 3600 * 1000;

    for (const file of files) {
      if (file.startsWith("nizalo_backup_") && file.endsWith(".json.gz")) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > fourteenDaysMs) {
          fs.unlinkSync(filePath);
          console.log(`[backup] Pruned old backup: ${file}`);
        }
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[backup] ❌ Backup failed:", err);
  process.exit(1);
});
