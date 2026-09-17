"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n/context";
import { LocaleLink } from "@/components/LocaleLink";
import styles from "./TournamentBannerSlider.module.css";

const BANNER_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%230D111A'/%3E%3Ccircle cx='200' cy='112' r='90' fill='rgba(255,215,0,0.1)'/%3E%3C/svg%3E";

type TournSlide = {
  id: string;
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
  href: string;
};

const TOURNAMENT_SLIDES: TournSlide[] = [
  {
    id: "blitz_gp",
    image: "/images/tournaments/slider-blitz-grandprix.jpg",
    superAr: "بطولة الأبطال الكبرى",
    superEn: "TOURNAMENT OF CHAMPIONS",
    titleAr: "الجائزة الكبرى للشطرنج الخاطف",
    titleEn: "World Blitz Grand Prix",
    metaAr: "نظام خروج المغلوب • مراقبة كاملة لمكافحة الغش • تصنيف ELO رسمي",
    metaEn: "Single Elimination Brackets • Anti-Cheat Sentinel • Official ELO Standard",
    badgeAr: "مباشر الآن",
    badgeEn: "LIVE BRACKET",
    tagAr: "عرض التصفيات ↗",
    tagEn: "VIEW BRACKETS ↗",
    href: "/tournaments",
  },
  {
    id: "pro_bracket",
    image: "/images/tournaments/slider-pro-bracket.jpg",
    superAr: "تصفيات النخبة الرسمية",
    superEn: "PRO KNOCKOUT CLASH",
    titleAr: "بطولة الإقصاء المباشر للمحترفين",
    titleEn: "Pro Elimination Championship",
    metaAr: "توزيع رقمي للمقاعد • النظام السويسري والإقصائي • شفافية كاملة",
    metaEn: "Live Seeding • Swiss & Knockout Brackets • 100% Provably Fair",
    badgeAr: "تصفيات حاسمة",
    badgeEn: "ELIMINATION ROUND",
    tagAr: "استعراض المباريات ↗",
    tagEn: "VIEW MATCHES ↗",
    href: "/tournaments",
  },
  {
    id: "weekend_cup",
    image: "/images/tournaments/tournament-weekend-knockout.jpg",
    superAr: "كأس نهاية الأسبوع",
    superEn: "WEEKEND MASTERS",
    titleAr: "كأس الأساتذة الأسبوعي لخروج المغلوب",
    titleEn: "Weekend Masters Knockout Cup",
    metaAr: "التسجيل مفتوح للجميع • منافسات مهارية خالية من الحظ • تسوية فورية",
    metaEn: "Open Registration • Zero Luck Factor • Instant Settlement",
    badgeAr: "تسجيل مفتوح",
    badgeEn: "REGISTRATION OPEN",
    tagAr: "سجّل مقعدك ↗",
    tagEn: "REGISTER NOW ↗",
    href: "/tournaments",
  },
  {
    id: "midnight_flash",
    image: "/images/tournaments/tournament-midnight-flash.jpg",
    superAr: "أرينا الفلاش الليلي",
    superEn: "MIDNIGHT SPEED ARENA",
    titleAr: "كأس الفلاش السريع الليلي",
    titleEn: "Midnight Flash Speed Cup",
    metaAr: "جولات خاطفة 3 دقائق • مطابقة سريعة للخصوم • تصعيد حماسي",
    metaEn: "Hyper-Blitz 3m Clocks • Rapid Matchmaking • High Velocity",
    badgeAr: "سرعة قصوى",
    badgeEn: "HYPER SPEED",
    tagAr: "ادخل الأرينا ↗",
    tagEn: "ENTER ARENA ↗",
    href: "/tournaments",
  },
  {
    id: "all_stars",
    image: "/images/tournaments/tournament-speed-battle.jpg",
    superAr: "ميدان كبار المتنافسين",
    superEn: "GRAND CHAMPIONS ARENA",
    titleAr: "أرينا أساطير نيزالو الكبرى",
    titleEn: "Nizalo Legends All-Stars Arena",
    metaAr: "نخبة لاعبي المنصة • فئات الألماس والماسترز • إمكانية المشاهدة الحية",
    metaEn: "Top Competitive Tiers • Glicko-2 Diamond Class • Live Spectator Mode",
    badgeAr: "فئة الأساطير",
    badgeEn: "LEGENDS TIER",
    tagAr: "شاهد وشارك ↗",
    tagEn: "SPECTATE & PLAY ↗",
    href: "/watch",
  },
];

