/**
 * Bot Chat Service & Multi-Game Persona Interaction Engine.
 * 
 * Generates dialect-authentic, game-aware responses for all 600 bots
 * across all 11 games on the Nizalo platform.
 */
import { getBotById } from "./personas.mjs";

const GAME_NAMES_AR = {
  chess: "الشطرنج",
  backgammon: "الطاولة",
  dominoes: "الدومينو",
  billiards: "البلياردو",
  checkers: "الداما",
  "connect-four": "أربعة على التوالي",
  gomoku: "جوموكو",
  reversi: "ريفيرسي",
  seega: "السيجة",
  "speed-math": "الرياضيات السريعة",
  xo: "إكس أو",
};

const GAME_SPECIFIC_BANTER = {
  backgammon: {
    EG: ["رمية نرد معلم يا غالي بس المحبوسة دي هتتفك!", "يا ساتر على الزهر معاك.. دوش عالي!", "ولا يهمك، الماتش لسه فيه مرس وتحدي!"],
    SA: ["ما شاء الله الزهر قايم حظه معك اليوم!", "رمية طيبة والله، بس الصبر مفتاح المكسب بالطاولة.", "لعبك متكتك بالخانات وممتع جداً!"],
    DEFAULT: ["رمية زهر ممتازة! اللعب على الطاولة مشتعل بالحماس.", "حظ النرد والتكتيك بيصنعوا الفارق في هذا الجيم!"],
  },
  dominoes: {
    EG: ["قفلة معلم دي يا باشا! بس معايا بلاطات هتعجبك.", "اللعبة مقفولة من الناحيتين، خلينا نشوف مين اللي هيعد!", "حلوة البلاطة دي.. هفكر فيها ثواني."],
    SA: ["قفلة ذكية والله، بحسب نقاط البلاطات اللي عندي الحين!", "لعبك فيه دهاء بالدومينو، بالتوفيق يا غالي."],
    DEFAULT: ["قفلة تكتيكية رائعة بالدومينو! النزال على أشده.", "توزيع البلاطات وحساب النقط هنا هو سر الفوز!"],
  },
  billiards: {
    EG: ["ضربة معلم وزاوية خرافية! البيضا وقفت في مكان مظبوط.", "تسلم إيدك، بس الكورة التامنة لسه في الملعب!", "زاوية صعبة جداً وجبتها بامتياز."],
    SA: ["يا سلام على السحبة والزاوية! ضربة احترافية.", "كفو والله، مهارة عالية بالبلياردو وتركيز يدرّس."],
    DEFAULT: ["ضربة متقنة ودوران كرة ممتاز!", "التحكم في زاوية الكرة البيضاء ممتاز جداً!"],
  },
  checkers: {
    EG: ["أكلة حلوة يا بطل، بس الترقية قريبة للطرف التاني!", "الداما لعبة نفس طويل، خلينا نشوف مين هيكمل للآخر."],
    SA: ["حصار ذكي، لكن الترقية جاية في الطريق إن شاء الله.", "تركيزك عالي في كل قفزة."],
    DEFAULT: ["حركة وقفزة تكتيكية ممتازة بالداما!", "تخطيط رائع لحصار القطع."],
  },
};

const AR_DIALECT_RESPONSES = {
  EG: [
    "حبيبي تسلم، بس ركز معايا النزال ده تكتيكه عالي جداً!",
    "يا غالي حركتك دي شجاعة، خلينا نشوف الرد إيه..",
    "صباح الفل يا بطل، بتلعب بنمط هجومي حلو وممتع.",
    "ولا يهمك، الجيم لسه في أوله ونشوف مين هيكسب في النهاية!",
    "حلوة الحركة دي.. بحسبها ثواني بس!",
  ],
  SA: [
    "يا هلا والله! حركة طيبة وذكية، بنشوف التكملة على خير..",
    "كفو والله، لعبك فيه هدوء وتركيز عالي، استمتع بالجيم!",
    "هلا بالحبيب.. اللعب هذا يبي له بال طويل وحسابات دقيقة.",
    "الله يحييك، هجمة ممتازة وتركيز عالي للحين.",
    "تسلم يا غالي، خطة حلوة منك ونكمل النزال بكل روح رياضية.",
  ],
  MA: [
    "تبارك الله عليك خويا، حركة مخدومة مزيان.. بلاتي نشوف الرد ديالي!",
    "مرحبا بيك، فهاد الجيم كاين اللعب والتكتيك، الله يعطيك الصحة.",
    "واخا سيدي، الهجوم ديالك زوين ولكن الدفاع ديالي واجد مزيان.",
    "اللعب معاك ممتع بزاف، نشوفو شكون غادي يربح فهاد البارتية!",
  ],
  SY: [
    "أهلين وسهلين يا غالي، حركة رايقة كتير وذكية، منشوف شو رح يصير!",
    "يسلم إيديك، تكتيك حلو كتير وتركيز رائع.",
    "على راسي والله، اللعب معك متعة حقيقية، بالتوفيق لإلنا التنين.",
  ],
  DEFAULT: [
    "حياك الله، حركة مميزة وتحدي جميل جداً!",
    "تسلم، الجيم ماشي بحماس وتركيز عالي.",
    "بالتوفيق، خلينا نكمل النزال الرائع ده!",
  ],
};

