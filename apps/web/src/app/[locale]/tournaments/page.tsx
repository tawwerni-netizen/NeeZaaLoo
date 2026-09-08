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
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/i18n/format";
import styles from "./tournaments.module.css";

type TournamentRow = {
  id: string; game_id: string; format: "SINGLE_ELIMINATION" | "SWISS";
  status: string; tier: "FREE" | "RANKED" | "CASH";
  entry_fee_minor: string; asset: string | null; capacity: number;
  registration_closes_at: string | null; starts_at: string | null; completed_at: string | null;
};

const GAME_NAME_KEY: Record<string, string> = { chess: "chess", "speed-math": "speed_math" };

export default function TournamentsPage() {
  return (
    <Suspense fallback={<RequireAuth><Header /><main className="nz-container" /></RequireAuth>}>
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
    void get<{ tournaments: TournamentRow[] }>("/v1/tournaments?status=REGISTRATION_OPEN")
      .then((r) => { if (!cancelled) setTournaments(r.tournaments); })
      .catch(() => { if (!cancelled) setTournaments([]); });
    return () => { cancelled = true; };
  }, []);

  const visible = gameFilter ? tournaments?.filter((row) => row.game_id === gameFilter) : tournaments;

  return (
    <RequireAuth>
      <Header />
      <main className="nz-container">
        <h1 className={styles.heading}>{t("tournamentsPage.heading")}</h1>
        {visible && visible.length === 0 && <p className={styles.empty}>{t("tournamentsPage.empty")}</p>}
        <div className={styles.list}>
          {visible?.map((row) => (
            <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.gameName}>{t(`common.game_names.${GAME_NAME_KEY[row.game_id] ?? row.game_id}`)}</span>
                <span className={styles.format}>{t(`tournamentsPage.format.${row.format}`)}</span>
              </div>
              <div className={styles.cardMeta}>
                <span>{row.tier === "FREE" ? t("tournamentsPage.entry_free") : t("tournamentsPage.entry_fee", { amount: Number(row.entry_fee_minor) / 100, asset: row.asset ?? "" })}</span>
                {row.starts_at && <span>{t("tournamentsPage.starts_at", { date: formatDate(row.starts_at, locale) })}</span>}
              </div>
              <span className={styles.view}>{t("tournamentsPage.view")}</span>
            </LocaleLink>
          ))}
        </div>
      </main>
    </RequireAuth>
  );
}
