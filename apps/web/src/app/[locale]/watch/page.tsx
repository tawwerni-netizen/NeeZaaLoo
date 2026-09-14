"use client";

/**
 * The Live Arena: a discoverable list of REAL live matches, fetched from
 * /v1/duels/live -- never a fabricated match, spectator count, or "safe
 * state summary." Each card shows exactly what the server already
 * computed: the game, both real seats (handle/badge/rating), a real move
 * count as the safe public summary (never board state -- that stays
 * behind the spectator projection the game page itself applies), and
 * whether this is a real tournament pairing's duel (isTournamentMatch,
 * derived server-side from the pairing_key -- never asserted here).
 * Clicking WATCH opens the same game screen a player uses; that page
 * decides MATCH vs SPECTATOR view from the server's own seat answer.
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import styles from "./watch.module.css";

type LiveMatchPlayer = { handle: string; badge: string | null; ratingX100: number | null };
type LiveMatch = {
  duelId: string; gameId: string; startedAt: string;
  isTournamentMatch: boolean; moveCount: number;
  players: LiveMatchPlayer[];
};
type LiveMatchesResponse = { matches: LiveMatch[] };

const POLL_MS = 3000;

export default function WatchPage() {
  return (
    <RequireAuth>
      <Header />
      <WatchContent />
    </RequireAuth>
  );
}

function WatchContent() {
  const { t, locale } = useI18n();
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const r = await get<LiveMatchesResponse>("/v1/duels/live");
      setMatches(r.matches || []);
    } catch {
      setMatches((prev) => prev ?? []);
    } finally {
      if (isManual) setTimeout(() => setRefreshing(false), 400);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadMatches();
    const interval = setInterval(() => {
      if (!cancelled) void loadMatches();
    }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.titleBadge}>
            <span className={styles.livePulseDot} />
            <span>{locale === "ar" ? "بث مباشر فوري" : "REALTIME ARENA FEED"}</span>
          </div>
          <h1 className={styles.title}>{t("watch.title")}</h1>
          <p className={styles.subtitle}>{t("watch.subtitle")}</p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.refreshBtn} ${refreshing ? styles.refreshing : ""}`}
            onClick={() => void loadMatches(true)}
            disabled={refreshing}
            title={locale === "ar" ? "تحديث فوري للمباريات" : "Refresh matches"}
          >
            <span className={styles.refreshIcon}>🔄</span>
            <span>{locale === "ar" ? "تحديث مباشر" : "Live Refresh"}</span>
          </button>
          <LocaleLink href="/play" className={styles.createDuelBtn}>
            <span>⚔️ {locale === "ar" ? "أطلق مبارزة الآن" : "Start a Duel"}</span>
          </LocaleLink>
        </div>
      </div>

      {matches === null ? (
        <div className={styles.grid} aria-hidden="true">
          <div className={styles.matchCardSkeleton} />
          <div className={styles.matchCardSkeleton} />
        </div>
      ) : matches.length === 0 ? (
        <div className={styles.emptyArenaCard}>
          <div className={styles.radarGraphic}>
            <div className={styles.radarSweep} />
            <span className={styles.radarIcon}>📡</span>
          </div>
          <h3 className={styles.emptyArenaTitle}>
            {locale === "ar" ? "الساحة في انتظار أبطالها الآن!" : "The Arena Awaits Its Champions!"}
          </h3>
          <p className={styles.emptyArenaDesc}>
            {locale === "ar"
              ? "لا توجد مبارزات جارية في هذه اللحظة. بادر بإطلاق مبارزة جديدة وادعُ خصوماً حقيقيين لمواجهتك فوراً!"
              : "No live duels in progress right now. Launch a duel and challenge real opponents instantly!"}
          </p>
          <div className={styles.emptyArenaActions}>
            <LocaleLink href="/play" className={styles.heroPlayBtn}>
              ⚔️ {locale === "ar" ? "ابدأ مبارزة الآن" : "Play & Challenge Now"}
            </LocaleLink>
            <LocaleLink href="/tournaments" className={styles.heroTourneyBtn}>
              🏆 {locale === "ar" ? "تصفح البطولات المفتوحة" : "Explore Tournaments"}
            </LocaleLink>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {matches.map((m) => {
            const nameKey = getGame(m.gameId)?.nameKey ?? m.gameId;
            return (
              <div key={m.duelId} className={styles.matchCard}>
                <div className={styles.cardTop}>
                  <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                  <span className={styles.liveBadge}>
                    <span className={styles.liveDot} aria-hidden="true" />
                    {t("watch.live_badge")}
                  </span>
                </div>

                {m.isTournamentMatch && (
                  <span className={styles.tournamentBadge}>{t("watch.tournament_badge")}</span>
                )}

                <div className={styles.matchPlayers}>
                  <PlayerChip player={m.players[0]} />
                  <span className={styles.vs}>{t("watch.vs")}</span>
                  <PlayerChip player={m.players[1]} />
                </div>

                <div className={styles.cardBottom}>
                  <span className={styles.moveCount}>{t("watch.move_count", { count: m.moveCount })}</span>
                  <LocaleLink href={`/game/${m.duelId}`} className={styles.watchCta}>{t("watch.watch_cta")}</LocaleLink>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerChip({ player }: { player: LiveMatchPlayer | undefined }) {
  if (!player) return null;
  return (
    // Spectator discovery (LIVE MATCH -> WATCH -> VIEW PLAYER): a real
    // link to the player's own profile, not just a static label.
    <LocaleLink href={`/players/${encodeURIComponent(player.handle)}`} className={styles.playerChip}>
      <Avatar nickname={player.handle} avatarUrl={null} size={32} />
      <span className={styles.playerInfo}>
        <span className={styles.playerHandle}>{player.handle}</span>
        {player.ratingX100 != null && (
          <span className={`nz-num ${styles.playerRating}`}>{Math.round(player.ratingX100 / 100)}</span>
        )}
      </span>
      {player.badge && <span className={styles.playerBadge}>{badgeIcon(player.badge)}</span>}
    </LocaleLink>
  );
}
