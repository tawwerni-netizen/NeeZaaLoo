"use client";

/**
 * Psychological & Esports Redesign of Upcoming Tournaments.
 * Reused on the public landing page and dashboard.
 * Reads real tournament data from /v1/tournaments while presenting it
 * with high-impact gamification, prestige branding, and psychological triggers.
 */
import { useEffect, useState, useMemo } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { formatRelativeTime } from "@/lib/i18n/format";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import type { SupportedLocale } from "@/lib/i18n/locale";
import styles from "./UpcomingTournaments.module.css";

// Last-resort fallback when even the resolved cover image fails to load --
// generic and game-agnostic on purpose, since a single OTHER game's photo
// (the previous fallback here) is a wrong image just as surely as a broken
// one, only less obviously so.
const COVER_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%230D111A'/%3E%3Ccircle cx='200' cy='112' r='90' fill='rgba(255,215,0,0.1)'/%3E%3C/svg%3E";

export type TournamentRow = {
  id: string;
  game_id: string;
  format: "SINGLE_ELIMINATION" | "SWISS";
  status: string;
  tier: "FREE" | "RANKED" | "CASH";
  entry_fee_minor: string;
  asset: string | null;
  capacity: number;
  title: string | null;
  registration_closes_at: string | null;
  scheduled_starts_at: string | null;
  starts_at: string | null;
  completed_at: string | null;
  registered_count: number;
};

type Props = {
  variant?: "cards" | "compact";
  heading?: string;
  emptyText: string;
  viewAllHref?: string;
  viewAllText?: string;
  limit?: number;
  bannerImage?: string;
  banners?: Array<{ img: string; tag: string; title: string; desc: string }>;
};

type FilterType = "ALL" | "REGISTRATION" | "FREE" | "CASH" | "LIVE";

function countdownFor(iso: string, locale: SupportedLocale, nowMs: number): string {
  const diffMs = new Date(iso).getTime() - nowMs;
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return formatRelativeTime(diffMin, "minute", locale);
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 48) return formatRelativeTime(diffHr, "hour", locale);
  return formatRelativeTime(Math.round(diffHr / 24), "day", locale);
}

export function getTournamentCover(gameId: string): string {
  const customCovers: Record<string, string> = {
    xo: "/images/tournaments/tournament-xo.jpg",
    "speed-math": "/images/tournaments/tournament-speed-math.jpg",
    seega: "/images/tournaments/tournament-seega.jpg",
    reversi: "/images/tournaments/tournament-reversi.jpg",
    // Not tournament-chess.jpg / chess-hero.webp: that generated art has
    // real chess grandmasters' names on its scoreboard, implying an
    // endorsement that doesn't exist. Same reasoning for billiards below
    // (a fabricated "AETHER Esports" sponsor logo baked into the photo).
    // Both point at hand-authored, brand-safe SVG art instead until a
    // properly-prompted replacement photo exists.
    chess: "/images/games/chess-cover-safe.svg",
    billiards: "/images/games/billiards-cover-safe.svg",
    "connect-four": "/images/tournaments/tournament-connect-four.jpg",
    checkers: "/images/tournaments/tournament-checkers.jpg",
    dominoes: "/images/games/dominoes-hero.webp",
    backgammon: "/images/games/backgammon-hero.webp",
    gomoku: "/images/games/gomoku-hero.webp",
  };
  return customCovers[gameId] ?? `/images/games/${gameId}-hero.webp`;
}

