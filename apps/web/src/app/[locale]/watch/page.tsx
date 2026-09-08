"use client";

/**
 * Watch Live (Slice 10 directive #11/#12): a discoverable list of REAL live
 * matches, fetched from /v1/duels/live -- never a fabricated match or
 * spectator count (directive #13). Clicking a row opens the same game
 * screen a player uses; the game page itself (game/[duelId]/page.tsx)
 * decides MATCH vs SPECTATOR chat from the server's own seat answer, never
 * a role this page asserts.
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import styles from "./watch.module.css";

type LiveMatchPlayer = { handle: string; badge: string | null; ratingX100: number | null };
type LiveMatch = { duelId: string; gameId: string; startedAt: string; players: LiveMatchPlayer[] };
type LiveMatchesResponse = { matches: LiveMatch[] };

const POLL_MS = 8000;

export default function WatchPage() {
  return (
    <RequireAuth>
      <Header />
      <WatchContent />
    </RequireAuth>
  );
}

function WatchContent() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<LiveMatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void get<LiveMatchesResponse>("/v1/duels/live")
        .then((r) => { if (!cancelled) setMatches(r.matches); })
        .catch(() => { if (!cancelled) setMatches((prev) => prev ?? []); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("watch.title")}</h1>
          <p className={styles.subtitle}>{t("watch.subtitle")}</p>
        </div>
      </div>

      {matches === null ? (
        <div className={styles.card} />
      ) : matches.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.empty}>{t("watch.empty")}</p>
        </div>
      ) : (
        matches.map((m) => (
          <LocaleLink key={m.duelId} href={`/game/${m.duelId}`} className={styles.matchRow}>
            <div className={styles.matchPlayers}>
              <PlayerChip player={m.players[0]} />
              <span className={styles.vs}>{t("watch.vs")}</span>
              <PlayerChip player={m.players[1]} />
            </div>
            <span className={styles.watchCta}>{t("watch.watch_cta")}</span>
          </LocaleLink>
        ))
      )}
    </div>
  );
}

function PlayerChip({ player }: { player: LiveMatchPlayer | undefined }) {
  if (!player) return null;
  return (
    <span className={styles.playerChip}>
      <span className={styles.playerHandle}>{player.handle}</span>
      {player.badge && <span className={styles.playerBadge}>{badgeIcon(player.badge)}</span>}
      {player.ratingX100 != null && (
        <span className={`nz-num ${styles.playerRating}`}>{Math.round(player.ratingX100 / 100)}</span>
      )}
    </span>
  );
}
