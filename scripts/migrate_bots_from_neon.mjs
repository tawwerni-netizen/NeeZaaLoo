import { Pool } from 'pg';

const neonConn = 'postgresql://neondb_owner:npg_ABH8MueOg6Qd@ep-cold-frog-b2dicy1p-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const supabaseConn = 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify';

async function main() {
  console.log('Connecting to Neon and Supabase...');
  const neon = new Pool({ connectionString: neonConn, max: 1 });
  const supabase = new Pool({ connectionString: supabaseConn, max: 1 });

  try {
    // 1. Fetch bots from Neon
    console.log('Fetching bot accounts from Neon...');
    const botRes = await neon.query(`
      SELECT * FROM player 
       WHERE is_ai IS TRUE 
          OR id LIKE 'bot_%' 
          OR id LIKE 'top_p_%'
          OR handle LIKE '%_%'
       ORDER BY created_at ASC;
    `);
    console.log(`Found ${botRes.rows.length} bots in Neon.`);

    if (botRes.rows.length === 0) {
      // Let's check all players in Neon
      const allPlayers = await neon.query(`SELECT id, handle, is_ai FROM player;`);
      console.log(`Total players in Neon: ${allPlayers.rows.length}`);
      console.log('Sample players in Neon:', allPlayers.rows.slice(0, 10));
    }

    const botIds = botRes.rows.map(b => b.id);

    // 2. Fetch ratings for these bots from Neon
    let ratings = [];
    if (botIds.length > 0) {
      const ratingRes = await neon.query(`
        SELECT * FROM rating WHERE player_id = ANY($1::text[]);
      `, [botIds]);
      ratings = ratingRes.rows;
      console.log(`Found ${ratings.length} ratings for bots in Neon.`);
    }

    // 3. Upsert into Supabase
    console.log('Upserting bots into Supabase...');
    for (const bot of botRes.rows) {
      const cols = Object.keys(bot);
      const vals = Object.values(bot);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const updateCols = cols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

      const query = `
        INSERT INTO player (${cols.map(c => `"${c}"`).join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateCols};
      `;
      await supabase.query(query, vals);
    }
    console.log(`Successfully migrated ${botRes.rows.length} bot accounts to Supabase!`);

    if (ratings.length > 0) {
      console.log('Upserting bot ratings into Supabase...');
      for (const r of ratings) {
        const cols = Object.keys(r);
        const vals = Object.values(r);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateCols = cols.filter(c => c !== 'player_id' && c !== 'game_id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

        const query = `
          INSERT INTO rating (${cols.map(c => `"${c}"`).join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (player_id, game_id) DO UPDATE SET ${updateCols};
        `;
        await supabase.query(query, vals);
      }
      console.log(`Successfully migrated ${ratings.length} ratings to Supabase!`);
    }

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await neon.end();
    await supabase.end();
  }
}

main().catch(console.error);
