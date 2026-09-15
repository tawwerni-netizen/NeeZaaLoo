"use client";

/**
 * Psychological & Gamified "How It Works" Section:
 * Visualizes the 5-step Player Ascent from casual trial to championship glory.
 * Includes glowing progressive timeline, cybernetic step cards, badges, and instant CTA.
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./HowItWorks.module.css";

type StepData = {
  n: string;
  key: "try" | "compete" | "improve" | "climb" | "win";
  icon: string;
  tagAr: string;
  tagEn: string;
  perksAr: [string, string];
  perksEn: [string, string];
};

const STEPS_DATA: StepData[] = [
  {
    n: "01",
    key: "try",
    icon: "🎯",
    tagAr: "الاستكشاف المجاني",
    tagEn: "Free Exploration",
    perksAr: ["⚡ نزال فوري", "🆓 بلا إيداع"],
    perksEn: ["⚡ Instant Match", "🆓 Zero Deposit"],
  },
  {
    n: "02",
    key: "compete",
    icon: "⚔️",
    tagAr: "النزال العادل",
    tagEn: "Fair Competition",
    perksAr: ["🛡️ حماية Sentinel AI", "⚖️ مطابقة حسب المستوى"],
    perksEn: ["🛡️ Anti-Cheat Protected", "⚖️ Skill-Based Match"],
  },
  {
    n: "03",
    key: "improve",
    icon: "🧠",
    tagAr: "التطور التكتيكي",
    tagEn: "Tactical Growth",
    perksAr: ["📊 تحليل الأخطاء", "🔍 إحصاءات معمقة"],
    perksEn: ["📊 Move Analysis", "🔍 Deep Performance Stats"],
  },
  {
    n: "04",
    key: "climb",
    icon: "📈",
    tagAr: "الارتقاء والتصنيف",
    tagEn: "Rank Ascendancy",
    perksAr: ["⭐ تصنيف Glicko-2", "👑 شارات النخبة"],
    perksEn: ["⭐ Global ELO Score", "👑 Master Badges"],
  },
  {
    n: "05",
    key: "win",
    icon: "🏆",
    tagAr: "المجد والجوائز",
    tagEn: "Glory & Rewards",
    perksAr: ["💰 جوائز USDT فورية", "🥇 كؤوس البطولات الكبرى"],
    perksEn: ["💰 Instant USDT Payouts", "🥇 Major Tournament Cups"],
  },
];

export function HowItWorks() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  return (
    <section className={styles.section} id="how-it-works">
      <div className="nz-container">
        {/* Esports Header */}
        <div className={styles.header}>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>
              <span className={styles.badgeDot} />
              <span>{isAr ? "🚀 مسار البطل في نيزالو • من التجربة إلى منصة التتويج" : "🚀 Champion's Ascent • From First Match to Trophy"}</span>
            </span>
          </div>
          <h2 className={styles.heading}>
            {isAr ? "كيف تعمل المنصة؟ ٥ خطوات تقودك إلى القمة" : "How It Works: 5 Steps to Platform Glory"}
          </h2>
          <p className={styles.subHeading}>
            {isAr
              ? "بيئة تنافسية متكاملة تضمن العدالة المطلقة، السرعة الفائقة، وتتويج المهارة العقلية الحقيقية بجوائز فورية."
              : "A provably fair esports environment where tactical intellect is recognized, honed, and rewarded."}
          </p>
        </div>

        {/* The Roadmap Connection Line (Desktop) */}
        <div className={styles.roadmapTrack}>
          <div className={styles.trackLine} />
          <div className={styles.trackPulse} />
        </div>

        {/* 5-Step Gamified Grid */}
        <ol className={styles.steps}>
          {STEPS_DATA.map((step, idx) => {
            const title = t(`home.how.steps.${step.key}.title`);
            const body = t(`home.how.steps.${step.key}.body`);
            const tag = isAr ? step.tagAr : step.tagEn;
            const perks = isAr ? step.perksAr : step.perksEn;

            return (
              <li key={step.n} className={styles.stepCard} style={{ animationDelay: `${idx * 120}ms` }}>
                {/* Step Top Bar */}
                <div className={styles.cardTop}>
                  <div className={styles.iconContainer}>
                    <span className={styles.icon}>{step.icon}</span>
                  </div>
                  <span className={styles.stepNumber}>{step.n}</span>
                </div>

                {/* Step Tag */}
                <span className={styles.stepTag}>{tag}</span>

                {/* Step Title & Description */}
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepBody}>{body}</p>

                {/* Perks Pills */}
                <div className={styles.perks}>
                  {perks.map((p, pIdx) => (
                    <span key={pIdx} className={styles.perkPill}>
                      {p}
                    </span>
                  ))}
                </div>

                {/* Card Glow Corner Accent */}
                <div className={styles.cardCornerAccent} />
              </li>
            );
          })}
        </ol>

        {/* Conversion & Action Banner Strip */}
        <div className={styles.actionStrip}>
          <div className={styles.actionContent}>
            <div className={styles.actionIconWrap}>
              <span className={styles.actionIcon}>⚡</span>
            </div>
            <div className={styles.actionTexts}>
              <h3 className={styles.actionTitle}>
                {isAr ? "جاهز لخوض النزال وإثبات مهاراتك الذهنية؟" : "Ready to Prove Your Mental Mastery?"}
              </h3>
              <p className={styles.actionSub}>
                {isAr
                  ? "اختر لعبتك المفضلة الآن، العب مجاناً أو نافس في بطولات الكاش مع سحب فوري للأرباح."
                  : "Pick your game now. Play free or compete in cash tournaments with instant payouts."}
              </p>
            </div>
          </div>
          <div className={styles.actionButtons}>
            <LocaleLink href="/play" className={styles.primaryCta}>
              <span>{isAr ? "العب نزالك الأول مجاناً" : "Play First Match Free"}</span>
              <span className={styles.ctaArrow}>⚔️</span>
            </LocaleLink>
            <LocaleLink href="/tournaments" className={styles.secondaryCta}>
              <span>{isAr ? "استكشف ساحة البطولات" : "Explore Tournaments"}</span>
              <span className={styles.ctaArrow}>🏆</span>
            </LocaleLink>
          </div>
        </div>
      </div>
    </section>
  );
}
