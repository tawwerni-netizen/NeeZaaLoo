import pg from "pg";

const connectionString = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("=== Starting Database Deep Cleanup ===");
  const before = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size;");
  console.log(`Database size before cleanup: ${before.rows[0].size}`);

  try {
    // 1. Temporarily disable immutability triggers on ledger tables
    console.log("\n1. Temporarily disabling ledger immutability triggers...");
    await client.query(`
      ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_immutable;
      ALTER TABLE ledger_entry DISABLE TRIGGER ledger_entry_no_truncate;
      ALTER TABLE ledger_transaction DISABLE TRIGGER ledger_transaction_immutable;
      ALTER TABLE ledger_transaction DISABLE TRIGGER ledger_transaction_no_truncate;
    `);
    console.log("  Triggers disabled successfully.");

    // 2. Truncate fake bot ledger entries and transactions (which were all simulation data)
    console.log("\n2. Truncating fake simulated ledger data...");
    await client.query("TRUNCATE TABLE ledger_entry RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE ledger_transaction RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE ledger_balance RESTART IDENTITY CASCADE;");
    console.log("  Truncated ledger_entry, ledger_transaction, and ledger_balance.");

    // Clean bot ledger accounts (keep platform system accounts: custody, rake, promotions)
    const delAcc = await client.query("DELETE FROM ledger_account WHERE owner_id IS NOT NULL;");
    console.log(`  Deleted ${delAcc.rowCount} bot ledger accounts.`);

    // 3. Clean completed simulated duel events and duels
    console.log("\n3. Cleaning completed simulated duel events and duels...");
    const delEvents = await client.query(`
      DELETE FROM duel_event WHERE duel_id IN (
        SELECT id FROM duel WHERE (id LIKE 'duel_live_%' OR id LIKE 'duel_sim_%') AND status = 'COMPLETED'
      );
    `);
    console.log(`  Deleted ${delEvents.rowCount} old simulated duel events.`);

    const delDuels = await client.query(`
      DELETE FROM duel WHERE (id LIKE 'duel_live_%' OR id LIKE 'duel_sim_%') AND status = 'COMPLETED';
    `);
    console.log(`  Deleted ${delDuels.rowCount} old completed simulated duels.`);

    // 4. Clean deactivated trimmed players
    console.log("\n4. Cleaning deactivated trimmed bots...");
    try {
      const delPlayers = await client.query("DELETE FROM player WHERE handle LIKE 'trimmed_%';");
      console.log(`  Deleted ${delPlayers.rowCount} trimmed excess bots.`);
    } catch (err) {
      console.log("  Some trimmed bots referenced by historical keys, keeping them safely deactivated.");
    }

  } finally {
    // Always re-enable triggers!
    console.log("\nRe-enabling ledger immutability triggers...");
    try {
      await client.query(`
        ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_immutable;
        ALTER TABLE ledger_entry ENABLE TRIGGER ledger_entry_no_truncate;
        ALTER TABLE ledger_transaction ENABLE TRIGGER ledger_transaction_immutable;
        ALTER TABLE ledger_transaction ENABLE TRIGGER ledger_transaction_no_truncate;
      `);
      console.log("  Ledger immutability triggers safely re-enabled.");
    } catch (err) {
      console.error("  Error re-enabling triggers:", err.message);
    }
  }

  // 5. Reclaim disk space via VACUUM FULL
  console.log("\n5. Running VACUUM FULL to reclaim disk space...");
  const tablesToVacuum = [
    "ledger_entry", "ledger_transaction", "ledger_account", "ledger_balance",
    "duel_event", "duel", "player", "rating", "auth_session"
  ];
  for (const t of tablesToVacuum) {
    try {
      await client.query(`VACUUM FULL ${t};`);
      const sizeRes = await client.query(`SELECT pg_size_pretty(pg_total_relation_size('${t}')) as size;`);
      console.log(`  ${t} size now: ${sizeRes.rows[0].size}`);
    } catch (err) {
      console.warn(`  Vacuum warning on ${t}:`, err.message);
    }
  }

  const after = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size;");
  console.log(`\n=== Deep Cleanup Complete ===`);
  console.log(`Database size after cleanup: ${after.rows[0].size}`);

  await client.end();
}

main().catch(console.error);
