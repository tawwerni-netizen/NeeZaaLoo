import pg from 'pg';
const { Client } = pg;

async function tryPort(port) {
  console.log(`Trying port ${port}...`);
  const client = new Client({
    connectionString: `postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:${port}/postgres`,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  });

  try {
    await client.connect();
    console.log(`Port ${port}: Connected successfully!`);

    const migs = await client.query('SELECT filename, applied_at FROM schema_migration ORDER BY applied_at DESC LIMIT 5');
    console.log(`Port ${port}: Latest applied migrations:\n`, migs.rows);

    const bots = await client.query("SELECT count(*) FROM player WHERE is_ai = true OR id LIKE 'bot_%'");
    console.log(`Port ${port}: Total bots in player table:`, bots.rows[0].count);

    const withNums = await client.query("SELECT count(*) FROM player WHERE (is_ai = true OR id LIKE 'bot_%') AND handle ~ '[0-9]'");
    console.log(`Port ${port}: Bots with numbers in handle:`, withNums.rows[0].count);

    await client.end();
    return true;
  } catch (err) {
    console.error(`Port ${port} error:`, err.message);
    await client.end().catch(() => {});
    return false;
  }
}

async function main() {
  const ok5432 = await tryPort(5432);
  if (!ok5432) {
    await tryPort(6543);
  }
}

main();
