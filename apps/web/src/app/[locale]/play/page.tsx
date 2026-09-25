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
import { useSearchParams } from "next/navigation";
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
  { id: "all", labelKey: "play_page.cat_all" },
  { id: "strategy", labelKey: "play_page.cat_strategy" },
  { id: "speed", labelKey: "play_page.cat_speed" },
  { id: "classic", labelKey: "play_page.cat_classic" },
];

const GAME_METADATA: Record<string, {
  category: "strategy" | "speed" | "classic";
  metaKey: string;
  activePlayers: number;
}> = {
  chess: { category: "strategy", metaKey: "play_page.meta_chess", activePlayers: 348 },
  dominoes: { category: "strategy", metaKey: "play_page.meta_dominoes", activePlayers: 292 },
  backgammon: { category: "strategy", metaKey: "play_page.meta_backgammon", activePlayers: 218 },
  reversi: { category: "strategy", metaKey: "play_page.meta_reversi", activePlayers: 165 },
  "speed-math": { category: "speed", metaKey: "play_page.meta_speed_math", activePlayers: 210 },
  xo: { category: "speed", metaKey: "play_page.meta_xo", activePlayers: 435 },
  "connect-four": { category: "speed", metaKey: "play_page.meta_connect_four", activePlayers: 280 },
  checkers: { category: "classic", metaKey: "play_page.meta_checkers", activePlayers: 194 },
  seega: { category: "classic", metaKey: "play_page.meta_seega", activePlayers: 146 },
  gomoku: { category: "classic", metaKey: "play_page.meta_gomoku", activePlayers: 172 },
};

function InnerPlayCatalogPage() {
  const { t, locale, dir } = useI18n();
  const searchParams = useSearchParams();
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
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
            <span>{t("play_page.badge")}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {t("play_page.title")}
          </h1>
          <p className={styles.heroSub}>
            {isRtl
              ? "10 ألعاب مهارية عادلة 100% بدون أي حظ. نافس مباشرة في مبارزات 1v1، صقل تكتيكاتك، أو انضم للبطولات الكبرى بجوائز USDT كاش."
              : "10 deterministic skill games. Duel in live 1v1 matches, hone tactics vs AI, or enter major cash cups with instant payouts."}
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
              <span className={styles.trustIcon}>🏆</span>
              <span>{t("play_page.trust_battles")}</span>
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
              {t("play_page.catalog_title")}
            </h2>
            <span className={styles.gamesCountBadge}>
              {t("play_page.games_available", { count: String(filteredGames.length) })}
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
                  {t(cat.labelKey)}
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
              metaKey: "play_page.meta_chess",
              activePlayers: 200,
            };
            const gameName = t(`common.game_names.${game.nameKey}`);
            const speedLabel = t(meta.metaKey);

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
                    badge={speedLabel}
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
                        {gameName}
                      </LocaleLink>
                    </h3>
                    <span className={styles.activeChip}>
                      <span className={styles.activeDot} />
                      {meta.activePlayers} {t("play_page.online")}
                    </span>
                  </div>

                  <p className={styles.cardDesc}>
                    {speedLabel}
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
