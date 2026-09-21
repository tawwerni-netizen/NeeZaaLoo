import pg from "pg";

const connectionString = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

const pool = new pg.Pool({ connectionString });

async function run() {
  console.log("Checking player mazyaninc...");
  const pRes = await pool.query("SELECT id, handle, created_at FROM player WHERE id = 'mazyaninc'");
  if (pRes.rows.length === 0) {
    console.error("Player mazyaninc not found!");
    return;
  }
  console.log("Player found:", pRes.rows[0]);

  // Ensure referral code exists for mazyaninc
  let codeRes = await pool.query("SELECT code FROM referral_code WHERE player_id = 'mazyaninc'");
  let referralCode = codeRes.rows[0]?.code;
  if (!referralCode) {
    referralCode = "MAZY7531";
    await pool.query(
      "INSERT INTO referral_code (code, player_id) VALUES ($1, 'mazyaninc') ON CONFLICT (player_id) DO UPDATE SET code = $1",
      [referralCode]
    );
    console.log("Created referral code MAZY7531 for mazyaninc");
  } else {
    console.log("Referral code for mazyaninc:", referralCode);
  }

  // Ensure who referred mazyaninc (e.g. Grandmaster Tariq bot_p_001 with code 'TARIQ2026')
  const refByRes = await pool.query("SELECT * FROM referral_attribution WHERE referred_player_id = 'mazyaninc'");
  if (refByRes.rows.length === 0) {
    // Ensure bot_p_001 has a referral code
    const existingBotCode = await pool.query("SELECT code FROM referral_code WHERE player_id = 'bot_p_001'");
    let tariqCode;
    if (existingBotCode.rows.length > 0) {
      tariqCode = existingBotCode.rows[0].code;
    } else {
      tariqCode = 'TARIQ2026';
      await pool.query(
        "INSERT INTO referral_code (code, player_id) VALUES ($1, 'bot_p_001') ON CONFLICT (player_id) DO NOTHING",
        [tariqCode]
      );
    }

    await pool.query(
      `INSERT INTO referral_attribution (referred_player_id, referrer_player_id, referral_code, attributed_at)
       VALUES ('mazyaninc', 'bot_p_001', $1, NOW() - INTERVAL '30 days')
       ON CONFLICT (referred_player_id) DO NOTHING`,
      [tariqCode]
    );
    console.log("Attributed mazyaninc as referred by bot_p_001 (Grandmaster_Tariq)");
  } else {
    console.log("mazyaninc is already referred by:", refByRes.rows[0]);
  }

  // Pick 5 active bots to be referred BY mazyaninc
  const candidateBots = [
    "bot_ar_002",
    "bot_ar_022",
    "bot_en_014",
    "bot_es_003",
    "bot_p_004"
  ];

  for (let i = 0; i < candidateBots.length; i++) {
    const botId = candidateBots[i];
    const botCheck = await pool.query("SELECT id, handle FROM player WHERE id = $1", [botId]);
    if (botCheck.rows.length === 0) continue;

    const daysAgo = (i + 1) * 3;
    await pool.query(
      `INSERT INTO referral_attribution (referred_player_id, referrer_player_id, referral_code, attributed_at)
       VALUES ($1, 'mazyaninc', $2, NOW() - INTERVAL '${daysAgo} days')
       ON CONFLICT (referred_player_id) DO UPDATE
       SET referrer_player_id = 'mazyaninc', referral_code = $2, attributed_at = NOW() - INTERVAL '${daysAgo} days'`,
      [botId, referralCode]
    );

    console.log(`Linked bot ${botId} (${botCheck.rows[0].handle}) as referred by mazyaninc`);
  }

  // Summary check
  const totalRefs = await pool.query(
    `SELECT ra.referred_player_id, p.handle, ra.attributed_at
     FROM referral_attribution ra
     JOIN player p ON p.id = ra.referred_player_id
     WHERE ra.referrer_player_id = 'mazyaninc'
     ORDER BY ra.attributed_at DESC`
  );
  console.log("Total referrals for mazyaninc:", totalRefs.rows);

  await pool.end();
}

run().catch((err) => {
  console.error("Error seeding referrals:", err);
  pool.end();
});
