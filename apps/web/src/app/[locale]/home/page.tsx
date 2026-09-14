"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { formatPercent } from "@/lib/i18n/format";
import { get } from "@/lib/api";
import { UpcomingTournaments } from "@/components/tournaments/UpcomingTournaments";
import { getGame } from "@/lib/games";
import styles from "./home.module.css";

type GlobalSkill = { score: number | null; breakdown: { gameId: string; percentile: number }[] };
type Duel = { id: string; game_id: string; status: string; result: string | null; created_at: string };
type DailyChallenge = { code: string; gameId: string | null; progress: number; target: number; expReward: number; completed: boolean };
type Recommendation = { gameId: string; reasonKey: string; reasonData: { category?: string; fromGame?: string } };

export default function HomePage() {
  return (
    <RequireAuth>
      <Header />
      <HomeContent />
    </RequireAuth>
  );
}

function HomeContent() {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const [skill, setSkill] = useState<GlobalSkill | null>(null);
  const [recent, setRecent] = useState<Duel[]>([]);
  const [challenges, setChallenges] = useState<DailyChallenge[] | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    void get<GlobalSkill>("/v1/me/global-skill").then(setSkill).catch(() => setSkill(null));
    void get<{ duels: Duel[] }>("/v1/me/duels?limit=5").then((r) => setRecent(r.duels)).catch(() => setRecent([]));
    void get<{ challenges: DailyChallenge[] }>("/v1/me/daily-challenges")
      .then((r) => setChallenges(r.challenges)).catch(() => setChallenges([]));
    void get<{ recommendations: Recommendation[] }>("/v1/me/recommendations")
      .then((r) => setRecommendations(r.recommendations)).catch(() => setRecommendations([]));
  }, []);

  function gameName(gameId: string): string {
    const nameKey = getGame(gameId)?.nameKey ?? gameId;
    return t(`common.game_names.${nameKey}`);
  }

  return (
    <main className={`nz-container ${styles.container}`}>
      <section className={styles.heroBanner}>
        <div className={styles.heroProfile}>
          <div className={styles.heroAvatar}>
            <span>{(player?.handle?.[0] ?? "U").toUpperCase()}</span>
            <span className={styles.onlineDot} title="متصل" />
          </div>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{t("dashboard.welcome")}</p>
            <h1 className={styles.name}>{player?.handle}</h1>
          </div>
        </div>

        <div className={styles.heroActions}>
          <LocaleLink href="/play" className={styles.actionBtnLink}>
            <button type="button" className={styles.playNowBtn}>
              <span className={styles.btnIcon}>⚔️</span>
              <span>{t("dashboard.play_now")}</span>
            </button>
          </LocaleLink>
          <LocaleLink href="/chat" className={styles.actionBtnLink}>
            <button type="button" className={styles.chatBtn}>
              <span className={styles.btnIcon}>💬</span>
              <span>{locale === "ar" ? "شات الأعضاء" : "Members Chat"}</span>
            </button>
          </LocaleLink>
          <LocaleLink href="/tournaments" className={styles.actionBtnLink}>
            <button type="button" className={styles.tournamentsBtn}>
              <span className={styles.btnIcon}>🏆</span>
              <span>{t("dashboard.tournaments.title")}</span>
            </button>
          </LocaleLink>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("dashboard.global_skill.title")}</h2>
          <p className={`nz-num ${styles.bigNumber}`}>{skill?.score ?? "—"}</p>
          {skill && skill.breakdown.length > 0 ? (
            <ul className={styles.breakdown}>
              {skill.breakdown.slice(0, 3).map((b) => (
                <li key={b.gameId}>
                  <span>{b.gameId}</span>
                  <span className="nz-num">{formatPercent(b.percentile, locale)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyState}>{t("dashboard.global_skill.empty")}</p>
          )}
          <LocaleLink href="/rank" className={styles.cardLink}>{t("dashboard.global_skill.view_breakdown")}</LocaleLink>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("dashboard.recent.title")}</h2>
          {recent.length === 0 ? (
            <p className={styles.emptyState}>{t("dashboard.recent.empty")}</p>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((d) => (
                <li key={d.id} className={styles.recentItem}>
                  <span className={styles.recentGame}>{d.game_id}</span>
                  <span className={styles.recentResult}>{d.status === "COMPLETED" || d.status === "SETTLED" ? d.result ?? "—" : d.status}</span>
                </li>
              ))}
            </ul>
          )}
          <LocaleLink href="/dashboard/history" className={styles.cardLink}>{t("dashboard.recent.full_history")}</LocaleLink>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("dashboard.tournaments.title")}</h2>
          <UpcomingTournaments variant="compact" emptyText={t("dashboard.tournaments.empty")} limit={3} />
          <LocaleLink href="/tournaments" className={styles.cardLink}>{t("dashboard.tournaments.browse")}</LocaleLink>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t("dailyChallenges.title")}</h2>
          {challenges === null ? null : challenges.length === 0 ? (
            <p className={styles.emptyState}>{t("dashboard.recent.empty")}</p>
          ) : (
            <ul className={styles.challengeList}>
              {challenges.map((c) => (
                <li key={c.code} className={styles.challengeItem}>
                  <div className={styles.challengeRow}>
                    <span className={c.completed ? styles.challengeDone : undefined}>
                      {t(`dailyChallenges.metric.${c.code}`, { target: c.target })}
                    </span>
                    <span className="nz-num">{c.completed ? t("dailyChallenges.completed_label") : `${c.progress}/${c.target}`}</span>
                  </div>
                  <div className={styles.challengeBar}>
                    <div className={styles.challengeBarFill} style={{ width: `${Math.min(100, (c.progress / c.target) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {recommendations !== null && recommendations.length > 0 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{t("recommendations.title")}</h2>
            <ul className={styles.recommendationList}>
              {recommendations.map((r) => (
                <li key={r.gameId}>
                  <LocaleLink href={`/play/${r.gameId}`} className={styles.recommendationLink}>
                    {r.reasonKey === "improving_related"
                      ? t("recommendations.improving_related", {
                          fromGame: gameName(r.reasonData.fromGame ?? ""), game: gameName(r.gameId),
                        })
                      : t("recommendations.strong_category", {
                          category: t(`recommendations.category.${r.reasonData.category}`), game: gameName(r.gameId),
                        })}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
