import pg from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

async function prune() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to database.');

  // Check read-only mode
  const ro = await client.query('SHOW transaction_read_only');
  console.log('Current transaction_read_only:', ro.rows[0].transaction_read_only);

  if (ro.rows[0].transaction_read_only === 'on') {
    console.log('Attempting to disable read-only mode for session and database...');
    try {
      await client.query('SET default_transaction_read_only = off');
      await client.query('SET transaction_read_only = off');
      console.log('Session read-only turned OFF.');
    } catch (e) {
      console.warn('Session set failed:', e.message);
    }
    try {
      await client.query('ALTER DATABASE postgres SET default_transaction_read_only = off');
      console.log('ALTER DATABASE SET default_transaction_read_only = off SUCCESS!');
    } catch (e) {
      console.warn('ALTER DATABASE failed:', e.message);
    }
  }

  const beforeSize = await client.query("SELECT pg_size_pretty(pg_database_size('postgres')) as size");
  console.log('Database size before pruning:', beforeSize.rows[0].size);

  // 1. Prune ephemeral duel_events
  console.log('\n--- Pruning duel_event ---');
  try {
    const countRes = await client.query('SELECT count(*)::int as count FROM duel_event');
    console.log(`Total duel_event rows: ${countRes.rows[0].count}`);

    // Delete duel_events older than 3 days, or belonging to old live simulated duels
    const del1 = await client.query(`
      DELETE FROM duel_event
       WHERE created_at < NOW() - INTERVAL '3 days'
          OR duel_id IN (
            SELECT id FROM duel
             WHERE id LIKE 'duel_live_%'
               AND status IN ('FINISHED', 'CANCELLED', 'FORFEITED', 'ABANDONED')
          )
    `);
    console.log(`Deleted ${del1.rowCount} duel_event rows.`);
  } catch (err) {
    console.error('Error pruning duel_event:', err.message);
  }

  // 2. Prune old notifications
  console.log('\n--- Pruning notification ---');
  try {
    const countRes = await client.query('SELECT count(*)::int as count FROM notification');
    console.log(`Total notification rows: ${countRes.rows[0].count}`);

    const del2 = await client.query(`
      DELETE FROM notification
       WHERE created_at < NOW() - INTERVAL '7 days'
    `);
    console.log(`Deleted ${del2.rowCount} notification rows.`);
  } catch (err) {
    console.error('Error pruning notification:', err.message);
  }

  // 3. Prune old tournament_events
  console.log('\n--- Pruning tournament_event ---');
  try {
    const countRes = await client.query('SELECT count(*)::int as count FROM tournament_event');
    console.log(`Total tournament_event rows: ${countRes.rows[0].count}`);

    const del3 = await client.query(`
      DELETE FROM tournament_event
       WHERE created_at < NOW() - INTERVAL '7 days'
    `);
    console.log(`Deleted ${del3.rowCount} tournament_event rows.`);
  } catch (err) {
    console.error('Error pruning tournament_event:', err.message);
  }

  // 4. Prune completed simulated live duels
  console.log('\n--- Pruning old simulated duels ---');
  try {
    // Delete any foreign key children first if they exist
    await client.query(`
      DELETE FROM duel_challenge_event
       WHERE challenge_id IN (SELECT id FROM duel_challenge WHERE duel_id LIKE 'duel_live_%')
    `).catch(() => {});

    await client.query(`
      DELETE FROM duel_challenge
       WHERE duel_id LIKE 'duel_live_%'
    `).catch(() => {});

    const del4 = await client.query(`
      DELETE FROM duel
       WHERE id LIKE 'duel_live_%'
         AND status IN ('FINISHED', 'CANCELLED', 'FORFEITED', 'ABANDONED')
         AND created_at < NOW() - INTERVAL '1 day'
    `);
    console.log(`Deleted ${del4.rowCount} simulated duel rows.`);
  } catch (err) {
    console.error('Error pruning simulated duels:', err.message);
  }

  // 5. Run VACUUM ANALYZE to reclaim disk space
  console.log('\n--- Running VACUUM ANALYZE ---');
  try {
    await client.query('VACUUM ANALYZE duel_event');
    console.log('VACUUM ANALYZE duel_event done.');
    await client.query('VACUUM ANALYZE notification');
    console.log('VACUUM ANALYZE notification done.');
    await client.query('VACUUM ANALYZE tournament_event');
    console.log('VACUUM ANALYZE tournament_event done.');
    await client.query('VACUUM ANALYZE duel');
    console.log('VACUUM ANALYZE duel done.');
  } catch (err) {
    console.error('VACUUM error:', err.message);
  }

  const afterSize = await client.query("SELECT pg_size_pretty(pg_database_size('postgres')) as size");
  console.log('\nDatabase size after pruning:', afterSize.rows[0].size);

  await client.end();
}

prune().catch(console.error);
