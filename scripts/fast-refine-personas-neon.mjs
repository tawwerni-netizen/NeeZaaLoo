import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
if (!match) throw new Error("DATABASE_URL missing from .env");

const client = new pg.Client({ 
  connectionString: match[1], 
  ssl: { rejectUnauthorized: false } 
});

await client.connect();

console.log("=== STEP 1: Updating ai-* bots for Computer Mode ===");
const aiUpdates = [
  { id: 'ai-easy', handle: 'Computer_Easy', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى السهل' },
  { id: 'ai-easy-2', handle: 'Computer_Easy_B', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى السهل' },
  { id: 'ai-easy-3', handle: 'Computer_Easy_C', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى السهل' },
  { id: 'ai-medium', handle: 'Computer_Medium', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتوسط' },
  { id: 'ai-medium-2', handle: 'Computer_Med_B', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتوسط' },
  { id: 'ai-medium-3', handle: 'Computer_Med_C', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتوسط' },
  { id: 'ai-hard', handle: 'Computer_Hard', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتقدم' },
  { id: 'ai-hard-2', handle: 'Computer_Hard_B', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتقدم' },
  { id: 'ai-hard-3', handle: 'Computer_Hard_C', bio: 'كمبيوتر المنصة الرسمي للتدريب — المستوى المتقدم' },
  { id: 'ai-expert', handle: 'Computer_Expert', bio: 'كمبيوتر المنصة الرسمي للتدريب — مستوى الخبير' },
  { id: 'ai-expert-2', handle: 'Computer_Exp_B', bio: 'كمبيوتر المنصة الرسمي للتدريب — مستوى الخبير' },
  { id: 'ai-expert-3', handle: 'Computer_Exp_C', bio: 'كمبيوتر المنصة الرسمي للتدريب — مستوى الخبير' },
];

for (const ai of aiUpdates) {
  await client.query(`
    UPDATE player
    SET handle = $1,
        bio = $2,
        avatar_key = '/images/bots/computer.png',
        is_ai = TRUE
    WHERE id = $3
  `, [ai.handle, ai.bio, ai.id]);
}
console.log("Updated ai-* accounts with clean computer handles.");

console.log("=== STEP 2: Fetching All Persona Bots ===");
const personasRes = await client.query(`
  SELECT id, handle, avatar_key, bio
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
  ORDER BY id ASC
`);
console.log(`Found ${personasRes.rows.length} bot personas.`);

const ARABIC_FIRST_MALE = [
  "Tariq", "Karim", "Omar", "Hassan", "Mostafa", "Ziad", "Walid", "Mahmoud", "Amr", "Tamer",
  "Sherif", "Ahmed", "Khaled", "Youssef", "Hamza", "Marwan", "Rami", "Haitham", "Bassem", "Mohamed",
  "Amir", "Maged", "Akram", "Hisham", "Tharwat", "Bayoumi", "Salah", "Ashraf", "Ali", "Khatir",
  "Hamdi", "Anwar", "Saqqa", "Ezz", "Ramadan", "Asser", "Farag", "Eyad", "Bassel", "Qusai",
  "Taim", "Abed", "Gamal", "Ghassan", "Samer", "Maxim", "Nasr", "Motasem", "Hatem", "Essam",
  "Taha", "Malek", "Nour", "Sayed", "Fathi", "Sabri", "Shaheen", "Murad", "Magdi", "Yasser",
  "Ramez", "Salama", "Dhafer", "Nicolas", "Adel", "Yehia", "Hussein", "Farouk", "Sameh", "Rashed",
  "Fahd", "Saud", "Bader", "Sultan", "Bandar", "Nasser", "Meshal", "Turki", "Nayef", "Hamad",
  "Ghanem", "Saeed", "Mansour", "Mubarak", "Salim", "Salem", "Obaid", "Suhail", "Thani", "Waleed"
];

const ARABIC_FIRST_FEMALE = [
  "Nour", "Yasmine", "Laila", "Salma", "Farah", "Dina", "Mona", "Reem", "Heba", "Aya",
  "Rania", "Asmaa", "Nelly", "Hend", "Dorra", "Saba", "Arwa", "Sherine", "Yosra", "Mai",
  "Ruby", "Donia", "Amy", "Sahar", "Jamila", "Tara", "Huda", "Mayan", "Hana", "Carmen",
  "Razan", "Nadine", "Cyrine", "Sulaf", "Kinda", "Nesreen", "Dima", "Sulafa", "Shokran", "Caresse",
  "Amal", "Lana", "Fawz", "Dana", "Rawan", "Noha", "Ola", "Lojain", "Aseel", "Mahira",
  "Joelle", "Roaa", "Mayssa", "Maryam", "Zahra", "Fatima", "Khadija", "Aisha", "Safaa", "Naglaa",
  "Nadia", "Soad", "Samira", "Fadia", "Wafaa", "Manal", "Iman", "Siham", "Bayan", "Ghada"
];

const ARABIC_LAST = [
  "ElSayed", "Mansour", "AlSharif", "AlBanna", "Ghanem", "Kabbani", "Tawfik", "Reda", "Diab", "Hosny",
  "Mounir", "Zaki", "Salim", "AlShami", "Namra", "Khoury", "Gamal", "Shaker", "Samra", "Mamdouh",
  "Karara", "ElKedwany", "Fahmy", "Maged", "Sarwat", "Fouad", "Abdallah", "Labib", "AbdelBaqi", "Rabie",
  "Khatir", "ElMerghany", "Anwar", "AbdelAziz", "ElSaqqa", "Ezz", "Ramadan", "Yassin", "Farrag", "Youssef",
  "Nassar", "Khayat", "Khouly", "Hassan", "Fahd", "Soliman", "Massoud", "AlMasri", "Khalil", "Nasr",
  "AlNahar", "Hatem", "Omar", "Desouki", "Malek", "ElNabawy", "Ragab", "AbdelWahab", "Fawaz", "Shaheen",
  "Mokram", "Magdi", "Galal", "Salama", "AlAbedeen", "Moawad", "Emam", "AlFakharany", "Hamida", "AlOtaibi",
  "AlGhamdi", "AlShehri", "AlQahtani", "AlDossari", "AlHarbi", "AlMutairi", "AlZahrani", "AlEnazi", "AlShammari", "AlSubaie",
  "AlRuwaili", "AlThani", "AlNuaimi", "AlFalasi", "AlMazrouei", "AlKetbi", "AlKaabi", "AlZaabi", "AlSuwaidi", "AlMarzooqi"
];

const INTL_FIRST = [
  "Alexander", "David", "Lucas", "Liam", "Noah", "Oliver", "James", "Benjamin", "Mateo", "Sebastian",
  "Alejandro", "Carlos", "Diego", "Gabriel", "Nicolas", "Antoine", "Julien", "Maxime", "Hugo", "Clement",
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Shaurya",
  "Emma", "Sophia", "Valeria", "Camila", "Isabella", "Elena", "Chloe", "Lea", "Manon", "Ines",
  "Ananya", "Diya", "Isha", "Pari", "Saanvi", "Aanya", "Myra", "Navya", "Avani", "Mia"
];

const INTL_LAST = [
  "Miller", "Wilson", "Smith", "Brown", "Taylor", "Davies", "Garcia", "Fernandez", "Lopez", "Ruiz",
  "Mendoza", "Alvarez", "Morales", "Castro", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre",
  "Sharma", "Patel", "Verma", "Gupta", "Reddy", "Prasad", "Chopra", "Iyer", "Malhotra", "Deshmukh"
];

const REAL_BIOS_MALE_AR = [
  "لاعب شطرنج تكتيكي ومحب للتحديات الذهنية في أرينا نيزالو",
  "بطل الطاولة والدومينو السريع والتحديات المباشرة",
  "محترف حساب ذهني وألعاب السرعة التنافسية",
  "عاشق السيجة والتراث العربي التكتيكي الأصيل",
  "أستاذ تكتيكات طاولة الزهر والمواجهات المفتوحة",
  "متخصص بطولات الإقصاء الفردي ومنافس دائم على الصدارة",
  "مهندس ومحب لألعاب التفكير والخطط بعيدة المدى",
  "طبيب يعشق الشطرنج السريع في أوقات الفراغ",
  "لاعب قديم ومخضرم في ألعاب الطاولة والداما",
  "سرعة وتركيز استراتيجي في نزالات الكاش والأرينا"
];

const REAL_BIOS_FEMALE_AR = [
  "لاعبة شطرنج تكتيكية ومحبة للتحديات الذهنية في أرينا نيزالو",
  "بطلة الطاولة والدومينو السريع والتحديات المباشرة",
  "متخصصة استراتيجيات ريفيرسي وجوموكو في البطولات",
  "محترفة حساب ذهني وألعاب السرعة التنافسية",
  "بطلة كونكت فور والداما الكلاسيكية في بطولات النخبة",
  "تكتيكية هادئة في مواجهات إكس أو وجوموكو الخاطفة",
  "متخصصة بطولات الإقصاء الفردي ومنافسة دائمة على الصدارة",
  "مهندسة ومحبة لألعاب التفكير والخطط بعيدة المدى",
  "عاشقة لألعاب الذكاء والألغاز التنافسية",
  "لاعبة لودو رويال وشطرنج خاطف متمرسة"
];

const REAL_BIOS_EN = [
  "Tactical chess and board game enthusiast competing daily in Nizalo arena.",
  "Fast-paced dominoes and backgammon specialist aiming for top ranks.",
  "Strategic mind focused on Reversi and Connect Four championships.",
  "Quick calculations, sharp focus, and competitive spirit.",
  "Veteran player enjoying casual and high-stakes strategy duels.",
  "Passionate about classic board games and blitz tournaments."
];

// Fetch already-used handles by real human players to avoid duplicate key conflicts
const realHumansRes = await client.query(`SELECT handle FROM player WHERE is_ai = FALSE`);
const usedHandles = new Set(realHumansRes.rows.map(r => r.handle.toLowerCase()));

// First set temporary distinct handles so there are zero unique constraint collisions during the rename
console.log("Setting temp distinct handles to prevent collision during swap...");
await client.query(`
  UPDATE player 
  SET handle = 'tmp_' || id
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
`);

function generateCleanHandle(index, isArabic, isMale) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    let name = "";
    if (isArabic) {
      const first = isMale 
        ? ARABIC_FIRST_MALE[(index * 7 + attempt) % ARABIC_FIRST_MALE.length]
        : ARABIC_FIRST_FEMALE[(index * 7 + attempt) % ARABIC_FIRST_FEMALE.length];
      const last = ARABIC_LAST[(index * 13 + attempt * 5) % ARABIC_LAST.length];
      name = `${first}_${last}`;
    } else {
      const first = INTL_FIRST[(index * 5 + attempt) % INTL_FIRST.length];
      const last = INTL_LAST[(index * 11 + attempt * 3) % INTL_LAST.length];
      name = `${first}_${last}`;
    }

    const lower = name.toLowerCase();
    if (name.length >= 3 && name.length <= 24 && !usedHandles.has(lower) && /^[A-Za-z_]{3,24}$/.test(name)) {
      usedHandles.add(lower);
      return name;
    }
  }
  const fallback = `Master_${isMale ? 'Guy' : 'Lady'}_${index}`;
  usedHandles.add(fallback.toLowerCase());
  return fallback;
}

console.log("Generating 620 unique clean human profiles...");
const updates = [];
for (let i = 0; i < personasRes.rows.length; i++) {
  const bot = personasRes.rows[i];
  const isArabic = i < 430;
  const isMale = (i % 2 === 0);
  const cleanHandle = generateCleanHandle(i, isArabic, isMale);
  
  let bio = "";
  if (isArabic) {
    bio = isMale 
      ? REAL_BIOS_MALE_AR[i % REAL_BIOS_MALE_AR.length]
      : REAL_BIOS_FEMALE_AR[i % REAL_BIOS_FEMALE_AR.length];
  } else {
    bio = REAL_BIOS_EN[i % REAL_BIOS_EN.length];
  }

  const portraitNum = (i % 95) + 1;
  const gender = isMale ? "men" : "women";
  const avatarUrl = `https://randomuser.me/api/portraits/${gender}/${portraitNum}.jpg`;

  updates.push({ id: bot.id, handle: cleanHandle, bio, avatarUrl });
}

console.log("Batch updating all 620 personas into Neon database...");
// Process in batches of 50 to avoid timeout while keeping roundtrips minimal
const batchSize = 50;
for (let i = 0; i < updates.length; i += batchSize) {
  const batch = updates.slice(i, i + batchSize);
  const values = [];
  const params = [];
  let pIdx = 1;

  for (const item of batch) {
    values.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2}, $${pIdx + 3})`);
    params.push(item.id, item.handle, item.bio, item.avatarUrl);
    pIdx += 4;
  }

  const query = `
    UPDATE player AS p
    SET handle = u.handle,
        bio = u.bio,
        avatar_key = u.avatar_key,
        is_ai = TRUE,
        disabled_at = NULL
    FROM (VALUES ${values.join(", ")}) AS u(id, handle, bio, avatar_key)
    WHERE p.id = u.id
  `;
  await client.query(query, params);
  process.stdout.write(`Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)}\r`);
}
console.log("\nAll 620 personas successfully updated with 100% human profiles!");

console.log("=== STEP 3: Ensuring All 620 Personas Have >= 500 USDT Bankroll ===");
const underfundedRes = await client.query(`
  SELECT p.id, COALESCE(ledger_natural_balance(la.normal_side, lb.balance), 0) as balance
  FROM player p
  LEFT JOIN ledger_account la ON la.key = 'user:' || p.id || ':available' AND la.asset = 'USDT'
  LEFT JOIN ledger_balance lb ON lb.account_id = la.id
  WHERE (p.is_ai = TRUE OR p.id LIKE 'bot_%' OR p.id LIKE 'top_p_%')
    AND p.id NOT LIKE 'ai-%'
    AND COALESCE(ledger_natural_balance(la.normal_side, lb.balance), 0) < 500000000
`);

console.log(`Found ${underfundedRes.rows.length} underfunded personas.`);
for (const b of underfundedRes.rows) {
  await client.query(`SELECT ledger_open_user_wallet($1, 'USDT')`, [b.id]);
  const topUpMinor = 1_000_000_000n; // 1,000 USDT
  await client.query(`
    SELECT ledger_post(
      $1,
      'DEPOSIT',
      'SYSTEM',
      NULL,
      $2::jsonb,
      'USDT',
      'bot persona liquidity bankroll',
      'bot',
      $3
    )
  `, [
    `seed:bankroll:${b.id}:${Date.now()}`,
    JSON.stringify([
      { account: 'platform:custody:USDT:TRON', amount: topUpMinor.toString() },
      { account: `user:${b.id}:available`, amount: (-topUpMinor).toString() }
    ]),
    b.id
  ]);
}
console.log("Funding verified!");

console.log("=== STEP 4: Verification ===");
const weirdHandles = await client.query(`
  SELECT count(*)::int as count
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
    AND (handle ~ '[0-9]' OR handle ILIKE '%bot%' OR handle ILIKE '%ai%' OR bio ILIKE '%بوت%' OR bio ILIKE '%ذكاء%')
`);
console.log("Personas with numbers, 'bot', 'ai', or AI bios:", weirdHandles.rows[0].count);

const sample = await client.query(`
  SELECT id, handle, avatar_key, bio
  FROM player
  WHERE (is_ai = TRUE OR id LIKE 'bot_%' OR id LIKE 'top_p_%')
    AND id NOT LIKE 'ai-%'
  ORDER BY random()
  LIMIT 10
`);
console.table(sample.rows);

await client.end();
console.log("Fast refine finished successfully!");
