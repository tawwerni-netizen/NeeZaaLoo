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
import { TournamentBannerSlider } from "@/components/tournaments/TournamentBannerSlider";
import { formatTournamentTitle, getTournamentCover } from "@/components/tournaments/UpcomingTournaments";
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
        {/* Large 5-Banner Tournament Showcase Slider */}
        <TournamentBannerSlider />

        <h1 className={styles.heading}>{t("tournamentsPage.heading")}</h1>
        {visible && visible.length === 0 && <p className={styles.empty}>{t("tournamentsPage.empty")}</p>}
        <div className={styles.list}>
          {visible?.map((row) => {
            const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
            const gameName = t(`common.game_names.${nameKey}`);
            const cleanTitle = formatTournamentTitle(row, gameName, locale);
            const startTarget = row.scheduled_starts_at ?? row.starts_at;
            const entryFeeUsdt = Number(row.entry_fee_minor || 0) / 1_000_000;
            const prizePool = (entryFeeUsdt * row.capacity * 0.88).toFixed(2);
            const registeredPct = Math.min(100, Math.round(((row.registered_count || 0) / (row.capacity || 1)) * 100));
            const imgPath = getTournamentCover(row.game_id);

            return (
              <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
                <div className={styles.cardBannerWrap}>
                  <img
                    src={imgPath}
                    alt={cleanTitle}
                    className={styles.cardBannerImg}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/images/games/chess-hero.webp";
                    }}
                  />
                  <div className={styles.cardBannerOverlay} />
                  <div className={styles.topPills}>
                    <span className={styles.formatBadge}>
                      <span>🏆</span>
                      {t(`tournamentsPage.format.${row.format}`)}
                    </span>
                    <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                      {t(`tournamentsPage.status.${row.status}`)}
                    </span>
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.titleArea}>
                    <div className={styles.gameNameRow}>
                      <span>🎮</span>
                      <span>{gameName}</span>
                    </div>
                    <h2 className={styles.title}>
                      {cleanTitle}
                    </h2>
                  </div>

                  <div className={styles.prizeBox}>
                    <div className={styles.prizeLabel}>
                      <span>💰</span>
                      <span>{locale === "ar" ? "مجموع الجوائز الفورية:" : "Total Prize Pool:"}</span>
                    </div>
                    <span className={styles.prizeAmount}>
                      {Number(prizePool) > 0 ? `$${prizePool} USDT` : (locale === "ar" ? "كأس الشرف ونقاط تصنيف" : "Honor Trophy & ELO")}
                    </span>
                  </div>

                  <div className={styles.progressSection}>
                    <div className={styles.progressLabels}>
                      <span>{t("tournamentsPage.registered_count", { count: row.registered_count, capacity: row.capacity })}</span>
                      <span>{registeredPct}%</span>
                    </div>
                    <div className={styles.capacityBar}>
                      <div className={styles.capacityFill} style={{ width: `${registeredPct}%` }} />
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.entryFee}>
                      <span className={styles.entryFeeLabel}>{locale === "ar" ? "رسوم الاشتراك" : "Entry Fee"}</span>
                      <span className={styles.entryFeeVal}>
                        {row.tier === "FREE"
                          ? (locale === "ar" ? "مجاناً 100%" : "Free Entry")
                          : `${entryFeeUsdt.toFixed(2)} ${row.asset || "USDT"}`}
                      </span>
                    </div>

                    <span className={styles.actionCta}>
                      <span>{locale === "ar" ? "سجّل ونافس" : "Join Tournament"}</span>
                      <span>⚔️</span>
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
