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
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./play.module.css";

const PRESENTATION: Record<string, { key: string; difficulty: "deep" | "fast" }> = {
  chess: { key: "chess", difficulty: "deep" },
  checkers: { key: "checkers", difficulty: "deep" },
  "connect-four": { key: "connect_four", difficulty: "fast" },
  xo: { key: "xo", difficulty: "fast" },
  "speed-math": { key: "speed_math", difficulty: "fast" },
};

export default function PlaySelectPage() {
  const { t } = useI18n();
  const games = listGames();

  return (
    <RequireAuth>
      <Header />
      <main className="nz-container">
        {/* Real-Time Member-to-Member Live Dueling Lobby */}
        <LiveDuelLobby />

        <h1 className={styles.heading}>{t("play.select.heading")}</h1>
        <div className={styles.grid}>
          {games.map((game) => {
            const presentation = PRESENTATION[game.id] ?? { key: game.nameKey, difficulty: "deep" as const };
            return (
              <LocaleLink key={game.id} href={`/play/${game.id}`} className={styles.card}>
                <h2 className={styles.cardTitle}>{t(`common.game_names.${presentation.key}`)}</h2>
                <dl className={styles.meta}>
                  <div><dt>{t("play.select.duration_label")}</dt><dd>{t(`home.games.${presentation.key}.duration`)}</dd></div>
                  <div><dt>{t("play.select.style_label")}</dt><dd>{t(`play.select.difficulty_${presentation.difficulty}`)}</dd></div>
                  <div><dt>{t("play.select.mode_label")}</dt><dd>{t(`home.games.${presentation.key}.mode`)}</dd></div>
                  <div><dt>{t("play.select.eligibility_label")}</dt><dd>{t("play.select.eligibility_free")}</dd></div>
                </dl>
                <span className={styles.cta}>{t("play.select.cta")}</span>
              </LocaleLink>
            );
          })}
        </div>
      </main>
    </RequireAuth>
  );
}
