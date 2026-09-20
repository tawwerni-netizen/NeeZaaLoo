import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Supabase on port 6543!');

  const appliedRes = await client.query('SELECT filename FROM schema_migration');
  const applied = new Set(appliedRes.rows.map(r => r.filename));
  console.log('Currently applied migrations count:', applied.size);

  const migrationsToRun = [
    '0067_clans_and_guilds.sql',
    '0068_clean_bot_handles_no_numbers.sql',
    '0069_sync_clean_bot_handles.sql'
  ];

  for (const filename of migrationsToRun) {
    if (applied.has(filename)) {
      console.log(`Migration ${filename} already applied. Skipping.`);
      continue;
    }

    console.log(`Applying migration ${filename}...`);
    const filePath = path.join(process.cwd(), 'db', 'migrations', filename);
    const sql = fs.readFileSync(filePath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Successfully applied ${filename}!`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Failed to apply ${filename}:`, err);
      throw err;
    }
  }

  // Verify bots after migration 0069
  console.log('\n--- Verifying bots after migration ---');
  const totalBots = await client.query("SELECT count(*) FROM player WHERE is_ai = true OR id LIKE 'bot_%'");
  console.log('Total bots in player table:', totalBots.rows[0].count);

  const withNums = await client.query("SELECT count(*) FROM player WHERE (is_ai = true OR id LIKE 'bot_%') AND handle ~ '[0-9]'");
  console.log('Bots with numbers in handle:', withNums.rows[0].count);

  const sampleBots = await client.query("SELECT id, handle, display_name FROM player WHERE is_ai = true OR id LIKE 'bot_%' ORDER BY id LIMIT 10");
  console.log('Sample bot handles:\n', sampleBots.rows);

  // Check leaderboard query
  const leaderboardSample = await client.query(`
    SELECT p.id AS player_id, p.handle, p.avatar_key, p.selected_badge_code,
            COALESCE(MAX(r.rating_x100), 150000) AS rating_x100,
            COALESCE(SUM(r.games_played), 0)::int AS games_played
        FROM player p
        JOIN rating r ON r.player_id = p.id
      WHERE p.handle NOT LIKE 'ai_%'
        AND p.handle NOT LIKE 'test_%'
      GROUP BY p.id, p.handle, p.avatar_key, p.selected_badge_code
      ORDER BY rating_x100 DESC, games_played DESC, p.created_at ASC
      LIMIT 10
  `);
  console.log('\nTop 10 on Leaderboard (game=all):\n', leaderboardSample.rows);

  await client.end();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
