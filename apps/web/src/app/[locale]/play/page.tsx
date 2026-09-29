"use client";

/**
 * The Nizalo Game Arena & Catalog (/play).
 * 
 * Clean, attractive, simple and beginner-friendly:
 * - High-end visual game cards with instant 1-click play buttons
 * - Quick category filters driven by canonical GameRegistry
 * - Live online player benchmarks and procedural audio feedback
 * - Streamlined 1v1 Radar integration
 */
import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { useI18n } from "@/lib/i18n/context";
import { GameRegistry, type GameCategory } from "@/lib/games";
import { playCardHoverSound, playButtonClickSound } from "@/lib/game-audio";
import styles from "./play.module.css";

const CATEGORIES: Array<{ id: GameCategory | "all"; labelKey: string }> = [
  { id: "all", labelKey: "play_page.cat_all" },
  { id: "STRATEGY", labelKey: "play_page.cat_strategy" },
  { id: "SPEED", labelKey: "play_page.cat_speed" },
  { id: "BOARD", labelKey: "play_page.cat_classic" },
];

function InnerPlayCatalogPage() {
  const { t, locale, dir } = useI18n();
  const searchParams = useSearchParams();
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const isRtl = dir === "rtl";
  const allGames = useMemo(() => GameRegistry.getAll(), []);
  const [selectedCategory, setSelectedCategory] = useState<GameCategory | "all">("all");

  const filteredGames = useMemo(() => {
    if (selectedCategory === "all") return allGames;
    return GameRegistry.filter(selectedCategory);
  }, [allGames, selectedCategory]);

  const handleHover = () => {
    try { playCardHoverSound(); } catch {}
  };

  const handleClick = () => {
    try { playButtonClickSound(); } catch {}
  };

  const gameCount = GameRegistry.getCount();

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Simplified & Attractive Hero Banner */}
        <section className={styles.heroSection}>
          <div className={styles.heroBadge}>
            <span className={styles.heroPulse} />
            <span>{t("play_page.badge")}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {t("play_page.title")}
          </h1>
          <p className={styles.heroSub}>
            {isRtl
              ? `${gameCount} لعبة معتمدة بقواعد عالمية أصيلة وتوقيت تكتيكي فريد. نافس مباشرة في مبارزات 1v1، صقل تكتيكاتك، أو انضم للبطولات الكبرى بجوائز USDT كاش.`
              : `${gameCount} authentic games with global tournament rules and unique pacing. Duel in live 1v1 matches, hone tactics vs AI, or enter major cash cups with instant payouts.`}
          </p>

          {/* Quick Trust Chips */}
          <div className={styles.trustChips}>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>⚡</span>
              <span>{t("play_page.trust_cashout")}</span>
            </div>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>🛡️</span>
              <span>{t("play_page.trust_fairplay")}</span>
            </div>
            <div className={styles.trustChip}>
              <span className={styles.trustIcon}>🤖</span>
              <span>{t("play_page.trust_ai")}</span>
            </div>
          </div>
        </section>

        {/* Live Lobby / Radar Widget */}
        <LiveDuelLobby />

        {/* Catalog Header & Filters */}
        <div className={styles.catalogHeader}>
          <div className={styles.catalogTitleGroup}>
            <h2 className={styles.catalogHeading}>{t("play_page.catalog_heading")}</h2>
            <span className={styles.catalogCount}>
              {filteredGames.length} {t("play_page.games_available")}
            </span>
          </div>

          <div className={styles.categoryFilters} role="tablist">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? styles.categoryBtnActive : styles.categoryBtn}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    handleClick();
                  }}
                >
                  {t(cat.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visual & Intuitive Game Cards Grid */}
        <div className={styles.grid}>
          {filteredGames.map((game) => {
            const gameName = t(`common.game_names.${game.nameKey}`) || game.id;
            const subtitle = isRtl ? game.taglineAr : game.tagline;
            const duration = isRtl ? game.typicalDurationAr : game.typicalDuration;
            const activePlayers = game.availability.onlinePlayersBenchmark;

            return (
              <div
                key={game.id}
                className={styles.card}
                onMouseEnter={handleHover}
              >
                {/* Visual Artwork Thumbnail */}
                <LocaleLink href={`/play/${game.id}${query}`} className={styles.thumbWrapper} onClick={handleClick}>
                  <GameThumbnail
                    gameId={game.id}
                    title={gameName}
                    duration={duration}
                  />
                  <div className={styles.thumbOverlay}>
                    <span className={styles.playNowOverlayBtn}>
                      ⚔️ {t("play_page.play_now")}
                    </span>
                  </div>
                </LocaleLink>

                {/* Card Content */}
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>
                      <LocaleLink href={`/play/${game.id}${query}`} className={styles.titleLink} onClick={handleClick}>
                        <span style={{ marginInlineEnd: "6px" }}>{game.icon}</span>
                        {gameName}
                      </LocaleLink>
                    </h3>
                    <span className={styles.activeChip}>
                      <span className={styles.activeDot} />
                      {activePlayers} {t("play_page.online")}
                    </span>
                  </div>

                  <p className={styles.cardDesc}>
                    {subtitle}
                  </p>

                  <div className={styles.cardModes}>
                    <span className={styles.modePill}>🤖 {t("play_page.mode_ai")}</span>
                    <span className={styles.modePill}>⚔️ {t("play_page.mode_duel")}</span>
                    <span className={styles.modePill}>🏆 {t("play_page.mode_tournaments")}</span>
                  </div>

                  <div className={styles.cardActions}>
                    <LocaleLink
                      href={`/play/${game.id}${query}`}
                      className={styles.playBtn}
                      onClick={handleClick}
                    >
                      <span>⚔️ {t("play_page.start_game")}</span>
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

export default function PlayCatalogPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InnerPlayCatalogPage />
    </Suspense>
  );
}
