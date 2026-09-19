"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/Button";
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

export function DailyQuestsWidget() {
  const { t, locale, dir } = useI18n();
  const { player } = useAuth();
  const [quests, setQuests] = useState<Challenge[] | null>(null);

  useEffect(() => {
    if (!player) {
      // Mock quests for guests
      setQuests([
        { code: "GUEST_1", metric: "WIN_FREE_MATCHES", gameId: null, progress: 1, target: 3, expReward: 100, completed: false },
        { code: "GUEST_2", metric: "PLAY_RATED_MATCH", gameId: null, progress: 0, target: 1, expReward: 50, completed: false },
      ]);
      return;
    }
    
    let cancelled = false;
    get<{ challenges: Challenge[] }>("/v1/me/daily-challenges")
      .then((res) => { if (!cancelled) setQuests(res.challenges); })
      .catch(() => { if (!cancelled) setQuests([]); });
    
    return () => { cancelled = true; };
  }, [player]);

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <h2 className={styles.title}>
                {locale === "ar" ? "المهام اليومية" : "Daily Quests"}
              </h2>
              <p className={styles.subtitle}>
                {locale === "ar" ? "أنجز المهام واربح نقاط الخبرة XP 💎" : "Complete quests to earn XP 💎"}
              </p>
            </div>
            {player && (
              <div className={styles.battlePassLevel}>
                <span className={styles.bpLabel}>Player Level</span>
                <span className={styles.bpValue}>{(player as any).level || 1}</span>
              </div>
            )}
          </div>

          <div className={styles.questsList}>
            {quests === null ? (
               <p style={{ color: "var(--nz-text-2)" }}>Loading quests...</p>
            ) : quests.length === 0 ? (
               <p style={{ color: "var(--nz-text-2)" }}>No daily quests available right now.</p>
            ) : quests.map((quest) => (
              <motion.div 
                key={quest.code} 
                className={`${styles.questItem} ${quest.completed ? styles.completed : ""}`}
                whileHover={{ scale: 1.01 }}
              >
                <div className={styles.questInfo}>
                  <h4 className={styles.questTitle}>{locale === "ar" ? "مهمة يومية: " + quest.code : "Daily Quest: " + quest.code}</h4>
                  <div className={styles.rewards}>
                    <span className={styles.rewardXp}>+{quest.expReward} EXP</span>
                  </div>
                </div>
                
                <div className={styles.progressSection}>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${Math.min((quest.progress / quest.target) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={styles.progressText}>{quest.progress} / {quest.target}</span>
                </div>
                
                <div className={styles.actionSection}>
                  {quest.completed ? (
                    <Button variant="primary" className={styles.claimBtn}>
                      {locale === "ar" ? "مكتملة" : "Completed"}
                    </Button>
                  ) : (
                    <Button variant="ghost" className={styles.playBtn} disabled>
                      {locale === "ar" ? "جارٍ" : "In Progress"}
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
