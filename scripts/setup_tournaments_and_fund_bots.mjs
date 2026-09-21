import pg from 'pg';
import { createPgAdapter } from '../packages/ledger/src/pg-adapter.mjs';
import { createTournamentService } from '../packages/tournament/src/tournament.mjs';
import { GAME_TIME_CONTROLS } from '../packages/tournament/src/automated-engine.mjs';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify',
  ssl: { rejectUnauthorized: false }
});

const db = createPgAdapter(pool);
const tournamentService = createTournamentService(db);

const TARGET_GAMES = [
  { id: 'chess', name: 'الشطرنج الدولي' },
  { id: 'dominoes', name: 'الدومينو الكلاسيكي' },
  { id: 'backgammon', name: 'طاولة الزهر 31' },
  { id: 'speed-math', name: 'تحدي الحساب السريع' },
  { id: 'connect-four', name: 'أربعة على التوالي' },
  { id: 'checkers', name: 'الداما الكلاسيكية' },
  { id: 'xo', name: 'إكس أو الأرينا' },
  { id: 'reversi', name: 'ريفيرسي الذكاء' },
  { id: 'gomoku', name: 'جوموكو الأبطال' },
  { id: 'seega', name: 'السيجة التراثية' },
];

async function fundAllBots() {
  console.log('=== STEP 1: Provisioning and Funding AI Bots ===');
  const botRows = await pool.query(`
    SELECT id FROM player WHERE is_ai = TRUE ORDER BY id ASC
  `);
  console.log(`Found ${botRows.rows.length} AI bots.`);

  let fundedCount = 0;
  for (const bot of botRows.rows) {
    const botId = bot.id;
    // 1. Open wallet
    await pool.query(`SELECT ledger_open_user_wallet($1, 'USDT')`, [botId]);

    // 2. Check balance
    const balRes = await pool.query(`
      SELECT ledger_natural_balance(la.normal_side, lb.balance) as balance
        FROM ledger_account la
        JOIN ledger_balance lb ON lb.account_id = la.id
       WHERE la.key = $1 AND la.asset = 'USDT'
    `, [`user:${botId}:available`]);

    const currentBal = balRes.rows[0]?.balance ? BigInt(balRes.rows[0].balance) : 0n;
    if (currentBal < 500_000_000n) { // Less than 500 USDT
      const topUpMinor = 1_000_000_000n; // 1,000 USDT
      try {
        await pool.query(`
          SELECT ledger_post(
            $1,
            'DEPOSIT',
            'SYSTEM',
            NULL,
            $2::jsonb,
            'USDT',
            'bot auto bankroll funding',
            'bot',
            $3
          )
        `, [
          `seed:bankroll:${botId}:${Date.now()}`,
          JSON.stringify([
            { account: 'platform:custody:USDT:TRON', amount: topUpMinor.toString() },
            { account: `user:${botId}:available`, amount: (-topUpMinor).toString() }
          ]),
          botId
        ]);
        fundedCount++;
      } catch (e) {
        console.error(`Failed to fund bot ${botId}:`, e.message);
      }
    }
  }
  console.log(`Funded/Verified ${botRows.rows.length} bots (newly funded: ${fundedCount}).`);
}

