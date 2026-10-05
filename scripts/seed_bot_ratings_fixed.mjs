import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl, max: 20 });

async function run() {
  const games = ['chess', 'tic_tac_toe', 'connect_four'];
  const res = await pool.query("SELECT id FROM player WHERE id LIKE 'bot_%'");
  
  let count = 0;
  for (const row of res.rows) {
    for (const game of games) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      num = num / 10.0 + 0.5;
      if (num < 0 || num > 1) num = Math.random();
      
      const rating = Math.floor(800 + (num * 2000));
      const rating_x100 = rating * 100;
      
      const games_played = Math.floor(Math.random() * 3000);
      const rd_x100 = 3000 + Math.floor(Math.random() * 5000);
      
      try {
        await pool.query(
          `INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, vol_x100, games_played)
           VALUES ($1, $2, $3, $4, 6, $5)
           ON CONFLICT (player_id, game_id) DO UPDATE SET
           rating_x100 = EXCLUDED.rating_x100,
           rd_x100 = EXCLUDED.rd_x100,
           games_played = EXCLUDED.games_played`,
          [row.id, game, rating_x100, rd_x100, games_played]
        );
      } catch(err) {
        if (err.message.includes('vol_x100')) {
             await pool.query(
              `INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (player_id, game_id) DO UPDATE SET
               rating_x100 = EXCLUDED.rating_x100,
               rd_x100 = EXCLUDED.rd_x100,
               games_played = EXCLUDED.games_played`,
              [row.id, game, rating_x100, rd_x100, games_played]
            );
        } else {
            console.error(err.message);
        }
      }
    }
    count++;
    if (count % 50 === 0) console.log(`Processed ${count} bots`);
  }
  console.log(`Updated ratings for ${count} bots.`);
}

run().finally(() => pool.end());
