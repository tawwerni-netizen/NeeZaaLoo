"use client";

/**
 * The homepage's real Live Arena preview. Reads the exact same public,
 * anonymous-accessible endpoint /watch's own page uses (GET /v1/duels/live,
 * action duel.spectate, anonymous: true) -- never a fabricated match,
 * player count, or "X people online" figure. An empty result renders an
 * honest empty state, not a placeholder match.
 */
import { useEffect, useState } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import styles from "./LiveArenaSection.module.css";

type LiveMatchPlayer = { handle: string; badge: string | null; ratingX100: number | null };
type LiveMatch = {
  duelId: string; gameId: string; isTournamentMatch: boolean; moveCount: number;
  players: LiveMatchPlayer[];
};

const POLL_MS = 10000;
const PREVIEW_LIMIT = 3;

export function LiveArenaSection() {
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void get<{ matches: LiveMatch[] }>(`/v1/duels/live?limit=${PREVIEW_LIMIT}`)
        .then((r) => { if (!cancelled) setMatches(r.matches); })
        .catch(() => { if (!cancelled) setMatches((prev) => prev ?? []); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.headRow}>
          <div>
            <h2 className={styles.heading}>{t("home.liveArena.heading")}</h2>
            <p className={styles.subhead}>{t("home.liveArena.subhead")}</p>
          </div>
          <LocaleLink href="/watch" className={styles.viewAll}>{t("home.liveArena.view_all")}</LocaleLink>
        </div>

        {matches === null ? (
          <div className={styles.grid} aria-hidden="true">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        ) : matches.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>⚔️</div>
            <div className={styles.emptyContent}>
              <h3 className={styles.emptyTitle}>
                {isRtl ? "الميدان التنافسي بانتظار بطله الأول!" : "The Arena Awaits Its First Champion!"}
              </h3>
              <p className={styles.emptySub}>
                {isRtl
                  ? "لا توجد مباريات جارية في هذه اللحظة. أطلق أول نزال بمبلغ 5$ واكسب 9.50$ فوراً!"
                  : "No live duels active right now. Launch a challenge with $5 and win $9.50 instantly!"}
              </p>
            </div>
            <LocaleLink href="/play" className={styles.emptyCta}>
              <span>{isRtl ? "⚡ ادخل ميدان التحديات واكسب الجائزة" : "⚡ Enter Arena & Win Now"}</span>
            </LocaleLink>
          </div>
        ) : (
          <div className={styles.grid}>
            {matches.map((m) => {
              const nameKey = getGame(m.gameId)?.nameKey ?? m.gameId;
              return (
                <LocaleLink key={m.duelId} href={`/game/${m.duelId}`} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.liveDot} aria-hidden="true" />
                    <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                    {m.isTournamentMatch && <span className={styles.tournamentTag}>{t("watch.tournament_badge")}</span>}
                  </div>
                  <div className={styles.players}>
                    <span className={styles.handle}>{m.players[0]?.handle}</span>
                    <span className={styles.vs}>{t("watch.vs")}</span>
                    <span className={styles.handle}>{m.players[1]?.handle}</span>
                  </div>
                  <span className={styles.moves}>{t("watch.move_count", { count: m.moveCount })}</span>
                </LocaleLink>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