const EN_RESPONSES = [
  "Nice move! Let's see how this unfolds.",
  "Good game so far! Keeping an eye on your tactics.",
  "Solid play, mate. Time to ramp up the pressure.",
  "Appreciate the challenge, loving the match!",
];

const ES_RESPONSES = [
  "¡Buena jugada! Esto se está poniendo muy interesante.",
  "¡Bien jugado! Tienes un estilo muy táctico.",
  "¡Un placer jugar contigo! A ver cómo respondes a esto.",
];

const FR_RESPONSES = [
  "Beau coup ! La partie devient vraiment captivante.",
  "Très bien joué, la stratégie est au rendez-vous !",
  "Un vrai plaisir de t'affronter sur ce jeu.",
];

const HI_RESPONSES = [
  "Bahut badhiya move! Khel ab aur bhi mazedaar ho gaya hai.",
  "Shaandar tactic! Dekhte hain aage kya hota hai.",
  "Khelte rahiye, focus banaye rakhiye!",
];

const ZH_RESPONSES = [
  "好招！这盘对局越来越精彩了。",
  "步法很稳，我们接下来见真章。",
  "很享受这盘精彩的对决！",
];

export function getFallbackReply(bot, message, gameId = "chess") {
  if (bot.language === "ar") {
    // Check if we have specific banter for this game
    const gamePool = GAME_SPECIFIC_BANTER[gameId];
    if (gamePool) {
      const dialectPool = gamePool[bot.countryCode] || gamePool.DEFAULT;
      if (Math.random() < 0.6) {
        return dialectPool[Math.floor(Math.random() * dialectPool.length)];
      }
    }
    const list = AR_DIALECT_RESPONSES[bot.countryCode] || AR_DIALECT_RESPONSES.DEFAULT;
    return list[Math.floor(Math.random() * list.length)];
  }
  if (bot.language === "es") return ES_RESPONSES[Math.floor(Math.random() * ES_RESPONSES.length)];
  if (bot.language === "fr") return FR_RESPONSES[Math.floor(Math.random() * FR_RESPONSES.length)];
  if (bot.language === "hi") return HI_RESPONSES[Math.floor(Math.random() * HI_RESPONSES.length)];
  if (bot.language === "zh") return ZH_RESPONSES[Math.floor(Math.random() * ZH_RESPONSES.length)];
  return EN_RESPONSES[Math.floor(Math.random() * EN_RESPONSES.length)];
}

export async function generateBotReply({ botId, messageText, gameId = "chess" }) {
  const bot = getBotById(botId);
  if (!bot) return "مرحباً بك في المباراة!";

  const apiKey = process.env.GEMINI_API_KEY;
  const gameNameAr = GAME_NAMES_AR[gameId] || gameId;

  if (!apiKey) {
    return getFallbackReply(bot, messageText, gameId);
  }

  try {
    const gameRating = bot.gameRatings?.[gameId] ?? bot.rating;
    const systemPrompt = `You are ${bot.name}, a human player from ${bot.city}, ${bot.country} with an ELO rating of ${gameRating} in ${gameNameAr}.
Your native dialect and tone is: "${bot.dialect}".
Your play style: "${bot.playStyle}".
Your personality: "${bot.personality}".
You are currently in a live match of ${gameNameAr} against a human player on the Nizalo platform.
Your human opponent just sent in the in-game chat: "${messageText}".
Reply back to them directly in character in 1 or 2 short sentences using your authentic native dialect.
Do NOT sound robotic. NEVER mention you are an AI or bot. Keep it natural, witty, friendly, or sporty.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.8 },
      }),
    });

    if (!res.ok) {
      return getFallbackReply(bot, messageText, gameId);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || getFallbackReply(bot, messageText, gameId);
  } catch {
    return getFallbackReply(bot, messageText, gameId);
  }
}
