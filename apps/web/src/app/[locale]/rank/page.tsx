"use client";

/**
 * The Global Skill Score breakdown -- the page `dashboard.global_skill
 * .view_breakdown` has always linked to. Renders exactly what
 * packages/global-skill/src/global-skill.mjs already computes and
 * documents in its own header: per-game percentile, weight (maturity x
 * confidence, capped at 35% per game, water-filled), and the small
 * breadth bonus for spreading real skill across multiple games. Nothing
 * here is a separate number -- every figure below is read straight from
 * GET /v1/me/global-skill.
 */
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { getGame } from "@/lib/games";
import styles from "./rank.module.css";

type Breakdown = {
  gameId: string;
  percentile: number;
  rawWeight: number;
  weight: number;
  weightPct: number;
  wasCapped: boolean;
  contribution: number;
};

type GlobalSkill = { score: number | null; breakdown: Breakdown[]; appliedCap: boolean; breadth: number };

export default function RankPage() {
  return (
    <RequireAuth>
      <Header />
      <RankContent />
    </RequireAuth>
  );
}

function RankContent() {
  const { t } = useI18n();
  const [skill, setSkill] = useState<GlobalSkill | null>(null);

  useEffect(() => {
    void get<GlobalSkill>("/v1/me/global-skill").then(setSkill).catch(() => setSkill(null));
  }, []);

  if (!skill) return <main className="nz-container" />;

  return (
    <main className={`nz-container ${styles.wrap}`}>
      <div className={styles.heroBanner}>
        <img
          src="/images/banners/banner-global-leaderboard.jpg"
          alt="Global Rankings"
          className={styles.heroBannerImg}
        />
        <div className={styles.heroBannerOverlay}>
          <span className={styles.heroBadge}>GLICKO-2 GLOBAL RATING</span>
          <h1 className={styles.heading}>{t("rank.heading")}</h1>
          <p className={styles.subtitle}>{t("rank.subtitle")}</p>
        </div>
      </div>

      <div className={styles.scoreCard}>
        <span className={`nz-num ${styles.scoreValue}`}>{skill.score ?? "—"}</span>
        <span className={styles.scoreScale}>{t("rank.score_scale")}</span>
      </div>

      {skill.breakdown.length === 0 ? (
        <p className={styles.empty}>{t("rank.empty")}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("rank.col_game")}</th>
                  <th>{t("rank.col_percentile")}</th>
                  <th>{t("rank.col_weight")}</th>
                  <th>{t("rank.col_contribution")}</th>
                </tr>
              </thead>
              <tbody>
                {skill.breakdown.map((row) => {
                  const nameKey = getGame(row.gameId)?.nameKey ?? row.gameId;
                  return (
                    <tr key={row.gameId}>
                      <td>{t(`common.game_names.${nameKey}`)}</td>
                      <td className="nz-num">{Math.round(row.percentile * 100)}%</td>
                      <td className="nz-num">
                        {row.weightPct}%
                        {row.wasCapped && <span className={styles.cappedNote}> {t("rank.capped_note")}</span>}
                      </td>
                      <td className="nz-num">{Math.round(row.contribution * 1000)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className={styles.breadthNote}>
            {t("rank.breadth_note", { breadth: Math.round((skill.breadth - 1) * 100) })}
          </p>
        </>
      )}

      <div className={styles.methodology}>
        <h2 className={styles.methodologyTitle}>{t("rank.methodology_title")}</h2>
        <p>{t("rank.methodology_body_1")}</p>
        <p>{t("rank.methodology_body_2")}</p>
      </div>
    </main>
  );
}
