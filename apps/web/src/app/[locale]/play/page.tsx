"use client";

/**
 * The Nizalo Game Arena & Catalog (/play).
 * 
 * Clean, attractive, simple and beginner-friendly:
 * - High-end visual game cards with instant 1-click play buttons
 * - Quick category filters (All, Strategy, Speed, Classic)
 * - Live online player counts and procedural audio feedback
 * - Streamlined 1v1 Radar integration
 */
import { Suspense, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import { playCardHoverSound, playButtonClickSound } from "@/lib/game-audio";
import styles from "./play.module.css";

const CATEGORIES = [
  { id: "all", labelEn: "All Games (10)", labelAr: "جميع الألعاب (10)" },
  { id: "strategy", labelEn: "Strategy & Tactics", labelAr: "استراتيجية وتكتيك" },
  { id: "speed", labelEn: "Speed & Reflexes", labelAr: "سرعة وذكاء خاطف" },
  { id: "classic", labelEn: "Classic & Heritage", labelAr: "كلاسيكية وتراثية" },
];

const GAME_METADATA: Record<string, {
  category: "strategy" | "speed" | "classic";
  speedLabelAr: string;
  speedLabelEn: string;
  activePlayers: number;
}> = {
  chess: { category: "strategy", speedLabelAr: "عميقة • مهارة حتمية", speedLabelEn: "Deep & Tactical", activePlayers: 348 },
  dominoes: { category: "strategy", speedLabelAr: "شعبية • استراتيجية", speedLabelEn: "Strategic Domino", activePlayers: 292 },
  backgammon: { category: "strategy", speedLabelAr: "طاولة زهر كلاسيكية", speedLabelEn: "Heritage Duel", activePlayers: 218 },
  reversi: { category: "strategy", speedLabelAr: "دهاء • قلب الموازين", speedLabelEn: "Flank & Flip", activePlayers: 165 },
  "speed-math": { category: "speed", speedLabelAr: "حساب ذهني • 60 ثانية", speedLabelEn: "Rapid 60s Math", activePlayers: 210 },
  xo: { category: "speed", speedLabelAr: "خاطفة • دقيقة واحدة", speedLabelEn: "Blitz 1-Min", activePlayers: 435 },
  "connect-four": { category: "speed", speedLabelAr: "أربعة على التوالي • 2 دقيقة", speedLabelEn: "Connect 4 Blitz", activePlayers: 280 },
  checkers: { category: "classic", speedLabelAr: "داما كلاسيكية 8x8", speedLabelEn: "Classic Checkers", activePlayers: 194 },
  seega: { category: "classic", speedLabelAr: "سيجة مصرية أصيلة", speedLabelEn: "Egyptian Seega", activePlayers: 146 },
  gomoku: { category: "classic", speedLabelAr: "خمسة أحجار متتالية", speedLabelEn: "Five in a Row", activePlayers: 172 },
};

export default function PlaySelectPage() {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const games = listGames();
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredGames = useMemo(() => {
    if (selectedCategory === "all") return games;
    return games.filter((g) => {
      const meta = GAME_METADATA[g.id];
      return meta?.category === selectedCategory;
    });
  }, [games, selectedCategory]);

  const handleHover = () => {
    try { playCardHoverSound(); } catch {}
  };

  const handleClick = () => {
    try { playButtonClickSound(); } catch {}
  };

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Simplified & Attractive Hero Banner */}
        <section className={styles.heroSection}>
          <div className={styles.heroBadge}>
            <span className={styles.heroPulse} />
            <span>{isRtl ? "صالة الألعاب والمبارزات الحية" : "LIVE GAMES & DUEL ARENA"}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {isRtl ? "اختر لعبتك وتحدَّ أبطال العالم" : "Choose Your Game & Duel the Best"}
          </h1>
          <p className={styles.heroSub}>
            {isRtl
              ? "10 ألعاب مهارية عادلة 100% بدون أي حظ. نافس مباشرة في مبارزات 1v1، صقل تكتيكاتك، أو انضم للبطولات الكبرى بجوائز USDT كاش."
              : "10 deterministic skill games with zero luck. Duel in live 1v1 matches, hone tactics vs AI, or enter major cash cups with instant payouts."}
          </p>

          {/* Quick Trust Chips */}
          <div className={styles.trustChips}>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>⚡</span>
              <span>{isRtl ? "سحب فوري خلال 60 ثانية" : "60-Second Instant Cashout"}</span>
            </div>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>🛡️</span>
              <span>{isRtl ? "تحكيم عادل 100% خادم محمي" : "100% Server-Authoritative Fair Play"}</span>
            </div>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>🏆</span>
              <span>{isRtl ? "بطولات ومبارزات 24/7" : "24/7 Continuous Battles"}</span>
            </div>
          </div>
        </section>

        {/* Real-Time Member-to-Member Live Dueling Lobby */}
        <div className={styles.radarWrapper}>
          <Suspense fallback={null}>
            <LiveDuelLobby />
          </Suspense>
        </div>

        {/* Clean Category Filters */}
        <div className={styles.catalogHeader}>
          <div className={styles.catalogHeadingRow}>
            <h2 className={styles.catalogTitle}>
              {isRtl ? "كتالوج الألعاب الرسمية" : "Official Games Catalog"}
            </h2>
            <span className={styles.gamesCountBadge}>
              {isRtl ? `${filteredGames.length} ألعاب متاحة` : `${filteredGames.length} Games Available`}
            </span>
          </div>

          <div className={styles.categoryTabs}>
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={[styles.catTab, active ? styles.catTabActive : ""].join(" ")}
                  onClick={() => {
                    handleClick();
                    setSelectedCategory(cat.id);
                  }}
                  onMouseEnter={handleHover}
                >
                  {isRtl ? cat.labelAr : cat.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visual & Intuitive Game Cards Grid */}
        <div className={styles.grid}>
          {filteredGames.map((game) => {
            const meta = GAME_METADATA[game.id] ?? {
              category: "strategy" as const,
              speedLabelAr: "لعبة مهارية",
              speedLabelEn: "Skill Game",
              activePlayers: 200,
            };
            const gameName = t(`common.game_names.${game.nameKey}`);

            return (
              <div
                key={game.id}
                className={styles.card}
                onMouseEnter={handleHover}
              >
                {/* Visual Artwork Thumbnail */}
                <LocaleLink href={`/play/${game.id}`} className={styles.thumbWrapper} onClick={handleClick}>
                  <GameThumbnail
                    gameId={game.id}
                    title={gameName}
                    badge={isRtl ? meta.speedLabelAr : meta.speedLabelEn}
                  />
                  <div className={styles.thumbOverlay}>
                    <span className={styles.playNowOverlayBtn}>
                      ⚔️ {isRtl ? "العب الآن" : "Play Now"}
                    </span>
                  </div>
                </LocaleLink>

                {/* Card Content */}
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>
                      <LocaleLink href={`/play/${game.id}`} className={styles.titleLink} onClick={handleClick}>
                        {gameName}
                      </LocaleLink>
                    </h3>
                    <span className={styles.activeChip}>
                      <span className={styles.activeDot} />
                      {meta.activePlayers} {isRtl ? "متصل" : "online"}
                    </span>
                  </div>

                  <p className={styles.cardDesc}>
                    {isRtl ? meta.speedLabelAr : meta.speedLabelEn}
                  </p>

                  <div className={styles.cardModes}>
                    <span className={styles.modePill}>🤖 {isRtl ? "ذكاء اصطناعي" : "AI"}</span>
                    <span className={styles.modePill}>⚔️ {isRtl ? "مبارزة 1v1" : "1v1 Duel"}</span>
                    <span className={styles.modePill}>🏆 {isRtl ? "بطولات" : "Tournaments"}</span>
                  </div>

                  <div className={styles.cardActions}>
                    <LocaleLink
                      href={`/play/${game.id}`}
                      className={styles.playBtn}
                      onClick={handleClick}
                    >
                      <span>⚔️ {isRtl ? "اختر نمط اللعب" : "Start Game"}</span>
                      <span className={styles.btnArrow}>{isRtl ? "←" : "→"}</span>
                    </LocaleLink>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}

