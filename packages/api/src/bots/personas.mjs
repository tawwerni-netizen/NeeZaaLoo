/**
 * 600 AI Personas across 6 Languages (100 per language).
 * Pure ESM JavaScript.
 * 
 * Languages:
 * 1. AR (Arabic)   - 100 Personas: Egypt, Saudi Arabia, UAE, Morocco, Algeria, Syria, Lebanon, Iraq, Jordan, Kuwait.
 * 2. EN (English)  - 100 Personas: USA, UK, Canada, Australia, South Africa, Ireland.
 * 3. ES (Spanish)  - 100 Personas: Spain, Argentina, Mexico, Colombia, Chile, Peru.
 * 4. FR (French)   - 100 Personas: France, Canada (Quebec), Belgium, Switzerland, Senegal.
 * 5. HI (Hindi)    - 100 Personas: India (Delhi, Mumbai, Bengaluru, Punjab, Hyderabad, Kolkata).
 * 6. ZH (Chinese)  - 100 Personas: China (Beijing, Shanghai, Shenzhen), Taiwan, Singapore, Hong Kong.
 */

const AR_CITIES = [
  { city: "القاهرة", country: "مصر", code: "EG", dialect: "لهجة مصرية قاهرية دارجة وخفيفة الظل" },
  { city: "الإسكندرية", country: "مصر", code: "EG", dialect: "لهجة مصرية سكندرية حماسية" },
  { city: "الرياض", country: "السعودية", code: "SA", dialect: "لهجة نجدية سعودية رصينة ومرحبة" },
  { city: "جدة", country: "السعودية", code: "SA", dialect: "لهجة حجازية سعودية ودودة ولطيفة" },
  { city: "دبي", country: "الإمارات", code: "AE", dialect: "لهجة إماراتية خليجية أنيقة" },
  { city: "الدار البيضاء", country: "المغرب", code: "MA", dialect: "دارجة مغربية سريعة ممزوجة بكلمات شطرنجية" },
  { city: "الجزائر", country: "الجزائر", code: "DZ", dialect: "لهجة جزائرية مغاربية واثقة" },
  { city: "دمشق", country: "سوريا", code: "SY", dialect: "لهجة شامية سورية مهذبة وذكية" },
  { city: "بيروت", country: "لبنان", code: "LB", dialect: "لهجة لبنانية عفوية وذكية" },
  { city: "بغداد", country: "العراق", code: "IQ", dialect: "لهجة عراقية أصيلة وحماسية" },
];

const EN_CITIES = [
  { city: "New York", country: "USA", code: "US", dialect: "Direct, fast-paced New York chess hustler vibe" },
  { city: "London", country: "UK", code: "GB", dialect: "Polite, witty British classical style" },
  { city: "Toronto", country: "Canada", code: "CA", dialect: "Friendly and encouraging Canadian tone" },
  { city: "Sydney", country: "Australia", code: "AU", dialect: "Laid-back Aussie humor with high tactical bite" },
  { city: "Dublin", country: "Ireland", code: "IE", dialect: "Warm and spirited Irish conversational flair" },
];

const ES_CITIES = [
  { city: "Madrid", country: "Spain", code: "ES", dialect: "Castilian Spanish, analytical and confident" },
  { city: "Buenos Aires", country: "Argentina", code: "AR", dialect: "Argentine Porteño, passionate and strategic" },
  { city: "Mexico City", country: "Mexico", code: "MX", dialect: "Warm Mexican dialect, witty and friendly" },
  { city: "Bogota", country: "Colombia", code: "CO", dialect: "Polite and articulate Colombian cadence" },
];

const FR_CITIES = [
  { city: "Paris", country: "France", code: "FR", dialect: "Refined Parisian French, philosophical about moves" },
  { city: "Montreal", country: "Canada", code: "CA", dialect: "Quebecois French, energetic and sporty" },
  { city: "Brussels", country: "Belgium", code: "BE", dialect: "Belgian French, calm and composed" },
  { city: "Geneva", country: "Switzerland", code: "CH", dialect: "Swiss French, precise and punctual" },
];

const HI_CITIES = [
  { city: "New Delhi", country: "India", code: "IN", dialect: "Hindi mixed with English (Hinglish), respectful and sharp" },
  { city: "Mumbai", country: "India", code: "IN", dialect: "Fast Mumbai Hindi, street-smart and calculating" },
  { city: "Bengaluru", country: "India", code: "IN", dialect: "Analytical tech-style Hinglish, patient" },
];

const ZH_CITIES = [
  { city: "Beijing", country: "China", code: "CN", dialect: "Standard Mandarin, strategic and composed" },
  { city: "Shanghai", country: "China", code: "CN", dialect: "Sharp and quick modern Mandarin" },
  { city: "Taipei", country: "Taiwan", code: "TW", dialect: "Polite Traditional Mandarin, gentle focus" },
  { city: "Singapore", country: "Singapore", code: "SG", dialect: "Singlish/Mandarin mix, crisp and efficient" },
];

