"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { get } from "@/lib/api";
import styles from "./DailyQuestsWidget.module.css";

type Challenge = {
  code: string;
  metric: string;
  gameId: string | null;
  progress: number;
  target: number;
  expReward: number;
  completed: boolean;
};

type StreakInfo = {
  current: number;
  longest: number;
  activeToday: boolean;
  atRisk: boolean;
};

interface QuestMeta {
  title: { ar: string; en: string };
  desc: { ar: string; en: string };
  icon: string;
  link: string;
}

const QUEST_CATALOG: Record<string, QuestMeta> = {
  WIN_FREE_MATCHES: {
    title: { ar: "انتصارات الأرينا المجانية", en: "Free Arena Victories" },
    desc: { ar: "فز في 3 مباريات أرينا مجانية ضد لاعبين حقيقيين", en: "Win 3 free matches against real players" },
    icon: "🏆",
    link: "/games",
  },
  PLAY_SPEED_MATH: {
    title: { ar: "تحدي الحساب السريع", en: "Speed Math Challenge" },
    desc: { ar: "العب 10 جولات في لعبة الحساب السريع", en: "Play 10 rounds of Speed Math" },
    icon: "⚡",
    link: "/play/speed-math",
  },
  PLAY_DIFFERENT_GAMES: {
    title: { ar: "تنوع المهارات التنافسية", en: "Multi-Game Mastery" },
    desc: { ar: "خض مباريات في لعبتين مختلفتين اليوم", en: "Play matches in 2 different games today" },
    icon: "🎲",
    link: "/games",
  },
  WATCH_A_REPLAY: {
    title: { ar: "نزال التصنيف الرسمي", en: "Official Ranked Duel" },
    desc: { ar: "خض مباراة تصنيف رسمية واحدة وارفع تقييمك", en: "Play 1 official ranked match to raise your ELO" },
    icon: "⚔️",
    link: "/games",
  },
  PLAY_RATED_MATCH: {
    title: { ar: "نزال التصنيف الرسمي", en: "Official Ranked Duel" },
    desc: { ar: "خض مباراة تصنيف رسمية واحدة وارفع تقييمك", en: "Play 1 official ranked match to raise your ELO" },
    icon: "⚔️",
    link: "/games",
  },
  FINISH_TRAINING: {
    title: { ar: "التدريب التكتيكي المنفرد", en: "Solo Tactical Training" },
    desc: { ar: "أنهِ نزالاً تدريبياً لتطوير مهاراتك التكتيكية", en: "Finish 1 free training match to hone your skills" },
    icon: "⚔️",
    link: "/play/chess?mode=practice",
  },
};

const SAMPLE_VISITOR_QUESTS: Challenge[] = [
  { code: "FINISH_TRAINING", metric: "FINISH_TRAINING", gameId: null, progress: 0, target: 1, expReward: 15, completed: false },
  { code: "WIN_FREE_MATCHES", metric: "WIN_FREE_MATCHES", gameId: null, progress: 1, target: 3, expReward: 30, completed: false },
  { code: "PLAY_DIFFERENT_GAMES", metric: "PLAY_DIFFERENT_GAMES", gameId: null, progress: 0, target: 2, expReward: 20, completed: false },
];

function getQuestMeta(code: string, isAr: boolean) {
  const meta = QUEST_CATALOG[code];
  if (meta) {
    return {
      title: isAr ? meta.title.ar : meta.title.en,
      desc: isAr ? meta.desc.ar : meta.desc.en,
      icon: meta.icon,
      link: meta.link,
    };
  }
  return {
    title: isAr ? `مهمة: ${code.replace(/_/g, " ")}` : `Quest: ${code.replace(/_/g, " ")}`,
    desc: isAr ? "أكمل متطلبات النزال لربح نقاط الخبرة" : "Complete match requirements to earn EXP",
    icon: "🎯",
    link: "/games",
  };
}