async function ensureTournaments() {
  console.log('=== STEP 2: Creating Active Tournaments for All 10 Games ===');
  const closesAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

  for (const game of TARGET_GAMES) {
    const timeControl = GAME_TIME_CONTROLS[game.id] || { initialSeconds: 180, incrementSeconds: 2 };

    // --- 1. FREE TOURNAMENT ---
    const freeRes = await pool.query(`
      SELECT id, status,
             (SELECT count(*)::int FROM tournament_registration tr WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') as registered_count
        FROM tournament t
       WHERE game_id = $1 AND tier = 'FREE' AND status = 'REGISTRATION'
       ORDER BY created_at DESC LIMIT 1
    `, [game.id]);

    let freeTourId;
    let freeCount = 0;

    if (freeRes.rows.length === 0) {
      console.log(`Creating Free Tournament for ${game.name} (${game.id})...`);
      const created = await tournamentService.create({
        gameId: game.id,
        format: 'SINGLE_ELIMINATION',
        tier: 'FREE',
        entryFeeMinor: 0n,
        asset: 'USDT',
        capacity: 16,
        minPlayers: 16,
        timeControl,
        registrationClosesAt: closesAt,
        scheduledStartsAt: closesAt,
        title: `بطولة ${game.name} التنافسية الكبرى [دخول مجاني]`,
        description: `بطولة رسمية بنظام خروج المغلوب لـ 16 لاعباً. دخول مجاني 100% لإثبات المهارة والارتقاء في تصنيف ELO وربح نقاط الشرف.`,
        prizeStructure: [],
        createdBy: 'system-official',
        visibility: 'PUBLIC'
      });
      if (created.ok) {
        await tournamentService.openRegistration(created.tournamentId);
        freeTourId = created.tournamentId;
        console.log(`  -> Created Free Tournament: ${freeTourId}`);
      } else {
        console.error(`  -> Failed to create Free Tournament:`, created.reason);
      }
    } else {
      freeTourId = freeRes.rows[0].id;
      freeCount = freeRes.rows[0].registered_count;
      console.log(`Found existing Free Tournament for ${game.id}: ${freeTourId} (${freeCount}/16 players)`);
    }

    // Register bots in FREE tournament (target: 12-13 bots, leaving 3-4 spots for humans)
    if (freeTourId && freeCount < 13) {
      const needed = 13 - freeCount;
      const eligibleBots = await pool.query(`
        SELECT p.id, COALESCE(r.rating_x100, 185000) AS rating_x100
          FROM player p
          LEFT JOIN rating r ON r.player_id = p.id AND r.game_id = $1
         WHERE p.is_ai = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM tournament_registration tr
              WHERE tr.tournament_id = $2 AND tr.player_id = p.id
           )
         ORDER BY random()
         LIMIT $3
      `, [game.id, freeTourId, needed]);

      let added = 0;
      for (const bot of eligibleBots.rows) {
        const reg = await tournamentService.register({
          tournamentId: freeTourId,
          playerId: bot.id,
          ratingX100: Number(bot.rating_x100)
        });
        if (reg.ok) added++;
      }
      console.log(`  -> Registered ${added} bots in Free Tournament (Total: ${freeCount + added}/16).`);
    }

    // --- 2. CASH TOURNAMENT ($10 USDT) ---
    const cashRes = await pool.query(`
      SELECT id, status,
             (SELECT count(*)::int FROM tournament_registration tr WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') as registered_count
        FROM tournament t
       WHERE game_id = $1 AND tier = 'CASH' AND entry_fee_minor = 10000000 AND status = 'REGISTRATION'
       ORDER BY created_at DESC LIMIT 1
    `, [game.id]);

    let cashTourId;
    let cashCount = 0;

    if (cashRes.rows.length === 0) {
      console.log(`Creating $10 Cash Tournament for ${game.name} (${game.id})...`);
      const created = await tournamentService.create({
        gameId: game.id,
        format: 'SINGLE_ELIMINATION',
        tier: 'CASH',
        entryFeeMinor: 10_000_000n,
        asset: 'USDT',
        capacity: 16,
        minPlayers: 16,
        timeControl,
        registrationClosesAt: closesAt,
        scheduledStartsAt: closesAt,
        title: `كأس أبطال ${game.name} [$10 USDT]`,
        description: `بطولة كاش رسمية بنظام خروج المغلوب لـ 16 لاعباً. إجمالي الوعاء 160 USDT. البطل يحصد 88% ($140.80 USDT) مع سحب فوري للأرباح.`,
        prizeStructure: [{ rank: 1, bps: 10000 }],
        createdBy: 'system-official',
        visibility: 'PUBLIC'
      });
      if (created.ok) {
        await tournamentService.openRegistration(created.tournamentId);
        cashTourId = created.tournamentId;
        console.log(`  -> Created Cash Tournament: ${cashTourId}`);
      } else {
        console.error(`  -> Failed to create Cash Tournament:`, created.reason);
      }
    } else {
      cashTourId = cashRes.rows[0].id;
      cashCount = cashRes.rows[0].registered_count;
      console.log(`Found existing Cash Tournament for ${game.id}: ${cashTourId} (${cashCount}/16 players)`);
    }

    // Register bots in CASH tournament (target: 12-13 bots, leaving 3-4 spots for humans)
    if (cashTourId && cashCount < 13) {
      const needed = 13 - cashCount;
      const eligibleBots = await pool.query(`
        SELECT p.id, COALESCE(r.rating_x100, 195000) AS rating_x100
          FROM player p
          LEFT JOIN rating r ON r.player_id = p.id AND r.game_id = $1
          JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = 'USDT'
          JOIN ledger_balance lb ON lb.account_id = la.id AND ledger_natural_balance(la.normal_side, lb.balance) >= 10000000
         WHERE p.is_ai = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM tournament_registration tr
              WHERE tr.tournament_id = $2 AND tr.player_id = p.id
           )
         ORDER BY random()
         LIMIT $3
      `, [game.id, cashTourId, needed]);

      let added = 0;
      for (const bot of eligibleBots.rows) {
        const reg = await tournamentService.register({
          tournamentId: cashTourId,
          playerId: bot.id,
          ratingX100: Number(bot.rating_x100)
        });
        if (reg.ok) added++;
        else console.log(`  Bot registration error:`, reg);
      }
      console.log(`  -> Registered ${added} bots in Cash Tournament (Total: ${cashCount + added}/16).`);
    }
  }
}

