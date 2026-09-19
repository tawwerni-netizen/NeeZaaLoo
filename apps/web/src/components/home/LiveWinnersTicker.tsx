"use client";

import React, { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LiveWinnersTicker.module.css";

interface PayoutEvent {
  id: string;
  handle: string;
  avatarChar: string;
  amount: string;
  gameAr: string;
  gameEn: string;
  icon: string;
  timeAr: string;
  timeEn: string;
  isWithdrawal?: boolean;
}

const RAW_PAYOUTS: PayoutEvent[] = [
  {
    id: "p1",
    handle: "tariq_chess",
    avatarChar: "T",
    amount: "$88.00",
    gameAr: "شطرنج كاش",
    gameEn: "Chess Cash",
    icon: "♟️",
    timeAr: "منذ دقيقة",
    timeEn: "1m ago",
  },
  {
    id: "p2",
    handle: "karim_dominoes",
    avatarChar: "K",
    amount: "$44.00",
    gameAr: "دومينو كلاسيك",
    gameEn: "Classic Dominoes",
    icon: "🀄",
    timeAr: "منذ دقيقتين",
    timeEn: "2m ago",
  },
  {
    id: "p3",
    handle: "sara_dxb",
    avatarChar: "S",
    amount: "$150.00",
    gameAr: "سحب USDT فوري",
    gameEn: "Instant USDT Cashout",
    icon: "⚡",
    timeAr: "منذ 3 دقائق",
    timeEn: "3m ago",
    isWithdrawal: true,
  },
  {
    id: "p4",
    handle: "omar_backgammon",
    avatarChar: "O",
    amount: "$35.20",
    gameAr: "طاولة الزهر 1v1",
    gameEn: "Backgammon 1v1",
    icon: "🎲",
    timeAr: "منذ 4 دقائق",
    timeEn: "4m ago",
  },
  {
    id: "p5",
    handle: "elena_domino",
    avatarChar: "E",
    amount: "$17.60",
    gameAr: "دومينو أمريكاني",
    gameEn: "Dominoes Pro",
    icon: "🀄",
    timeAr: "منذ 5 دقائق",
    timeEn: "5m ago",
  },
  {
    id: "p6",
    handle: "alex_math",
    avatarChar: "A",
    amount: "$8.80",
    gameAr: "حساب سريع",
    gameEn: "Speed Math",
    icon: "⚡",
    timeAr: "منذ 6 دقائق",
    timeEn: "6m ago",
  },
  {
    id: "p7",
    handle: "faisal_c4",
    avatarChar: "F",
    amount: "$88.00",
    gameAr: "أربعة على التوالي",
    gameEn: "Connect Four",
    icon: "🟡",
    timeAr: "منذ 7 دقائق",
    timeEn: "7m ago",
  },
  {
    id: "p8",
    handle: "youssef_checkers",
    avatarChar: "Y",
    amount: "$44.00",
    gameAr: "داما كلاسيك",
    gameEn: "Checkers Duel",
    icon: "🔴",
    timeAr: "منذ 8 دقائق",
    timeEn: "8m ago",
  },
  {
    id: "p9",
    handle: "nour_gomoku",
    avatarChar: "N",
    amount: "$17.60",
    gameAr: "جوموكو تكتيكي",
    gameEn: "Gomoku Master",
    icon: "⚪",
    timeAr: "منذ 10 دقائق",
    timeEn: "10m ago",
  },
  {
    id: "p10",
    handle: "hassan_hero",
    avatarChar: "H",
    amount: "$200.00",
    gameAr: "سحب USDT فوري",
    gameEn: "Instant USDT Cashout",
    icon: "⚡",
    timeAr: "منذ 12 دقيقة",
    timeEn: "12m ago",
    isWithdrawal: true,
  },
];

export function LiveWinnersTicker() {
  const { dir } = useI18n();
  const isRtl = dir === "rtl";

  // Duplicate items array to create a seamless infinite loop
  const displayItems = useMemo(() => [...RAW_PAYOUTS, ...RAW_PAYOUTS], []);

  return (
    <div className={styles.tickerContainer} aria-label={isRtl ? "شريط الأرباح المباشرة" : "Live Winners Ticker"}>
      <div className={styles.tickerLabel}>
        <span className={styles.pulseIcon} />
        <span>{isRtl ? "أرباح وسحوبات حية" : "LIVE PAYOUTS"}</span>
      </div>

      <div className={styles.trackWrapper}>
        <div className={styles.track}>
          {displayItems.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className={styles.item}>
              <span className={styles.avatar}>{item.avatarChar}</span>
              <span className={styles.winnerHandle}>@{item.handle}</span>
              <span>{isRtl ? (item.isWithdrawal ? "سحب" : "كسب") : (item.isWithdrawal ? "withdrew" : "won")}</span>
              <span className={styles.amount}>{item.amount}</span>
              <span className={styles.gameBadge}>
                {item.icon} {isRtl ? item.gameAr : item.gameEn}
              </span>
              <span className={styles.instantTag}>{isRtl ? "فوري ⚡" : "Instant ⚡"}</span>
              <span className={styles.timeAgo}>{isRtl ? item.timeAr : item.timeEn}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