export function TournamentBannerSlider() {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % TOURNAMENT_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + TOURNAMENT_SLIDES.length) % TOURNAMENT_SLIDES.length);
  }, []);

  // Automatic rotation every 4.8s
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 4800);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const currentSlide = TOURNAMENT_SLIDES[currentIdx] ?? TOURNAMENT_SLIDES[0]!;

  return (
    <div
      className={styles.sliderWrap}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className={styles.sliderCard}>
        {/* Slides Stack */}
        <div className={styles.slidesStack}>
          {TOURNAMENT_SLIDES.map((slide, idx) => (
            <img
              key={slide.id}
              src={slide.image}
              alt={isRtl ? slide.titleAr : slide.titleEn}
              className={`${styles.bannerImg} ${idx === currentIdx ? styles.bannerImgActive : ""}`}
              loading={idx === 0 ? "eager" : "lazy"}
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.onerror = null;
                img.src = BANNER_PLACEHOLDER;
              }}
            />
          ))}
        </div>

        <div className={styles.bannerOverlay} />
        <div className={styles.cyberCornerTL} />
        <div className={styles.cyberCornerBR} />

        {/* Live Badge */}
        <div className={styles.badgeTopLeft}>
          <span className={styles.pulseDot} />
          <span>{isRtl ? currentSlide.badgeAr : currentSlide.badgeEn}</span>
        </div>

        <div className={styles.badgeTopRight}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>{isRtl ? "بطولة معتمدة رسمياً" : "OFFICIAL TOURNAMENT"}</span>
        </div>

        {/* Bottom Bar */}
        <div className={styles.slideBottomBar}>
          <div className={styles.slideTextGroup}>
            <div className={styles.slideSuperRow}>
              <span className={styles.trophyIcon}>🏆</span>
              <span className={styles.slideSuper}>
                {isRtl ? currentSlide.superAr : currentSlide.superEn}
              </span>
            </div>
            <h2 className={styles.slideTitle}>
              {isRtl ? currentSlide.titleAr : currentSlide.titleEn}
            </h2>
            <p className={styles.slideMeta}>
              {isRtl ? currentSlide.metaAr : currentSlide.metaEn}
            </p>
          </div>

          <LocaleLink href={currentSlide.href} className={styles.slideCtaBtn}>
            {isRtl ? currentSlide.tagAr : currentSlide.tagEn}
          </LocaleLink>
        </div>
      </div>

      {/* Manual Navigation Arrows */}
      <button
        type="button"
        className={`${styles.arrowBtn} ${styles.arrowBtnPrev}`}
        onClick={(e) => {
          e.preventDefault();
          if (isRtl) nextSlide();
          else prevSlide();
        }}
        aria-label={isRtl ? "البانر السابق" : "Previous banner"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <button
        type="button"
        className={`${styles.arrowBtn} ${styles.arrowBtnNext}`}
        onClick={(e) => {
          e.preventDefault();
          if (isRtl) prevSlide();
          else nextSlide();
        }}
        aria-label={isRtl ? "البانر التالي" : "Next banner"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* 5-Dot Progress Indicators */}
      <div className={styles.indicatorsWrap} role="tablist">
        {TOURNAMENT_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            aria-selected={idx === currentIdx}
            aria-label={`${slide.titleEn} (${idx + 1}/${TOURNAMENT_SLIDES.length})`}
            className={`${styles.indicator} ${idx === currentIdx ? styles.indicatorActive : ""}`}
            onClick={() => setCurrentIdx(idx)}
          />
        ))}
      </div>
    </div>
  );
}
