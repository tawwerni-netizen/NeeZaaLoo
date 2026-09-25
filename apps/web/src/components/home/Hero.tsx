"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { transition } from "@/lib/motion";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { listGames } from "@/lib/games";
import { playCardHoverSound, playDifficultySelectSound } from "@/lib/game-audio";
import { HeroParticles } from "./HeroParticles";
import styles from "./Hero.module.css";

const FEATURED_COUNT = 6;

const QUICK_STAKES = [
  {
    stake: 2,
    prize: 3.52,
    badgeKey: "home.quick_stakes.badge_safe_start",
    tagKey: "home.quick_stakes.tag_quick_trial",
    popular: false,
    accentColor: "#10B981",
    themeClass: styles.cardEmerald,
    soundLevel: "EASY" as const,
  },
  {
    stake: 5,
    prize: 8.8,
    badgeKey: "home.quick_stakes.badge_most_popular",
    tagKey: "home.quick_stakes.tag_champions_duel",
    popular: true,
    accentColor: "#3B82F6",
    themeClass: styles.cardSapphire,
    soundLevel: "MEDIUM" as const,
  },
  {
    stake: 10,
    prize: 17.6,
    badgeKey: "home.quick_stakes.badge_pro_challenge",
    tagKey: "home.quick_stakes.tag_tactical_duel",
    popular: false,
    accentColor: "#8B5CF6",
    themeClass: styles.cardViolet,
    soundLevel: "HARD" as const,
  },
  {
    stake: 25,
    prize: 44.0,
    badgeKey: "home.quick_stakes.badge_elite_table",
    tagKey: "home.quick_stakes.tag_grand_prize",
    popular: false,
    accentColor: "#F59E0B",
    themeClass: styles.cardGold,
    soundLevel: "EXPERT" as const,
  },
  {
    stake: 50,
    prize: 88.0,
    badgeKey: "home.quick_stakes.badge_high_roller",
    tagKey: "home.quick_stakes.tag_high_roller_prize",
    popular: false,
    accentColor: "#EF4444",
    themeClass: styles.cardRuby,
    soundLevel: "EXPERT" as const,
  },
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
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";
  const featured = listGames().slice(0, FEATURED_COUNT);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedIndices, setLoadedIndices] = useState<number[]>([0]);

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
      <HeroParticles />
      <div className={`nz-container ${styles.container}`}>
        {/* Top Hero Statement / Copy Zone */}
        <div className={styles.headerZone}>
          <motion.div {...stage(0, reduceMotion)} className={styles.eyebrowWrap}>
            <span className={styles.eyebrowBadge}>
              <span className={styles.eyebrowBeacon} aria-hidden="true" />
              <span>{t("home.hero.eyebrow")}</span>
            </span>
          </motion.div>

          <motion.h1 {...stage(1, reduceMotion)} className={styles.headline}>
            <span>{t("home.hero.headline_title")}</span>{" "}
            <span className={styles.headlineAccent}>{t("home.hero.headline_accent")}</span>
          </motion.h1>

          <motion.p {...stage(2, reduceMotion)} className={styles.subhead}>
            {t("home.hero.subhead")}
          </motion.p>

          <motion.div {...stage(3, reduceMotion)} className={styles.actions}>
            <LocaleLink
              href="/play"
              onMouseEnter={() => playCardHoverSound()}
              onClick={() => playDifficultySelectSound("HARD")}
            >
              <Button variant="primary" className={styles.primaryBtn}>
                <span style={{ marginInlineEnd: "8px" }}>⚔️</span>
                {t("home.hero.cta_primary")}
              </Button>
            </LocaleLink>
            <LocaleLink
              href="/wallet"
              onMouseEnter={() => playCardHoverSound()}
              onClick={() => playDifficultySelectSound("MEDIUM")}
            >
              <Button variant="ghost" className={styles.secondaryBtn}>
                <span style={{ marginInlineEnd: "8px" }}>💳</span>
                {t("home.hero.instant_deposit")}
              </Button>
            </LocaleLink>
          </motion.div>

          {/* Psychological Trust & Conversion Anchors */}
          <div className={styles.psychologicalTrustBar}>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>⚡</span>
              <span>{t("home.hero.trust_payout")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>🛡️</span>
              <span>{t("home.hero.trust_skill")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>💰</span>
              <span>{t("home.hero.trust_share")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>🏆</span>
              <span>{t("home.hero.trust_tournaments")}</span>
            </div>
          </div>

          {/* Instant Quick-Stake Match Selector (Tactile Cyber-Luxury Cards) */}
          <div className={styles.quickStakeSection}>
            <div className={styles.quickStakeHeader}>
              <div className={styles.quickStakeTitle}>
                <span className={styles.quickStakeTitleBadge}>
                  <span className={styles.quickStakePulse} />
                  <span>{t("home.quick_stakes.section_badge")}</span>
                </span>
                <span className={styles.quickStakeTitleText}>
                  {t("home.quick_stakes.section_title")}
                </span>
              </div>
              <span className={styles.quickStakeSub}>
                {t("home.quick_stakes.section_sub")}
              </span>
            </div>

            <div className={styles.quickStakeGrid}>
              {QUICK_STAKES.map((qs) => (
                <LocaleLink
                  key={qs.stake}
                  href={`/play?stake=${qs.stake}&tier=CASH`}
                  className={`${styles.quickStakeCard} ${qs.themeClass} ${qs.popular ? styles.quickStakeCardPopular : ""}`}
                  onMouseEnter={() => playCardHoverSound()}
                  onClick={() => playDifficultySelectSound(qs.soundLevel)}
                  title={isRtl ? `بدء نزال بقيمة ${qs.stake} USDT` : `Start a ${qs.stake} USDT duel`}
                >
                  <div className={styles.cardGlowLine} style={{ background: `linear-gradient(90deg, ${qs.accentColor}, transparent)` }} />
                  <div className={styles.cardTopRow}>
                    <span
                      className={qs.popular ? styles.popularBadge : styles.subtleBadge}
                      style={!qs.popular ? { color: qs.accentColor, borderColor: `${qs.accentColor}55` } : undefined}
                    >
                      {t(qs.badgeKey)}
                    </span>
                  </div>
                  <div className={styles.quickStakeTop}>
                    <span className={styles.stakeAmountVal}>${qs.stake}</span>
                    <span className={styles.stakeAmountCurrency}>USDT</span>
                  </div>
                  <div className={styles.quickStakePrizeBox}>
                    <span className={styles.prizePrefix}>{isRtl ? "تكسب صافي:" : "Net Win:"}</span>
                    <span className={styles.prizeNumber}>${qs.prize.toFixed(2)}</span>
                    <span className={styles.prizeCurrency}>USDT</span>
                  </div>
                  <span className={styles.quickStakeTag}>
                    {t(qs.tagKey)}
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
              onMouseEnter={() => playCardHoverSound()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playCardHoverSound();
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
              onMouseEnter={() => playCardHoverSound()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playCardHoverSound();
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
                  onMouseEnter={() => playCardHoverSound()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    playCardHoverSound();
                    setCurrentIdx(idx);
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Redesigned 4 Luxury Glassmorphic Guarantee Cards */}
        <div className={styles.metricCardsGrid}>
          {/* Card 1: 1v1 Live Human Showdowns */}
          <div
            className={`${styles.metricCard} ${styles.metricCardEmerald}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #10B981, #059669)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚔️</div>
              <span className={styles.metricBadgeLive}>
                <span className={styles.statPulseDot} />
                {isRtl ? "ميدان حي 24/7" : "Live Arena 24/7"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                {isRtl ? "فوري 24/7" : "Instant 24/7"}
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "نزالات حية ومنافسات حقيقية 1v1" : "Live 1v1 Member Showdowns"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "نافس لاعبين مهرة من مختلف الدول بتطابق فوري، أو تحدَّ أصدقاءك برابط مباشر" : "Instant matchmaking against active players or challenge friends via direct link"}
              </div>
            </div>
          </div>

          {/* Card 2: Instant Automated Cash Payouts */}
          <div
            className={`${styles.metricCard} ${styles.metricCardGold}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #F59E0B, #D97706)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚡</div>
              <span className={styles.metricBadgeOnline}>
                ⚡ {isRtl ? "سحب فوري" : "Instant Cashout"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">&lt; 60s</bdi>
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "سحب كاش فوري وتلقائي" : "Instant Automated Cashout"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "سحب مباشر لمحفظتك بالـ USDT (TRC20 / BEP20) أو وسائل الدفع المعتمدة بدون أي انتظار" : "Direct to your USDT wallet with zero waiting time or holds"}
              </div>
            </div>
          </div>

          {/* Card 3: 88% Winner Payout Rate */}
          <div
            className={`${styles.metricCard} ${styles.metricCardRuby}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #EC4899, #8B5CF6)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>🏆</div>
              <span className={styles.metricBadgePayout}>
                💎 {isRtl ? "عمولة 12% فقط" : "12% Platform Fee"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                88%
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "حصة الفائز من وعاء النزال" : "Winner's Share of Prize Pool"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "أعلى نسبة توزيع أرباح للاعبين المهرة؛ الفائز يحصد الجائزة كاملة فور إعلان النتيجة" : "Highest skill gaming payout rate in the region with instant prize credit"}
              </div>
            </div>
          </div>

          {/* Card 4: 100% Skill & Zero RNG */}
          <div
            className={`${styles.metricCard} ${styles.metricCardCyan}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #3B82F6, #06B6D4)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>🛡️</div>
              <span className={styles.metricBadgeFair}>
                🔒 {isRtl ? "تحكيم حتمي 100%" : "100% Provably Fair"}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">100% {isRtl ? "مهارة" : "Skill"}</bdi>
              </div>
              <div className={styles.metricTitle}>
                {isRtl ? "مهارة خالصة، خوارزميات عادلة، حماية ضد الغش" : "100% Pure Skill, Deterministic, Anti-Cheat"}
              </div>
              <div className={styles.metricSub}>
                {isRtl ? "خوادم مشفرة وقواعد حتمية تضمن انتصار الأذكى تكتيكياً بدون أي تحيز" : "Deterministic server verification guarantees integrity and fair play"}
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
                {t("home.hero.guarantees.pillar_skill_title") || (isRtl ? "العب واكسب بمهارتك" : "Play & Win With Pure Skill")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_skill_desc") || (isRtl
                  ? "الفائز يحصل على مجموع جوائز التحدي مع رسوم تنظيم منصة 12% فقط."
                  : "Winner takes the challenge prize pool directly with a 12% platform fee.")}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>⚡</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {t("home.hero.guarantees.pillar_payout_title") || (isRtl ? "سحب كاش فوري خلال 60 ثانية" : "Instant 60s Cash Payouts")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_payout_desc") || (isRtl
                  ? "الأرباح تصل مباشرة إلى محفظتك بعملة USDT المستقرة بدون شروط تعجيزية."
                  : "Winnings credit directly to your wallet in USDT with zero hold times.")}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>🔒</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {t("home.hero.guarantees.pillar_fair_title") || (isRtl ? "تحكيم عادل ومضاد للغش 100%" : "100% Provably Fair & Anti-Cheat")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_fair_desc") || (isRtl
                  ? "خوارزميات حتمية مراقبة عبر السيرفر تضمن انتصار الأذكى تكتيكياً بدون أي عنصر حظ."
                  : "Pure deterministic skill. Authoritative server verification guarantees absolute integrity.")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
