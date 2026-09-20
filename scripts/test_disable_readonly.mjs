import pg from 'pg';
const { Client } = pg;

async function testOverride() {
  const client = new Client({
    connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Testing session-level read-only override...');
  try {
    await client.query('SET default_transaction_read_only = off');
    await client.query('SET transaction_read_only = off');
    const check = await client.query('SHOW transaction_read_only');
    console.log('transaction_read_only after SET:', check.rows[0]);

    // Try a simple write test
    await client.query('CREATE TABLE IF NOT EXISTS _test_write (id int)');
    console.log('CREATE TABLE test SUCCESS!');
    await client.query('DROP TABLE IF EXISTS _test_write');
    console.log('DROP TABLE test SUCCESS!');
  } catch (err) {
    console.log('Override failed:', err.message);
  }

  // Can we run ALTER DATABASE postgres SET default_transaction_read_only = off?
  try {
    console.log('Trying ALTER DATABASE...');
    await client.query('ALTER DATABASE postgres SET default_transaction_read_only = off');
    console.log('ALTER DATABASE SUCCESS!');
  } catch (err) {
    console.log('ALTER DATABASE failed:', err.message);
  }

  await client.end();
}

testOverride().catch(console.error);
