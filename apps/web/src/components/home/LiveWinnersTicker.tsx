"use client";

import React, { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LiveWinnersTicker.module.css";

interface PayoutEvent {
  id: string;
  handle: string;
  avatarChar: string;
  amount: string;
  gameText: Record<string, string>;
  icon: string;
  timeText: Record<string, string>;
  isWithdrawal?: boolean;
}

const RAW_PAYOUTS: PayoutEvent[] = [
  {
    id: "p1",
    handle: "tariq_chess",
    avatarChar: "T",
    amount: "$88.00",
    gameText: {
      ar: "شطرنج كاش",
      en: "Chess Cash",
      es: "Ajedrez Cash",
      fr: "Échecs Cash",
      hi: "शतरंज कैश",
      zh: "国际象棋现金赛",
    },
    icon: "♟️",
    timeText: {
      ar: "منذ دقيقة",
      en: "1m ago",
      es: "hace 1 min",
      fr: "il y a 1 min",
      hi: "1 मिनट पहले",
      zh: "1分钟前",
    },
  },
  {
    id: "p2",
    handle: "karim_dominoes",
    avatarChar: "K",
    amount: "$44.00",
    gameText: {
      ar: "دومينو كلاسيك",
      en: "Classic Dominoes",
      es: "Dominó Clásico",
      fr: "Dominos Classiques",
      hi: "क्लासिक डोमिनोज़",
      zh: "经典多米诺",
    },
    icon: "🀄",
    timeText: {
      ar: "منذ دقيقتين",
      en: "2m ago",
      es: "hace 2 min",
      fr: "il y a 2 min",
      hi: "2 मिनट पहले",
      zh: "2分钟前",
    },
  },
  {
    id: "p_ludo",
    handle: "sami_ludo",
    avatarChar: "S",
    amount: "$70.40",
    gameText: {
      ar: "لودو الأساطير",
      en: "Ludo Legends",
      es: "Ludo de Leyendas",
      fr: "Ludo des Légendes",
      hi: "लूडो लीजेंड्स",
      zh: "传奇飞行棋",
    },
    icon: "🎲",
    timeText: {
      ar: "منذ دقيقتين",
      en: "2m ago",
      es: "hace 2 min",
      fr: "il y a 2 min",
      hi: "2 मिनट पहले",
      zh: "2分钟前",
    },
  },
  {
    id: "p3",
    handle: "sara_dxb",
    avatarChar: "S",
    amount: "$150.00",
    gameText: {
      ar: "سحب USDT فوري",
      en: "Instant USDT Cashout",
      es: "Retiro Inmediato USDT",
      fr: "Retrait Immédiat USDT",
      hi: "तत्काल USDT निकासी",
      zh: "即时 USDT 提现",
    },
    icon: "⚡",
    timeText: {
      ar: "منذ 3 دقائق",
      en: "3m ago",
      es: "hace 3 min",
      fr: "il y a 3 min",
      hi: "3 मिनट पहले",
      zh: "3分钟前",
    },
    isWithdrawal: true,
  },
  {
    id: "p4",
    handle: "omar_backgammon",
    avatarChar: "O",
    amount: "$35.20",
    gameText: {
      ar: "طاولة الزهر 1v1",
      en: "Backgammon 1v1",
      es: "Backgammon 1v1",
      fr: "Backgammon 1v1",
      hi: "बैकगैमौन 1v1",
      zh: "双陆棋 1v1",
    },
    icon: "🎲",
    timeText: {
      ar: "منذ 4 دقائق",
      en: "4m ago",
      es: "hace 4 min",
      fr: "il y a 4 min",
      hi: "4 मिनट पहले",
      zh: "4分钟前",
    },
  },
  {
    id: "p5",
    handle: "elena_domino",
    avatarChar: "E",
    amount: "$17.60",
    gameText: {
      ar: "دومينو أمريكاني",
      en: "Dominoes All-Fives",
      es: "Dominó Americano",
      fr: "Dominos Américains",
      hi: "डोमिनोज़ ऑल-फाइव्स",
      zh: "美式多米诺 All-Fives",
    },
    icon: "🀄",
    timeText: {
      ar: "منذ 5 دقائق",
      en: "5m ago",
      es: "hace 5 min",
      fr: "il y a 5 min",
      hi: "5 मिनट पहले",
      zh: "5分钟前",
    },
  },
  {
    id: "p6",
    handle: "alex_math",
    avatarChar: "A",
    amount: "$8.80",
    gameText: {
      ar: "حساب سريع",
      en: "Speed Math",
      es: "Cálculo Rápido",
      fr: "Calcul Rapide",
      hi: "स्पीड मैथ",
      zh: "极限心算",
    },
    icon: "⚡",
    timeText: {
      ar: "منذ 6 دقائق",
      en: "6m ago",
      es: "hace 6 min",
      fr: "il y a 6 min",
      hi: "6 मिनट पहले",
      zh: "6分钟前",
    },
  },
  {
    id: "p7",
    handle: "faisal_c4",
    avatarChar: "F",
    amount: "$88.00",
    gameText: {
      ar: "أربعة على التوالي",
      en: "Connect Four",
      es: "Conecta Cuatro",
      fr: "Puissance 4",
      hi: "कनेक्ट फोर",
      zh: "四子棋",
    },
    icon: "🟡",
    timeText: {
      ar: "منذ 7 دقائق",
      en: "7m ago",
      es: "hace 7 min",
      fr: "il y a 7 min",
      hi: "7 मिनट पहले",
      zh: "7分钟前",
    },
  },
  {
    id: "p8",
    handle: "youssef_checkers",
    avatarChar: "Y",
    amount: "$44.00",
    gameText: {
      ar: "داما كلاسيك",
      en: "Checkers Duel",
      es: "Damas Clásicas",
      fr: "Dames Classiques",
      hi: "क्लासिक चेकर्स",
      zh: "西洋跳棋",
    },
    icon: "🔴",
    timeText: {
      ar: "منذ 8 دقائق",
      en: "8m ago",
      es: "hace 8 min",
      fr: "il y a 8 min",
      hi: "8 मिनट पहले",
      zh: "8分钟前",
    },
  },
  {
    id: "p9",
    handle: "nour_gomoku",
    avatarChar: "N",
    amount: "$17.60",
    gameText: {
      ar: "جوموكو تكتيكي",
      en: "Gomoku Master",
      es: "Gomoku Maestro",
      fr: "Gomoku Maître",
      hi: "गोमोकु मास्टर",
      zh: "五子棋大师赛",
    },
    icon: "⚪",
    timeText: {
      ar: "منذ 10 دقائق",
      en: "10m ago",
      es: "hace 10 min",
      fr: "il y a 10 min",
      hi: "10 मिनट पहले",
      zh: "10分钟前",
    },
  },
  {
    id: "p10",
    handle: "hassan_hero",
    avatarChar: "H",
    amount: "$200.00",
    gameText: {
      ar: "سحب USDT فوري",
      en: "Instant USDT Cashout",
      es: "Retiro Inmediato USDT",
      fr: "Retrait Immédiat USDT",
      hi: "तत्काल USDT निकासी",
      zh: "即时 USDT 提现",
    },
    icon: "⚡",
    timeText: {
      ar: "منذ 12 دقيقة",
      en: "12m ago",
      es: "hace 12 min",
      fr: "il y a 12 min",
      hi: "12 मिनट पहले",
      zh: "12分钟前",
    },
    isWithdrawal: true,
  },
];

const TICKER_LABEL_I18N: Record<string, string> = {
  ar: "شريط الأرباح المباشرة",
  en: "Live Winners Ticker",
  es: "Transmisión de Ganadores en Vivo",
  fr: "Flux des Gagnants en Direct",
  hi: "लाइव विजेताओं का टिकर",
  zh: "实时获胜与提现实况",
};

export function LiveWinnersTicker() {
  const { locale, dir, t } = useI18n();
  const isRtl = dir === "rtl";

  // Duplicate items array to create a seamless infinite loop
  const displayItems = useMemo(() => [...RAW_PAYOUTS, ...RAW_PAYOUTS], []);

  const actionText = (isWithdrawal?: boolean) => {
    if (locale === "ar") return isWithdrawal ? "سحب" : "كسب";
    if (locale === "fr") return isWithdrawal ? "a retiré" : "a gagné";
    if (locale === "es") return isWithdrawal ? "retiró" : "ganó";
    if (locale === "hi") return isWithdrawal ? "निकाले" : "जीते";
    if (locale === "zh") return isWithdrawal ? "提现" : "获胜赢得";
    return isWithdrawal ? "withdrew" : "won";
  };

  const instantTagText = () => {
    if (locale === "ar") return "فوري ⚡";
    if (locale === "fr") return "Instantané ⚡";
    if (locale === "es") return "Instantáneo ⚡";
    if (locale === "hi") return "तत्काल ⚡";
    if (locale === "zh") return "秒级到账 ⚡";
    return "Instant ⚡";
  };

  const tickerAria = TICKER_LABEL_I18N[locale] || TICKER_LABEL_I18N.en;

  return (
    <div className={styles.tickerContainer} aria-label={tickerAria}>
      <div className={styles.tickerLabel}>
        <span className={styles.pulseIcon} />
        <span>{t("ticker.live_payouts")}</span>
      </div>

      <div className={styles.trackWrapper}>
        <div className={styles.track}>
          {displayItems.map((item, idx) => {
            const game = item.gameText[locale] || item.gameText.en;
            const time = item.timeText[locale] || item.timeText.en;
            return (
              <div key={`${item.id}-${idx}`} className={styles.item}>
                <span className={styles.avatar}>{item.avatarChar}</span>
                <span className={styles.winnerHandle}>@{item.handle}</span>
                <span>{actionText(item.isWithdrawal)}</span>
                <span className={styles.amount}>{item.amount}</span>
                <span className={styles.gameBadge}>
                  {item.icon} {game}
                </span>
                <span className={styles.instantTag}>{instantTagText()}</span>
                <span className={styles.timeAgo}>{time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
