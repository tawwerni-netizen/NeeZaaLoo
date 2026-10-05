import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
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

// Curated list of realistic human first and last names (Arabic & International)
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

const REAL_BIOS_AR = [
  "لاعب شطرنج تكتيكي ومحب للتحديات الذهنية في أرينا نيزالو",
  "بطل الطاولة والدومينو السريع والتحديات المباشرة",
  "متخصصة استراتيجيات ريفيرسي وجوموكو في البطولات",
  "محترف حساب ذهني وألعاب السرعة التنافسية",
  "عاشق السيجة والتراث العربي التكتيكي الأصيل",
  "بطلة كونكت فور والداما الكلاسيكية في بطولات النخبة",
  "أستاذ تكتيكات طاولة الزهر والمواجهات المفتوحة",
  "تكتيكية هادئة في مواجهات إكس أو وجوموكو الخاطفة",
  "متخصص بطولات الإقصاء الفردي ومنافس دائم على الصدارة",
  "مهندس ومحب لألعاب التفكير والخطط بعيدة المدى",
  "طبيب يعشق الشطرنج السريع في أوقات الفراغ",
  "عاشقة لألعاب الذكاء والألغاز التنافسية",
  "لاعب قديم ومخضرم في ألعاب الطاولة والداما",
  "سرعة وتركيز استراتيجي في نزالات الكاش والأرينا",
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

// Generate 620 distinct realistic human names (letters & underscore only, 3-24 chars, no digits)
const usedHandles = new Set();
function generateCleanHandle(index) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let name = "";
    if (index < 430) {
      // 70% Arabic personas
      const isMale = (index % 2 === 0);
      const first = isMale 
        ? ARABIC_FIRST_MALE[(index * 7 + attempt) % ARABIC_FIRST_MALE.length]
        : ARABIC_FIRST_FEMALE[(index * 7 + attempt) % ARABIC_FIRST_FEMALE.length];
      const last = ARABIC_LAST[(index * 13 + attempt * 5) % ARABIC_LAST.length];
      name = `${first}_${last}`;
    } else {
      // 30% International personas
      const first = INTL_FIRST[(index * 5 + attempt) % INTL_FIRST.length];
      const last = INTL_LAST[(index * 11 + attempt * 3) % INTL_LAST.length];
      name = `${first}_${last}`;
    }

    if (name.length <= 24 && !usedHandles.has(name) && /^[A-Za-z_]{3,24}$/.test(name)) {
      usedHandles.add(name);
      return name;
    }
  }
  return `Player_Master_${index}`;
}

console.log("=== STEP 3: Updating Bot Personas with 100% Real Human Profiles ===");
let updatedProfiles = 0;
for (let i = 0; i < personasRes.rows.length; i++) {
  const bot = personasRes.rows[i];
  const cleanHandle = generateCleanHandle(i);
  const isArabic = i < 430;
  const isMale = (i % 2 === 0);
  const bio = isArabic 
    ? REAL_BIOS_AR[i % REAL_BIOS_AR.length]
    : REAL_BIOS_EN[i % REAL_BIOS_EN.length];
  
  // Real human portrait URL (men/women 1-99)
  const portraitNum = (i % 95) + 1;
  const gender = isMale ? "men" : "women";
  const avatarUrl = `https://randomuser.me/api/portraits/${gender}/${portraitNum}.jpg`;

  await client.query(`
    UPDATE player
    SET handle = $1,
        bio = $2,
        avatar_key = $3,
        is_ai = TRUE,
        disabled_at = NULL
    WHERE id = $4
  `, [cleanHandle, bio, avatarUrl, bot.id]);
  updatedProfiles++;
}
console.log(`Updated ${updatedProfiles} personas with clean human names, bios, and portraits.`);

console.log("=== STEP 4: Funding All Personas with 1,000 USDT Bankroll ===");
let fundedBots = 0;
for (const bot of personasRes.rows) {
  const botId = bot.id;
  // 1. Open USDT wallet if not exists
  await client.query(`SELECT ledger_open_user_wallet($1, 'USDT')`, [botId]);

  // 2. Check current balance
  const balRes = await client.query(`
    SELECT ledger_natural_balance(la.normal_side, COALESCE(lb.balance, 0)) as balance
      FROM ledger_account la
      LEFT JOIN ledger_balance lb ON lb.account_id = la.id
     WHERE la.key = $1 AND la.asset = 'USDT'
  `, [`user:${botId}:available`]);

  const currentBal = balRes.rows[0]?.balance ? BigInt(balRes.rows[0].balance) : 0n;
  
  // Ensure every bot has at least 500 USDT ($500.00 = 500,000,000 minor)
  if (currentBal < 500_000_000n) {
    const topUpMinor = 1_000_000_000n; // 1,000 USDT
    try {
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
        `seed:bankroll:${botId}:${Date.now()}`,
        JSON.stringify([
          { account: 'platform:custody:USDT:TRON', amount: topUpMinor.toString() },
          { account: `user:${botId}:available`, amount: (-topUpMinor).toString() }
        ]),
        botId
      ]);
      fundedBots++;
    } catch (e) {
      console.error(`Funding error on ${botId}:`, e.message);
    }
  }
}
console.log(`Successfully funded ${fundedBots} personas with 1,000 USDT each!`);

console.log("=== STEP 5: Verification of No AI/Number in Handles ===");
const verifyRes = await client.query(`
  SELECT count(*)::int as weird_count
  FROM player
  WHERE is_ai = TRUE AND id NOT LIKE 'ai-%'
    AND (handle ~ '[0-9]' OR handle ILIKE '%bot%' OR handle ILIKE '%ai%' OR bio ILIKE '%بوت%')
`);
console.log("Remaining weird handles / bios:", verifyRes.rows[0].weird_count);

const sampleAfter = await client.query(`
  SELECT id, handle, avatar_key, bio
  FROM player
  WHERE is_ai = TRUE AND id NOT LIKE 'ai-%'
  ORDER BY id ASC
  LIMIT 15
`);
console.table(sampleAfter.rows);

await client.end();
