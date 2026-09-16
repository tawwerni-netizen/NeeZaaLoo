"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { transition } from "@/lib/motion";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import { get } from "@/lib/api";
import styles from "./Hero.module.css";

const FEATURED_COUNT = 6;

export const RECENT_WINNERS = [
  { id: "w1", winner: "Karim_Master", avatar: "K", amount: 47.50, asset: "USDT", gameAr: "شطرنج خاطف", gameEn: "Blitz Chess", timeAr: "منذ دقيقتين", timeEn: "2m ago" },
  { id: "w2", winner: "Tariq_Pro", avatar: "T", amount: 19.00, asset: "USDT", gameAr: "طاولة زهر (1v1)", gameEn: "Backgammon", timeAr: "منذ 4 دقائق", timeEn: "4m ago" },
  { id: "w3", winner: "Sara_Queen", avatar: "S", amount: 95.00, asset: "USDT", gameAr: "داما تكتيكية", gameEn: "Checkers", timeAr: "منذ 6 دقائق", timeEn: "6m ago" },
  { id: "w4", winner: "Fahad_99", avatar: "F", amount: 38.00, asset: "USDT", gameAr: "دومينو محترفين", gameEn: "Dominoes", timeAr: "منذ 8 دقائق", timeEn: "8m ago" },
  { id: "w5", winner: "Ziad_Speed", avatar: "Z", amount: 19.00, asset: "USDT", gameAr: "الحساب السريع", gameEn: "Speed Math", timeAr: "منذ 11 دقيقة", timeEn: "11m ago" },
  { id: "w6", winner: "Othman_Ace", avatar: "O", amount: 190.00, asset: "USDT", gameAr: "أربعة على التوالي", gameEn: "Connect Four", timeAr: "منذ 15 دقيقة", timeEn: "15m ago" },
];

export const QUICK_STAKES = [
  { stake: 2, prize: 3.80, tagAr: "بداية سريعة 🚀", tagEn: "Fast Start 🚀" },
  { stake: 5, prize: 9.50, tagAr: "نزال الأبطال 🔥 الأكثر طلباً", tagEn: "Popular 🔥 Most Wanted", popular: true },
  { stake: 10, prize: 19.00, tagAr: "تحدي المحترفين ⚡", tagEn: "Pro Duel ⚡" },
  { stake: 25, prize: 47.50, tagAr: "نزال النخبة 💎", tagEn: "Elite 💎" },
  { stake: 50, prize: 95.00, tagAr: "كبار المتحدين 👑", tagEn: "High-Roller 👑" },
];

type ShowcaseSlide = {
  id: string;
  gameId: string;
  image: string;
  superAr: string;
  superEn: string;
  titleAr: string;
  titleEn: string;
  metaAr: string;
  metaEn: string;
  badgeAr: string;
  badgeEn: string;
  tagAr: string;
  tagEn: string;
  targetHref: string;
};

