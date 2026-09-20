import pg from 'pg';

const baseUri = 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com';

async function test(port) {
  const url = `${baseUri}:${port}/postgres`;
  console.log(`Testing port ${port}...`);
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 7000, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log(`Port ${port}: CONNECTED!`);
    const r = await client.query('SELECT version(), current_setting(\'transaction_read_only\') as ro;');
    console.log(`Port ${port} result:`, r.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    console.log(`Port ${port} failed: ${err.message} (${err.code})`);
    try { await client.end(); } catch (_) {}
    return false;
  }
}

async function run() {
  await test(6543);
  await test(5432);
}

run();