async function balanceClans() {
  console.log('=== STEP 3: Ensuring Exactly 50 Members per Clan ===');
  const clans = [
    { id: 'clan_desert_knights', name: 'فرسان الصحراء' },
    { id: 'clan_arena_hawks', name: 'صقور الأرينا' },
    { id: 'clan_mind_kings', name: 'ملوك العقل والذكاء' },
    { id: 'clan_nizalo_legends', name: 'أساطير نيزالو' }
  ];

  // Get all AI bots
  const allBots = await pool.query(`
    SELECT id FROM player WHERE is_ai = TRUE ORDER BY id ASC
  `);

  // Clear existing clan_member and player.clan_id
  await pool.query(`DELETE FROM clan_member`);
  await pool.query(`UPDATE player SET clan_id = NULL WHERE is_ai = TRUE`);

  // Distribute exactly 50 bots into each clan
  for (let cIdx = 0; cIdx < clans.length; cIdx++) {
    const clan = clans[cIdx];
    const clanBots = allBots.rows.slice(cIdx * 50, (cIdx + 1) * 50);

    for (let i = 0; i < clanBots.length; i++) {
      const botId = clanBots[i].id;
      const role = i === 0 ? 'LEADER' : (i < 5 ? 'CO_LEADER' : (i < 15 ? 'ELDER' : 'MEMBER'));
      await pool.query(`
        INSERT INTO clan_member (clan_id, player_id, role, joined_at)
        VALUES ($1, $2, $3, now())
      `, [clan.id, botId, role]);
      await pool.query(`
        UPDATE player SET clan_id = $1 WHERE id = $2
      `, [clan.id, botId]);
    }
    console.log(`Clan ${clan.name} populated with exactly ${clanBots.length} members.`);
  }

  // Update bot_platform_config
  await pool.query(`
    UPDATE bot_platform_config
       SET value = jsonb_build_object(
         'enabled', true,
         'reserved_seats', 3,
         'max_wait_minutes', 15,
         'fill_interval_seconds', 20
       ),
       updated_at = now()
     WHERE key = 'tournaments'
  `);
  console.log('Updated bot_platform_config for tournaments.');
}

async function main() {
  await fundAllBots();
  await ensureTournaments();
  await balanceClans();

  // Final summary verification
  const tSummary = await pool.query(`
    SELECT t.game_id, t.tier, t.title, t.status,
           (SELECT count(*)::int FROM tournament_registration tr WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') as registered_count
      FROM tournament t
     WHERE t.status = 'REGISTRATION'
     ORDER BY t.game_id, t.tier
  `);
  console.log('\n=== FINAL ACTIVE TOURNAMENTS ===');
  console.table(tSummary.rows);

  const cSummary = await pool.query(`
    SELECT c.name, c.tag, c.global_elo, count(cm.player_id)::int as members_count
      FROM clan c
      LEFT JOIN clan_member cm ON cm.clan_id = c.id
     GROUP BY c.id, c.name, c.tag, c.global_elo
     ORDER BY c.global_elo DESC
  `);
  console.log('\n=== FINAL CLANS STATUS ===');
  console.table(cSummary.rows);

  await pool.end();
  console.log('\nAll done successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
