/**
/**
 * Programmatic seeder for 600 AI personas, ratings, and double-entry ledger wallets.
 * Seeds 10,000 USDT (10,000,000,000 minor units) for each bot.
 */
import { ALL_BOT_PERSONAS, ALL_GAMES } from "./personas.mjs";

export const FUNDING_AMOUNT_USDT_MINOR = 10_000_000_000n; // 10,000 USDT

// Designate the top 200 Standing-By bots:
// 100 Arabic personas (diverse Arab countries) + 50 English + 25 Spanish + 25 French
export const STANDING_BY_BOT_IDS = new Set([
  ...ALL_BOT_PERSONAS.filter((b) => b.language === "ar").map((b) => b.id),
  ...ALL_BOT_PERSONAS.filter((b) => b.language === "en").slice(0, 50).map((b) => b.id),
  ...ALL_BOT_PERSONAS.filter((b) => b.language === "es").slice(0, 25).map((b) => b.id),
  ...ALL_BOT_PERSONAS.filter((b) => b.language === "fr").slice(0, 25).map((b) => b.id),
]);

export async function seedBotsAndFund(db) {
  let createdCount = 0;
  let fundedCount = 0;

  // Rename legacy bots to real human handles without numbers
  await db.query(`
    UPDATE player SET handle = 'Karim_AlMasry', bio = 'لاعب شطرنج هاوٍ يعشق التكتيكات السريعة ♟️' WHERE id = 'ai-easy';
    UPDATE player SET handle = 'Tariq_AlKhaled', bio = 'منافس دائم على بطولات الطاولة والشطرنج 🎲' WHERE id = 'ai-medium';
    UPDATE player SET handle = 'Sultan_AlGhamdi', bio = 'محترف استراتيجيات وألعاب لوحية، 1850 ELO ⚡' WHERE id = 'ai-hard';
    UPDATE player SET handle = 'Farouk_AlSharif', bio = 'جراند ماستر، بطل بطولات نيزالو 👑' WHERE id = 'ai-expert';
  `);

  for (const bot of ALL_BOT_PERSONAS) {
    // 1. Insert or update player
    await db.query(
      `INSERT INTO player (id, handle, is_ai, bio)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (id) DO UPDATE
         SET handle = EXCLUDED.handle,
             is_ai = TRUE,
             bio = EXCLUDED.bio`,
      [bot.id, bot.handle, `${bot.country} • ${bot.dialect}`]
    );
    createdCount++;

    // 2. Open user wallet for USDT
    await db.query("SELECT ledger_open_user_wallet($1, 'USDT')", [bot.id]);

    // 3. Seed rating across all launch games
    for (const gameId of ALL_GAMES) {
      const rating = (bot.gameRatings?.[gameId] ?? bot.rating) * 100;
      await db.query(
        `INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, volatility_x1e6, games_played, last_played_at)
         VALUES ($1, $2, $3, 6500, 60000, $4, now() - interval '1 hour')
         ON CONFLICT (player_id, game_id) DO UPDATE
           SET rating_x100 = EXCLUDED.rating_x100,
               games_played = EXCLUDED.games_played`,
        [bot.id, gameId, rating, bot.totalMatches]
      );
    }

    // 4. Fund 10,000 USDT into user:bot.id:available if balance < 10,000 USDT
    const balRes = await db.query(
      `SELECT COALESCE(b.balance, 0) AS balance
         FROM ledger_account a
         LEFT JOIN ledger_balance b ON b.account_id = a.id
        WHERE a.key = $1 AND a.asset = 'USDT'`,
      [`user:${bot.id}:available`]
    );
    const curBal = BigInt(balRes.rows[0]?.balance ?? 0);

    if (curBal < FUNDING_AMOUNT_USDT_MINOR) {
      const needed = FUNDING_AMOUNT_USDT_MINOR - curBal;
      await db.query(
        `SELECT ledger_post(
           $1, 'ADJUSTMENT', 'ADMIN', 'admin-system', $2::jsonb, 'USDT', 'Seed bot operational funds (10,000 USDT)'
         )`,
        [
          `seed-bot-node-${bot.id}`,
          JSON.stringify([
            { account: "platform:promotions", amount: needed.toString() },
            { account: `user:${bot.id}:available`, amount: (-needed).toString() },
          ]),
        ]
      );
      fundedCount++;
    }
  }

  return { totalBots: ALL_BOT_PERSONAS.length, createdCount, fundedCount };
}
