"use client";

/**
 * A single game's public, crawlable details page -- distinct from the
 * catalog (/games, a scan-and-compare grid) and from /play/:gameId (the
 * authenticated mode-select flow). This page's job is to answer "what is
 * this game, really" before someone commits to signing in.
 *
 * The leaderboard section calls the real GET /v1/leaderboard?game=:id --
 * the SAME endpoint /rank's own methodology describes -- which requires a
 * signed-in caller (it has no `anonymous: true` in the route table). An
 * anonymous visitor gets a real 401 back; this page treats that as an
 * honest "sign in to see it" state, never a fabricated preview of ranked
 * players.
 */
import { use, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { getGame } from "@/lib/games";
import styles from "./game-details.module.css";

type LeaderboardEntry = { player_id: string; handle: string; rating_x100: number; rd_x100: number; games_played: number };

export default function GameDetailsPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { t } = useI18n();
  const plugin = getGame(gameId);

  if (!plugin) {
    return (
      <>
        <Header />
        <main className="nz-container"><p className={styles.unknown}>{t("common.unknown_game")}</p></main>
        <Footer />
      </>
    );
  }

  const name = t(`common.game_names.${plugin.nameKey}`);

  return (
    <>
      <Header />
      <main className="nz-container">
        <LocaleLink href="/games" className={styles.back}>{t("gameDetailsPage.back_to_games")}</LocaleLink>

        <header className={styles.head}>
          <h1 className={styles.heading}>{name}</h1>
          <p className={styles.subhead}>{t(`home.games.${plugin.nameKey}.description`)}</p>
          <LocaleLink href={`/play/${plugin.id}`}>
            <Button variant="primary">{t("gameDetailsPage.play_cta", { name })}</Button>
          </LocaleLink>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("gameDetailsPage.facts_heading")}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>{t("gameDetailsPage.fact_turn_model")}</dt>
              <dd>{plugin.turnModel === "SIMULTANEOUS" ? t("gamesPage.turn_model_simultaneous") : t("gamesPage.turn_model_alternating")}</dd>
            </div>
            <div>
              <dt>{t("gameDetailsPage.fact_duration")}</dt>
              <dd>{t(`home.games.${plugin.nameKey}.duration`)}</dd>
            </div>
            <div>
              <dt>{t("gameDetailsPage.fact_mode")}</dt>
              <dd>{t(`home.games.${plugin.nameKey}.mode`)}</dd>
            </div>
            <div>
              <dt>{t("gameDetailsPage.fact_stakes")}</dt>
              <dd>{plugin.cashEnabled ? t("gameDetailsPage.stakes_enabled") : t("gameDetailsPage.stakes_free_only")}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("gameDetailsPage.difficulty_heading")}</h2>
          {plugin.difficulties.length > 0 ? (
            <>
              <p className={styles.sectionBody}>{t("gameDetailsPage.difficulty_body")}</p>
              <div className={styles.difficulties}>
                {plugin.difficulties.map((d) => (
                  <span key={d} className={styles.difficultyBadge}>{t(`game.difficulty.${d}`)}</span>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.sectionBody}>{t("gameDetailsPage.no_ai_body")}</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("gameDetailsPage.leaderboard_heading")}</h2>
          <Leaderboard gameId={plugin.id} />
        </section>
      </main>
      <Footer />
    </>
  );
}

function Leaderboard({ gameId }: { gameId: string }) {
  const { t } = useI18n();
  const { player, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!player) { setSignedOut(true); return; }
    let cancelled = false;
    void get<{ gameId: string; entries: LeaderboardEntry[] }>(`/v1/leaderboard?game=${encodeURIComponent(gameId)}&limit=10`)
      .then((r) => { if (!cancelled) setEntries(r.entries); })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setSignedOut(true);
        else setEntries([]);
      });
    return () => { cancelled = true; };
  }, [gameId, player, loading]);

  if (signedOut) return <p className={styles.empty}>{t("gameDetailsPage.leaderboard_signed_out")}</p>;
  if (entries === null) return null;
  if (entries.length === 0) return <p className={styles.empty}>{t("gameDetailsPage.leaderboard_empty")}</p>;

  return (
    <ol className={styles.leaderboard}>
      {entries.map((e, i) => (
        <li key={e.player_id} className={styles.leaderboardRow}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.handle}>{e.handle}</span>
          <span className={styles.played}>{t("gameDetailsPage.leaderboard_games_played", { count: e.games_played })}</span>
          <span className={`nz-num ${styles.rating}`}>{Math.round(e.rating_x100 / 100)}</span>
        </li>
      ))}
    </ol>
  );
}
