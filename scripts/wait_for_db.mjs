import pg from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

async function pollDb() {
  const url = process.env.DATABASE_URL;
  console.log('Connecting to database...');
  for (let i = 1; i <= 12; i++) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      console.log(`[Attempt ${i}] Connected successfully!`);
      const ro = await client.query('SHOW transaction_read_only');
      console.log('transaction_read_only:', ro.rows[0]);
      const defRo = await client.query('SHOW default_transaction_read_only');
      console.log('default_transaction_read_only:', defRo.rows[0]);
      const dbSize = await client.query("SELECT pg_size_pretty(pg_database_size('postgres')) as size");
      console.log('Database size:', dbSize.rows[0].size);
      await client.end();
      return true;
    } catch (err) {
      console.log(`[Attempt ${i}] Error: ${err.message} (${err.code || 'no code'})`);
      try { await client.end(); } catch (_) {}
      if (i < 12) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  return false;
}

pollDb().then(ok => {
  if (!ok) console.log('Database still not ready after 60 seconds.');
  process.exit(ok ? 0 : 1);
});
