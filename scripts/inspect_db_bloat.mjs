import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log("=== 1. Total Database Size ===");
  const dbSizeRes = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes;");
  console.log("Total DB Size:", dbSizeRes.rows[0]);

  console.log("\n=== 2. Size by Schema ===");
  const schemaRes = await client.query(`
    SELECT
      n.nspname AS schema_name,
      pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS total_size,
      SUM(pg_total_relation_size(c.oid)) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'm')
    GROUP BY n.nspname
    ORDER BY bytes DESC;
  `);
  for (const r of schemaRes.rows) {
    console.log(`  ${r.schema_name.padEnd(25)} ${r.total_size}`);
  }

  console.log("\n=== 3. Top 25 Largest Tables Across All Schemas ===");
  const topTables = await client.query(`
    SELECT
      n.nspname AS schema,
      c.relname AS table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
      pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
      c.reltuples::bigint AS estimated_row_count,
      pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'm')
    ORDER BY bytes DESC
    LIMIT 25;
  `);
  for (const r of topTables.rows) {
    console.log(`  ${(r.schema + "." + r.table_name).padEnd(35)} Total: ${r.total_size.padEnd(10)} Table: ${r.table_size.padEnd(10)} Indexes: ${r.index_size.padEnd(10)} Rows: ~${r.estimated_row_count}`);
  }

  console.log("\n=== 4. Dead Tuples (Bloat) in Top Tables ===");
  const deadRes = await client.query(`
    SELECT
      schemaname,
      relname,
      n_live_tup,
      n_dead_tup,
      ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio,
      last_vacuum,
      last_autovacuum
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
    LIMIT 15;
  `);
  for (const r of deadRes.rows) {
    console.log(`  ${(r.schemaname + "." + r.relname).padEnd(30)} Live: ${String(r.n_live_tup).padEnd(8)} Dead: ${String(r.n_dead_tup).padEnd(8)} Dead%: ${r.dead_ratio || 0}%`);
  }

  await client.end();
}

main().catch(console.error);
