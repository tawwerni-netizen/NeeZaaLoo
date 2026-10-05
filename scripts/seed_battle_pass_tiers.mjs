import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    await client.query(`
      INSERT INTO battle_pass_tier (
        season_id, level, required_exp, 
        free_reward_type, free_reward_asset, free_reward_amount, 
        premium_reward_type, premium_reward_asset, premium_reward_amount
      )
      VALUES 
        ('season_1', 6, 2500, null, null, null, 'ASSET', 'USDT', 20000000),
        ('season_1', 7, 3000, 'ASSET', 'USDT', 3000000, 'ASSET', 'USDT', 25000000),
        ('season_1', 8, 3500, null, null, null, 'ASSET', 'USDT', 30000000),
        ('season_1', 9, 4000, 'ASSET', 'USDT', 5000000, 'ASSET', 'USDT', 40000000),
        ('season_1', 10, 5000, 'ASSET', 'USDT', 10000000, 'ASSET', 'USDT', 60000000)
      ON CONFLICT (season_id, level) DO UPDATE SET
        required_exp = EXCLUDED.required_exp,
        free_reward_type = EXCLUDED.free_reward_type,
        free_reward_asset = EXCLUDED.free_reward_asset,
        free_reward_amount = EXCLUDED.free_reward_amount,
        premium_reward_type = EXCLUDED.premium_reward_type,
        premium_reward_asset = EXCLUDED.premium_reward_asset,
        premium_reward_amount = EXCLUDED.premium_reward_amount;
    `);

    const res = await client.query(`
      SELECT level, required_exp, free_reward_amount, premium_reward_amount
      FROM battle_pass_tier 
      WHERE season_id = 'season_1' 
      ORDER BY level ASC;
    `);

    console.log("Season 1 Battle Pass Tiers (Levels 1 - 10):");
    console.table(res.rows);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
