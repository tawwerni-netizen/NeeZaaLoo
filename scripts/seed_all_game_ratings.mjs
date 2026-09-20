import pg from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

const ALL_GAMES = [
  'chess',
  'dominoes',
  'backgammon',
  'speed-math',
  'xo',
  'connect-four',
  'checkers',
  'reversi',
  'gomoku',
  'seega'
];

async function seedRatings() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2
  });

  try {
    console.log('Fetching all bot players...');
    const res = await pool.query("SELECT id, handle FROM player WHERE id LIKE 'bot_%' ORDER BY id");
    console.log(`Found ${res.rows.length} bots.`);

    if (res.rows.length === 0) {
      console.log('No bots found. Exiting.');
      return;
    }

    const allRows = [];
    for (const bot of res.rows) {
      // Each bot plays 3 to 6 random games out of the 10 games
      const numGames = 3 + Math.floor(Math.random() * 4);
      const shuffledGames = [...ALL_GAMES].sort(() => 0.5 - Math.random()).slice(0, numGames);

      for (const gameId of shuffledGames) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        const rating = Math.min(2400, Math.max(1000, Math.round(1450 + z * 280)));
        const rating_x100 = rating * 100;
        const rd_x100 = Math.round(5000 + Math.random() * 6000); // <= 11000 for established
        const games_played = Math.floor(15 + Math.random() * 250); // >= 10 for established

        allRows.push({
          playerId: bot.id,
          gameId,
          rating_x100,
          rd_x100,
          games_played
        });
      }
    }

    console.log(`Total rating records to insert: ${allRows.length}`);

    // Insert in batches of 250 rows for blazing speed
    const batchSize = 250;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const chunk = allRows.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      chunk.forEach((row, idx) => {
        const offset = idx * 5;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
        values.push(row.playerId, row.gameId, row.rating_x100, row.rd_x100, row.games_played);
      });

      const sql = `
        INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (player_id, game_id) DO UPDATE SET
          rating_x100 = EXCLUDED.rating_x100,
          rd_x100 = EXCLUDED.rd_x100,
          games_played = EXCLUDED.games_played
      `;

      await pool.query(sql, values);
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(allRows.length / batchSize)}`);
    }

    console.log(`Successfully seeded ${allRows.length} ratings across all 10 games!`);
  } finally {
    await pool.end();
  }
}

seedRatings().catch(console.error);
