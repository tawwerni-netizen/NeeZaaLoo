"use client";

import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import styles from "./TimeControlSelect.module.css";

export type TimeProfile = "BLITZ" | "STANDARD" | "EXTENDED";

type ProfileInfo = {
  id: TimeProfile;
  titleKey: string;
  icon: string;
  descKey: string;
  getDurationKey: (gameId: string) => string;
};

const PROFILES: ProfileInfo[] = [
  {
    id: "BLITZ",
    titleKey: "play.time_control.blitz",
    descKey: "play.time_control.blitz_desc",
    icon: "⚡",
    getDurationKey: (gameId) => {
      if (gameId === "xo" || gameId === "speed-math") return "play.time_control.dur_30s";
      if (gameId === "connect-four" || gameId === "dominoes") return "play.time_control.dur_2m_plus2";
      return "play.time_control.dur_3m_plus2";
    },
  },
  {
    id: "STANDARD",
    titleKey: "play.time_control.standard",
    descKey: "play.time_control.standard_desc",
    icon: "⏱️",
    getDurationKey: (gameId) => {
      if (gameId === "xo" || gameId === "speed-math") return "play.time_control.dur_60s";
      if (gameId === "connect-four" || gameId === "dominoes") return "play.time_control.dur_3m_plus3";
      if (gameId === "checkers") return "play.time_control.dur_4m_plus3";
      return "play.time_control.dur_5m_plus3";
    },
  },
  {
    id: "EXTENDED",
    titleKey: "play.time_control.extended",
    descKey: "play.time_control.extended_desc",
    icon: "⏳",
    getDurationKey: (gameId) => {
      if (gameId === "xo" || gameId === "speed-math") return "play.time_control.dur_2m_120s";
      if (gameId === "connect-four" || gameId === "dominoes") return "play.time_control.dur_5m_plus5";
      if (gameId === "checkers") return "play.time_control.dur_8m_plus5";
      return "play.time_control.dur_10m_plus5";
    },
  },
];

export function TimeControlSelect({
  plugin,
  onSelect,
}: {
  plugin: GamePlugin;
  onSelect: (profile: TimeProfile) => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <h1 className={styles.heading}>{t("play.time_control.heading")}</h1>
      <p className={styles.subheading}>{t("play.time_control.subheading")}</p>
      <div className={styles.grid}>
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.card}
            onClick={() => onSelect(p.id)}
          >
            <span className={styles.icon}>{p.icon}</span>
            <span className={styles.title}>{t(p.titleKey)}</span>
            <span className={styles.duration}>{t(p.getDurationKey(plugin.id))}</span>
            <span className={styles.desc}>{t(p.descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
