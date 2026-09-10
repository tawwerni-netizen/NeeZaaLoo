"use client";

import { useEffect, useState, type FormEvent } from "react";
import { use } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, post, ApiError } from "@/lib/api";
import type { PublicProfile } from "@/lib/profile-types";
import styles from "../../profile/profile.module.css";
import formStyles from "@/components/auth/AuthForm.module.css";

export default function PublicProfilePage({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = use(params);
  return <PublicProfileContent nickname={nickname} />;
}

function PublicProfileContent({ nickname }: { nickname: string }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void get<PublicProfile>(`/v1/players/${encodeURIComponent(nickname)}`)
      .then((r) => { if (!cancelled) setProfile(r); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
  }, [nickname]);

  if (notFound) {
    return <><Header /><div className={styles.wrap}><p className={styles.empty}>{t("profile.not_found")}</p></div><Footer /></>;
  }
  if (!profile) return <><Header /><div className={styles.wrap} /><Footer /></>;

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <div className={styles.header}>
          <span className={`${styles.avatarFrame} ${profile.selectedFrame ? styles[`frame_${profile.selectedFrame}`] ?? "" : ""}`}>
            <Avatar nickname={profile.nickname} avatarUrl={profile.avatarUrl} size={88} />
          </span>
          <div className={styles.identity}>
            <h1 className={styles.nickname}>
              {profile.nickname} {profile.selectedBadge && <span>{badgeIcon(profile.selectedBadge)}</span>}
            </h1>
            <div className={styles.levelRow}>
              <span>{t("profile.level_label")} {profile.exp.level}</span>
              <span>{t("profile.exp_label")} {profile.exp.totalExp}</span>
              {profile.globalSkill != null && <span>{t("profile.global_skill_label")} {profile.globalSkill}</span>}
            </div>
          </div>
          <Button variant="ghost" onClick={() => setReporting(true)}>{t("profile.report_cta")}</Button>
        </div>

        {reporting && <ReportPanel nickname={profile.nickname} onDone={() => setReporting(false)} onCancel={() => setReporting(false)} />}

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.bio_label")}</h2>
          <p className={profile.bio ? styles.bio : styles.empty}>{profile.bio || t("profile.no_bio")}</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.ratings_title")}</h2>
          {profile.ratings.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_ratings")}</p>
          ) : (
            profile.ratings.map((r) => {
              const m = profile.mastery.find((mm) => mm.gameId === r.gameId);
              const peak = profile.highestRatings[r.gameId];
              return (
                <div key={r.gameId} className={styles.ratingRow}>
                  <span className={styles.ratingGameName}>
                    {r.displayName}
                    {m && <span className={styles.masteryPill}>{t(`profile.mastery_level.${m.level}`)}</span>}
                  </span>
                  <span className={styles.ratingNumbers}>
                    {peak != null && peak > r.rating && (
                      <span className={styles.peakRating}>{t("profile.highest_rating_label")} {Math.round(peak)}</span>
                    )}
                    <span className={`nz-num ${styles.ratingValue}`}>{Math.round(r.rating)}</span>
                    {/* Spectator discovery, closing the loop: LIVE MATCH -> WATCH
                        -> VIEW PLAYER -> SEE GAME RATING -> TRY GAME -> PLAY. */}
                    <LocaleLink href={`/play/${r.gameId}`} className={styles.tryGameLink}>
                      {t("profile.try_game_cta")}
                    </LocaleLink>
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.stats_title")}</h2>
          <div className={styles.statsGrid}>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.games}</div><div className={styles.statLabel}>{t("profile.games_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.wins}</div><div className={styles.statLabel}>{t("profile.wins_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.losses}</div><div className={styles.statLabel}>{t("profile.losses_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.stats.games === 0 ? "—" : `${Math.round((profile.stats.wins / profile.stats.games) * 100)}%`}</div><div className={styles.statLabel}>{t("profile.win_rate_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.tournaments.played}</div><div className={styles.statLabel}>{t("profile.tournaments_played_label")}</div></div>
            <div><div className={`nz-num ${styles.statValue}`}>{profile.tournaments.won}</div><div className={styles.statLabel}>{t("profile.tournaments_won_label")}</div></div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.achievements_title")}</h2>
          {profile.achievements.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_achievements")}</p>
          ) : (
            <div className={styles.achievementList}>
              {profile.achievements.map((code) => (
                <span key={code} className={styles.achievementPill}>{t(`profile.achievements_catalog.${code}`)}</span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("profile.badges_title")}</h2>
          {profile.badges.length === 0 ? (
            <p className={styles.empty}>{t("profile.no_badges")}</p>
          ) : (
            <div className={styles.badgeRow}>
              {profile.badges.map((b) => <span key={b.code} title={t(`profile.achievements_catalog.${b.code}`)}>{badgeIcon(b.code)}</span>)}
            </div>
          )}
        </div>

        <p className={styles.memberSince}>
          {t("profile.member_since_label")} {new Date(profile.memberSince).toLocaleDateString()}
        </p>
      </div>
      <Footer />
    </>
  );
}

function ReportPanel({ nickname, onDone, onCancel }: { nickname: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post(`/v1/players/${encodeURIComponent(nickname)}/report`, { contentType: "BIO", reason: reason || undefined });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={styles.card}>
        <p className={formStyles.subtitle}>{t("profile.reported_message")}</p>
        <Button variant="ghost" onClick={onDone}>{t("profile.cancel_cta")}</Button>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h2 className={styles.cardTitle}>{t("profile.report_title")}</h2>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.field}>
        <label htmlFor="reportReason">{t("profile.report_reason_label")}</label>
        <input id="reportReason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
      <div style={{ display: "flex", gap: "var(--nz-space-3)" }}>
        <Button type="submit" disabled={submitting}>{t("profile.report_submit_cta")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("profile.cancel_cta")}</Button>
      </div>
    </form>
  );
}
