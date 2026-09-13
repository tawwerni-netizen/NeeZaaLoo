"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { transition } from "@/lib/motion";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./Hero.module.css";

const FEATURED_COUNT = 6;

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

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length);
  }, []);

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
    <section className={styles.hero}>
      <div className={`nz-container ${styles.inner}`}>
        <div className={styles.copy}>
          <motion.p {...stage(0, reduceMotion)} className={styles.eyebrow}>
            {t("home.hero.eyebrow")}
          </motion.p>
          <motion.h1 {...stage(1, reduceMotion)} className={styles.headline}>
            {t("home.hero.headline_line1")}
            <br />
            {t("home.hero.headline_line2")}
          </motion.h1>
          <motion.p {...stage(2, reduceMotion)} className={styles.subhead}>
            {t("home.hero.subhead")}
          </motion.p>
          <motion.div {...stage(3, reduceMotion)} className={styles.actions}>
            <LocaleLink href="/register">
              <Button variant="primary">{t("home.hero.cta_primary")}</Button>
            </LocaleLink>
            <LocaleLink href="/watch">
              <Button variant="ghost">{t("home.hero.cta_secondary")}</Button>
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
                      {name}
                    </LocaleLink>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* Dynamic 10-Slide Showcase Carousel */}
        <motion.div
          {...stage(2, reduceMotion)}
          className={styles.visual}
        >
          <div className={styles.showcaseGlowBackdrop} aria-hidden="true" />
          
          <div
            className={styles.carouselContainer}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <LocaleLink href={currentSlide.targetHref} className={styles.showcaseCard}>
              {/* Stack of 10 slides with smooth opacity cross-fade */}
              <div className={styles.slidesStack}>
                {SHOWCASE_SLIDES.map((slide, idx) => (
                  <img
                    key={slide.id}
                    src={slide.image}
                    alt={isRtl ? slide.titleAr : slide.titleEn}
                    className={`${styles.bannerImg} ${idx === currentIdx ? styles.bannerImgActive : ""}`}
                    loading={idx === 0 ? "eager" : "lazy"}
                  />
                ))}
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
                <span>100% FAIR PLAY</span>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  aria-label={`${slide.titleEn} (${idx + 1}/${SHOWCASE_SLIDES.length})`}
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
      </div>
    </section>
  );
}