export function formatTournamentTitle(row: { game_id: string; title?: string | null }, gameName: string, locale: string): string {
  const rawTitle = (row.title || "").replace(/\[.*?\]/gi, "").trim();
  if (locale === "ar") {
    const g = row.game_id.toLowerCase();
    if (g === "xo") return "بطولة نخبة الإكس أو الخاطفة";
    if (g === "speed-math") return "أولمبياد الحساب الذهني السريع";
    if (g === "seega") return "كأس أساتذة السيجة التكتيكية";
    if (g === "reversi") return "بطولة أوتيللو الكبرى للمحترفين";
    if (g === "chess") return "كأس الأبطال للشطرنج الخاطف";
    if (g === "connect-four" || g === "connect4") return "بطولة الأربعة المتتالية الكبرى";
    if (g === "checkers") return "كأس تاج الداما للمحترفين";
    if (g === "dominoes") return "دوري أساتذة الضمنة الكلاسيكية";
    if (g === "backgammon") return "بطولة طاولة الزهر الكبرى";
    if (g === "gomoku") return "كأس أساطير غوموكو الخمسة";
    if (rawTitle) return rawTitle;
    return `بطولة ${gameName} الكبرى`;
  }
  return rawTitle || `${gameName} Grand Championship`;
}

export function formatTournamentDescription(
  row: {
    game_id: string;
    tier?: "FREE" | "RANKED" | "CASH";
    format?: string;
    capacity?: number;
    entry_fee_minor?: string;
    description?: string | null;
  },
  locale: string
): string {
  if (locale === "ar") {
    const formatAr = row.format === "SWISS" ? "النظام السويسري" : "خروج المغلوب";
    const cap = row.capacity ?? 16;
    if (row.tier === "FREE") {
      return `بطولة ${formatAr} تضم ${cap} لاعباً. اشتراك مجاني لإثبات المهارة، صعود سلم التصنيف، وكسب نقاط الصدارة.`;
    }
    const entryFeeUsdt = Number(row.entry_fee_minor || 0) / 1_000_000;
    const winnerUsd = (entryFeeUsdt * cap * 0.88).toFixed(2);
    return `بطولة ${formatAr} تضم ${cap} لاعباً بنظام الجوائز الكبرى. يحصل الفائز بالمركز الأول على 88% ($${winnerUsd} USDT). رسوم تنظيم المنصة 12%.`;
  }
  return (
    row.description ||
    (row.tier === "FREE"
      ? `${row.capacity ?? 16}-Player ${row.format === "SWISS" ? "Swiss System" : "Single Elimination"}. Free entry to prove skill and climb rankings.`
      : `${row.capacity ?? 16}-Player ${row.format === "SWISS" ? "Swiss System" : "Single Elimination"}. Winner takes 88%. 12% Platform Fee.`)
  );
}


