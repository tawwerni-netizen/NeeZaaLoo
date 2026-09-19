"use client";

/**
 * Enhanced Gamified Difficulty Select Component.
 *
 * Renders rich, interactive cards for every supported difficulty level
 * with visual theme accents, ELO ratings, feature highlights, and tactile
 * Web Audio feedback.
 */
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import type { Difficulty, GamePlugin } from "@/lib/games";
import { playCardHoverSound, playDifficultySelectSound } from "@/lib/game-audio";
import styles from "./DifficultySelect.module.css";

interface DifficultyConfig {
  level: Difficulty;
  icon: string;
  themeClass?: string | undefined;
  accentColor: string;
  eloDisplay: string;
  badge?: Record<string, string>;
  title: Record<string, string>;
  tier: Record<string, string>;
  desc: Record<string, string>;
  specs: Array<{ icon: string; text: Record<string, string> }>;
  cta: Record<string, string>;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  EASY: {
    level: "EASY",
    icon: "🛡️",
    themeClass: styles.cardEasy,
    accentColor: "#10B981",
    eloDisplay: "800 - 1000 ELO",
    badge: {
      ar: "تدريب مفتوح 🟢",
      en: "Free Practice 🟢",
      es: "Práctica Libre 🟢",
      fr: "Entraînement Libre 🟢",
      hi: "मुफ्त अभ्यास 🟢",
      zh: "自由练习 🟢",
    },
    title: {
      ar: "سهل",
      en: "Easy",
      es: "Fácil",
      fr: "Facile",
      hi: "आसान",
      zh: "简单",
    },
    tier: {
      ar: "مبتدئ • Casual",
      en: "Novice • Casual",
      es: "Novato • Casual",
      fr: "Novice • Détendu",
      hi: "शुरुआती • अनौपचारिक",
      zh: "新手入门 • 轻松对弈",
    },
    desc: {
      ar: "مناسب للمبتدئين والإحماء وتجربة النقلات بحرية تامة دون أي ضغوطات أو قيود زمنية معقدة.",
      en: "Perfect for warming up, casual play, and trying new tactics without heavy time pressure.",
      es: "Ideal para calentar, jugar relajado y probar tácticas sin presión.",
      fr: "Idéal pour débuter, s'échauffer et tester des tactiques sans pression.",
      hi: "शुरुआती खिलाड़ियों और बिना दबाव के सीखने के लिए सर्वोत्तम।",
      zh: "适合新手入门、热身练习及零压力尝试各种战术策略。",
    },
    specs: [
      { icon: "🌱", text: { ar: "وتيرة لعب هادئة ومريحة", en: "Relaxed friendly pace", es: "Ritmo tranquilo", fr: "Rythme détendu", hi: "आरामदेह गति", zh: "轻松友好的对弈节奏" } },
      { icon: "✨", text: { ar: "فرص عديدة لتدارك الأخطاء", en: "Forgiving tactical margin", es: "Margen de error alto", fr: "Marge d'erreur tolérante", hi: "गलतियों की माफी", zh: "容错率高，适合试错" } },
      { icon: "🔓", text: { ar: "متاح فوراً للزوار دون تسجيل", en: "Instant play for all visitors", es: "Juego instantáneo", fr: "Accès immédiat", hi: "तुरंत खेलें", zh: "访客即开即玩" } },
    ],
    cta: {
      ar: "ابدأ التدريب (سهل)",
      en: "Play Casual",
      es: "Jugar Fácil",
      fr: "Jouer Facile",
      hi: "आसान खेलें",
      zh: "开始简单对局",
    },
  },
  MEDIUM: {
    level: "MEDIUM",
    icon: "⚔️",
    themeClass: styles.cardMedium,
    accentColor: "#3B82F6",
    eloDisplay: "1300 - 1500 ELO",
    badge: {
      ar: "الأكثر اختياراً 🔥",
      en: "Most Popular 🔥",
      es: "Más Popular 🔥",
      fr: "Le Plus Choisi 🔥",
      hi: "सबसे लोकप्रिय 🔥",
      zh: "最受欢迎 🔥",
    },
    title: {
      ar: "متوسط",
      en: "Medium",
      es: "Medio",
      fr: "Moyen",
      hi: "मध्यम",
      zh: "中等",
    },
    tier: {
      ar: "تكتيكي • Balanced",
      en: "Tactical • Balanced",
      es: "Táctico • Equilibrado",
      fr: "Tactique • Équilibré",
      hi: "रणनीतिक • संतुलित",
      zh: "进阶战术 • 攻防兼备",
    },
    desc: {
      ar: "مواجهة ذكية ومتوازنة تتطلب تركيزاً واستغلالاً استراتيجياً لثغرات الخصم في اللحظات الحاسمة.",
      en: "A smart, balanced duel requiring positional foresight and solid tactical moves.",
      es: "Duelo táctico equilibrado que exige previsión y atención.",
      fr: "Duel tactique équilibré exigeant concentration et vision.",
      hi: "संतुलित और समझदारी भरी चुनौती जिसमें ध्यान आवश्यक है।",
      zh: "攻守平衡的智能对局，考验局面把控与战术应对。"
    },
    specs: [
      { icon: "🧠", text: { ar: "ذكاء تكتيكي متزن وواقعي", en: "Solid tactical depth", es: "Táctica sólida", fr: "Profondeur tactique", hi: "मजबूत रणनीति", zh: "均衡扎实的战术思考" } },
      { icon: "🎯", text: { ar: "أخطاء نادرة ومحسوبة", en: "Few calculated slips", es: "Errores mínimos", fr: "Erreurs rares", hi: "कम गलतियां", zh: "偶有破绽，需敏锐捕捉" } },
      { icon: "📈", text: { ar: "المستوى الأمثل لتطوير المهارة", en: "Ideal for skill progression", es: "Mejora tus habilidades", fr: "Parfait pour progresser", hi: "कौशल निखारने के लिए उत्तम", zh: "提升实战水平的最佳选择" } },
    ],
    cta: {
      ar: "ابدأ التحدي (متوسط)",
      en: "Play Medium",
      es: "Jugar Medio",
      fr: "Jouer Moyen",
      hi: "मध्यम खेलें",
      zh: "开始中等对局",
    },
  },
  HARD: {
    level: "HARD",
    icon: "⚡",
    themeClass: styles.cardHard,
    accentColor: "#8B5CF6",
    eloDisplay: "1750 - 1950 ELO",
    badge: {
      ar: "تحدي النخبة ⚡",
      en: "Elite Challenge ⚡",
      es: "Desafío Élite ⚡",
      fr: "Défi Élite ⚡",
      hi: "अभिजात चुनौती ⚡",
      zh: "精英挑战 ⚡",
    },
    title: {
      ar: "صعب",
      en: "Hard",
      es: "Difícil",
      fr: "Difficile",
      hi: "कठिन",
      zh: "困难",
    },
    tier: {
      ar: "محترف • Advanced",
      en: "Master • Advanced",
      es: "Avanzado • Experto",
      fr: "Avancé • Maître",
      hi: "उन्नत • मास्टर",
      zh: "职业高手 • 强力推演",
    },
    desc: {
      ar: "منافسة شرسة وحسابات تفريعية عميقة؛ أي هفوة صغيرة يتم استغلالها فوراً دون رحمة.",
      en: "Fierce calculation and sharp tactical pressure; zero room for casual mistakes.",
      es: "Cálculos profundos y castigo inmediato a cualquier error.",
      fr: "Calculs profonds et punition immédiate de la moindre erreur.",
      hi: "गंभीर मुकाबला जहां छोटी सी गलती भी भारी पड़ेगी।",
      zh: "深层分支推演与致命惩罚，稍有不慎将瞬间崩盘。"
    },
    specs: [
      { icon: "⚡", text: { ar: "عمق تفريعي وسرعة قاطعة", en: "Deep search depth", es: "Búsqueda profunda", fr: "Calculs en profondeur", hi: "गहरी खोज", zh: "深层推演，极速落子" } },
      { icon: "🛡️", text: { ar: "دفاع صلب وهجمات مباغتة", en: "Iron defense & sharp attack", es: "Defensa férrea", fr: "Défense d'acier", hi: "मजबूत रक्षा और हमला", zh: "钢铁防线与凌厉突袭" } },
      { icon: "🏆", text: { ar: "اختبار حقيقي للاعبين المتمرسين", en: "True test for veterans", es: "Prueba para expertos", fr: "Test pour vétérans", hi: "अनुभवी खिलाड़ियों की परीक्षा", zh: "硬核高手的真正试金石" } },
    ],
    cta: {
      ar: "ابدأ التحدي (صعب)",
      en: "Play Hard",
      es: "Jugar Difícil",
      fr: "Jouer Difficile",
      hi: "कठिन खेलें",
      zh: "开始困难对局",
    },
  },
  EXPERT: {
    level: "EXPERT",
    icon: "👑",
    themeClass: styles.cardExpert,
    accentColor: "#F59E0B",
    eloDisplay: "2200+ ELO",
    badge: {
      ar: "مستحيل تقريباً 👑",
      en: "Near Invincible 👑",
      es: "Casi Invencible 👑",
      fr: "Presque Invincible 👑",
      hi: "लगभग अजेय 👑",
      zh: "近乎无敌 👑",
    },
    title: {
      ar: "خبير",
      en: "Expert",
      es: "Experto",
      fr: "Expert",
      hi: "विशेषज्ञ",
      zh: "特级大师",
    },
    tier: {
      ar: "جراند ماستر • Grandmaster",
      en: "Grandmaster • Peak",
      es: "Gran Maestro • Cúspide",
      fr: "Grand Maître • Sommet",
      hi: "ग्रैंडमास्टर • सर्वोच्च",
      zh: "世界大师 • 巅峰引擎",
    },
    desc: {
      ar: "أعلى مستوى ذكاء اصطناعي لا يرحم؛ دقة مطلقة كالأساتذة الدوليين وبدون أي هفوة تذكر!",
      en: "Peak grandmaster AI precision with flawless positional mastery and zero margin for error!",
      es: "Precisión de Gran Maestro sin margen de error.",
      fr: "Précision de niveau Grand Maître sans aucune marge d'erreur.",
      hi: "ग्रैंडमास्टर स्तर की सटीकता जहां कोई गलती संभव नहीं।",
      zh: "巅峰引擎全开，步步杀机，近乎零失误的极境挑战！"
    },
    specs: [
      { icon: "🔥", text: { ar: "دقة استراتيجية تفوق 99%", en: "99%+ move precision", es: "Precisión 99%+", fr: "Précision 99%+", hi: "99%+ सटीकता", zh: "超过99%的完美着法" } },
      { icon: "💎", text: { ar: "خالٍ تماماً من الهفوات", en: "Zero unforced blunders", es: "Cero fallos", fr: "Zéro gaffe", hi: "शून्य गलती", zh: "绝无走样与非受迫失误" } },
      { icon: "👑", text: { ar: "مواجهة تاريخية للأساطير فقط", en: "Legendary showdown", es: "Duelo legendario", fr: "Duel légendaire", hi: "ऐतिहासिक मुकाबला", zh: "为巅峰挑战者准备的终极对决" } },
    ],
    cta: {
      ar: "تحدَّ الجراند ماستر",
      en: "Challenge Master",
      es: "Desafiar Maestro",
      fr: "Défier le Maître",
      hi: "चुनौती दें",
      zh: "迎战特级大师",
    },
  },
};

