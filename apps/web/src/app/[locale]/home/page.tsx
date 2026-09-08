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
import styles from "./home.module.css";

type GlobalSkill = { score: number | null; breakdown: { gameId: string; percentile: number }[] };
type Duel = { id: string; game_id: string; status: string; result: string | null; created_at: string };

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

  useEffect(() => {
    void get<GlobalSkill>("/v1/me/global-skill").then(setSkill).catch(() => setSkill(null));
    void get<{ duels: Duel[] }>("/v1/me/duels?limit=5").then((r) => setRecent(r.duels)).catch(() => setRecent([]));
  }, []);

  return (
    <main className="nz-container">
      <section className={styles.welcome}>
        <div>
          <p className={styles.eyebrow}>{t("dashboard.welcome")}</p>
          <h1 className={styles.name}>{player?.handle}</h1>
        </div>
        <LocaleLink href="/play">
          <Button variant="primary">{t("dashboard.play_now")}</Button>
        </LocaleLink>
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
          <p className={styles.emptyState}>{t("dashboard.tournaments.empty")}</p>
          <LocaleLink href="/tournaments" className={styles.cardLink}>{t("dashboard.tournaments.browse")}</LocaleLink>
        </div>
      </section>
    </main>
  );
}