const SHOWCASE_SLIDES: ShowcaseSlide[] = [
  {
    id: "chess",
    gameId: "chess",
    image: "/images/hero-showcase/showcase-chess-blitz.jpg",
    superAr: "بطولة الشطرنج الخاطف",
    superEn: "CHESS BLITZ ARENA",
    titleAr: "مواجهات الشطرنج الخاطف 1v1",
    titleEn: "1v1 Grandmaster Chess Blitz",
    metaAr: "تسوية فورية • خوارزمية مكافحة الغش • تصنيف ELO معتمد",
    metaEn: "Instant Settlement • Certified Anti-Cheat • FIDE ELO Standard",
    badgeAr: "ميدان مباشر",
    badgeEn: "LIVE SKILL ARENA",
    tagAr: "تحدَّ الآن ↗",
    tagEn: "PLAY BLITZ ↗",
    targetHref: "/play/chess",
  },
  {
    id: "dominoes",
    gameId: "dominoes",
    image: "/images/hero-showcase/showcase-dominoes-clash.jpg",
    superAr: "مواجهات الدومينو التكتيكية",
    superEn: "DOMINOES CLASH",
    titleAr: "تحديات أساتذة الدومينو الكلاسيكي",
    titleEn: "Classic Dominoes Clash",
    metaAr: "حساب دقيق للنقاط • خالية من الحظ • جولات سريعة",
    metaEn: "Precision Tile Engine • Deterministic State • Fast Rounds",
    badgeAr: "أرينا حية",
    badgeEn: "LIVE ARENA",
    tagAr: "العب الآن ↗",
    tagEn: "PLAY NOW ↗",
    targetHref: "/play/dominoes",
  },
  {
    id: "backgammon",
    gameId: "backgammon",
    image: "/images/hero-showcase/showcase-backgammon-masters.jpg",
    superAr: "بطولة طاولة الزهر الكبرى",
    superEn: "BACKGAMMON MASTERS",
    titleAr: "بطولة طاولة الزهر الإمبراطورية",
    titleEn: "Imperial Backgammon Cup",
    metaAr: "أدوار متسلسلة • عدالة رقمية كاملة • أرينا المحترفين",
    metaEn: "High-Stakes Tawla • Provably Fair Clock • Pro Arena",
    badgeAr: "مباشر الآن",
    badgeEn: "ACTIVE ARENA",
    tagAr: "ادخل الأرينا ↗",
    tagEn: "ENTER ARENA ↗",
    targetHref: "/play/backgammon",
  },
  {
    id: "math",
    gameId: "speed-math",
    image: "/images/hero-showcase/showcase-math-olympiad.jpg",
    superAr: "أولمبياد الحساب الذهني",
    superEn: "SPEED MATH OLYMPIAD",
    titleAr: "أولمبياد الحساب والسرعة الذهنية",
    titleEn: "Speed Math Mind Olympiad",
    metaAr: "معادلات متتالية • وقت متسارع • أعلى معدل ذكاء",
    metaEn: "Mental Arithmetic • Clock Pressure • Pure Calculation",
    badgeAr: "تحدي العقول",
    badgeEn: "MIND BATTLE",
    tagAr: "اختبر سرعتك ↗",
    tagEn: "TEST SPEED ↗",
    targetHref: "/play/speed-math",
  },
  {
    id: "xo",
    gameId: "xo",
    image: "/images/hero-showcase/showcase-xo-speed.jpg",
    superAr: "مبارزات إكس أو الخاطفة",
    superEn: "XO BLITZ BATTLE",
    titleAr: "تحدي السرعة القصوى XO",
    titleEn: "XO Ultra Speed Arena",
    metaAr: "جولات 60 ثانية • سرعة بديهة مطلقة • مباريات فورية",
    metaEn: "60-Second Blitz • Lightning Reflexes • Instant Match",
    badgeAr: "سرعة فائقة",
    badgeEn: "LIGHTNING SPEED",
    tagAr: "العب في ثوانٍ ↗",
    tagEn: "PLAY NOW ↗",
    targetHref: "/play/xo",
  },
  {
    id: "connect4",
    gameId: "connect-four",
    image: "/images/hero-showcase/showcase-connect4-matrix.jpg",
    superAr: "تحدي المصفوفة الرأسي",
    superEn: "MATRIX ARENA",
    titleAr: "أربعة على التوالي - الصراع السريع",
    titleEn: "Connect Four Speed Matrix",
    metaAr: "تفكير استراتيجي فوري • خروج المغلوب • تصفيات مباشرة",
    metaEn: "Vertical Tactical Grid • Instant Matchmaking • Zero RNG",
    badgeAr: "مبارزة 1v1",
    badgeEn: "1v1 DUEL",
    tagAr: "تحدَّ الخصم ↗",
    tagEn: "CHALLENGE ↗",
    targetHref: "/play/connect-four",
  },
  {
    id: "checkers",
    gameId: "checkers",
    image: "/images/hero-showcase/showcase-checkers-crown.jpg",
    superAr: "تصفيات تاج الداما",
    superEn: "CROWN MASTERS",
    titleAr: "بطولة الداما التكتيكية الكلاسيكية",
    titleEn: "Checkers Crown Elimination",
    metaAr: "قوانين دولية معتمدة • ترقية الملوك • حسم مهاري",
    metaEn: "Official Standard • Crown Promotion • Pure Skill Duel",
    badgeAr: "جولة حاسمة",
    badgeEn: "KNOCKOUT ROUND",
    tagAr: "ابدأ التحدي ↗",
    tagEn: "START DUEL ↗",
    targetHref: "/play/checkers",
  },
  {
    id: "reversi",
    gameId: "reversi",
    image: "/images/hero-showcase/showcase-reversi-arena.jpg",
    superAr: "كأس ريفيرسي الإستراتيجي",
    superEn: "REVERSI CHAMPIONSHIP",
    titleAr: "ريفيرسي: تكتيك قلب الأوبسيديان",
    titleEn: "Reversi Obsidian Flip Cup",
    metaAr: "انقلاب الموازين في ثوانٍ • تحكم استراتيجي بالأطراف",
    metaEn: "Dynamic Flipping • Corner Strategy • High Skill Ceiling",
    badgeAr: "استراتيجية عميقة",
    badgeEn: "DEEP STRATEGY",
    tagAr: "تحدَّ الآن ↗",
    tagEn: "PLAY REVERSI ↗",
    targetHref: "/play/reversi",
  },
  {
    id: "gomoku",
    gameId: "gomoku",
    image: "/images/hero-showcase/showcase-gomoku-cup.jpg",
    superAr: "بطولة غوموكو الدولية",
    superEn: "GOMOKU ZEN CUP",
    titleAr: "غوموكو: محاذاة الأحجار الخمسة",
    titleEn: "Gomoku Five-in-a-Row Cup",
    metaAr: "هجوم ودفاع متزامن • رقعة 15×15 • مهارة نقية",
    metaEn: "Five-Stone Alignment • 15x15 Matrix • Pure Tactical Duel",
    badgeAr: "نخبة الأرينا",
    badgeEn: "ELITE ARENA",
    tagAr: "خض المنافسة ↗",
    tagEn: "ENTER CUP ↗",
    targetHref: "/play/gomoku",
  },
  {
    id: "seega",
    gameId: "seega",
    image: "/images/hero-showcase/showcase-seega-championship.jpg",
    superAr: "بطولة السيجة التراثية",
    superEn: "SEEGA GRAND ARENA",
    titleAr: "السيجة: صراع الذكاء التراثي الكلاسيكي",
    titleEn: "Seega Desert Strategy Arena",
    metaAr: "تراث شرقي عريق • حصار القطع • منافسات بطولية",
    metaEn: "Heritage Tactics • Stone Encirclement • Tournament Standard",
    badgeAr: "تراث ومهارة",
    badgeEn: "HERITAGE SKILL",
    tagAr: "العب السيجة ↗",
    tagEn: "PLAY SEEGA ↗",
    targetHref: "/play/seega",
  },
];

