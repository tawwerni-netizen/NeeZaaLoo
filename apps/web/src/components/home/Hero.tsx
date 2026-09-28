"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { transition } from "@/lib/motion";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import { listGames } from "@/lib/games";
import { playCardHoverSound, playDifficultySelectSound } from "@/lib/game-audio";
import { HeroParticles } from "./HeroParticles";
import styles from "./Hero.module.css";

const triggerDopamineExplosion = () => {
  const duration = 1000;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 8,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#FFD700', '#FFB800', '#FFEA00', '#00FFFF', '#FF00FF']
    });
    confetti({
      particleCount: 8,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#FFD700', '#FFB800', '#FFEA00', '#00FFFF', '#FF00FF']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  frame();
};

const FEATURED_COUNT = 6;

const QUICK_STAKES = [
  {
    stake: 2,
    prize: 3.52,
    badgeKey: "home.quick_stakes.badge_safe_start",
    tagKey: "home.quick_stakes.tag_quick_trial",
    popular: false,
    accentColor: "#10B981",
    themeClass: styles.cardEmerald,
    soundLevel: "EASY" as const,
  },
  {
    stake: 5,
    prize: 8.8,
    badgeKey: "home.quick_stakes.badge_most_popular",
    tagKey: "home.quick_stakes.tag_champions_duel",
    popular: true,
    accentColor: "#3B82F6",
    themeClass: styles.cardSapphire,
    soundLevel: "MEDIUM" as const,
  },
  {
    stake: 10,
    prize: 17.6,
    badgeKey: "home.quick_stakes.badge_pro_challenge",
    tagKey: "home.quick_stakes.tag_tactical_duel",
    popular: false,
    accentColor: "#8B5CF6",
    themeClass: styles.cardViolet,
    soundLevel: "HARD" as const,
  },
  {
    stake: 25,
    prize: 44.0,
    badgeKey: "home.quick_stakes.badge_elite_table",
    tagKey: "home.quick_stakes.tag_grand_prize",
    popular: false,
    accentColor: "#F59E0B",
    themeClass: styles.cardGold,
    soundLevel: "EXPERT" as const,
  },
  {
    stake: 50,
    prize: 88.0,
    badgeKey: "home.quick_stakes.badge_high_roller",
    tagKey: "home.quick_stakes.tag_high_roller_prize",
    popular: false,
    accentColor: "#EF4444",
    themeClass: styles.cardRuby,
    soundLevel: "EXPERT" as const,
  },
];


type LocalizedText = {
  ar: string;
  en: string;
  es: string;
  fr: string;
  hi: string;
  zh: string;
};

const HERO_I18N = {
  netWin: {
    ar: "تكسب صافي:",
    en: "Net Win:",
    es: "Ganancia neta:",
    fr: "Gain net :",
    hi: "शुद्ध जीत:",
    zh: "净收益:",
  },
  fairPlay100: {
    ar: "100% لعب عادل",
    en: "100% FAIR PLAY",
    es: "100% JUEGO LIMPIO",
    fr: "100% JEU ÉQUITABLE",
    hi: "100% निष्पक्ष खेल",
    zh: "100% 公平对决",
  },
  prevSlide: {
    ar: "الشريحة السابقة",
    en: "Previous slide",
    es: "Diapositiva anterior",
    fr: "Diapositive précédente",
    hi: "पिछली स्लाइड",
    zh: "上一张",
  },
  nextSlide: {
    ar: "الشريحة التالية",
    en: "Next slide",
    es: "Diapositiva siguiente",
    fr: "Diapositive suivante",
    hi: "अगली स्लाइड",
    zh: "下一张",
  },
  startDuel: (stake: number): Record<string, string> => ({
    ar: `بدء نزال بقيمة ${stake} USDT`,
    en: `Start a ${stake} USDT duel`,
    es: `Iniciar duelo de ${stake} USDT`,
    fr: `Lancer un duel à ${stake} USDT`,
    hi: `${stake} USDT का मुकाबला शुरू करें`,
    zh: `发起 ${stake} USDT 对局`,
  }),
};

const getSlideText = (field: LocalizedText, loc: string): string => {
  return (field as Record<string, string>)[loc] || field.en || "";
};

type ShowcaseSlide = {
  id: string;
  gameId: string;
  image: string;
  superText: LocalizedText;
  titleText: LocalizedText;
  metaText: LocalizedText;
  badgeText: LocalizedText;
  tagText: LocalizedText;
  targetHref: string;
};

const SHOWCASE_SLIDES: ShowcaseSlide[] = [
  {
    id: "chess",
    gameId: "chess",
    image: "/images/hero-showcase/showcase-chess-blitz.jpg",
    superText: {
      ar: "بطولة الشطرنج الخاطف",
      en: "CHESS BLITZ ARENA",
      es: "ARENA DE AJEDREZ BLITZ",
      fr: "ARÈNE D'ÉCHECS BLITZ",
      hi: "शतरंज ब्लिट्ज अखाड़ा",
      zh: "快棋竞技场",
    },
    titleText: {
      ar: "مواجهات الشطرنج الخاطف 1v1",
      en: "1v1 Grandmaster Chess Blitz",
      es: "Duelo 1v1 de Ajedrez Relámpago",
      fr: "Duels 1v1 Échecs Blitz",
      hi: "1v1 ग्रैंडमास्टर शतरंज ब्लिट्ज",
      zh: "1v1 国际象棋特级大师快棋",
    },
    metaText: {
      ar: "تسوية فورية • خوارزمية مكافحة الغش • تصنيف ELO معتمد",
      en: "Instant Settlement • Certified Anti-Cheat • FIDE ELO Standard",
      es: "Liquidación Inmediata • Anti-Trampas Certificado • ELO FIDE",
      fr: "Règlement Immédiat • Anti-Triche Certifié • Standard ELO FIDE",
      hi: "तत्काल भुगतान • प्रमाणित एंटी-चीट • FIDE ELO मानक",
      zh: "秒级结算 • 权威反作弊 • FIDE 官方 ELO 标准",
    },
    badgeText: {
      ar: "ميدان مباشر",
      en: "LIVE SKILL ARENA",
      es: "ARENA EN VIVO",
      fr: "ARÈNE EN DIRECT",
      hi: "लाइव अखाड़ा",
      zh: "实时竞技场",
    },
    tagText: {
      ar: "تحدَّ الآن ↗",
      en: "PLAY BLITZ ↗",
      es: "JUGAR BLITZ ↗",
      fr: "JOUER BLITZ ↗",
      hi: "ब्लिट्ज खेलें ↗",
      zh: "即刻对决 ↗",
    },
    targetHref: "/play/chess",
  },
  {
    id: "dominoes",
    gameId: "dominoes",
    image: "/images/hero-showcase/showcase-dominoes-clash.jpg",
    superText: {
      ar: "مواجهات الدومينو التكتيكية",
      en: "DOMINOES CLASH",
      es: "DUELO DE DOMINÓ",
      fr: "CHOC DE DOMINOS",
      hi: "डोमिनोज़ क्लैश",
      zh: "多米诺对决",
    },
    titleText: {
      ar: "تحديات أساتذة الدومينو الكلاسيكي",
      en: "Classic Dominoes Clash",
      es: "Choque de Dominó Clásico",
      fr: "Choc de Dominos Classique",
      hi: "क्लासिक डोमिनोज़ मुकाबला",
      zh: "经典多米诺大师对决",
    },
    metaText: {
      ar: "حساب دقيق للنقاط • خالية من الحظ • جولات سريعة",
      en: "Precision Tile Engine • Deterministic State • Fast Rounds",
      es: "Cálculo Preciso • Estado Determinista • Rondas Rápidas",
      fr: "Calcul Précis des Tuiles • État Déterministe • Manches Rapides",
      hi: "सटीक टाइल इंजन • बिना किसी भाग्य के • तेज़ राउंड",
      zh: "精准骨牌计算 • 纯技术确定性 • 节奏快局",
    },
    badgeText: {
      ar: "أرينا حية",
      en: "LIVE ARENA",
      es: "ARENA EN VIVO",
      fr: "ARÈNE EN DIRECT",
      hi: "लाइव अखाड़ा",
      zh: "实时竞技场",
    },
    tagText: {
      ar: "العب الآن ↗",
      en: "PLAY NOW ↗",
      es: "JUGAR AHORA ↗",
      fr: "JOUER ↗",
      hi: "अभी खेलें ↗",
      zh: "即刻开局 ↗",
    },
    targetHref: "/play/dominoes",
  },
  {
    id: "ludo",
    gameId: "ludo",
    image: "/images/hero-showcase/showcase-ludo-legends.jpg",
    superText: {
      ar: "لودو الأساطير",
      en: "LUDO OF LEGENDS",
      es: "LUDO DE LEYENDAS",
      fr: "LUDO DES LÉGENDES",
      hi: "लूडो लीजेंड्स",
      zh: "传奇飞行棋",
    },
    titleText: {
      ar: "بطولة لودو الكبرى المباشرة",
      en: "Grand Ludo Live Championship",
      es: "Gran Campeonato en Vivo de Ludo",
      fr: "Grand Championnat de Ludo en Direct",
      hi: "ग्रैंड लूडो लाइव चैंपियनशिप",
      zh: "传奇飞行棋线上大奖赛",
    },
    metaText: {
      ar: "4 لاعبين • تنافس استراتيجي عالي • جوائز ضخمة",
      en: "4 Players • High Tactical Competition • Massive Prizes",
      es: "4 Jugadores • Alta Táctica • Grandes Premios",
      fr: "4 Joueurs • Haute Compétition Tactique • Gros Lots",
      hi: "4 खिलाड़ी • उच्च सामरिक मुकाबला • विशाल पुरस्कार",
      zh: "4人对战 • 高度战术博弈 • 丰厚奖池",
    },
    badgeText: {
      ar: "ميدان حي 24/7",
      en: "LIVE ARENA 24/7",
      es: "ARENA 24/7",
      fr: "ARÈNE 24/7",
      hi: "लाइव अखाड़ा 24/7",
      zh: "24/7 竞技场",
    },
    tagText: {
      ar: "العب لودو الآن ↗",
      en: "PLAY LUDO NOW ↗",
      es: "JUGAR LUDO YA ↗",
      fr: "JOUER AU LUDO ↗",
      hi: "लूडो खेलें ↗",
      zh: "即刻飞翔 ↗",
    },
    targetHref: "/play/ludo",
  },
  {
    id: "backgammon",
    gameId: "backgammon",
    image: "/images/hero-showcase/showcase-backgammon-masters.jpg",
    superText: {
      ar: "بطولة طاولة الزهر الكبرى",
      en: "BACKGAMMON MASTERS",
      es: "MAESTROS DE BACKGAMMON",
      fr: "MAÎTRES DU BACKGAMMON",
      hi: "बैकगैमौन मास्टर्स",
      zh: "双陆棋大师赛",
    },
    titleText: {
      ar: "بطولة طاولة الزهر الإمبراطورية",
      en: "Imperial Backgammon Cup",
      es: "Copa Imperial de Backgammon",
      fr: "Coupe Impériale de Backgammon",
      hi: "इंपीरियल बैकगैमौन कप",
      zh: "双陆棋帝国冠军杯",
    },
    metaText: {
      ar: "أدوار متسلسلة • عدالة رقمية كاملة • أرينا المحترفين",
      en: "High-Stakes Tawla • Provably Fair Clock • Pro Arena",
      es: "Tawla de Altos Vuelos • Reloj Provablemente Justo • Arena Pro",
      fr: "Tawla à Forts Enjeux • Horloge Équitable • Arène Pro",
      hi: "उच्च दांव वाली तावला • प्रमाणित निष्पक्ष घड़ी • प्रो अखाड़ा",
      zh: "高额局 Tawla • 绝对公平倒计时 • 职业竞技场",
    },
    badgeText: {
      ar: "مباشر الآن",
      en: "ACTIVE ARENA",
      es: "ARENA ACTIVA",
      fr: "ARÈNE ACTIVE",
      hi: "सक्रिय अखाड़ा",
      zh: "火热进行中",
    },
    tagText: {
      ar: "ادخل الأرينا ↗",
      en: "ENTER ARENA ↗",
      es: "ENTRAR A LA ARENA ↗",
      fr: "ENTRER DANS L'ARÈNE ↗",
      hi: "अखाड़े में प्रवेश करें ↗",
      zh: "进入赛场 ↗",
    },
    targetHref: "/play/backgammon",
  },
  {
    id: "math",
    gameId: "speed-math",
    image: "/images/hero-showcase/showcase-math-olympiad.jpg",
    superText: {
      ar: "أولمبياد الحساب الذهني",
      en: "SPEED MATH OLYMPIAD",
      es: "OLIMPIADA DE CÁLCULO",
      fr: "OLYMPIADE DE CALCUL RAPIDE",
      hi: "स्पीड मैथ ओलंपियाड",
      zh: "极限心算擂台",
    },
    titleText: {
      ar: "أولمبياد الحساب والسرعة الذهنية",
      en: "Speed Math Mind Olympiad",
      es: "Olimpiada Mental de Cálculo Rápido",
      fr: "Olympiades de Calcul Mental Rapide",
      hi: "स्पीड मैथ मानसिक ओलंपियाड",
      zh: "极限心算奥林匹克",
    },
    metaText: {
      ar: "معادلات متتالية • وقت متسارع • أعلى معدل ذكاء",
      en: "Mental Arithmetic • Clock Pressure • Pure Calculation",
      es: "Aritmética Mental • Presión de Reloj • Cálculo Puro",
      fr: "Calcul Mental • Pression du Chrono • Calcul Pur",
      hi: "मानसिक अंकगणित • समय का दबाव • शुद्ध गणना",
      zh: "连环心算题 • 极速倒计时 • 纯粹脑力决战",
    },
    badgeText: {
      ar: "تحدي العقول",
      en: "MIND BATTLE",
      es: "BATALLA MENTAL",
      fr: "DÉFI MENTAL",
      hi: "दिमागी मुकाबला",
      zh: "最强大脑",
    },
    tagText: {
      ar: "اختبر سرعتك ↗",
      en: "TEST SPEED ↗",
      es: "PROBAR VELOCIDAD ↗",
      fr: "TESTER LA RAPIDITÉ ↗",
      hi: "गति परखें ↗",
      zh: "测测手速 ↗",
    },
    targetHref: "/play/speed-math",
  },
  {
    id: "xo",
    gameId: "xo",
    image: "/images/hero-showcase/showcase-xo-speed.jpg",
    superText: {
      ar: "مبارزات إكس أو الخاطفة",
      en: "XO BLITZ BATTLE",
      es: "BATALLA BLITZ XO",
      fr: "BATAILLE BLITZ XO",
      hi: "XO ब्लिट्ज लड़ाई",
      zh: "XO 闪电战",
    },
    titleText: {
      ar: "تحدي السرعة القصوى XO",
      en: "XO Ultra Speed Arena",
      es: "Arena de Ultra Velocidad XO",
      fr: "Arène Ultra Rapide XO",
      hi: "XO अल्ट्रा स्पीड एरिना",
      zh: "XO 极速井字棋角斗场",
    },
    metaText: {
      ar: "جولات 60 ثانية • سرعة بديهة مطلقة • مباريات فورية",
      en: "60-Second Blitz • Lightning Reflexes • Instant Match",
      es: "Partidas de 60s • Reflejos Rápidos • Partida Instantánea",
      fr: "Parties en 60s • Réflexes Éclair • Match Immédiat",
      hi: "60-सेकंड ब्लिट्ज • तीव्र सजगता • त्वरित मैच",
      zh: "60秒快速局 • 极限反应力 • 秒级配对",
    },
    badgeText: {
      ar: "سرعة فائقة",
      en: "LIGHTNING SPEED",
      es: "VELOCIDAD RELÁMPAGO",
      fr: "VITESSE ÉCLAIR",
      hi: "बिजली जैसी गति",
      zh: "闪电极速",
    },
    tagText: {
      ar: "العب في ثوانٍ ↗",
      en: "PLAY NOW ↗",
      es: "JUGAR YA ↗",
      fr: "JOUER ↗",
      hi: "तुरंत खेलें ↗",
      zh: "即刻对战 ↗",
    },
    targetHref: "/play/xo",
  },
  {
    id: "connect4",
    gameId: "connect-four",
    image: "/images/hero-showcase/showcase-connect4-matrix.jpg",
    superText: {
      ar: "تحدي المصفوفة الرأسي",
      en: "MATRIX ARENA",
      es: "ARENA DE LA MATRIZ",
      fr: "ARÈNE MATRICE",
      hi: "मैट्रिक्स अखाड़ा",
      zh: "矩阵竞技场",
    },
    titleText: {
      ar: "أربعة على التوالي - الصراع السريع",
      en: "Connect Four Speed Matrix",
      es: "Conecta Cuatro Matriz Rápida",
      fr: "Puissance 4 Matrice Rapide",
      hi: "कनेक्ट फोर स्पीड मैट्रिक्स",
      zh: "四子棋极速矩阵对决",
    },
    metaText: {
      ar: "تفكير استراتيجي فوري • خروج المغلوب • تصفيات مباشرة",
      en: "Vertical Tactical Grid • Instant Matchmaking • Zero RNG",
      es: "Cuadrícula Táctica • Emparejamiento Rápido • Cero RNG",
      fr: "Grille Tactique Verticale • Matchmaking Instantané • Zéro RNG",
      hi: "ऊर्ध्वाधर सामरिक ग्रिड • त्वरित मिलान • शून्य RNG",
      zh: "垂直重力棋盘 • 秒级智能匹配 • 零随机数",
    },
    badgeText: {
      ar: "مبارزة 1v1",
      en: "1v1 DUEL",
      es: "DUELO 1v1",
      fr: "DUEL 1v1",
      hi: "1v1 मुकाबला",
      zh: "1v1 对决",
    },
    tagText: {
      ar: "تحدَّ الخصم ↗",
      en: "CHALLENGE ↗",
      es: "DESAFIAR ↗",
      fr: "DÉFIER ↗",
      hi: "चुनौती दें ↗",
      zh: "发起挑战 ↗",
    },
    targetHref: "/play/connect-four",
  },
  {
    id: "checkers",
    gameId: "checkers",
    image: "/images/hero-showcase/showcase-checkers-crown.jpg",
    superText: {
      ar: "تصفيات تاج الداما",
      en: "CROWN MASTERS",
      es: "MAESTROS DE LA CORONA",
      fr: "MAÎTRES DE LA COURONNE",
      hi: "क्राउन मास्टर्स",
      zh: "王冠大师",
    },
    titleText: {
      ar: "بطولة الداما التكتيكية الكلاسيكية",
      en: "Checkers Crown Elimination",
      es: "Eliminatoria de Corona de Damas",
      fr: "Élimination Couronne de Dames",
      hi: "चेकर्स क्राउन एलिमिनेशन",
      zh: "西洋跳棋王冠淘汰赛",
    },
    metaText: {
      ar: "قوانين دولية معتمدة • ترقية الملوك • حسم مهاري",
      en: "Official Standard • Crown Promotion • Pure Skill Duel",
      es: "Estándar Oficial • Coronación • Duelo de Habilidad",
      fr: "Norme Officielle • Promotion des Dames • Duel d'Habileté",
      hi: "आधिकारिक मानक • राजा का ताज • शुद्ध कौशल मुकाबला",
      zh: "国际官方规则 • 王棋加冕 • 纯技术攻防",
    },
    badgeText: {
      ar: "جولة حاسمة",
      en: "KNOCKOUT ROUND",
      es: "RONDA ELIMINATORIA",
      fr: "MANCHE ÉLIMINATOIRE",
      hi: "नॉकआउट राउंड",
      zh: "淘汰生死局",
    },
    tagText: {
      ar: "ابدأ التحدي ↗",
      en: "START DUEL ↗",
      es: "INICIAR DUELO ↗",
      fr: "LANCER LE DÉFI ↗",
      hi: "मुकाबला शुरू करें ↗",
      zh: "开始对决 ↗",
    },
    targetHref: "/play/checkers",
  },
  {
    id: "reversi",
    gameId: "reversi",
    image: "/images/hero-showcase/showcase-reversi-arena.jpg",
    superText: {
      ar: "كأس ريفيرسي الإستراتيجي",
      en: "REVERSI CHAMPIONSHIP",
      es: "CAMPEONATO DE REVERSI",
      fr: "CHAMPIONNAT DE REVERSI",
      hi: "रिवर्सी चैंपियनशिप",
      zh: "黑白棋锦标赛",
    },
    titleText: {
      ar: "ريفيرسي: تكتيك قلب الأوبسيديان",
      en: "Reversi Obsidian Flip Cup",
      es: "Copa de Volteo Obsidiana Reversi",
      fr: "Coupe de Reversi d'Obsidienne",
      hi: "रिवर्सी ओब्सीडियन फ्लिप कप",
      zh: "黑白棋黑曜石翻转锦标赛",
    },
    metaText: {
      ar: "انقلاب الموازين في ثوانٍ • تحكم استراتيجي بالأطراف",
      en: "Dynamic Flipping • Corner Strategy • High Skill Ceiling",
      es: "Volteo Dinámico • Estrategia de Esquinas • Alto Nivel",
      fr: "Retournements Dynamiques • Stratégie des Coins • Haute Maîtrise",
      hi: "गतिशील फ़्लिपिंग • कोनों का नियंत्रण • उच्च कौशल क्षमता",
      zh: "瞬间逆转战局 • 边角控盘战略 • 极高竞技上限",
    },
    badgeText: {
      ar: "استراتيجية عميقة",
      en: "DEEP STRATEGY",
      es: "ESTRATEGIA PROFUNDA",
      fr: "STRATÉGIE PROFONDE",
      hi: "गहन रणनीति",
      zh: "深度策略",
    },
    tagText: {
      ar: "تحدَّ الآن ↗",
      en: "PLAY REVERSI ↗",
      es: "JUGAR REVERSI ↗",
      fr: "JOUER À REVERSI ↗",
      hi: "रिवर्सी खेलें ↗",
      zh: "即刻落子 ↗",
    },
    targetHref: "/play/reversi",
  },
  {
    id: "gomoku",
    gameId: "gomoku",
    image: "/images/hero-showcase/showcase-gomoku-cup.jpg",
    superText: {
      ar: "بطولة غوموكو الدولية",
      en: "GOMOKU ZEN CUP",
      es: "COPA ZEN GOMOKU",
      fr: "COUPE ZEN GOMOKU",
      hi: "गोमोकु ज़ेन कप",
      zh: "五子棋禅境杯",
    },
    titleText: {
      ar: "غوموكو: محاذاة الأحجار الخمسة",
      en: "Gomoku Five-in-a-Row Cup",
      es: "Copa Gomoku Cinco en Línea",
      fr: "Coupe Gomoku Cinq Aligné",
      hi: "गोमोकु फाइव-इन-ए-रो कप",
      zh: "五子连珠国际禅宗杯",
    },
    metaText: {
      ar: "هجوم ودفاع متزامن • رقعة 15×15 • مهارة نقية",
      en: "Five-Stone Alignment • 15x15 Matrix • Pure Tactical Duel",
      es: "Alineación de Cinco Piedras • Matriz 15x15 • Duelo Táctico Puro",
      fr: "Alignement de Cinq Pierres • Matrice 15x15 • Duel Tactique Pur",
      hi: "पांच पत्थरों का संरेखण • 15x15 ग्रिड • शुद्ध सामरिक द्वंद्व",
      zh: "五子连珠 • 15x15 纵横棋盘 • 纯粹攻守战术",
    },
    badgeText: {
      ar: "نخبة الأرينا",
      en: "ELITE ARENA",
      es: "ARENA ÉLITE",
      fr: "ARÈNE D'ÉLITE",
      hi: "अभिजात वर्ग अखाड़ा",
      zh: "精英竞技场",
    },
    tagText: {
      ar: "خض المنافسة ↗",
      en: "ENTER CUP ↗",
      es: "ENTRAR A LA COPA ↗",
      fr: "PARTICIPER À LA COUPE ↗",
      hi: "कप में भाग लें ↗",
      zh: "角逐冠军 ↗",
    },
    targetHref: "/play/gomoku",
  },
  {
    id: "seega",
    gameId: "seega",
    image: "/images/hero-showcase/showcase-seega-championship.jpg",
    superText: {
      ar: "بطولة السيجة التراثية",
      en: "SEEGA GRAND ARENA",
      es: "GRAN ARENA DE SEEGA",
      fr: "GRANDE ARÈNE DE SEEGA",
      hi: "सीगा ग्रैंड एरिना",
      zh: "塞加古韵竞技场",
    },
    titleText: {
      ar: "السيجة: صراع الذكاء التراثي الكلاسيكي",
      en: "Seega Desert Strategy Arena",
      es: "Arena Táctica del Desierto Seega",
      fr: "Arène Stratégique du Désert Seega",
      hi: "सीगा डेजर्ट स्ट्रैटेजी एरिना",
      zh: "古埃及塞加沙漠围棋争霸",
    },
    metaText: {
      ar: "تراث شرقي عريق • حصار القطع • منافسات بطولية",
      en: "Heritage Tactics • Stone Encirclement • Tournament Standard",
      es: "Tácticas Ancestrales • Captura por Encierro • Nivel Torneo",
      fr: "Tactique Ancestrale • Prise en Prise Sandwiche • Standard Tournoi",
      hi: "प्राचीन रणनीति • पत्थरों की घेराबंदी • टूर्नामेंट मानक",
      zh: "千年古老智慧 • 三明治夹击吃子 • 锦标赛水准",
    },
    badgeText: {
      ar: "تراث ومهارة",
      en: "HERITAGE SKILL",
      es: "HABILIDAD ANCESTRAL",
      fr: "SAVOIR-FAIRE ANCESTRAL",
      hi: "पारंपरिक कौशल",
      zh: "古韵与技巧",
    },
    tagText: {
      ar: "العب السيجة ↗",
      en: "PLAY SEEGA ↗",
      es: "JUGAR SEEGA ↗",
      fr: "JOUER À LA SEEGA ↗",
      hi: "सीगा खेलें ↗",
      zh: "即刻对弈 ↗",
    },
    targetHref: "/play/seega",
  },
];

const stage = (index: number, reduceMotion: boolean | null) => ({
  initial: reduceMotion ? {} : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...transition.reveal, delay: reduceMotion ? 0 : index * 0.12 },
});