export function DifficultySelect({
  plugin,
  gameName,
  onSelect,
}: {
  plugin: GamePlugin;
  gameName?: string | undefined;
  onSelect: (difficulty: Difficulty) => void;
}) {
  const { locale, dir } = useI18n();
  const { player } = useAuth();
  const isRtl = dir === "rtl";

  const diffList = useMemo(() => {
    return plugin.difficulties.filter((d) => Boolean(DIFFICULTY_CONFIGS[d]));
  }, [plugin.difficulties]);

  if (diffList.length === 0) return null;

  const handleSelect = (diff: Difficulty) => {
    try {
      playDifficultySelectSound(diff);
    } catch {
      // Audio fallback safe
    }
    onSelect(diff);
  };

  const handleHover = () => {
    try {
      playCardHoverSound();
    } catch {
      // Audio fallback safe
    }
  };

  const getLang = (obj: Record<string, string> | undefined, fallback: string = "") => {
    if (!obj) return fallback;
    return obj[locale] || obj.en || obj.ar || fallback;
  };

  return (
    <div className={styles.container}>
      {/* Header section with modern badge and title */}
      <div className={styles.header}>
        <div className={styles.categoryBadge}>
          <span className={styles.badgePulse} />
          <span>{isRtl ? "⚔️ مواجهة الذكاء الاصطناعي (AI Match)" : "⚔️ Single-Player AI Duel"}</span>
        </div>
        <h1 className={styles.heading}>
          {isRtl ? "اختر مستوى الصعوبة" : "Select Difficulty Level"}
          {gameName ? <span className={styles.gameHighlight}> • {gameName}</span> : null}
        </h1>
        <p className={styles.subtitle}>
          {isRtl
            ? "حدد مستوى قوة الذكاء الاصطناعي الذي ترغب في مواجهته، واختبر مهاراتك التكتيكية واستراتيجيتك."
            : "Choose the AI strength you want to face and put your tactical thinking to the ultimate test."}
        </p>
      </div>

      {/* Grid of 4 rich, responsive difficulty cards */}
      <div className={styles.grid}>
        {diffList.map((d) => {
          const cfg = DIFFICULTY_CONFIGS[d];
          const isGuestLocked = d !== "EASY" && !player;
          const badgeText = cfg.badge ? getLang(cfg.badge) : null;
          const titleText = getLang(cfg.title, d);
          const tierText = getLang(cfg.tier);
          const descText = getLang(cfg.desc);
          const ctaText = getLang(cfg.cta, isRtl ? "اختر المستوى" : "Select");

          return (
            <div
              key={d}
              className={`${styles.card} ${cfg.themeClass}`}
              onClick={() => handleSelect(d)}
              onMouseEnter={handleHover}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(d);
                }
              }}
            >
              {/* Top Accent Line */}
              <div className={styles.cardGlowLine} />

              {/* Card Top Metadata & Badges */}
              <div className={styles.cardTop}>
                {badgeText && (
                  <span className={styles.cardBadge}>
                    {badgeText}
                  </span>
                )}
                <span className={styles.eloPill}>
                  ⚡ {cfg.eloDisplay}
                </span>
              </div>

              {/* Icon & Title Row */}
              <div className={styles.cardHero}>
                <div className={styles.iconCircle}>
                  <span className={styles.emojiIcon}>{cfg.icon}</span>
                </div>
                <div className={styles.heroText}>
                  <h3 className={styles.cardTitle}>{titleText}</h3>
                  <span className={styles.cardTier}>{tierText}</span>
                </div>
              </div>

              {/* Description */}
              <p className={styles.cardDesc}>{descText}</p>

              {/* Feature bullet list */}
              <div className={styles.specsList}>
                {cfg.specs.map((sp, idx) => (
                  <div key={idx} className={styles.specItem}>
                    <span className={styles.specIcon}>{sp.icon}</span>
                    <span className={styles.specText}>{getLang(sp.text)}</span>
                  </div>
                ))}
              </div>

              {/* Bottom Action CTA */}
              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.ctaButton}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <span>{ctaText}</span>
                  <span className={styles.ctaArrow}>{isRtl ? "←" : "→"}</span>
                </button>
                {isGuestLocked && (
                  <div className={styles.guestNote}>
                    <span>🔒 {isRtl ? "يتطلب تسجيل الدخول" : "Sign in to play"}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Helpful tactical tip footer */}
      <div className={styles.footerTip}>
        <span className={styles.tipIcon}>💡</span>
        <div className={styles.tipText}>
          <strong>{isRtl ? "نصيحة تكتيكية:" : "Pro Tip:"}</strong>{" "}
          {isRtl
            ? "المستوى السهل متاح مجاناً وفورياً للجميع دون قيود، بينما تمنحك المستويات التكتيكية والمحترفة تدريباً عميقاً يحاكي أبطال المنصة."
            : "Easy mode is open and instant for all players, while Medium and above offer deep training mimicking top platform contenders."}
        </div>
      </div>
    </div>
  );
}