export function UpcomingTournaments({
  variant = "cards",
  heading,
  emptyText,
  viewAllHref,
  viewAllText,
  limit = 8,
  bannerImage,
  banners,
}: Props) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  // Countdown text is only ever computed client-side, after mount, from
  // this clock snapshot -- never read live during render, so the server-
  // rendered placeholder and the client's first render always agree.
  // Refreshed periodically so a countdown actually counts down instead of
  // freezing at whatever it read when the tournament list loaded.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [filter, setFilter] = useState<FilterType>("ALL");

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [banners]);

  useEffect(() => {
    let cancelled = false;
    void get<{ tournaments: TournamentRow[] }>("/v1/tournaments?status=SCHEDULED,REGISTRATION,LIVE,FINALS")
      .then((r) => {
        if (!cancelled) {
          setRows(r.tournaments ?? []);
        }
      })
      .catch(() => {
        // A failed fetch is an honest empty state, never invented rows.
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    let list = rows;
    if (filter === "REGISTRATION") {
      list = list.filter((r) => r.status === "REGISTRATION");
    } else if (filter === "FREE") {
      list = list.filter((r) => r.tier === "FREE");
    } else if (filter === "CASH") {
      list = list.filter((r) => r.tier === "CASH");
    } else if (filter === "LIVE") {
      list = list.filter((r) => r.status === "LIVE" || r.status === "FINALS");
    }
    return list;
  }, [rows, filter]);

  const visible = (filteredRows ?? []).slice(0, limit);

  // Compact Variant (Dashboard)
  if (variant === "compact") {
    return (
      <div className={styles.compactWrap}>
        {rows === null ? (
          <div className={styles.listSkeleton} aria-hidden="true" />
        ) : visible.length === 0 ? (
          <p className={styles.empty}>{emptyText}</p>
        ) : (
          <ul className={styles.compactList}>
            {visible.map((row) => {
              const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
              const gameName = t(`common.game_names.${nameKey}`);
              const cleanTitle = formatTournamentTitle(row, gameName, locale);
              const countdownTarget = row.scheduled_starts_at ?? row.starts_at ?? row.registration_closes_at;
              const entryFeeUsdt = Number(row.entry_fee_minor || 0) / 1_000_000;
              // 88% distributable, matching the platform's 12% fee.
              const prizePoolNum = entryFeeUsdt * row.capacity * 0.88;
              const coverImg = getTournamentCover(row.game_id);

              return (
                <li key={row.id}>
                  <LocaleLink href={`/tournaments/${row.id}`} className={styles.compactRow}>
                    <div className={styles.compactThumb}>
                      <img
                        src={coverImg}
                        alt={cleanTitle}
                        className={styles.compactThumbImg}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = COVER_PLACEHOLDER;
                        }}
                      />
                    </div>
                    <div className={styles.compactInfo}>
                      <span className={styles.compactGame}>🎮 {gameName}</span>
                      <span className={styles.compactTitle}>{cleanTitle}</span>
                    </div>
                    <div className={styles.compactMeta}>
                      {row.tier === "CASH" && prizePoolNum > 0 ? (
                        <span className={styles.compactPrize}>💰 ${prizePoolNum.toFixed(0)} USDT</span>
                      ) : (
                        <span className={styles.compactFree}>{locale === "ar" ? "🎁 مجاني" : "Free"}</span>
                      )}
                      {countdownTarget && nowMs !== null && (
                        <span className={styles.compactCountdown}>⏱️ {countdownFor(countdownTarget, locale, nowMs)}</span>
                      )}
                      <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                        {t(`tournamentsPage.status.${row.status}`)}
                      </span>
                      <span className={styles.compactArrow}>↗</span>
                    </div>
                  </LocaleLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // Cards Variant (Landing & Explore)
  return (
    <section className={styles.section} id="tournaments">
      <div className="nz-container">
        {/* Esports Arena Header with Psychological Value Pitch */}
        <div className={styles.arenaHeader}>
          <div className={styles.headerInfo}>
            <div className={styles.badgeRow}>
              <span className={styles.esportsBadge}>
                <span className={styles.badgePulse} />
                <span>{locale === "ar" ? "⚔️ ساحة البطولات الكبرى • منافسات المهارة الرسمية" : "⚔️ Major Esports Arena • Official Tournaments"}</span>
              </span>
            </div>
            <h2 className={styles.heading}>
              {heading ?? (locale === "ar" ? "البطولات القادمة والمواجهات الكبرى" : "Upcoming Esports Tournaments")}
            </h2>
            <p className={styles.subHeading}>
              {locale === "ar"
                ? "حيث يتنافس أبطال العقل والتكتيك على كؤوس الشرف والجوائز الفورية المضمونة. صفر حظ — المهارة والسرعة تصنعان النصر."
                : "Where tactical titans clash for prestige cups and guaranteed instant payouts. Zero luck — pure mind skill."}
            </p>
          </div>

          {viewAllHref && (
            <LocaleLink href={viewAllHref} className={styles.viewAllBtn}>
              <span>{viewAllText ?? (locale === "ar" ? "عرض كافة البطولات" : "View All Tournaments")}</span>
              <span className={styles.viewAllArrow}>←</span>
            </LocaleLink>
          )}
        </div>

        {/* Psychological Trust & Hype Ribbon */}
        <div className={styles.hypeRibbon}>
          <div className={styles.hypeItem}>
            <span className={styles.hypeIcon}>💰</span>
            <div className={styles.hypeTexts}>
              <span className={styles.hypeVal}>+20,000 USDT</span>
              <span className={styles.hypeLabel}>{locale === "ar" ? "جوائز كبرى موزعة" : "Total Prizes"}</span>
            </div>
          </div>
          <div className={styles.hypeDivider} />
          <div className={styles.hypeItem}>
            <span className={styles.hypeIcon}>⚡</span>
            <div className={styles.hypeTexts}>
              <span className={styles.hypeVal}>{locale === "ar" ? "100% مهارة ذهنية" : "100% Skill"}</span>
              <span className={styles.hypeLabel}>{locale === "ar" ? "خالية تماماً من الحظ" : "Zero Luck Required"}</span>
            </div>
          </div>
          <div className={styles.hypeDivider} />
          <div className={styles.hypeItem}>
            <span className={styles.hypeIcon}>🎁</span>
            <div className={styles.hypeTexts}>
              <span className={styles.hypeVal}>{locale === "ar" ? "دخول مجاني يومي" : "Daily Free Entry"}</span>
              <span className={styles.hypeLabel}>{locale === "ar" ? "فرص حقيقية للجميع" : "Earn Real Crypto"}</span>
            </div>
          </div>
          <div className={styles.hypeDivider} />
          <div className={styles.hypeItem}>
            <span className={styles.hypeIcon}>🛡️</span>
            <div className={styles.hypeTexts}>
              <span className={styles.hypeVal}>{locale === "ar" ? "Sentinel AI" : "AI Sentinel"}</span>
              <span className={styles.hypeLabel}>{locale === "ar" ? "رقابة نزاهة ومكافحة غش" : "Anti-Cheat Protected"}</span>
            </div>
          </div>
        </div>

        {/* Cinematic Featured Showcase Banner */}
        {banners && banners.length > 0 ? (() => {
          const activeBanner = banners[bannerIdx] ?? banners[0]!;
          return (
            <div className={styles.featureBanner} dir={locale === "ar" ? "rtl" : "ltr"}>
              <picture className={styles.featureBannerPicture}>
                <source srcSet={activeBanner.img.replace(/\.jpg$/, ".webp")} type="image/webp" />
                <img
                  src={activeBanner.img}
                  alt={activeBanner.title}
                  className={styles.featureBannerImg}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div className={styles.featureBannerOverlay}>
                <div className={styles.bannerContentCard}>
                  <div className={styles.bannerBadgeRow}>
                    <span className={styles.bannerTag}>{activeBanner.tag}</span>
                    <span className={styles.bannerLivePill}>
                      <span className={styles.bannerPulseDot} />
                      {locale === "ar" ? "بطولة الأسبوع المميزة" : "Featured Cup"}
                    </span>
                  </div>
                  <h3 className={styles.bannerTitle}>{activeBanner.title}</h3>
                  <p className={styles.bannerDesc}>
                    <bdi>{activeBanner.desc}</bdi>
                  </p>
                  <div className={styles.bannerSpecs}>
                    <span className={styles.specBadge}>🏆 {locale === "ar" ? "جوائز مضمونة" : "Guaranteed Pool"}</span>
                    <span className={styles.specBadge}>👥 16 {locale === "ar" ? "مقعد رسمي" : "Seeds"}</span>
                    <span className={styles.specBadge}>⚡ {locale === "ar" ? "سحب فوري للأرباح" : "Instant Payout"}</span>
                  </div>
                  {banners.length > 1 && (
                    <div className={styles.bannerDots}>
                      {banners.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Switch tournament banner ${i + 1}`}
                          className={`${styles.bannerDot} ${bannerIdx === i ? styles.bannerDotActive : ""}`}
                          onClick={() => setBannerIdx(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })() : bannerImage ? (
          <div className={styles.featureBanner} dir={locale === "ar" ? "rtl" : "ltr"}>
            <picture className={styles.featureBannerPicture}>
              <source srcSet={bannerImage.replace(/\.jpg$/, ".webp")} type="image/webp" />
              <img
                src={bannerImage}
                alt="Daily Blitz Tournaments"
                className={styles.featureBannerImg}
                loading="lazy"
                decoding="async"
              />
            </picture>
            <div className={styles.featureBannerOverlay}>
              <div className={styles.bannerContentCard}>
                <span className={styles.bannerTag}>⚡ Daily Blitz Stage</span>
                <h3 className={styles.bannerTitle}>Real-Time Competitive Brackets</h3>
                <p className={styles.bannerDesc}>Compete against verified players in high-prestige knockout brackets with live streaming.</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Interactive Filter Pills */}
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.filterBtn} ${filter === "ALL" ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter("ALL")}
          >
            <span>🔥</span>
            <span>{locale === "ar" ? "جميع البطولات" : "All Tournaments"}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${filter === "REGISTRATION" ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter("REGISTRATION")}
          >
            <span>🟢</span>
            <span>{locale === "ar" ? "التسجيل مفتوح" : "Registration Open"}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${filter === "FREE" ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter("FREE")}
          >
            <span>🎁</span>
            <span>{locale === "ar" ? "دخول مجاني" : "Free Entry"}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${filter === "CASH" ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter("CASH")}
          >
            <span>💰</span>
            <span>{locale === "ar" ? "جوائز نقدية" : "Cash Prizes"}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${filter === "LIVE" ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter("LIVE")}
          >
            <span>🔴</span>
            <span>{locale === "ar" ? "مواجهات حية" : "Live Matches"}</span>
          </button>
        </div>

        {/* Tournament Cards Grid */}
        {rows === null ? (
          <div className={styles.gridSkeleton} aria-hidden="true" />
        ) : visible.length === 0 ? (
          <div className={styles.emptyBox}>
            <span className={styles.emptyIcon}>🏆</span>
            <p className={styles.emptyText}>{emptyText}</p>
            <LocaleLink href="/tournaments" className={styles.emptyCta}>
              {locale === "ar" ? "تصفح أرشيف البطولات والمباريات" : "Explore Tournament Archive"}
            </LocaleLink>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((row) => {
              const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
              const gameName = t(`common.game_names.${nameKey}`);
              const cleanTitle = formatTournamentTitle(row, gameName, locale);
              const countdownTarget = row.scheduled_starts_at ?? row.starts_at ?? row.registration_closes_at;
              const entryFeeUsdt = Number(row.entry_fee_minor || 0) / 1_000_000;
              // 88% distributable, matching the platform's 12% fee.
              const prizePoolNum = entryFeeUsdt * row.capacity * 0.88;
              const prizePoolStr = prizePoolNum.toFixed(2);
              const registeredPct = Math.min(100, Math.round(((row.registered_count || 0) / (row.capacity || 1)) * 100));
              const remainingSpots = Math.max(0, row.capacity - (row.registered_count || 0));
              const isLive = row.status === "LIVE" || row.status === "FINALS";
              const isUrgent = row.status === "REGISTRATION" && (registeredPct >= 60 || remainingSpots <= 5);
              const coverImg = getTournamentCover(row.game_id);

              return (
                <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
                  {/* Custom 3D Tournament Banner Header */}
                  <div className={styles.cardHero}>
                    <img
                      src={coverImg}
                      alt={cleanTitle}
                      className={styles.cardHeroImg}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = COVER_PLACEHOLDER;
                      }}
                    />
                    <div className={styles.cardHeroOverlay} />

                    <div className={styles.heroBadges}>
                      <span className={styles.formatPill}>
                        <span className={styles.formatIcon}>🏆</span>
                        <span>{t(`tournamentsPage.format.${row.format}`)} ({row.capacity} {locale === "ar" ? "لاعب" : "p"})</span>
                      </span>

                      {isLive ? (
                        <span className={styles.livePulsePill}>
                          <span className={styles.pulseDot} />
                          {locale === "ar" ? "مباشر الآن" : "LIVE"}
                        </span>
                      ) : isUrgent ? (
                        <span className={styles.urgentPill}>
                          🔥 {locale === "ar" ? `متبقي ${remainingSpots} مقاعد فقط!` : `${remainingSpots} spots left!`}
                        </span>
                      ) : (
                        <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                          {t(`tournamentsPage.status.${row.status}`)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content & Psychological Hooks */}
                  <div className={styles.cardBody}>
                    <div className={styles.cardGameInfo}>
                      <span className={styles.gameCategory}>🎮 {gameName}</span>
                      <h3 className={styles.cardTitle}>{cleanTitle}</h3>
                    </div>

                    {/* Gold Metallic Prize Box */}
                    <div className={styles.prizePoolBox}>
                      <div className={styles.prizePoolHeader}>
                        <span className={styles.prizeIcon}>💰</span>
                        <span className={styles.prizeLabel}>
                          {locale === "ar" ? "مجموع الجوائز الفورية:" : "Guaranteed Prize Pool:"}
                        </span>
                      </div>
                      <span className={styles.prizeValue}>
                        {row.tier === "CASH" && prizePoolNum > 0
                          ? `$${prizePoolStr} USDT`
                          : (locale === "ar" ? "كأس الشرف ونقاط ELO +250" : "Honor Cup & +250 ELO")}
                      </span>
                    </div>

                    {/* Capacity Progress Bar with Scarcity Prompt */}
                    <div className={styles.capacitySection}>
                      <div className={styles.capacityHeader}>
                        <span className={styles.capacityCount}>
                          👥 <span className="nz-num">{row.registered_count}</span> / <span className="nz-num">{row.capacity}</span> {locale === "ar" ? "بطل انضموا" : "players joined"}
                        </span>
                        <span className={styles.capacityPct}>{registeredPct}%</span>
                      </div>
                      <div className={styles.capacityTrack}>
                        <div
                          className={`${styles.capacityFill} ${registeredPct >= 60 ? styles.capacityFillUrgent : ""}`}
                          style={{ width: `${registeredPct}%` }}
                        />
                      </div>
                      <div className={styles.scarcityRow}>
                        <span className={styles.scarcityText}>
                          {row.status === "REGISTRATION"
                            ? (remainingSpots > 0
                                ? (locale === "ar" ? `⚡ سارع بحجز مكانك قبل اكتمال العدد!` : `⚡ Hurry, spots are filling up fast!`)
                                : (locale === "ar" ? `🔒 اكتملت المقاعد — انتظر بدء النزال` : `🔒 Full capacity reached`))
                            : (locale === "ar" ? `⚔️ المنافسات جارية على الهواء مباشرة` : `⚔️ Live tournament in progress`)}
                        </span>
                      </div>
                    </div>

                    {/* Card Footer: Time Countdown + Shimmering CTA */}
                    <div className={styles.cardFooter}>
                      <div className={styles.timeInfo}>
                        <span className={styles.timeIcon}>⏱️</span>
                        <span className={styles.countdown}>
                          {countdownTarget && nowMs !== null
                            ? countdownFor(countdownTarget, locale, nowMs)
                            : (locale === "ar" ? "قريباً" : "Soon")}
                        </span>
                      </div>

                      <span className={styles.ctaButton}>
                        <span>
                          {row.status === "REGISTRATION"
                            ? (row.tier === "FREE"
                                ? (locale === "ar" ? "احجز مقعدك مجاناً" : "Join Free")
                                : (locale === "ar" ? "احجز مقعدك الآن" : "Register Now"))
                            : row.status === "LIVE"
                            ? (locale === "ar" ? "شاهد البث الحي" : "Watch Live")
                            : (locale === "ar" ? "عرض التفاصيل" : "Details")}
                        </span>
                        <span className={styles.ctaArrow}>⚔️</span>
                      </span>
                    </div>
                  </div>
                </LocaleLink>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

