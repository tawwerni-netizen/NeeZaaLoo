import pg from "pg";

const connectionString = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

const CLANS = [
  {
    id: "clan_desert_knights",
    name: "فرسان الصحراء",
    tag: "[DK]",
    logo: "⚔️",
    description: "عشيرة النخبة لأساتذة الشطرنج والألعاب التكتيكية، لا مكان فيها إلا للأبطال.",
    global_elo: 2850,
    owner_id: "bot_p_001", // Grandmaster_Tariq
  },
  {
    id: "clan_arena_hawks",
    name: "صقور الأرينا",
    tag: "[HWK]",
    logo: "🦅",
    description: "صقور الأرينا للسرعة والحساب الذهني والمواجهات الخاطفة، نحلق دائماً في الصدارة.",
    global_elo: 2780,
    owner_id: "bot_p_006", // Apex_Tactician
  },
  {
    id: "clan_mind_kings",
    name: "ملوك العقل والذكاء",
    tag: "[MK]",
    logo: "👑",
    description: "أقوى تحالف عربي وعالمي في ألعاب الطاولة والدومينو والسيجة الاستراتيجية.",
    global_elo: 2910,
    owner_id: "bot_p_003", // Sultan_Of_Mind
  },
  {
    id: "clan_nizalo_legends",
    name: "أساطير نيزالو",
    tag: "[NZL]",
    logo: "🔥",
    description: "أساطير التحديات الكبرى والبطولات النارية، ننافس بشرف وننتصر بمهارة.",
    global_elo: 2690,
    owner_id: "bot_p_002", // KingSlayer_EG
  },
];

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to Supabase!");

  try {
    // 1. Clean existing clan members & clans if any
    await client.query("UPDATE player SET clan_id = NULL WHERE clan_id IS NOT NULL;");
    await client.query("DELETE FROM clan_member;");
    await client.query("DELETE FROM clan_invite;");
    await client.query("DELETE FROM clan;");
    console.log("Cleaned existing clans and clan memberships.");

    // 2. Insert the 4 clans
    for (const c of CLANS) {
      await client.query(`
        INSERT INTO clan (id, name, tag, logo, description, global_elo, owner_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          tag = EXCLUDED.tag,
          logo = EXCLUDED.logo,
          description = EXCLUDED.description,
          global_elo = EXCLUDED.global_elo,
          owner_id = EXCLUDED.owner_id;
      `, [c.id, c.name, c.tag, c.logo, c.description, c.global_elo, c.owner_id]);
      console.log(`Created clan: ${c.name} ${c.tag} (Owner: ${c.owner_id})`);
    }

    // 3. Fetch all 204 bots
    const botRes = await client.query(`
      SELECT id, handle FROM player WHERE is_ai = TRUE ORDER BY id ASC;
    `);
    const bots = botRes.rows;
    console.log(`Found ${bots.length} bots to distribute among 4 clans.`);

    // 4. Distribute bots evenly across the 4 clans (approx 51 bots each)
    let assignedCount = 0;
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      const clanIndex = i % CLANS.length;
      const clan = CLANS[clanIndex];
      const isOwner = bot.id === clan.owner_id;
      const isOfficer = !isOwner && i < 24; // Some top bots as officers
      const role = isOwner ? "OWNER" : (isOfficer ? "OFFICER" : "MEMBER");

      // Insert clan member
      await client.query(`
        INSERT INTO clan_member (clan_id, player_id, role, joined_at)
        VALUES ($1, $2, $3, NOW() - (INTERVAL '1 day' * $4))
        ON CONFLICT (clan_id, player_id) DO UPDATE SET role = EXCLUDED.role;
      `, [clan.id, bot.id, role, Math.floor(Math.random() * 30)]);

      // Update player clan_id
      await client.query(`
        UPDATE player SET clan_id = $1 WHERE id = $2;
      `, [clan.id, bot.id]);

      assignedCount++;
    }

    console.log(`Assigned ${assignedCount} bots across the 4 clans.`);

    // 5. Verification
    const summary = await client.query(`
      SELECT c.id, c.name, c.tag, c.logo, c.global_elo,
             count(cm.player_id)::int as members_count
      FROM clan c
      LEFT JOIN clan_member cm ON cm.clan_id = c.id
      GROUP BY c.id, c.name, c.tag, c.logo, c.global_elo
      ORDER BY c.global_elo DESC;
    `);

    console.log("\n=== Clans Summary in Database ===");
    console.table(summary.rows);

  } finally {
    await client.end();
  }
}

main().catch(console.error);