export function DailyQuestsWidget() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const [quests, setQuests] = useState<Challenge[] | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);

  useEffect(() => {
    if (!player) {
      setQuests(SAMPLE_VISITOR_QUESTS);
      return;
    }

    let cancelled = false;
    get<{ challenges: Challenge[] }>("/v1/me/daily-challenges")
      .then((res) => { if (!cancelled) setQuests(res.challenges); })
      .catch(() => { if (!cancelled) setQuests([]); });

    get<StreakInfo>("/v1/me/streak")
      .then((res) => { if (!cancelled) setStreak(res); })
      .catch(() => { if (!cancelled) setStreak(null); });

    return () => { cancelled = true; };
  }, [player]);

  const streakDays = streak?.current ?? 0;
  let nextMilestone = { days: 3, reward: isAr ? "+50 EXP" : "+50 EXP" };
  if (streakDays >= 7) {
    nextMilestone = { days: 30, reward: isAr ? "إطار النخبة 👑 + 500 EXP" : "Elite Frame 👑 + 500 EXP" };
  } else if (streakDays >= 3) {
    nextMilestone = { days: 7, reward: isAr ? "إطار البروفايل 🌟 + 100 EXP" : "Profile Frame 🌟 + 100 EXP" };
  }

  return (
    <section className={styles.section} dir={isAr ? "rtl" : "ltr"}>
      <div className="nz-container">
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <h2 className={styles.title}>
                {isAr ? "المهام اليومية وسلسلة النزالات" : "Daily Quests & Match Streak"}
              </h2>
              <p className={styles.subtitle}>
                {isAr
                  ? "أنجز المهام واربح نقاط الخبرة XP لترقية مستواك وفتح مكافآت الباتل باس 💎"
                  : "Complete daily quests to level up and unlock Battle Pass rewards 💎"}
              </p>
            </div>
            {player && (
              <div className={styles.battlePassLevel}>
                <span className={styles.bpLabel}>{isAr ? "مستوى اللاعب" : "Player Level"}</span>
                <span className={styles.bpValue}>{(player as any).level || 1}</span>
              </div>
            )}
          </div>

          {/* Streak Tracker for logged in players */}
          {player && (
            <div className={styles.streakTracker}>
              <div className={styles.streakLeft}>
                <span className={styles.streakFlame}>🔥</span>
                <div>
                  <div className={styles.streakCountTitle}>
                    {isAr ? "سلسلة الحضور والتنافس:" : "Daily Match Streak:"}{" "}
                    <span className={styles.streakCountVal}>
                      {streakDays} {isAr ? (streakDays === 1 ? "يوم" : "أيام") : (streakDays === 1 ? "Day" : "Days")}
                    </span>
                    {streak?.longest && streak.longest > streakDays && (
                      <span style={{ fontSize: "12px", color: "#94a3b8", marginInlineStart: "8px" }}>
                        ({isAr ? `أطول سلسلة: ${streak.longest}` : `Best: ${streak.longest}`})
                      </span>
                    )}
                  </div>
                  <div className={styles.streakStatusBadge}>
                    {streak?.activeToday ? (
                      <span className={styles.streakStatusActive}>
                        {isAr ? "✅ تم تسجيل نشاط نزال اليوم بنجاح!" : "✅ Today's duel logged successfully!"}
                      </span>
                    ) : (
                      <span>
                        {isAr
                          ? "⚡ خض نزالاً واحداً اليوم في الساحة للحفاظ على سلسلتك!"
                          : "⚡ Play 1 match in the arena today to keep your streak!"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.streakMilestonePill}>
                <span>🎯</span>
                <span>
                  {isAr
                    ? `المحطة القادمة: ${nextMilestone.days} أيام (${nextMilestone.reward})`
                    : `Next Goal: ${nextMilestone.days} Days (${nextMilestone.reward})`}
                </span>
              </div>
            </div>
          )}

          {/* Visitor Teaser Banner */}
          {!player && (
            <div className={styles.visitorBanner}>
              <div className={styles.visitorText}>
                <span>🎁 </span>
                <span>
                  {isAr
                    ? "سجل حسابك الآن لتفعيل المهام اليومية وسلسلة المكافآت وربح جوائز الباتل باس!"
                    : "Create a free account now to activate daily quests, streaks, and Battle Pass rewards!"}
                </span>
              </div>
              <button
                type="button"
                className={styles.visitorBtn}
                onClick={() => openPopup()}
              >
                <span>⚡</span>
                <span>{isAr ? "إنشاء حساب مجاني" : "Create Free Account"}</span>
              </button>
            </div>
          )}

          <div className={styles.questsList}>
            {quests === null ? (
              <p style={{ color: "var(--nz-text-2)" }}>{isAr ? "جاري تحميل المهام..." : "Loading quests..."}</p>
            ) : quests.length === 0 ? (
              <p style={{ color: "var(--nz-text-2)" }}>
                {isAr ? "لا توجد مهام متاحة الآن." : "No daily quests available right now."}
              </p>
            ) : (
              quests.map((quest) => {
                const meta = getQuestMeta(quest.code, isAr);
                const progressPct = Math.min((quest.progress / quest.target) * 100, 100);

                return (
                  <motion.div
                    key={quest.code}
                    className={`${styles.questItem} ${quest.completed ? styles.completed : ""}`}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className={styles.questInfoWithIcon}>
                      <div className={styles.questIcon}>{meta.icon}</div>
                      <div>
                        <h4 className={styles.questTitle}>{meta.title}</h4>
                        <p className={styles.questDesc}>{meta.desc}</p>
                        <div className={styles.rewards}>
                          <span className={styles.rewardXp}>+{quest.expReward} EXP</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.progressSection}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className={styles.progressText}>
                        {quest.progress} / {quest.target}
                      </span>
                    </div>

                    <div className={styles.actionSection}>
                      {quest.completed ? (
                        <div className={styles.claimBtn}>
                          <span>✓</span>
                          <span>{isAr ? "مكتملة" : "Completed"}</span>
                        </div>
                      ) : player ? (
                        <Link href={`/${locale}${meta.link}`} className={styles.playActionBtn}>
                          <span>⚔️</span>
                          <span>{isAr ? "خوض النزال" : "Play Now"}</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={styles.playActionBtn}
                          onClick={() => openPopup()}
                        >
                          <span>🔒</span>
                          <span>{isAr ? "تفعيل المهمة" : "Unlock"}</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          <div className={styles.resetFooter}>
            <div>
              <span>⏳ </span>
              <span>
                {isAr
                  ? "تتجدد المهام وسلسلة الحضور يومياً في الساعة 00:00 بتوقيت UTC."
                  : "Quests and streaks reset daily at 00:00 UTC."}
              </span>
            </div>
            <Link
              href={`/${locale}/battle-pass`}
              style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}
            >
              {isAr ? "عرض تذكرة المعركة (Battle Pass) ←" : "View Battle Pass →"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
