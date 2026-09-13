"use client";

import { use, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { JsonLd } from "@/components/seo/JsonLd";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { getGame, listGames } from "@/lib/games";
import { getGameContent, type GameLocalizedContent } from "@/lib/games/game-content";
import styles from "./game-details.module.css";

type TabKey =
  | "overview"
  | "rules"
  | "beginner"
  | "strategy"
  | "advanced"
  | "faq"
  | "tournament"
  | "livePlay"
  | "leaderboard";

type LeaderboardEntry = {
  player_id: string;
  handle: string;
  rating_x100: number;
  rd_x100: number;
  games_played: number;
};

export default function GameDetailsPage({
  params,
}: {
  params: Promise<{ locale: string; gameId: string }>;
}) {
  const { locale, gameId } = use(params);
  const { t } = useI18n();
  const plugin = getGame(gameId);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const gameContent: GameLocalizedContent | null = getGameContent(gameId, locale);
  const allGames = listGames();

  if (!plugin) {
    return (
      <>
        <Header />
        <main className="nz-container">
          <p className={styles.unknown}>{t("common.unknown_game")}</p>
        </main>
        <Footer />
      </>
    );
  }

  const isRtl = locale === "ar";
  const gameName = gameContent?.title || t(`common.game_names.${plugin.nameKey}`);
  const tagline = gameContent?.tagline || t(`home.games.${plugin.nameKey}.description`);
  const coreCta = gameContent?.coreCta || (isRtl ? "اثبت مهارتك. العب. اكسب." : "PROVE. PLAY. WIN.");
  const legalNotice =
    gameContent?.legalPrizeNotice ||
    (isRtl
      ? "اكسب الجوائز عبر منافسات المهارة المؤهلة"
      : "earn prizes through eligible skill competitions");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nizalo.com";
  const canonicalUrl = `${siteUrl}/${locale}/games/${plugin.id}`;

  // Structured Data
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isRtl ? "الرئيسية" : "Home",
        item: `${siteUrl}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isRtl ? "الألعاب" : "Games",
        item: `${siteUrl}/${locale}/games`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: gameName,
        item: canonicalUrl,
      },
    ],
  };

  const videoGameLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: gameName,
    description: tagline,
    genre: ["Skill Game", "Board Game", "Competitive Strategy"],
    gamePlatform: ["Web Browser", "Android", "iOS"],
    applicationCategory: "Game",
    inLanguage: locale,
    url: canonicalUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: {
      "@type": "Organization",
      name: "Nizalo Arena",
      url: siteUrl,
    },
  };

  const faqLd = gameContent?.faq && gameContent.faq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: gameContent.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }
    : null;

  const tabLabels: Record<TabKey, string> = {
    overview: isRtl ? "نظرة عامة" : "Overview",
    rules: isRtl ? "القواعد الرسمية" : "Rules",
    beginner: isRtl ? "دليل المبتدئين" : "Beginner Guide",
    strategy: isRtl ? "الاستراتيجية التكتيكية" : "Tactics & Strategy",
    advanced: isRtl ? "الاحتراف المتقدم" : "Advanced Mastery",
    faq: isRtl ? "الأسئلة الشائعة" : "FAQ",
    tournament: isRtl ? "البطولات والتصفيات" : "Tournaments",
    livePlay: isRtl ? "اللعب المباشر والنزاهة" : "Live & Fair Play",
    leaderboard: isRtl ? "لوحة المتصدرين" : "Leaderboard",
  };

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={videoGameLd} />
      {faqLd && <JsonLd data={faqLd} />}

      <Header />
      <main className="nz-container" dir={isRtl ? "rtl" : "ltr"}>
        {/* Breadcrumb Navigation */}
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <LocaleLink href="/" className={styles.breadcrumbLink}>
            {isRtl ? "الرئيسية" : "Home"}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <LocaleLink href="/games" className={styles.breadcrumbLink}>
            {isRtl ? "الألعاب" : "Games"}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>{gameName}</span>
        </nav>

        {/* Hero Section */}
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badgeRow}>
              <span className={styles.badgeTag}>
                {plugin.turnModel === "SIMULTANEOUS"
                  ? isRtl ? "أدوار متزامنة" : "Simultaneous Turns"
                  : isRtl ? "أدوار متبادلة" : "Alternating Turns"}
              </span>
              <span className={styles.badgeTag}>
                {t(`home.games.${plugin.nameKey}.duration`)}
              </span>
              <span className={styles.badgeTag}>
                {plugin.cashEnabled
                  ? isRtl ? "منافسات مهارية بجوائز" : "Prize Tournaments Active"
                  : isRtl ? "لعب مجاني وتدريب" : "Free Play Only"}
              </span>
            </div>

            <h1 className={styles.heading}>{gameName}</h1>
            <p className={styles.tagline}>{tagline}</p>

            <dl className={styles.factsBar}>
              <div className={styles.factItem}>
                <dt>{isRtl ? "نموذج اللعب" : "Turn Model"}</dt>
                <dd>
                  {plugin.turnModel === "SIMULTANEOUS"
                    ? isRtl ? "متزامن" : "Simultaneous"
                    : isRtl ? "متبادل" : "Alternating"}
                </dd>
              </div>
              <div className={styles.factItem}>
                <dt>{isRtl ? "متوسط الجولة" : "Avg Duration"}</dt>
                <dd>{t(`home.games.${plugin.nameKey}.duration`)}</dd>
              </div>
              <div className={styles.factItem}>
                <dt>{isRtl ? "النمط التنافسي" : "Competitive Mode"}</dt>
                <dd>{t(`home.games.${plugin.nameKey}.mode`)}</dd>
              </div>
              <div className={styles.factItem}>
                <dt>{isRtl ? "مستوى التحدي" : "Skill Ceiling"}</dt>
                <dd>{isRtl ? "عالي / استراتيجي" : "High / Pure Skill"}</dd>
              </div>
            </dl>

            <div className={styles.ctaBox}>
              <div className={styles.ctaActions}>
                <LocaleLink href={`/play/${plugin.id}`}>
                  <Button variant="primary">
                    {isRtl ? `تحدَّ الآن في ${gameName}` : `Play ${gameName} Now`}
                  </Button>
                </LocaleLink>
                <span className={styles.coreCtaBanner}>{coreCta}</span>
              </div>
              <p className={styles.complianceNote}>{legalNotice}</p>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <GameThumbnail gameId={plugin.id} title={gameName} variant="hero" />
          </div>
        </header>

        {/* Tab Navigation */}
        <div className={styles.tabsNav} role="tablist">
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <section className={styles.tabContent}>
          {/* 1. OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {isRtl ? `عن لعبة ${gameName}` : `About ${gameName}`}
                </h2>
                {gameContent?.overview && gameContent.overview.length > 0 ? (
                  gameContent.overview.map((paragraph, idx) => (
                    <p key={idx} className={styles.cardText}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className={styles.cardText}>{t(`home.games.${plugin.nameKey}.description`)}</p>
                )}
              </div>

              <div className={styles.listGrid}>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {isRtl ? "نزاهة كاملة بدون حظ" : "Zero RNG / Pure Skill"}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {isRtl
                      ? "تعتمد نتائج المباريات كلياً على البراعة الذهنية والسرعة الحركية والتخطيط الاستراتيجي، دون تدخل أي عنصر من عناصر الحظ أو الصدفة."
                      : "Outcomes are determined solely by cognitive precision, strategic planning, and execution speed. Random number generators (RNG) do not influence results."}
                  </p>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {isRtl ? "توقيت مركزي محمي" : "Centralized Authoritative Clock"}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {isRtl
                      ? "تتم مزامنة ساعات المباريات بالمللي ثانية على خوادم Nizalo السحابية لمنع التلاعب بالتوقيت أو هجمات تأخير الاتصال."
                      : "Clocks are synchronized down to the millisecond on Nizalo's edge cloud, neutralizing local client clock spoofing and lag abuse."}
                  </p>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {isRtl ? "تصنيف ELO عادل ومستمر" : "Glicko-2 & ELO Precision"}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {isRtl
                      ? "يتم احتساب تصنيفك بدقة بعد كل مباراة باستخدام خوارزميات Glicko-2 الرسمية لضمان مواجهة خصوم من نفس المستوى التنافسي."
                      : "Ratings evolve dynamically after every sanctioned match using calibrated Glicko-2 mathematics to guarantee fair, balanced matchmaking."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. RULES */}
          {activeTab === "rules" && (
            <div>
              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {isRtl ? "الهدف الأساسي للمباراة" : "Primary Objective"}
                </h2>
                <p className={styles.cardText}>
                  {gameContent?.rules.objective ||
                    (isRtl
                      ? "تحقيق شروط الفوز المحددة لقواعد اللعبة الرسمية قبل الخصم أو عند استنفاد وقته."
                      : "Fulfill the sanctioned victory condition before your opponent or force a timeout win.")}
                </p>

                <h3 className={styles.featureBoxHeading} style={{ marginTop: "20px" }}>
                  {isRtl ? "إعدادات الرقعة / اللوحة" : "Setup & Layout"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.rules.setup ||
                    (isRtl
                      ? "يتم توزيع القطع وتعيين المواقع الابتدائية تلقائياً بدقة هندسية موحدة لكلتا الجهتين."
                      : "Pieces and boards initialize instantaneously following certified competitive layouts.")}
                </p>
              </div>

              <div className={styles.listGrid}>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {isRtl ? "آليات اللعب وقوانين الحركة" : "Core Mechanics"}
                  </h3>
                  <ul className={styles.featureBoxList}>
                    {gameContent?.rules.mechanics.map((mech, idx) => (
                      <li key={idx}>{mech}</li>
                    )) || (
                      <li>{isRtl ? "تطبيق القواعد الرسمية المعتمدة دولياً." : "Official tournament rules apply."}</li>
                    )}
                  </ul>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {isRtl ? "شروط حسم الانتصار" : "Victory Conditions"}
                  </h3>
                  <ul className={styles.featureBoxList}>
                    {gameContent?.rules.victoryConditions.map((cond, idx) => (
                      <li key={idx}>{cond}</li>
                    )) || (
                      <li>{isRtl ? "تحقيق شروط الإماتة أو النقاط المحددة." : "Decisive tactical checkmate or score threshold."}</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 3. BEGINNER */}
          {activeTab === "beginner" && (
            <div className={styles.listGrid}>
              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {isRtl ? "نصائح جوهرية للمبتدئين" : "Fundamental Beginner Tips"}
                </h2>
                <ul className={styles.featureBoxList}>
                  {gameContent?.beginner.coreTips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  )) || (
                    <li>{isRtl ? "ركز على السيطرة على المركز وإدارة الوقت." : "Focus on board center and time preservation."}</li>
                  )}
                </ul>
              </div>

              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {isRtl ? "أخطاء شائعة يجب تجنبها" : "Costly Mistakes to Avoid"}
                </h2>
                <ul className={styles.featureBoxList}>
                  {gameContent?.beginner.commonMistakes.map((mistake, idx) => (
                    <li key={idx} style={{ color: "#ff8b8b" }}>
                      {mistake}
                    </li>
                  )) || (
                    <li>{isRtl ? "التسرع في التحريك دون فحص ردود الخصم." : "Premature attacks without calculation."}</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* 4. STRATEGY */}
          {activeTab === "strategy" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "مبادئ الافتتاح والانتشار" : "Opening Principles"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.openingPrinciples.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "تطوير سريع ومدروس للقطع." : "Rapid harmonious piece development."}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "الأنماط التكتيكية الحاسمة" : "Tactical Patterns"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.tacticalPatterns.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "البحث عن نقاط الضعف المزدوجة." : "Exploiting overloaded enemy positions."}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "تنسيق وسط الدور" : "Midgame Coordination"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.midgameCoordination.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "فتح مسارات الضغط المتزامن." : "Coordinated pressure across open lines."}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* 5. ADVANCED */}
          {activeTab === "advanced" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "الحساب العميق والشجري" : "Deep Calculation"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.deepCalculation.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "حساب 4 إلى 6 نقلات حاسمة للأمام." : "Visualizing 4 to 6 forced plies ahead."}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "إدارة الوقت والضغط النفسي" : "Clock Management"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.clockManagement.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "الحفاظ على تفوق زمني للضغط على الخصم." : "Maintaining temporal advantage for endgame leverage."}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "تقنيات حسم النهايات" : "Endgame Precision"}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.endgameTechnique.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{isRtl ? "تحويل التفوق الطفيف إلى فوز مؤكد." : "Converting fractional positional edges into victory."}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* 6. FAQ */}
          {activeTab === "faq" && (
            <div>
              {gameContent?.faq && gameContent.faq.length > 0 ? (
                gameContent.faq.map((item, idx) => (
                  <details key={idx} className={styles.faqItem}>
                    <summary className={styles.faqSummary}>{item.question}</summary>
                    <p className={styles.faqAnswer}>{item.answer}</p>
                  </details>
                ))
              ) : (
                <p className={styles.empty}>
                  {isRtl ? "لا توجد أسئلة شائعة مسجلة حالياً." : "No FAQs currently recorded."}
                </p>
              )}
            </div>
          )}

          {/* 7. TOURNAMENT */}
          {activeTab === "tournament" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "نظام وهيكل البطولات" : "Tournament Format"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.format ||
                    (isRtl
                      ? "تصفيات خروج المغلوب بنظام السويسري أو الإقصاء المباشر."
                      : "Single elimination or Swiss bracket tournament structure.")}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "قواعد كسر التعادل" : "Tie-Breaker Rules"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.tieBreakers ||
                    (isRtl
                      ? "جولة حاسمة سريعة (Blitz Armageddon) لحسم المتأهل."
                      : "Decisive Blitz sudden-death blitz playoff.")}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "توزيع الجوائز المعتمد" : "Prize Distribution"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.prizeDistribution ||
                    (isRtl
                      ? "إيداع فوري ومؤتمت في المحفظة لحاملي المراكز الأولى."
                      : "Immediate audited smart escrow settlement to eligible winners.")}
                </p>
              </div>
            </div>
          )}

          {/* 8. LIVE PLAY */}
          {activeTab === "livePlay" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "خوارزمية التوفيق التنافسي" : "Skill Matchmaking"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.matchmaking ||
                    (isRtl
                      ? "مطابقة آنية مبنية على تقارب نقاط التصنيف ومعدل الثقة."
                      : "Real-time rating tolerance expansion for minimal waiting times.")}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "حماية تأخير الاتصال (Lag Protection)" : "Latency Protection"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.latencyProtection ||
                    (isRtl
                      ? "تعويض زمني عادل يعزل تقلبات الإنترنت غير المتوقعة."
                      : "Server-side state reconciliation with lag compensation.")}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {isRtl ? "محرك النزاهة وكشف الغش" : "Fair Play Shield"}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.fairPlayEngine ||
                    (isRtl
                      ? "فحص وتحليل إحصائي آني لحركات اللعب لمنع المحركات والمساعدات."
                      : "Continuous behavioral telemetry against engine assistance.")}
                </p>
              </div>
            </div>
          )}

          {/* 9. LEADERBOARD */}
          {activeTab === "leaderboard" && (
            <div className={styles.contentCard}>
              <h2 className={styles.cardTitle}>
                {isRtl ? `أفضل اللاعبين في ${gameName}` : `Top Ranked Players in ${gameName}`}
              </h2>
              <Leaderboard gameId={plugin.id} />
            </div>
          )}
        </section>

        {/* Internal Linking: Other 9 Games Carousel / Grid */}
        <section style={{ borderTop: "1px solid var(--nz-line)", paddingBlock: "var(--nz-space-8)" }}>
          <h2 className={styles.cardTitle}>
            {isRtl ? "اكتشف ألعاب المهارة الأخرى" : "Explore Other Skill Games"}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--nz-space-4)",
              marginTop: "var(--nz-space-4)",
            }}
          >
            {allGames
              .filter((g) => g.id !== plugin.id)
              .map((g) => (
                <LocaleLink
                  key={g.id}
                  href={`/games/${g.id}`}
                  style={{
                    textDecoration: "none",
                    background: "var(--nz-surface-1, #12141a)",
                    border: "1px solid var(--nz-line)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  <div style={{ aspectRatio: "16 / 9" }}>
                    <GameThumbnail gameId={g.id} title={t(`common.game_names.${g.nameKey}`)} />
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "14px",
                        color: "var(--nz-text)",
                        marginBottom: "4px",
                      }}
                    >
                      {t(`common.game_names.${g.nameKey}`)}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--nz-text-3)" }}>
                      {t(`home.games.${g.nameKey}.duration`)}
                    </div>
                  </div>
                </LocaleLink>
              ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Leaderboard({ gameId }: { gameId: string }) {
  const { t } = useI18n();
  const { player, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!player) {
      setSignedOut(true);
      return;
    }
    let cancelled = false;
    void get<{ gameId: string; entries: LeaderboardEntry[] }>(
      `/v1/leaderboard?game=${encodeURIComponent(gameId)}&limit=10`
    )
      .then((r) => {
        if (!cancelled) setEntries(r.entries);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setSignedOut(true);
        else setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, player, loading]);

  if (signedOut)
    return (
      <p className={styles.empty}>{t("gameDetailsPage.leaderboard_signed_out")}</p>
    );
  if (entries === null) return null;
  if (entries.length === 0)
    return <p className={styles.empty}>{t("gameDetailsPage.leaderboard_empty")}</p>;

  return (
    <ol className={styles.leaderboard}>
      {entries.map((e, i) => (
        <li key={e.player_id} className={styles.leaderboardRow}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.handle}>{e.handle}</span>
          <span className={styles.played}>
            {t("gameDetailsPage.leaderboard_games_played", { count: e.games_played })}
          </span>
          <span className={`nz-num ${styles.rating}`}>
            {Math.round(e.rating_x100 / 100)}
          </span>
        </li>
      ))}
    </ol>
  );
}