export function Hero() {
  const reduceMotion = useReducedMotion();
  const { t, dir, locale } = useI18n();
  const isRtl = dir === "rtl";
  const featured = listGames().slice(0, FEATURED_COUNT);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadedIndices, setLoadedIndices] = useState<number[]>([0, 1]);

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length);
  }, []);

  // Preload upcoming slides on demand
  useEffect(() => {
    setLoadedIndices((prev) => {
      const nextIdx = (currentIdx + 1) % SHOWCASE_SLIDES.length;
      const prevIdx = (currentIdx - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length;
      if (prev.includes(currentIdx) && prev.includes(nextIdx) && prev.includes(prevIdx)) return prev;
      const set = new Set(prev);
      set.add(currentIdx);
      set.add(nextIdx);
      set.add(prevIdx);
      return Array.from(set);
    });
  }, [currentIdx]);

  // Automatic slideshow rotation every 4.2 seconds
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 4200);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const currentSlide = SHOWCASE_SLIDES[currentIdx] ?? SHOWCASE_SLIDES[0]!;

  return (
    <section className={styles.hero} dir={isRtl ? "rtl" : "ltr"}>
      <HeroParticles />
      <div className={`nz-container ${styles.container}`}>
        {/* Top Hero Statement / Copy Zone */}
        <div className={styles.headerZone}>
          <motion.div {...stage(0, reduceMotion)} className={styles.eyebrowWrap}>
            <span className={styles.eyebrowBadge}>
              <span className={styles.eyebrowBeacon} aria-hidden="true" />
              <span>{t("home.hero.eyebrow")}</span>
            </span>
          </motion.div>

          <motion.h1 {...stage(1, reduceMotion)} className={styles.headline}>
            <span>{t("home.hero.headline_title")}</span>{" "}
            <span className={styles.headlineAccent}>{t("home.hero.headline_accent")}</span>
          </motion.h1>

          <motion.p {...stage(2, reduceMotion)} className={styles.subhead}>
            {t("home.hero.subhead")}
          </motion.p>

          <motion.div {...stage(3, reduceMotion)} className={styles.actions}>
            <LocaleLink
              href="/play"
              onMouseEnter={() => playCardHoverSound()}
              onClick={(e) => {
                triggerDopamineExplosion();
                playDifficultySelectSound("HARD");
              }}
            >
              <Button variant="primary" className={styles.primaryBtn}>
                <span style={{ marginInlineEnd: "8px" }}>⚔️</span>
                {t("home.hero.cta_primary")}
              </Button>
            </LocaleLink>
            <LocaleLink
              href="/wallet"
              onMouseEnter={() => playCardHoverSound()}
              onClick={() => playDifficultySelectSound("MEDIUM")}
            >
              <Button variant="ghost" className={styles.secondaryBtn}>
                <span style={{ marginInlineEnd: "8px" }}>💳</span>
                {t("home.hero.instant_deposit")}
              </Button>
            </LocaleLink>
          </motion.div>

          {/* Psychological Trust & Conversion Anchors */}
          <div className={styles.psychologicalTrustBar}>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>⚡</span>
              <span>{t("home.hero.trust_payout")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>🛡️</span>
              <span>{t("home.hero.trust_skill")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>💰</span>
              <span>{t("home.hero.trust_share")}</span>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustIcon}>🏆</span>
              <span>{t("home.hero.trust_tournaments")}</span>
            </div>
          </div>

          {/* Instant Quick-Stake Match Selector (Tactile Cyber-Luxury Cards) */}
          <div className={styles.quickStakeSection}>
            <div className={styles.quickStakeHeader}>
              <div className={styles.quickStakeTitle}>
                <span className={styles.quickStakeTitleBadge}>
                  <span className={styles.quickStakePulse} />
                  <span>{t("home.quick_stakes.section_badge")}</span>
                </span>
                <span className={styles.quickStakeTitleText}>
                  {t("home.quick_stakes.section_title")}
                </span>
              </div>
              <span className={styles.quickStakeSub}>
                {t("home.quick_stakes.section_sub")}
              </span>
            </div>

            <div className={styles.quickStakeGrid}>
              {QUICK_STAKES.map((qs) => (
                <LocaleLink
                  key={qs.stake}
                  href={`/play?stake=${qs.stake}&tier=CASH`}
                  className={`${styles.quickStakeCard} ${qs.themeClass} ${qs.popular ? styles.quickStakeCardPopular : ""}`}
                  onMouseEnter={() => playCardHoverSound()}
                  onClick={() => {
                    triggerDopamineExplosion();
                    playDifficultySelectSound(qs.soundLevel);
                  }}
                  title={HERO_I18N.startDuel(qs.stake)[locale] || HERO_I18N.startDuel(qs.stake).en}
                >
                  <div className={styles.cardGlowLine} style={{ background: `linear-gradient(90deg, ${qs.accentColor}, transparent)` }} />
                  <div className={styles.cardTopRow}>
                    <span
                      className={qs.popular ? styles.popularBadge : styles.subtleBadge}
                      style={!qs.popular ? { color: qs.accentColor, borderColor: `${qs.accentColor}55` } : undefined}
                    >
                      {t(qs.badgeKey)}
                    </span>
                  </div>
                  <div className={styles.quickStakeTop}>
                    <span className={styles.stakeAmountVal}>${qs.stake}</span>
                    <span className={styles.stakeAmountCurrency}>USDT</span>
                  </div>
                  <div className={styles.quickStakePrizeBox}>
                    <span className={styles.prizePrefix}>{HERO_I18N.netWin[locale] || HERO_I18N.netWin.en}</span>
                    <span className={styles.prizeNumber}>${qs.prize.toFixed(2)}</span>
                    <span className={styles.prizeCurrency}>USDT</span>
                  </div>
                  <span className={styles.quickStakeTag}>
                    {t(qs.tagKey)}
                  </span>
                </LocaleLink>
              ))}
            </div>
          </div>
        </div>

        {/* Large Grand Full-Width Showcase Slider */}
        <motion.div
          {...stage(3, reduceMotion)}
          className={styles.visualFullWidth}
        >
          <div className={styles.showcaseGlowBackdrop} aria-hidden="true" />
          
          <div
            className={styles.carouselContainer}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <LocaleLink href={currentSlide.targetHref} className={styles.showcaseCard}>
              {/* Stack of slides with on-demand lazy mounting and WebP optimization */}
              <div className={styles.slidesStack}>
                {SHOWCASE_SLIDES.map((slide, idx) => {
                  if (!loadedIndices.includes(idx)) return null;
                  const webpSrc = slide.image.replace(/\.jpg$/, ".webp");
                  const isActive = idx === currentIdx;
                  return (
                    <picture
                      key={slide.id}
                      className={`${styles.bannerPicture} ${isActive ? styles.bannerPictureActive : ""}`}
                    >
                      <source srcSet={webpSrc} type="image/webp" />
                      <img
                        src={slide.image}
                        alt={getSlideText(slide.titleText, locale)}
                        className={styles.bannerImg}
                        width={1240}
                        height={520}
                        loading={idx === 0 ? "eager" : "lazy"}
                        decoding={idx === 0 ? "sync" : "async"}
                        fetchPriority={idx === 0 ? "high" : "low"}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.parentElement && target.parentElement.querySelector("source")) {
                            target.parentElement.querySelector("source")?.remove();
                          }
                          target.src = slide.image;
                        }}
                      />
                    </picture>
                  );
                })}
              </div>

              <div className={styles.bannerOverlay} />
              <div className={styles.cyberCornerTL} />
              <div className={styles.cyberCornerBR} />
              
              {/* Dynamic Badge */}
              <div className={styles.badgeArena}>
                <span className={styles.pulsingDot} />
                <span>{getSlideText(currentSlide.badgeText, locale)}</span>
              </div>

              <div className={styles.badgeCertified}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <span>{HERO_I18N.fairPlay100[locale] || HERO_I18N.fairPlay100.en}</span>
              </div>

              {/* Dynamic Bottom Bar */}
              <div className={styles.showcaseBottomBar}>
                <div className={styles.showcaseTextGroup}>
                  <div className={styles.showcaseTagRow}>
                    <span className={styles.trophyIcon}>🏆</span>
                    <span className={styles.showcaseSuper}>
                      {getSlideText(currentSlide.superText, locale)}
                    </span>
                  </div>
                  <h3 className={styles.showcaseTitle}>
                    {getSlideText(currentSlide.titleText, locale)}
                  </h3>
                  <p className={styles.showcaseMeta}>
                    {getSlideText(currentSlide.metaText, locale)}
                  </p>
                </div>
                <span className={styles.tagFairPlay}>
                  {getSlideText(currentSlide.tagText, locale)}
                </span>
              </div>
            </LocaleLink>

            {/* Manual Slide Navigation Arrows */}
            <button
              type="button"
              className={`${styles.carouselArrow} ${styles.carouselArrowPrev}`}
              onMouseEnter={() => playCardHoverSound()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playCardHoverSound();
                if (isRtl) nextSlide();
                else prevSlide();
              }}
              aria-label={HERO_I18N.prevSlide[locale] || HERO_I18N.prevSlide.en}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.carouselArrow} ${styles.carouselArrowNext}`}
              onMouseEnter={() => playCardHoverSound()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playCardHoverSound();
                if (isRtl) prevSlide();
                else nextSlide();
              }}
              aria-label={HERO_I18N.nextSlide[locale] || HERO_I18N.nextSlide.en}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* 10-Dot Progress Indicator Strip */}
            <div className={styles.carouselIndicators} role="tablist">
              {SHOWCASE_SLIDES.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentIdx}
                  aria-label={`${getSlideText(slide.titleText, locale)} (${idx + 1}/${SHOWCASE_SLIDES.length})`}
                  className={`${styles.indicatorBar} ${idx === currentIdx ? styles.indicatorBarActive : ""}`}
                  onMouseEnter={() => playCardHoverSound()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    playCardHoverSound();
                    setCurrentIdx(idx);
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Redesigned 4 Luxury Glassmorphic Guarantee Cards */}
        <div className={styles.metricCardsGrid}>
          {/* Card 1: 1v1 Live Human Showdowns */}
          <div
            className={`${styles.metricCard} ${styles.metricCardEmerald}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #10B981, #059669)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚔️</div>
              <span className={styles.metricBadgeLive}>
                <span className={styles.statPulseDot} />
                {t("home.hero.guarantees.card_ai_badge")}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                {t("home.hero.guarantees.card_ai_metric")}
              </div>
              <div className={styles.metricTitle}>
                {t("home.hero.guarantees.card_ai_title")}
              </div>
              <div className={styles.metricSub}>
                {t("home.hero.guarantees.card_ai_sub")}
              </div>
            </div>
          </div>

          {/* Card 2: Instant Automated Cash Payouts */}
          <div
            className={`${styles.metricCard} ${styles.metricCardGold}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #F59E0B, #D97706)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>⚡</div>
              <span className={styles.metricBadgeOnline}>
                ⚡ {t("home.hero.guarantees.card_payout_badge")}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">{t("home.hero.guarantees.card_payout_metric")}</bdi>
              </div>
              <div className={styles.metricTitle}>
                {t("home.hero.guarantees.card_payout_title")}
              </div>
              <div className={styles.metricSub}>
                {t("home.hero.guarantees.card_payout_sub")}
              </div>
            </div>
          </div>

          {/* Card 3: 88% Winner Payout Rate */}
          <div
            className={`${styles.metricCard} ${styles.metricCardRuby}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #EC4899, #8B5CF6)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>🏆</div>
              <span className={styles.metricBadgePayout}>
                💎 {t("home.hero.guarantees.card_rate_badge")}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                {t("home.hero.guarantees.card_rate_metric")}
              </div>
              <div className={styles.metricTitle}>
                {t("home.hero.guarantees.card_rate_title")}
              </div>
              <div className={styles.metricSub}>
                {t("home.hero.guarantees.card_rate_sub")}
              </div>
            </div>
          </div>

          {/* Card 4: 100% Skill & Zero RNG */}
          <div
            className={`${styles.metricCard} ${styles.metricCardCyan}`}
            onMouseEnter={() => playCardHoverSound()}
          >
            <div className={styles.cardGlowLine} style={{ background: "linear-gradient(90deg, #3B82F6, #06B6D4)" }} />
            <div className={styles.metricCardHeader}>
              <div className={styles.metricIconWrap}>🛡️</div>
              <span className={styles.metricBadgeFair}>
                🔒 {t("home.hero.guarantees.card_fair_badge")}
              </span>
            </div>
            <div className={styles.metricCardBody}>
              <div className={styles.metricNumber}>
                <bdi dir="ltr">{t("home.hero.guarantees.card_fair_metric")}</bdi>
              </div>
              <div className={styles.metricTitle}>
                {t("home.hero.guarantees.card_fair_title")}
              </div>
              <div className={styles.metricSub}>
                {t("home.hero.guarantees.card_fair_sub")}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Pillars of Winning & Platform Trust */}
        <div className={styles.trustPillarsRow}>
          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>💎</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {t("home.hero.guarantees.pillar_skill_title") || (isRtl ? "العب واكسب بمهارتك" : "Play & Win With Pure Skill")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_skill_desc") || (isRtl
                  ? "الفائز يحصل على مجموع جوائز التحدي مع رسوم تنظيم منصة 12% فقط."
                  : "Winner takes the challenge prize pool directly with a 12% platform fee.")}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>⚡</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {t("home.hero.guarantees.pillar_payout_title") || (isRtl ? "سحب كاش فوري خلال 60 ثانية" : "Instant 60s Cash Payouts")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_payout_desc") || (isRtl
                  ? "الأرباح تصل مباشرة إلى محفظتك بعملة USDT المستقرة بدون شروط تعجيزية."
                  : "Winnings credit directly to your wallet in USDT with zero hold times.")}
              </span>
            </div>
          </div>

          <div className={styles.trustPillar}>
            <span className={styles.pillarIcon}>🔒</span>
            <div className={styles.pillarTextWrap}>
              <strong className={styles.pillarTitle}>
                {t("home.hero.guarantees.pillar_fair_title") || (isRtl ? "تحكيم عادل ومضاد للغش 100%" : "100% Provably Fair & Anti-Cheat")}
              </strong>
              <span className={styles.pillarDesc}>
                {t("home.hero.guarantees.pillar_fair_desc") || (isRtl
                  ? "خوارزميات حتمية مراقبة عبر السيرفر تضمن انتصار الأذكى تكتيكياً بدون أي عنصر حظ."
                  : "Pure deterministic skill. Authoritative server verification guarantees absolute integrity.")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
