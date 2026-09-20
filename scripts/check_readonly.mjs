import pg from 'pg';
const { Client } = pg;

async function check() {
  const client = new Client({
    connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const r1 = await client.query('SHOW default_transaction_read_only');
  console.log('default_transaction_read_only:', r1.rows[0]);

  const r2 = await client.query("SELECT pg_size_pretty(pg_database_size('postgres')) as size");
  console.log('Database size:', r2.rows[0].size);

  const r3 = await client.query("SELECT datname, datconfig FROM pg_database WHERE datname = 'postgres'");
  console.log('Database config:', r3.rows[0]);

  const r4 = await client.query('SHOW in_hot_standby');
  console.log('in_hot_standby:', r4.rows[0]);

  // Can we turn off read only?
  try {
    await client.query('SET default_transaction_read_only = off');
    await client.query('SET transaction_read_only = off');
    console.log('Set transaction_read_only = off SUCCESS in session!');
  } catch (err) {
    console.log('Set transaction_read_only = off FAILED:', err.message);
  }

  await client.end();
}

check().catch(console.error);
