"use client";

import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import styles from "./TimeControlSelect.module.css";

export type TimeProfile = "BLITZ" | "STANDARD" | "EXTENDED";

type ProfileInfo = {
  id: TimeProfile;
  titleKey: string;
  icon: string;
  getDuration: (gameId: string, isAr: boolean) => string;
  getDesc: (isAr: boolean) => string;
};

const PROFILES: ProfileInfo[] = [
  {
    id: "BLITZ",
    titleKey: "play.time_control.blitz",
    icon: "⚡",
    getDuration: (gameId, isAr) => {
      if (gameId === "xo" || gameId === "speed-math") return isAr ? "30 ثانية" : "30 seconds";
      if (gameId === "connect-four" || gameId === "dominoes") return isAr ? "دقيقتان (+2ث)" : "2 mins (+2s)";
      return isAr ? "3 دقائق (+2ث)" : "3 mins (+2s)";
    },
    getDesc: (isAr) => isAr ? "إيقاع سريع وتحدي حاسم تحت ضغط الوقت" : "Fast-paced match under high time pressure",
  },
  {
    id: "STANDARD",
    titleKey: "play.time_control.standard",
    icon: "⏱️",
    getDuration: (gameId, isAr) => {
      if (gameId === "xo" || gameId === "speed-math") return isAr ? "60 ثانية" : "60 seconds";
      if (gameId === "connect-four" || gameId === "dominoes") return isAr ? "3 دقائق (+3ث)" : "3 mins (+3s)";
      if (gameId === "checkers") return isAr ? "4 دقائق (+3ث)" : "4 mins (+3s)";
      return isAr ? "5 دقائق (+3ث)" : "5 mins (+3s)";
    },
    getDesc: (isAr) => isAr ? "الوقت الرسمي المتوازن للتفكير واتخاذ القرارات" : "Balanced official time for strategic depth",
  },
  {
    id: "EXTENDED",
    titleKey: "play.time_control.extended",
    icon: "⏳",
    getDuration: (gameId, isAr) => {
      if (gameId === "xo" || gameId === "speed-math") return isAr ? "دقيقتان (120ث)" : "2 mins (120s)";
      if (gameId === "connect-four" || gameId === "dominoes") return isAr ? "5 دقائق (+5ث)" : "5 mins (+5s)";
      if (gameId === "checkers") return isAr ? "8 دقائق (+5ث)" : "8 mins (+5s)";
      return isAr ? "10 دقائق (+5ث)" : "10 mins (+5s)";
    },
    getDesc: (isAr) => isAr ? "مباراة هادئة مع وقت وفير للحسابات المعقدة" : "Deep tactical game with ample time per turn",
  },
];

export function TimeControlSelect({
  plugin,
  onSelect,
}: {
  plugin: GamePlugin;
  onSelect: (profile: TimeProfile) => void;
}) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  return (
    <div>
      <h1 className={styles.heading}>{t("play.time_control.heading") || (isAr ? "اختر مدة المباراة" : "Choose Match Duration")}</h1>
      <p className={styles.subheading}>{isAr ? "حدد سرعة الوقت المناسبة لأسلوب لعبك" : "Select the time pace that fits your playstyle"}</p>
      <div className={styles.grid}>
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.card}
            onClick={() => onSelect(p.id)}
          >
            <span className={styles.icon}>{p.icon}</span>
            <span className={styles.title}>{t(p.titleKey) || p.id}</span>
            <span className={styles.duration}>{p.getDuration(plugin.id, isAr)}</span>
            <span className={styles.desc}>{p.getDesc(isAr)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
