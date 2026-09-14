"use client";

/**
 * The game lobby -- reads its catalog from the SAME registry the rest of
 * the Game Factory resolves plugins through (getGame/DuelShell), not a
 * hardcoded list. A game that is not registered (no Board, no adapter)
 * cannot appear here to be clicked into a dead end -- this is the fix for
 * the "lobby advertises a game with no real board" catalog drift the
 * architecture audit flagged.
 *
 * `duration`/`style` below are presentation copy, not gameplay capability
 * -- deliberately NOT part of GamePlugin (see lib/games/types.ts's own
 * header on what belongs there), so they stay a small local map here.
 */
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./play.module.css";

const PRESENTATION: Record<string, { key: string; difficulty: "deep" | "fast" }> = {
  chess: { key: "chess", difficulty: "deep" },
  checkers: { key: "checkers", difficulty: "deep" },
  "connect-four": { key: "connect_four", difficulty: "fast" },
  xo: { key: "xo", difficulty: "fast" },
  "speed-math": { key: "speed_math", difficulty: "fast" },
  dominoes: { key: "dominoes", difficulty: "deep" },
  backgammon: { key: "backgammon", difficulty: "deep" },
  seega: { key: "seega", difficulty: "deep" },
  reversi: { key: "reversi", difficulty: "deep" },
  gomoku: { key: "gomoku", difficulty: "deep" },
};

export default function PlaySelectPage() {
  const { t, dir } = useI18n();
  const games = listGames();
  const isRtl = dir === "rtl";

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Real-Time Member-to-Member Live Dueling Lobby */}
        <LiveDuelLobby />

        <div className={styles.sectionHeader}>
          <div className={styles.sectionBadge}>
            <span className={styles.badgeDot} />
            <span>{isRtl ? "كتالوج الألعاب التنافسية" : "COMPETITIVE CATALOG"}</span>
          </div>
          <h1 className={styles.heading}>{t("play.select.heading")}</h1>
          <p className={styles.subheading}>
            {isRtl
              ? "اختر من بين 10 ألعاب مهارية معتمدة ذات قواعد حتمية وتحكيم خادم فوري بدون أي عنصر حظ."
              : "Choose from 10 server-authoritative skill games with deterministic rules and instant matchmaking."}
          </p>
        </div>

        <div className={styles.grid}>
          {games.map((game) => {
            const presentation = PRESENTATION[game.id] ?? { key: game.nameKey, difficulty: "deep" as const };
            return (
              <LocaleLink key={game.id} href={`/play/${game.id}`} className={styles.card}>
                <div className={styles.thumbWrapper}>
                  <GameThumbnail
                    gameId={game.id}
                    title={t(`common.game_names.${presentation.key}`)}
                    badge={t(`play.select.difficulty_${presentation.difficulty}`)}
                  />
                </div>
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>{t(`common.game_names.${presentation.key}`)}</h2>
                    <span className={styles.difficultyBadge}>
                      {t(`play.select.difficulty_${presentation.difficulty}`)}
                    </span>
                  </div>
                  <dl className={styles.meta}>
                    <div><dt>{t("play.select.duration_label")}</dt><dd>{t(`home.games.${presentation.key}.duration`)}</dd></div>
                    <div><dt>{t("play.select.style_label")}</dt><dd>{t(`play.select.difficulty_${presentation.difficulty}`)}</dd></div>
                    <div><dt>{t("play.select.mode_label")}</dt><dd>{t(`home.games.${presentation.key}.mode`)}</dd></div>
                    <div><dt>{t("play.select.eligibility_label")}</dt><dd>{t("play.select.eligibility_free")}</dd></div>
                  </dl>
                  <div className={styles.cardFooter}>
                    <span className={styles.cta}>
                      {t("play.select.cta")}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isRtl ? "scaleX(-1)" : "none" }}>
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </LocaleLink>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