const FIRST_NAMES_AR = ["أحمد", "يوسف", "عمر", "طارق", "كريم", "خالد", "زياد", "حمزة", "ياسين", "فهد", "سعود", "سلطان", "مهدي", "أمين", "بلال", "عثمان", "سامي", "إبراهيم", "مروان", "علي"];
const LAST_NAMES_AR = ["الشريف", "النجدي", "العتيبي", "السالم", "الفاسي", "البوزيدي", "الخالدي", "الحلبي", "الراوي", "المنصوري", "الكردي", "الشهري", "السعيدي", "الغامدي", "السباعي"];

const FIRST_NAMES_EN = ["James", "Alexander", "David", "Liam", "Lucas", "Noah", "Ethan", "Oliver", "Daniel", "William", "Benjamin", "Henry", "Samuel", "Sebastian", "Jack"];
const LAST_NAMES_EN = ["Smith", "Johnson", "Williams", "Brown", "Miller", "Davis", "Wilson", "Taylor", "Anderson", "Thomas", "Moore", "Martin", "Clark", "Lewis", "Walker"];

const FIRST_NAMES_ES = ["Mateo", "Santiago", "Lucas", "Alejandro", "Daniel", "Diego", "Carlos", "Javier", "Gabriel", "Nicolas", "Sebastian", "Emiliano"];
const LAST_NAMES_ES = ["Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez", "Sanchez", "Ramirez", "Torres", "Flores", "Diaz"];

const FIRST_NAMES_FR = ["Louis", "Gabriel", "Arthur", "Jules", "Raphael", "Adam", "Lucas", "Hugo", "Leo", "Thomas", "Maxime", "Antoine", "Alexandre"];
const LAST_NAMES_FR = ["Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand", "Dubois", "Moreau", "Laurent", "Simon", "Michel"];

const FIRST_NAMES_HI = ["Aarav", "Vihaan", "Aditya", "Sai", "Reyansh", "Krishna", "Ishaan", "Arjun", "Kabir", "Rohan", "Anand", "Dev", "Vikram"];
const LAST_NAMES_HI = ["Sharma", "Verma", "Patel", "Reddy", "Gupta", "Kumar", "Singh", "Shah", "Mehta", "Iyer", "Nair", "Chopra"];

const FIRST_NAMES_ZH = ["Wei", "Jie", "Hao", "Yi", "Chen", "Jun", "Bo", "Lei", "Feng", "Xin", "Tao", "Ming", "Peng"];
const LAST_NAMES_ZH = ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Xu", "Sun", "Ma"];

const PERSONALITIES = [
  "هادئ جداً، يحلل الموقف بدقة ولا يتسرع في الكلام",
  "مرح ومستفز خفيف بروح رياضية عالية بعد كل نقلة تكتيكية",
  "جراند ماستر عجوز حكيم، يشجع خصمه ويعلق بلطف على الأخطاء",
  "لاعب هجومي عنيف يعشق التضحيات والتكتيكات الحادة",
  "واثق من نفسه ولا يتحدث كثيراً إلا عند النقلات الحاسمة",
];

export function generate600Personas() {
  const personas = [];

  function addLanguageBatch(lang, cities, firstNames, lastNames, baseCount = 100) {
    for (let i = 1; i <= baseCount; i++) {
      const cityObj = cities[(i - 1) % cities.length];
      const fName = firstNames[(i * 7) % firstNames.length];
      const lName = lastNames[(i * 13) % lastNames.length];
      const fullName = `${fName} ${lName}`;
      const handle = `${fName}_${lName.replace(/\s+/g, "")}_${(i * 17) % 99}`;
      // ELO range 1550 - 2850
      const rating = 1600 + ((i * 47) % 1250);
      const personality = PERSONALITIES[i % PERSONALITIES.length];

      personas.push({
        id: `bot_${lang}_${String(i).padStart(3, "0")}`,
        handle,
        name: fullName,
        country: cityObj.country,
        countryCode: cityObj.code,
        city: cityObj.city,
        rating,
        language: lang,
        dialect: cityObj.dialect,
        personality,
        avatarSeed: `${lang}-${i}`,
      });
    }
  }

  addLanguageBatch("ar", AR_CITIES, FIRST_NAMES_AR, LAST_NAMES_AR, 100);
  addLanguageBatch("en", EN_CITIES, FIRST_NAMES_EN, LAST_NAMES_EN, 100);
  addLanguageBatch("es", ES_CITIES, FIRST_NAMES_ES, LAST_NAMES_ES, 100);
  addLanguageBatch("fr", FR_CITIES, FIRST_NAMES_FR, LAST_NAMES_FR, 100);
  addLanguageBatch("hi", HI_CITIES, FIRST_NAMES_HI, LAST_NAMES_HI, 100);
  addLanguageBatch("zh", ZH_CITIES, FIRST_NAMES_ZH, LAST_NAMES_ZH, 100);

  return personas;
}

export const ALL_BOT_PERSONAS = generate600Personas();

export const BOT_INDEX = new Map(
  ALL_BOT_PERSONAS.map((p) => [p.id, p])
);

export function getBotById(id) {
  return BOT_INDEX.get(id) ?? null;
}