const stage = (index: number, reduceMotion: boolean | null) => ({
  initial: reduceMotion ? {} : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transition.reveal, delay: reduceMotion ? 0 : index * 0.12 },
});

export function Hero() {
  const reduceMotion = useReducedMotion();
  const { t, dir, locale } = useI18n();
  const isRtl = dir === "rtl";
  const featured = listGames().slice(0, FEATURED_COUNT);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedIndices, setLoadedIndices] = useState<number[]>([0]);

  const [activeWinnerIdx, setActiveWinnerIdx] = useState(0);
  const [lobbyStats, setLobbyStats] = useState({ openChallenges: 0, activePlayers: 0, activeMatches: 0 });

  useEffect(() => {
    const t = setInterval(() => {
      setActiveWinnerIdx((prev) => (prev + 1) % RECENT_WINNERS.length);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void get<{ openChallenges: number; activePlayers: number; activeMatches: number }>("/v1/lobby/stats")
      .then((res) => {
        if (res) {
          setLobbyStats({
            openChallenges: res.openChallenges || 0,
            activePlayers: res.activePlayers || 0,
            activeMatches: res.activeMatches || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length);
  }, []);

  // Preload upcoming slides on demand
  useEffect(() => {
    setLoadedIndices((prev) => {
      const nextIdx = (currentIdx + 1) % SHOWCASE_SLIDES.length;
      if (prev.includes(currentIdx) && prev.includes(nextIdx)) return prev;
      const set = new Set(prev);
      set.add(currentIdx);
      set.add(nextIdx);
      return Array.from(set);
    });
  }, [currentIdx]);

  // Automatic slideshow rotation every 4.2 seconds
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 4200);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const currentSlide = SHOWCASE_SLIDES[currentIdx] ?? SHOWCASE_SLIDES[0]!;

  return (
    <section className={styles.hero} dir={isRtl ? "rtl" : "ltr"}>
      <div className={`nz-container ${styles.container}`}>
        {/* Top Hero Statement / Copy Zone */}
        <div className={styles.headerZone}>
          {/* Live Wins / Cashout Proof Ticker (Neuro-Design Social Proof & FOMO) */}
          <div className={styles.liveWinsTicker}>
            <div className={styles.tickerBadge}>
              <span className={styles.tickerLiveDot} />
              <span className={styles.tickerBadgeText}>
                {isRtl ? "سحب فوري تم للتو ⚡" : "Live Cashout ⚡"}
              </span>
            </div>
            <div className={styles.tickerSlideWrap}>
              {(() => {
                const currentWin = RECENT_WINNERS[activeWinnerIdx] ?? RECENT_WINNERS[0];
                if (!currentWin) return null;
                return (
                  <div key={currentWin.id} className={styles.tickerSlide}>
                    <span className={styles.winnerAvatar}>{currentWin.avatar}</span>
                    <span className={styles.winnerText}>
                      {isRtl ? (
                        <>
                          فاز اللاعب <strong>{currentWin.winner}</strong> بجائزة{" "}
                          <span className={styles.winnerAmount}>
                            +{currentWin.amount.toFixed(2)} {currentWin.asset}
                          </span>{" "}
                          في لعبة <em>{currentWin.gameAr}</em> ({currentWin.timeAr})
                        </>
                      ) : (
                        <>
                          Player <strong>{currentWin.winner}</strong> won{" "}
                          <span className={styles.winnerAmount}>
                            +{currentWin.amount.toFixed(2)} {currentWin.asset}
                          </span>{" "}
                          in <em>{currentWin.gameEn}</em> ({currentWin.timeEn})
                        </>
                      )}
                    </span>
                    <span className={styles.instantVerifiedBadge}>
                      {isRtl ? "✓ مسحوبة للمحفظة" : "✓ Paid to Wallet"}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          <motion.div {...stage(0, reduceMotion)} className={styles.eyebrowWrap}>
            <span className={styles.eyebrowBadge}>
              <span className={styles.eyebrowBeacon} aria-hidden="true" />
              <span>{isRtl ? "منصة الألعاب التنافسية المهارية الأولى" : t("home.hero.eyebrow")}</span>
            </span>
          </motion.div>

          <motion.h1 {...stage(1, reduceMotion)} className={styles.headline}>
            <span>{isRtl ? "ضاعف رهانك بمهارتك." : t("home.hero.headline_line1")}</span>{" "}
            <span className={styles.headlineAccent}>{isRtl ? "اكسب كاش فورياً." : t("home.hero.headline_line2")}</span>
          </motion.h1>

          <motion.p {...stage(2, reduceMotion)} className={styles.subhead}>
            {isRtl
              ? "نافس لاعبين حقيقيين 1v1 في 10 ألعاب مهارية معتمدة بدون أي عنصر حظ. اربح جوائز USDT كاش تُحوَّل لمحفظتك وتُسحب فوراً خلال 60 ثانية."
              : t("home.hero.subhead")}
          </motion.p>

          <motion.div {...stage(3, reduceMotion)} className={styles.actions}>
            <LocaleLink href="/play">
              <Button variant="primary" className={styles.primaryBtn}>
                <span style={{ marginInlineEnd: "6px" }}>⚔️</span>
                {isRtl ? "ابدأ النزال الآن واكسب الكاش" : t("home.hero.cta_primary")}
              </Button>
            </LocaleLink>
            <LocaleLink href="/wallet">
              <Button variant="ghost" className={styles.secondaryBtn}>
                <span style={{ marginInlineEnd: "6px" }}>💳</span>
                {isRtl ? "شحن المحفظة فوراً" : "Instant Deposit"}
              </Button>
            </LocaleLink>
          </motion.div>

          {featured.length > 0 && (
            <motion.div {...stage(4, reduceMotion)} className={styles.featured}>
              <span className={styles.featuredLabel}>{t("home.hero.featured_heading")}</span>
              <div className={styles.featuredList}>
                {featured.map((game) => {
                  const name = t(`common.game_names.${game.nameKey}`);
                  return (
                    <LocaleLink key={game.id} href={`/play/${game.id}`} className={styles.featuredChip}>
                      <span className={styles.featuredGlyph} aria-hidden="true">{name.slice(0, 1)}</span>
                      <span>{name}</span>
                    </LocaleLink>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Instant Quick-Stake Match Selector (1-Click Cash Action & High Rewards) */}
          <div className={styles.quickStakeSection}>
            <div className={styles.quickStakeHeader}>
              <div className={styles.quickStakeTitle}>
                <span>⚡</span>
                <span>
                  {isRtl ? "باقات النزال السريع (اختر قيمة النزال واكسب الجائزة فوراً):" : "Instant Quick-Stakes (Pick stake & win prize immediately):"}
                </span>
              </div>
              <span className={styles.quickStakeSub}>
                {isRtl ? "سحب الأرباح فوري خلال 60 ثانية ⚡" : "Instant 60s Cash Withdrawal ⚡"}
              </span>
            </div>

            <div className={styles.quickStakeGrid}>
              {QUICK_STAKES.map((qs) => (
                <LocaleLink
                  key={qs.stake}
                  href={`/play?stake=${qs.stake}&tier=CASH`}
                  className={`${styles.quickStakeCard} ${qs.popular ? styles.quickStakeCardPopular : ""}`}
                  title={isRtl ? `بدء نزال بقيمة ${qs.stake} USDT` : `Start a ${qs.stake} USDT duel`}
                >
                  {qs.popular && (
                    <span className={styles.popularBadge}>
                      {isRtl ? "🔥 الأكثر طلباً" : "🔥 Most Popular"}
                    </span>
                  )}
                  <div className={styles.quickStakeTop}>
                    <span className={styles.stakeAmountVal}>${qs.stake}</span>
                    <span className={styles.stakeAmountCurrency}>USDT</span>
                  </div>
                  <div className={styles.quickStakePrizeBox}>
                    <span className={styles.prizePrefix}>{isRtl ? "تكسب:" : "Win:"}</span>
                    <span className={styles.prizeNumber}>${qs.prize.toFixed(2)}</span>
                    <span className={styles.prizeCurrency}>USDT</span>
                  </div>
                  <span className={styles.quickStakeTag}>
                    {isRtl ? qs.tagAr : qs.tagEn}
                  </span>
                </LocaleLink>
              ))}
            </div>
          </div>
        </div>

        {/* Large Grand Full-Width Showcase Slider */}
        <motion.div
          {...stage(3, reduceMotion)}
          className={styles.visualFullWidth}
        >
          <div className={styles.showcaseGlowBackdrop} aria-hidden="true" />
          
          <div
            className={styles.carouselContainer}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <LocaleLink href={currentSlide.targetHref} className={styles.showcaseCard}>
              {/* Stack of slides with on-demand lazy mounting and WebP optimization */}
              <div className={styles.slidesStack}>
                {SHOWCASE_SLIDES.map((slide, idx) => {
                  if (!loadedIndices.includes(idx)) return null;
                  const webpSrc = slide.image.replace(/\.jpg$/, ".webp");
                  const isActive = idx === currentIdx;
                  return (
                    <picture
                      key={slide.id}
                      className={`${styles.bannerPicture} ${isActive ? styles.bannerPictureActive : ""}`}
                    >
                      <source srcSet={webpSrc} type="image/webp" />
                      <img
                        src={slide.image}
                        alt={isRtl ? slide.titleAr : slide.titleEn}
                        className={styles.bannerImg}
                        width={1240}
                        height={520}
                        loading={idx === 0 ? "eager" : "lazy"}
                        decoding={idx === 0 ? "sync" : "async"}
                        fetchPriority={idx === 0 ? "high" : "low"}
                      />
                    </picture>
                  );
                })}
              </div>

              <div className={styles.bannerOverlay} />
              <div className={styles.cyberCornerTL} />
              <div className={styles.cyberCornerBR} />
              
              {/* Dynamic Badge */}
              <div className={styles.badgeArena}>
                <span className={styles.pulsingDot} />
                <span>{isRtl ? currentSlide.badgeAr : currentSlide.badgeEn}</span>
              </div>

              <div className={styles.badgeCertified}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <span>{isRtl ? "100% لعب عادل" : "100% FAIR PLAY"}</span>
              </div>

              {/* Dynamic Bottom Bar */}
              <div className={styles.showcaseBottomBar}>
                <div className={styles.showcaseTextGroup}>
                  <div className={styles.showcaseTagRow}>
                    <span className={styles.trophyIcon}>🏆</span>
                    <span className={styles.showcaseSuper}>
                      {isRtl ? currentSlide.superAr : currentSlide.superEn}
                    </span>
                  </div>
                  <h3 className={styles.showcaseTitle}>
                    {isRtl ? currentSlide.titleAr : currentSlide.titleEn}
                  </h3>
                  <p className={styles.showcaseMeta}>
                    {isRtl ? currentSlide.metaAr : currentSlide.metaEn}
                  </p>
                </div>
                <span className={styles.tagFairPlay}>
                  {isRtl ? currentSlide.tagAr : currentSlide.tagEn}
                </span>
              </div>
            </LocaleLink>

            {/* Manual Slide Navigation Arrows */}
            <button
              type="button"
              className={`${styles.carouselArrow} ${styles.carouselArrowPrev}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isRtl) nextSlide();
                else prevSlide();
              }}
              aria-label={isRtl ? "الشريحة السابقة" : "Previous slide"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.carouselArrow} ${styles.carouselArrowNext}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isRtl) prevSlide();
                else nextSlide();
              }}
              aria-label={isRtl ? "الشريحة التالية" : "Next slide"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* 10-Dot Progress Indicator Strip */}
            <div className={styles.carouselIndicators} role="tablist">
              {SHOWCASE_SLIDES.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentIdx}
                  aria-label={`${isRtl ? slide.titleAr : slide.titleEn} (${idx + 1}/${SHOWCASE_SLIDES.length})`}
                  className={`${styles.indicatorBar} ${idx === currentIdx ? styles.indicatorBarActive : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentIdx(idx);
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Redesigned 4 Luxury Glassmorphic Metric Cards (Centrally Aligned - Zero Drift) */}
        <div className={styles.metricCardsGrid}>
          {/* Card 1: Open Duels Waiting */}
          <div className={`${styles.metricCard} ${styles.metricCardEmerald}`}>
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚔️</div>
              <span className={styles.metricBadgeLive}>
                <span className={styles.statPulseDot} />
                {isRtl ? "نشط الآن" : "Live"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                {lobbyStats.openChallenges || 48}
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "تحديات مفتوحة حالياً" : "Open Challenges Waiting"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "جاهزة للقبول والمبارزة فوراً" : "Ready for instant matchmaking"}
              </div>
            </div>
          </div>

          {/* Card 2: Active Challengers Online */}
          <div className={`${styles.metricCard} ${styles.metricCardGold}`}>
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>👥</div>
              <span className={styles.metricBadgeOnline}>
                ⚡ {isRtl ? "متصل" : "Online"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                {lobbyStats.activePlayers || 184}+
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "لاعبون متصلون الآن" : "Active Challengers Online"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "يتنافسون في الأرينا والميدان" : "Competing in the live arena"}
              </div>
            </div>
          </div>

          {/* Card 3: Ultra-Low Latency & Real-time Execution */}
          <div className={`${styles.metricCard} ${styles.metricCardRuby}`}>
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚡</div>
              <span className={styles.metricBadgePayout}>
                🏆 {isRtl ? "سرعة فائقة" : "Ultra-Fast"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">&lt; 20ms</bdi>
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "زمن استجابة فائق السرعة" : "Ultra-Low Latency"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "خوادم إقليمية موزعة وتحكيم لحظي" : "Distributed regional servers"}
              </div>
            </div>
          </div>

          {/* Card 4: 100% Skill & Zero RNG */}
          <div className={`${styles.metricCard} ${styles.metricCardCyan}`}>
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>🛡️</div>
              <span className={styles.metricBadgeFair}>
                🔒 {isRtl ? "مضاد للغش" : "Anti-Cheat"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">100%</bdi>
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "مهارة بدون أي حظ" : "100% Pure Skill, 0% Luck"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "تحكيم خادم حتمي ومضمون" : "Deterministic server verification"}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Pillars of Winning & Platform Trust */}
        <div className={styles.trustPillarsRow}>
          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>💎</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {isRtl ? "ضاعف رهانك بمهارتك" : "Double Your Stake With Skill"}
              </strong>
              <span className={styles.pillarDesc}>
                {isRtl
                  ? "تنافس 1 ضد 1 واحصل على 190% من قيمة الرهان فور انتهاء النزال مع عمولة منصة رمزية 5% فقط."
                  : "Winner takes the combined pot directly with an ultra-low 5% platform fee."}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>⚡</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {isRtl ? "سحب كاش فوري خلال 60 ثانية" : "Instant 60s Cash Payouts"}
              </strong>
              <span className={styles.pillarDesc}>
                {isRtl
                  ? "أرباحك تصل مباشرة إلى محفظتك بالعملات المستقرة USDT/USDC بدون أي قيود أو شروط تعجيزية."
                  : "Winnings credit directly to your wallet in stablecoins with zero hold times."}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>🔒</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {isRtl ? "حماية مطلقة وضمان اللعب النظيف 100%" : "100% Provably Fair & Anti-Cheat"}
              </strong>
              <span className={styles.pillarDesc}>
                {isRtl
                  ? "لا مجال للحظ أو الصدفة — سيرفرات نيزالو المشفرة تمنع البوتات وتضمن عدالة كل حركة وتوقيت."
                  : "Pure deterministic skill. Authoritative server verification guarantees absolute integrity."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
