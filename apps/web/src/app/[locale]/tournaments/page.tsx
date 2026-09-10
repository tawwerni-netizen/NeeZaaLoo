"use client";

/**
 * TOURNAMENT INTEGRATION -- the generic bracket/Swiss engine
 * (packages/tournament) surfaced for real, for any game. This list reads
 * ONLY what the server already computes (status, registeredCount,
 * capacity) -- no client-side standings, no fabricated "players online."
 * Reusable in full: a game's own detail is nothing more than
 * common.game_names[gameId], read the same way ModeSelect's own
 * tournament card links here.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/i18n/format";
import { getGame } from "@/lib/games";
import styles from "./tournaments.module.css";

type TournamentRow = {
  id: string; game_id: string; format: "SINGLE_ELIMINATION" | "SWISS";
  status: string; tier: "FREE" | "RANKED" | "CASH";
  entry_fee_minor: string; asset: string | null; capacity: number;
  title: string | null; registered_count: number;
  registration_closes_at: string | null; scheduled_starts_at: string | null;
  starts_at: string | null; completed_at: string | null;
};

// Everything a visitor might reasonably want to browse: not-yet-open,
// open, and currently playing. COMPLETED/SETTLED tournaments are reachable
// by direct link (their own duel history, standings) but do not belong in
// a "browse what to join" list.
const BROWSE_STATUSES = "SCHEDULED,REGISTRATION,LIVE,FINALS";

export default function TournamentsPage() {
  return (
    <Suspense fallback={<><Header /><main className="nz-container" /></>}>
      <TournamentsList />
    </Suspense>
  );
}

function TournamentsList() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const gameFilter = searchParams.get("game");
  const [tournaments, setTournaments] = useState<TournamentRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void get<{ tournaments: TournamentRow[] }>(`/v1/tournaments?status=${BROWSE_STATUSES}`)
      .then((r) => { if (!cancelled) setTournaments(r.tournaments); })
      .catch(() => { if (!cancelled) setTournaments([]); });
    return () => { cancelled = true; };
  }, []);

  const visible = gameFilter ? tournaments?.filter((row) => row.game_id === gameFilter) : tournaments;

  return (
    <>
      <Header />
      <main className="nz-container">
        <h1 className={styles.heading}>{t("tournamentsPage.heading")}</h1>
        {visible && visible.length === 0 && <p className={styles.empty}>{t("tournamentsPage.empty")}</p>}
        <div className={styles.list}>
          {visible?.map((row) => {
            const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
            const startTarget = row.scheduled_starts_at ?? row.starts_at;
            return (
              <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                  <span className={styles.format}>{t(`tournamentsPage.format.${row.format}`)}</span>
                  <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                    {t(`tournamentsPage.status.${row.status}`)}
                  </span>
                </div>
                {row.title && <h2 className={styles.title}>{row.title}</h2>}
                <div className={styles.cardMeta}>
                  <span>{row.tier === "FREE" ? t("tournamentsPage.entry_free") : t("tournamentsPage.entry_fee", { amount: Number(row.entry_fee_minor) / 100, asset: row.asset ?? "" })}</span>
                  <span className="nz-num">{t("tournamentsPage.registered_count", { count: row.registered_count, capacity: row.capacity })}</span>
                  {startTarget && <span>{t("tournamentsPage.starts_at", { date: formatDate(startTarget, locale) })}</span>}
                </div>
                <span className={styles.view}>{t("tournamentsPage.view")}</span>
              </LocaleLink>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
