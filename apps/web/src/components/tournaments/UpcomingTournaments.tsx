"use client";

/**
 * Real, upcoming/active tournaments -- reused on both the public landing
 * page and the logged-in dashboard, since it is the exact same feature in
 * two placements. Reads ONLY what /v1/tournaments already computes
 * (status, registered_count, capacity, the real scheduled/registration/
 * start timestamps) -- never a fabricated countdown, participant count, or
 * prize figure. A card's countdown is derived from whichever real
 * timestamp is next (scheduled_starts_at, then starts_at, then
 * registration_closes_at); a tournament with none of those simply shows no
 * countdown, rather than inventing one.
 */
import { useEffect, useState } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { formatRelativeTime } from "@/lib/i18n/format";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import type { SupportedLocale } from "@/lib/i18n/locale";
import styles from "./UpcomingTournaments.module.css";

type TournamentRow = {
  id: string; game_id: string; format: "SINGLE_ELIMINATION" | "SWISS";
  status: string; tier: "FREE" | "RANKED" | "CASH";
  entry_fee_minor: string; asset: string | null; capacity: number;
  title: string | null;
  registration_closes_at: string | null; scheduled_starts_at: string | null;
  starts_at: string | null; completed_at: string | null;
  registered_count: number;
};

type Props = {
  /** "cards" (default): a full card grid with its own heading/view-all row,
   *  for the public landing page. "compact": a bare row list with no
   *  heading or view-all link of its own -- for the dashboard, whose card
   *  already renders those; only the empty state and the rows are this
   *  component's job in either variant, since both need the same real data
   *  to decide between them. */
  variant?: "cards" | "compact";
  heading?: string;
  emptyText: string;
  viewAllHref?: string;
  viewAllText?: string;
  limit?: number;
  bannerImage?: string;
  banners?: Array<{ img: string; tag: string; title: string; desc: string }>;
};

function countdownFor(iso: string, locale: SupportedLocale): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return formatRelativeTime(diffMin, "minute", locale);
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 48) return formatRelativeTime(diffHr, "hour", locale);
  return formatRelativeTime(Math.round(diffHr / 24), "day", locale);
}

export function UpcomingTournaments({ variant = "cards", heading, emptyText, viewAllHref, viewAllText, limit = 4, bannerImage, banners }: Props) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [banners]);

  useEffect(() => {
    let cancelled = false;
    void get<{ tournaments: TournamentRow[] }>("/v1/tournaments?status=SCHEDULED,REGISTRATION,LIVE,FINALS")
      .then((r) => { if (!cancelled) setRows(r.tournaments); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  const visible = (rows ?? []).slice(0, limit);

  const body = rows === null ? (
    <div className={variant === "cards" ? styles.grid : styles.list} aria-hidden="true" />
  ) : visible.length === 0 ? (
    <p className={styles.empty}>{emptyText}</p>
  ) : variant === "compact" ? (
    <ul className={styles.list}>
      {visible.map((row) => {
        const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
        const countdownTarget = row.scheduled_starts_at ?? row.starts_at ?? row.registration_closes_at;
        return (
          <li key={row.id}>
            <LocaleLink href={`/tournaments/${row.id}`} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.gameName}>{t(`common.game_names.${nameKey}`)}</span>
                <span className={styles.rowTitle}>{row.title ?? t(`tournamentsPage.format.${row.format}`)}</span>
              </span>
              <span className={styles.rowMeta}>
                {countdownTarget && <span className={styles.countdown}>{countdownFor(countdownTarget, locale)}</span>}
                <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                  {t(`tournamentsPage.status.${row.status}`)}
                </span>
              </span>
            </LocaleLink>
          </li>
        );
      })}
    </ul>
  ) : (
    <div className={styles.grid}>
      {visible.map((row) => {
        const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
        const gameName = t(`common.game_names.${nameKey}`);
        const countdownTarget = row.scheduled_starts_at ?? row.starts_at ?? row.registration_closes_at;
        return (
          <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.gameName}>{gameName}</span>
              <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                {t(`tournamentsPage.status.${row.status}`)}
              </span>
            </div>
            <h3 className={styles.cardTitle}>{row.title ?? t(`tournamentsPage.format.${row.format}`)}</h3>
            <div className={styles.meta}>
              <span>
                {row.tier === "FREE"
                  ? t("tournamentsPage.entry_free")
                  : t("tournamentsPage.entry_fee", { amount: Number(row.entry_fee_minor) / 100, asset: row.asset ?? "" })}
              </span>
              <span className="nz-num">{t("tournamentsPage.registered_count", { count: row.registered_count, capacity: row.capacity })}</span>
            </div>
            <div className={styles.cardBottom}>
              {countdownTarget && <span className={styles.countdown}>{countdownFor(countdownTarget, locale)}</span>}
              {row.status === "REGISTRATION" && (
                <span className={styles.joinBadge}>{t("tournamentsPage.join")}</span>
              )}
            </div>
          </LocaleLink>
        );
      })}
    </div>
  );

  if (variant === "compact") return body;

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.headerRow}>
          <h2 className={styles.heading}>{heading}</h2>
          {viewAllHref && <LocaleLink href={viewAllHref} className={styles.viewAll}>{viewAllText}</LocaleLink>}
        </div>

        {banners && banners.length > 0 ? (() => {
          const activeBanner = banners[bannerIdx] ?? banners[0]!;
          return (
            <div className={styles.featureBanner} dir={locale === "ar" ? "rtl" : "ltr"}>
              <img src={activeBanner.img} alt={activeBanner.title} className={styles.featureBannerImg} />
              <div className={styles.featureBannerOverlay}>
                <div className={styles.bannerContentCard}>
                  <span className={styles.bannerTag}>{activeBanner.tag}</span>
                  <h3 className={styles.bannerTitle}>{activeBanner.title}</h3>
                  <p className={styles.bannerDesc}>
                    <bdi>{activeBanner.desc}</bdi>
                  </p>
                  {banners.length > 1 && (
                    <div className={styles.bannerDots}>
                      {banners.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Switch tournament banner ${i + 1}`}
                          className={`${styles.bannerDot} ${bannerIdx === i ? styles.bannerDotActive : ""}`}
                          onClick={() => setBannerIdx(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })() : bannerImage ? (
          <div className={styles.featureBanner} dir={locale === "ar" ? "rtl" : "ltr"}>
            <img src={bannerImage} alt="Daily Blitz Tournaments" className={styles.featureBannerImg} />
            <div className={styles.featureBannerOverlay}>
              <div className={styles.bannerContentCard}>
                <span className={styles.bannerTag}>⚡ Daily Blitz Stage</span>
                <h3 className={styles.bannerTitle}>Real-Time Competitive Brackets</h3>
                <p className={styles.bannerDesc}>Compete against verified players in high-stakes knockout brackets with live streaming.</p>
              </div>
            </div>
          </div>
        ) : null}

        {body}
      </div>
    </section>
  );
}
