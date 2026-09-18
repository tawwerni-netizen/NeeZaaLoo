/**
 * Bot Chat Service & Persona Interaction Engine.
 * 
 * Generates dialect-authentic, human-like responses for all 600 bots.
 * Supports Gemini Flash API integration with fallback dialect templates.
 */
import { getBotById } from "./personas.mjs";

const AR_DIALECT_RESPONSES = {
  EG: [
    "حبيبي تسلم، بس ركز معايا في الرقعة دي شكلها هتقلب تكتيك عالي!",
    "يا غالي نقلتك دي شجاعة، خلينا نشوف رد الفيل ده إيه..",
    "صباح الفل يا بطل، بتلعب بنمط هجومي حلو بس الرخ هنا واقف مظبوط.",
    "ولا يهمك، الماتش لسه في أوله ونشوف مين هيكسب في الأند جيم!",
    "حلوة الحركة دي.. هفكر فيها ثواني بس!",
  ],
  SA: [
    "يا هلا والله! نقلة طيبة وذكية، بنشوف التكملة على خير..",
    "كفو والله، لعبك فيه هدوء وتركيز عالي، استمتع بالجيم!",
    "هلا بالحبيب.. رقعة الشطرنج هذي يبي لها بال طويل وحسابات دقيقة.",
    "الله يحييك، هجمة ممتازة بس الملك في مكان آمن للحين.",
    "تسلم يا غالي، خطة حلوة منك ونكمل النزال بكل روح رياضية.",
  ],
  MA: [
    "تبارك الله عليك خويا، نقلة مخدومة مزيان.. بلاتي نشوف الرد ديالي!",
    "مرحبا بيك، فهاد الكيم كاين اللعب والتكتيك، الله يعطيك الصحة.",
    "واخا سيدي، الهجوم ديالك زوين ولكن الدفاع ديالي واجد مزيان.",
    "اللعب معاك ممتع بزاف، نشوفو شكون غادي يربح فهاد البارتية!",
  ],
  SY: [
    "أهلين وسهلين يا غالي، نقلة رايقة كتير وذكية، منشوف شو رح يصير!",
    "يسلم إيديك، تكتيك حلو كتير، بس انتبه للحصان منيح.",
    "على راسي والله، الشطرنج معك متعة حقيقية، بالتوفيق لإلنا التنين.",
  ],
  DEFAULT: [
    "حياك الله، نقلة مميزة وتحدي جميل جداً!",
    "تسلم، الجيم ماشي بحماس وتركيز عالي.",
    "بالتوفيق، خلينا نكمل النزال الرائع ده!",
  ],
};

const EN_RESPONSES = [
  "Nice move! Let's see how this endgame unfolds.",
  "Good game so far! Keeping an eye on that knight of yours.",
  "Solid opening, mate. Time to bring out the big pieces.",
  "Appreciate the challenge, loving the tactical pressure!",
];

const ES_RESPONSES = [
  "¡Buena jugada! Esto se está poniendo muy interesante.",
  "¡Bien jugado! Tienes un estilo muy agresivo y táctico.",
  "¡Un placer jugar contigo! A ver cómo respondes a esta torre.",
];

const FR_RESPONSES = [
  "Beau coup ! La partie devient vraiment captivante.",
  "Très bien joué, mais attention à la diagonale de mon fou !",
  "Un vrai plaisir de t'affronter sur l'échiquier.",
];

const HI_RESPONSES = [
  "Bahut badhiya move! Khel ab aur bhi mazedaar ho gaya hai.",
  "Shaandar tactic! Dekhte hain end-game me kya hota hai.",
  "Khelte rahiye, focus banaye rakhiye!",
];

const ZH_RESPONSES = [
  "好棋！这盘对局越来越精彩了。",
  "步法很稳，我们中局再见真章。",
  "棋逢对手，很享受这盘棋！",
];

export function getFallbackReply(bot, message) {
  if (bot.language === "ar") {
    const list = AR_DIALECT_RESPONSES[bot.countryCode] || AR_DIALECT_RESPONSES.DEFAULT;
    return list[Math.floor(Math.random() * list.length)];
  }
  if (bot.language === "es") return ES_RESPONSES[Math.floor(Math.random() * ES_RESPONSES.length)];
  if (bot.language === "fr") return FR_RESPONSES[Math.floor(Math.random() * FR_RESPONSES.length)];
  if (bot.language === "hi") return HI_RESPONSES[Math.floor(Math.random() * HI_RESPONSES.length)];
  if (bot.language === "zh") return ZH_RESPONSES[Math.floor(Math.random() * ZH_RESPONSES.length)];
  return EN_RESPONSES[Math.floor(Math.random() * EN_RESPONSES.length)];
}

export async function generateBotReply({ botId, messageText }) {
  const bot = getBotById(botId);
  if (!bot) return "مرحباً بك في المباراة!";

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return getFallbackReply(bot, messageText);
  }

  try {
    const systemPrompt = `You are ${bot.name}, a human chess player from ${bot.city}, ${bot.country} with an ELO rating of ${bot.rating}.
Your native dialect and tone is: "${bot.dialect}".
Your personality: "${bot.personality}".
Your human opponent in a live chess match just said: "${messageText}".
Reply back to them directly in character in 1 or 2 concise sentences using your exact authentic dialect.
Do NOT sound robotic. NEVER mention you are an AI or bot. Keep it natural, friendly, or sporty.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.8 },
      }),
    });

    if (!res.ok) {
      return getFallbackReply(bot, messageText);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || getFallbackReply(bot, messageText);
  } catch {
    return getFallbackReply(bot, messageText);
  }
}
