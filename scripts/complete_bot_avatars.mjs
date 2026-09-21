/**
 * Updates any legacy bots and super admins in the database with realistic handles and avatars.
 */
const SQL_ENDPOINT = process.env.SQL_ENDPOINT || "https://ep-cold-frog-b2dicy1p-pooler.c-6.eu-central-1.aws.neon.tech/sql";
const NEON_CONN_STRING = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_ABH8MueOg6Qd@ep-cold-frog-b2dicy1p-pooler.c-6.eu-central-1.aws.neon.tech/neondb";

async function main() {
  const updates = [
    "UPDATE player SET handle = 'Karim_AlMasry', bio = 'لاعب شطرنج هاوٍ يعشق التكتيكات السريعة ♟️' WHERE id = 'ai-easy'",
    "UPDATE player SET handle = 'Tariq_AlKhaled', bio = 'منافس دائم على بطولات الطاولة والشطرنج 🎲' WHERE id = 'ai-medium'",
    "UPDATE player SET handle = 'Sultan_AlGhamdi', bio = 'محترف استراتيجيات وألعاب لوحية، 1850 ELO ⚡' WHERE id = 'ai-hard'",
    "UPDATE player SET handle = 'Farouk_AlSharif', bio = 'جراند ماستر، بطل بطولات نيزالو 👑' WHERE id = 'ai-expert'",
    "UPDATE player SET avatar_key = 'https://randomuser.me/api/portraits/men/1.jpg' WHERE id = 'logoxpress_eg' AND (avatar_key IS NULL OR avatar_key = '')",
    "UPDATE player SET avatar_key = 'https://randomuser.me/api/portraits/men/32.jpg' WHERE id = 'tawwerni' AND (avatar_key IS NULL OR avatar_key = '')"
  ];

  for (const q of updates) {
    const res = await fetch(SQL_ENDPOINT, {
      method: "POST",
      headers: { "neon-connection-string": NEON_CONN_STRING, "content-type": "application/json" },
      body: JSON.stringify({ query: q })
    });
    const data = await res.json();
    if (!res.ok) console.error("Error on query:", q, data);
  }

  // Check profiles without avatar
  const checkRes = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: { "neon-connection-string": NEON_CONN_STRING, "content-type": "application/json" },
    body: JSON.stringify({
      query: "SELECT id, handle, is_ai, avatar_key FROM player WHERE avatar_key IS NULL OR avatar_key = '';"
    })
  });
  const checkData = await checkRes.json();
  console.log("Remaining profiles without avatar in DB:", checkData.rows);

  const totalRes = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: { "neon-connection-string": NEON_CONN_STRING, "content-type": "application/json" },
    body: JSON.stringify({
      query: "SELECT count(*) as total, count(avatar_key) as with_avatar FROM player;"
    })
  });
  const totalData = await totalRes.json();
  console.log("Total players in DB:", totalData.rows);
}

main().catch(console.error);
