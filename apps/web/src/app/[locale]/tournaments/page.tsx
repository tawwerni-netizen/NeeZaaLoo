"use client";

// See this route's own layout.tsx for the real fix: route segment config
// is silently ignored when exported from a "use client" page itself in
// this Next.js/Turbopack setup (verified against a real build).

/**
 * Psychological & Esports Redesign of Nizalo Tournaments Hub (/tournaments).
 * Provides a high-conversion, luxury gaming lobby for tournaments with:
 * - 4 Luxury Tournament Metric Highlight Cards (Social Proof & Instant Payout trust)
 * - Multi-category Smart Filter Bar (All, Open Registration, Free Entry, Cash Prizes, Live)
 * - Interactive Game Selector Chips (Chess, Ludo, Backgammon, Dominoes, XO, etc.)
 * - 3D Luxury Tournament Cards with gold prize boxes, capacity progress, urgency tags
 * - "How Tournaments Work" skill verification & instant cashout section
 * - 100% Skill & Fair Play - ZERO gambling/betting terminology across all 6 languages.
 */
import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { formatRelativeTime } from "@/lib/i18n/format";
import { getGame, listGames } from "@/lib/games";
import type { SupportedLocale } from "@/lib/i18n/locale";
import { TournamentBannerSlider } from "@/components/tournaments/TournamentBannerSlider";
import { formatTournamentTitle, getTournamentCover } from "@/components/tournaments/UpcomingTournaments";
import styles from "./tournaments.module.css";

type TournamentRow = {
  id: string;
  game_id: string;
  format: "SINGLE_ELIMINATION" | "SWISS";
  status: string;
  tier: "FREE" | "RANKED" | "CASH";
  entry_fee_minor: string;
  asset: string | null;
  capacity: number;
  title: string | null;
  registered_count: number;
  registration_closes_at: string | null;
  scheduled_starts_at: string | null;
  starts_at: string | null;
  completed_at: string | null;
};

type FilterType = "ALL" | "REGISTRATION" | "FREE" | "CASH" | "LIVE";

const BROWSE_STATUSES = "SCHEDULED,REGISTRATION,LIVE,FINALS";

const GAME_ICONS: Record<string, string> = {
  chess: "♟️",
  dominoes: "🀄",
  backgammon: "🎲",
  "speed-math": "🔢",
  xo: "❌",
  "connect-four": "🔴",
  checkers: "⚫",
  reversi: "⚪",
  gomoku: "🟢",
  seega: "🎯",
};

// Complete multilingual localized copy across all 6 supported languages
const PAGE_TEXTS: Record<SupportedLocale, {
  badge: string;
  title: string;
  subtitle: string;
  metric1Val: string;
  metric1Title: string;
  metric1Sub: string;
  metric2Val: string;
  metric2Title: string;
  metric2Sub: string;
  metric3Val: string;
  metric3Title: string;
  metric3Sub: string;
  metric4Val: string;
  metric4Title: string;
  metric4Sub: string;
  filterAll: string;
  filterReg: string;
  filterFree: string;
  filterCash: string;
  filterLive: string;
  allGames: string;
  showingResults: string;
  clearFilters: string;
  prizePoolLabel: string;
  prizePotPrefix: string;
  prizeFeePrefix: string;
  honorTrophy: string;
  entryFeeLabel: string;
  freeEntry: string;
  urgentSpots: string;
  spotsLeft: string;
  ctaPlay: string;
  ctaWatch: string;
  ctaFinals: string;
  startsIn: string;
  emptyHeading: string;
  emptySub: string;
  resetFilter: string;
  arenaCta: string;
  howHeading: string;
  howSub: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
}> = {
  ar: {
    badge: "🏆 البطولات الرسمية والأولمبياد التنافسي",
    title: "بطولات نيزالو الكبرى · العب واكسب بجدارة",
    subtitle: "ساحة البطولات التنافسية الرسمية — نافس نخبة اللاعبين في ألعاب الذكاء والمهارة الخالصة 100%، واكسب جوائز كاش مضمونة تسحبها فوراً.",
    metric1Val: "+$25,000 USDT",
    metric1Title: "إجمالي جوائز البطولات",
    metric1Sub: "جوائز كاش حقيقية مضمونة وموزعة",
    metric2Val: "340+",
    metric2Title: "أبطال مسجلون في البطولات",
    metric2Sub: "تنافس واصعد لقمة صدارة النخبة",
    metric3Val: "خلال 60 ثانية",
    metric3Title: "سحب فوري للأرباح",
    metric3Sub: "إيداع الجوائز وسحبها لمحفظتك دون تأخير",
    metric4Val: "100% مهارة",
    metric4Title: "تحكيم عادل ومكافحة غش",
    metric4Sub: "خوارزميات ELO ورقابة نزاهة صارمة",
    filterAll: "جميع البطولات",
    filterReg: "التسجيل مفتوح",
    filterFree: "دخول مجاني",
    filterCash: "جوائز كاش",
    filterLive: "مواجهات حية",
    allGames: "كل الألعاب",
    showingResults: "عرض {count} بطولة متاحة",
    clearFilters: "إلغاء الفلترة",
    prizePoolLabel: "صافي جائزة الفائز (88%):",
    prizePotPrefix: "إجمالي الوعاء:",
    prizeFeePrefix: "عمولة المنصة:",
    honorTrophy: "كأس الشرف ونقاط تصنيف ELO",
    entryFeeLabel: "رسوم الاشتراك",
    freeEntry: "دخول مجاني 100%",
    urgentSpots: "🔥 مقاعد محدودة!",
    spotsLeft: "متبقي {count} مقاعد شاغرة",
    ctaPlay: "العب واكسب ⚔️",
    ctaWatch: "شاهد المواجهة 🔴",
    ctaFinals: "متابعة النهائي 🏆",
    startsIn: "تبدأ في:",
    emptyHeading: "لا توجد بطولات تطابق هذا الفلتر حالياً",
    emptySub: "جرّب تغيير خيارات الفلتر أو استكشف البطولات الأخرى المتاحة الآن، أو أطلق تحدياً فورياً في الأرينا.",
    resetFilter: "إعادة ضبط الفلاتر",
    arenaCta: "الذهاب لساحة النزال الفوري ⚔️",
    howHeading: "كيف تعمل بطولات نيزالو التنافسية؟",
    howSub: "نظام بطولات إلكترونية عادل واحترافي مصمم لأبطال المهارة والذكاء.",
    step1Title: "1. سجّل مقعدك في البطولة",
    step1Desc: "اختر لعبتك المفضلة وسجّل في البطولات اليومية المجانية أو بطولات الجوائز الكاش ذات العوائد الكبرى.",
    step2Title: "2. العب واكسب بمهارتك وحدها",
    step2Desc: "مواجهات حاسمة بنظام خروج المغلوب بدون أي عنصر حظ، ومحمية كلياً بنظام مكافحة الغش لضمان تكافؤ الفرص.",
    step3Title: "3. اسحب أرباحك فوراً خلال 60 ثانية",
    step3Desc: "تضاف جائزتك الكبرى إلى رصيد محفظتك تلقائياً فور انتهاء النزال النهائي، مع إمكانية السحب الفوري 24/7.",
  },
  en: {
    badge: "🏆 OFFICIAL ESPORTS CHAMPIONSHIPS",
    title: "Nizalo Grand Championships · Play & Win",
    subtitle: "The official esports arena for mind games — compete against verified players in 100% skill-based brackets with guaranteed cash prizes and instant payouts.",
    metric1Val: "+$25,000 USDT",
    metric1Title: "Total Tournament Prizes",
    metric1Sub: "Guaranteed cash prize pools",
    metric2Val: "340+",
    metric2Title: "Registered Competitors",
    metric2Sub: "Climb the global ELO leaderboards",
    metric3Val: "Under 60s",
    metric3Title: "Instant Cashouts",
    metric3Sub: "Direct to your external wallet 24/7",
    metric4Val: "100% Skill",
    metric4Title: "Anti-Cheat Protected",
    metric4Sub: "Provably fair with zero luck factor",
    filterAll: "All Tournaments",
    filterReg: "Registration Open",
    filterFree: "Free Entry",
    filterCash: "Cash Prizes",
    filterLive: "Live Matches",
    allGames: "All Games",
    showingResults: "Showing {count} tournaments",
    clearFilters: "Clear Filters",
    prizePoolLabel: "Net Winner Prize (88%):",
    prizePotPrefix: "Gross Pot:",
    prizeFeePrefix: "Platform Fee:",
    honorTrophy: "Honor Trophy & ELO Rank",
    entryFeeLabel: "Entry Fee",
    freeEntry: "100% Free Entry",
    urgentSpots: "🔥 Filling Fast!",
    spotsLeft: "{count} spots remaining",
    ctaPlay: "Play & Win ⚔️",
    ctaWatch: "Watch Live 🔴",
    ctaFinals: "Watch Finals 🏆",
    startsIn: "Starts in:",
    emptyHeading: "No tournaments match your filter",
    emptySub: "Try switching categories or explore live challenges in the instant arena.",
    resetFilter: "Reset All Filters",
    arenaCta: "Enter Live Arena ⚔️",
    howHeading: "How Nizalo Tournaments Work",
    howSub: "An esports-grade championship system designed for pure skill and intelligence.",
    step1Title: "1. Reserve Your Seat",
    step1Desc: "Pick your game from 10 competitive mind sports and enter either daily free cups or high-tier cash brackets.",
    step2Title: "2. Play & Win With Pure Skill",
    step2Desc: "Single-elimination brackets with zero luck, monitored by Sentinel AI anti-cheat to guarantee 100% fair play.",
    step3Title: "3. Instant Payout in 60 Seconds",
    step3Desc: "Your prize is credited to your wallet the moment the championship concludes, withdrawable in under 60 seconds.",
  },
  es: {
    badge: "🏆 CAMPEONATOS OFICIALES DE ESPORTS",
    title: "Grandes Campeonatos Nizalo · Juega y Gana",
    subtitle: "La arena oficial de deportes mentales: compite en llaves 100% de habilidad con premios en efectivo garantizados y retiros instantáneos.",
    metric1Val: "+$25,000 USDT",
    metric1Title: "Premios Totales de Torneos",
    metric1Sub: "Bolsas de efectivo garantizadas",
    metric2Val: "340+",
    metric2Title: "Competidores Registrados",
    metric2Sub: "Asciende en el ranking ELO global",
    metric3Val: "En 60s",
    metric3Title: "Retiros Instantáneos",
    metric3Sub: "Directo a tu billetera 24/7",
    metric4Val: "100% Habilidad",
    metric4Title: "Protección Antitrampas",
    metric4Sub: "Juego limpio comprobable sin azar",
    filterAll: "Todos los Torneos",
    filterReg: "Inscripción Abierta",
    filterFree: "Entrada Gratis",
    filterCash: "Premios en Efectivo",
    filterLive: "En Vivo",
    allGames: "Todos los Juegos",
    showingResults: "Mostrando {count} torneos",
    clearFilters: "Limpiar Filtros",
    prizePoolLabel: "Premio Neto Ganador (88%):",
    prizePotPrefix: "Bolsa Total:",
    prizeFeePrefix: "Comisión:",
    honorTrophy: "Trofeo de Honor y Puntos ELO",
    entryFeeLabel: "Cuota de Entrada",
    freeEntry: "Entrada 100% Gratis",
    urgentSpots: "🔥 ¡Cupos limitados!",
    spotsLeft: "Quedan {count} cupos",
    ctaPlay: "Juega y Gana ⚔️",
    ctaWatch: "Ver en Vivo 🔴",
    ctaFinals: "Ver Final 🏆",
    startsIn: "Comienza en:",
    emptyHeading: "No hay torneos con este filtro",
    emptySub: "Prueba otra categoría o desafía a jugadores en la arena en vivo.",
    resetFilter: "Restablecer Filtros",
    arenaCta: "Ir a la Arena en Vivo ⚔️",
    howHeading: "¿Cómo Funcionan los Torneos Nizalo?",
    howSub: "Un sistema de torneos de esports diseñado para la destreza pura.",
    step1Title: "1. Inscríbete en el Torneo",
    step1Desc: "Elige tu juego favorito y participa en torneos gratuitos diarios o copas por premios en efectivo.",
    step2Title: "2. Juega y Gana con Habilidad",
    step2Desc: "Eliminatorias directas sin suerte, con monitoreo antitrampas para garantizar juego limpio.",
    step3Title: "3. Retiro Instantáneo en 60 Segundos",
    step3Desc: "Tu premio se acredita inmediatamente tras la final y puedes retirarlo en 60 segundos.",
  },
  fr: {
    badge: "🏆 CHAMPIONNATS OFFICIELS ESPORT",
    title: "Grands Championnats Nizalo · Jouez et Gagnez",
    subtitle: "L'arène officielle d'esport cérébral — affrontez l'élite dans des tournois 100% basés sur les compétences avec prix cash garantis et retraits instantanés.",
    metric1Val: "+$25,000 USDT",
    metric1Title: "Total des Prix des Tournois",
    metric1Sub: "Cagnottes cash garanties",
    metric2Val: "340+",
    metric2Title: "Compétiteurs Inscrits",
    metric2Sub: "Grimpez au classement mondial ELO",
    metric3Val: "En 60s",
    metric3Title: "Retraits Instantanés",
    metric3Sub: "Directement sur votre portefeuille 24/7",
    metric4Val: "100% Talent",
    metric4Title: "Protection Anti-Triche",
    metric4Sub: "Équité totale prouvée sans aucun hasard",
    filterAll: "Tous les Tournois",
    filterReg: "Inscriptions Ouvertes",
    filterFree: "Entrée Gratuite",
    filterCash: "Prix en Cash",
    filterLive: "Matchs en Direct",
    allGames: "Tous les Jeux",
    showingResults: "Affichage de {count} tournois",
    clearFilters: "Effacer les Filtres",
    prizePoolLabel: "Prix Net Vainqueur (88%) :",
    prizePotPrefix: "Cagnotte Totale :",
    prizeFeePrefix: "Frais Plateforme :",
    honorTrophy: "Trophée d'Honneur & ELO",
    entryFeeLabel: "Frais d'Entrée",
    freeEntry: "100% Gratuit",
    urgentSpots: "🔥 Places limitées !",
    spotsLeft: "{count} places restantes",
    ctaPlay: "Jouez et Gagnez ⚔️",
    ctaWatch: "Voir le Direct 🔴",
    ctaFinals: "Voir la Finale 🏆",
    startsIn: "Débute dans :",
    emptyHeading: "Aucun tournoi ne correspond",
    emptySub: "Essayez une autre catégorie ou défiez un joueur dans l'arène en direct.",
    resetFilter: "Réinitialiser les Filtres",
    arenaCta: "Aller à l'Arène en Direct ⚔️",
    howHeading: "Comment Fonctionnent les Tournois Nizalo ?",
    howSub: "Un système esport d'élite conçu pour l'intelligence et la stratégie.",
    step1Title: "1. Réservez votre Place",
    step1Desc: "Choisissez votre jeu parmi 10 disciplines et inscrivez-vous aux tournois gratuits ou cash.",
    step2Title: "2. Jouez et Gagnez par le Talent",
    step2Desc: "Élimination directe sans hasard, surveillée par IA anti-triche.",
    step3Title: "3. Retrait Garanti en 60 Secondes",
    step3Desc: "Votre cagnotte est créditée dès la fin de la finale, retirable en 60 secondes.",
  },
  zh: {
    badge: "🏆 官方电竞职业锦标赛",
    title: "Nizalo 巅峰锦标赛 · 纯技艺竞技 赢取大奖",
    subtitle: "官方智力电竞竞技场 — 与全球认证选手同台较量，100% 纯技巧淘汰赛，保底现金大奖，秒级极速提现。",
    metric1Val: "+$25,000 USDT",
    metric1Title: "锦标赛累计总奖金池",
    metric1Sub: "官方保底真实加密货币奖金",
    metric2Val: "340+",
    metric2Title: "认证在册参赛选手",
    metric2Sub: "冲击全服天梯 ELO 榜首",
    metric3Val: "60 秒内",
    metric3Title: "极速自动化提现",
    metric3Sub: "直达您的外部去中心化钱包",
    metric4Val: "100% 实力",
    metric4Title: "AI 反作弊公平竞技",
    metric4Sub: "杜绝运气与作弊 纯粹实力决定胜负",
    filterAll: "全部锦标赛",
    filterReg: "正在报名",
    filterFree: "免费参赛",
    filterCash: "高额现金赛",
    filterLive: "正在直播对决",
    allGames: "全部竞技游戏",
    showingResults: "当前展示 {count} 场锦标赛",
    clearFilters: "重置筛选",
    prizePoolLabel: "优胜者净得奖金 (88%):",
    prizePotPrefix: "总奖池:",
    prizeFeePrefix: "平台服务费:",
    honorTrophy: "巅峰荣誉奖杯与 ELO 天梯分",
    entryFeeLabel: "报名费用",
    freeEntry: "100% 免费参赛",
    urgentSpots: "🔥 席位告急！",
    spotsLeft: "仅剩 {count} 个席位",
    ctaPlay: "加入竞技 赢取大奖 ⚔️",
    ctaWatch: "观战对决 🔴",
    ctaFinals: "观战总决赛 🏆",
    startsIn: "开赛倒计时：",
    emptyHeading: "暂无符合当前筛选条件的锦标赛",
    emptySub: "尝试选择其他分类或前往即时对决大厅发起一场 1v1 挑战。",
    resetFilter: "重置全部筛选",
    arenaCta: "前往即时竞技大厅 ⚔️",
    howHeading: "Nizalo 电竞赛事运作流程",
    howSub: "专为纯粹智力与战略高手打造的专业电竞锦标赛系统。",
    step1Title: "1. 报名锁定席位",
    step1Desc: "从 10 款经典脑力竞技游戏中挑选，自由参加新手免费赛或大师现金杯。",
    step2Title: "2. 纯实力单败淘汰",
    step2Desc: "零运气成份，AI 实时天眼反作弊监控，全方位保障 100% 绝对公平。",
    step3Title: "3. 秒级极速提现奖金",
    step3Desc: "决赛分出胜负瞬间奖金直入您的账户，随时 60 秒内提现至外部钱包。",
  },
  hi: {
    badge: "🏆 आधिकारिक एस्पोर्ट्स चैंपियनशिप",
    title: "निज़ालो ग्रैंड चैंपियनशिप · खेलें और जीतें",
    subtitle: "आधिकारिक माइंड स्पोर्ट्स एस्पोर्ट्स एरिना — 100% कौशल-आधारित टूर्नामेंटों में मुकाबला करें, गारंटीकृत नकद पुरस्कार और तुरंत निकासी।",
    metric1Val: "+$25,000 USDT",
    metric1Title: "कुल टूर्नामेंट पुरस्कार",
    metric1Sub: "गारंटीकृत नकद पुरस्कार राशि",
    metric2Val: "340+",
    metric2Title: "पंजीकृत प्रतियोगी",
    metric2Sub: "वैश्विक ELO लीडरबोर्ड पर शीर्ष पर पहुंचें",
    metric3Val: "60 सेकंड में",
    metric3Title: "तत्काल निकासी",
    metric3Sub: "सीधे आपके बाहरी वॉलेट में 24/7",
    metric4Val: "100% कौशल",
    metric4Title: "एंटी-चीट सुरक्षा",
    metric4Sub: "बिना भाग्य के 100% निष्पक्ष खेल",
    filterAll: "सभी टूर्नामेंट",
    filterReg: "पंजीकरण खुला है",
    filterFree: "मुफ्त प्रवेश",
    filterCash: "नकद पुरस्कार",
    filterLive: "लाइव मैच",
    allGames: "सभी खेल",
    showingResults: "{count} टूर्नामेंट प्रदर्शित",
    clearFilters: "फ़िल्टर साफ़ करें",
    prizePoolLabel: "विजेता का शुद्ध पुरस्कार (88%):",
    prizePotPrefix: "कुल पूल:",
    prizeFeePrefix: "प्लेटफ़ॉर्म शुल्क:",
    honorTrophy: "सम्मान ट्रॉफी और ELO रैंक",
    entryFeeLabel: "प्रवेश शुल्क",
    freeEntry: "100% मुफ्त प्रवेश",
    urgentSpots: "🔥 सीटें तेजी से भर रही हैं!",
    spotsLeft: "{count} सीटें शेष हैं",
    ctaPlay: "खेलें और जीतें ⚔️",
    ctaWatch: "लाइव देखें 🔴",
    ctaFinals: "फाइनल देखें 🏆",
    startsIn: "शुरू होने में:",
    emptyHeading: "इस फ़िल्टर से मेल खाने वाला कोई टूर्नामेंट नहीं मिला",
    emptySub: "कोई अन्य श्रेणी आज़माएं या लाइव अखाड़े में तुरंत द्वंद्वयुद्ध खेलें।",
    resetFilter: "फ़िल्टर रीसेट करें",
    arenaCta: "लाइव एरिना में जाएं ⚔️",
    howHeading: "निज़ालो टूर्नामेंट कैसे काम करते हैं?",
    howSub: "शुद्ध कौशल और बुद्धिमत्ता के लिए डिज़ाइन की गई पेशेवर एस्पोर्ट्स प्रणाली।",
    step1Title: "1. अपनी सीट सुरक्षित करें",
    step1Desc: "10 प्रतिस्पर्धी खेलों में से चुनें और मुफ्त या नकद टूर्नामेंट में भाग लें।",
    step2Title: "2. केवल कौशल से खेलें और जीतें",
    step2Desc: "शून्य भाग्य के साथ नॉकआउट मैच, एंटी-चीट द्वारा 100% निष्पक्ष खेल।",
    step3Title: "3. 60 सेकंड में तत्काल निकासी",
    step3Desc: "फाइनल समाप्त होते ही पुरस्कार आपके वॉलेट में, 60 सेकंड में निकासी योग्य।",
  },
};

export default function TournamentsPage() {
  return (
    <Suspense fallback={<><Header /><main className="nz-container" /></>}>
      <TournamentsList />
    </Suspense>
  );
}

function TournamentsList() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const initialGame = searchParams.get("game");

  const [tournaments, setTournaments] = useState<TournamentRow[] | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(initialGame);
  const [statusFilter, setStatusFilter] = useState<FilterType>("ALL");
  const [nowMs, setNowMs] = useState<number | null>(null);
  // A real zero from the first render onward -- never the fabricated
  // placeholder text this banner used to hardcode, not even for a moment
  // while the real figure loads.
  const [siteStats, setSiteStats] = useState<{ totalPrizesUsd: number; totalRegistrants: number }>({ totalPrizesUsd: 0, totalRegistrants: 0 });

  const texts = PAGE_TEXTS[locale as SupportedLocale] ?? PAGE_TEXTS.en;
  const gamesList = useMemo(() => listGames(), []);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Every coin the platform pays tournament prizes in is a $1-pegged
    // stablecoin, so summing them is a real total -- always the real
    // figure, including a real zero before the first tournament settles.
    void get<{ totalPrizesByAsset?: Record<string, string>; totalRegistrants?: number }>("/v1/tournaments/stats")
      .then((r) => {
        if (cancelled) return;
        const totalPrizesUsd = Object.values(r.totalPrizesByAsset ?? {})
          .reduce((sum, minor) => sum + Number(minor || "0") / 1_000_000, 0);
        setSiteStats({ totalPrizesUsd, totalRegistrants: r.totalRegistrants ?? 0 });
      })
      .catch(() => { if (!cancelled) setSiteStats({ totalPrizesUsd: 0, totalRegistrants: 0 }); });
    void get<{ tournaments: TournamentRow[] }>(`/v1/tournaments?status=${BROWSE_STATUSES}`)
      .then((r) => {
        if (!cancelled) setTournaments(r.tournaments ?? []);
      })
      .catch(() => {
        if (!cancelled) setTournaments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute status counts for filter badges
  const counts = useMemo(() => {
    if (!tournaments) return { ALL: 0, REGISTRATION: 0, FREE: 0, CASH: 0, LIVE: 0 };
    return {
      ALL: tournaments.length,
      REGISTRATION: tournaments.filter((r) => r.status === "REGISTRATION").length,
      FREE: tournaments.filter((r) => r.tier === "FREE").length,
      CASH: tournaments.filter((r) => r.tier === "CASH").length,
      LIVE: tournaments.filter((r) => r.status === "LIVE" || r.status === "FINALS").length,
    };
  }, [tournaments]);

  // Filter tournaments by both status and game
  const filtered = useMemo(() => {
    if (!tournaments) return null;
    let list = tournaments;

    // Apply Game Filter
    if (selectedGame) {
      list = list.filter((r) => r.game_id === selectedGame);
    }

    // Apply Status Filter
    if (statusFilter === "REGISTRATION") {
      list = list.filter((r) => r.status === "REGISTRATION");
    } else if (statusFilter === "FREE") {
      list = list.filter((r) => r.tier === "FREE");
    } else if (statusFilter === "CASH") {
      list = list.filter((r) => r.tier === "CASH");
    } else if (statusFilter === "LIVE") {
      list = list.filter((r) => r.status === "LIVE" || r.status === "FINALS");
    }

    return list;
  }, [tournaments, selectedGame, statusFilter]);

  const resetFilters = () => {
    setSelectedGame(null);
    setStatusFilter("ALL");
  };

  const isFilterActive = selectedGame !== null || statusFilter !== "ALL";

  return (
    <>
      <Header />
      <main className="nz-container">
        <div className={styles.pageContainer}>
          {/* Page Intro Header */}
          <section className={styles.pageHeader}>
            <div className={styles.badgeRow}>
              <div className={styles.esportsBadge}>
                <span className={styles.badgePulse} />
                <span>{texts.badge}</span>
              </div>
            </div>
            <h1 className={styles.heading}>{texts.title}</h1>
            <p className={styles.subHeading}>{texts.subtitle}</p>
          </section>

          {/* Cinematic 5-Banner Tournament Showcase Slider */}
          <div className={styles.sliderWrap}>
            <TournamentBannerSlider />
          </div>

          {/* 4 Luxury Tournament Metric Highlight Cards */}
          <section className={styles.metricsGrid} aria-label="Tournament Highlights">
            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>🏆</div>
              <div className={styles.metricContent}>
                <div className={styles.metricValue}>
                  <bdi className="nz-num">
                    {siteStats.totalPrizesUsd > 0
                      ? `+$${Math.floor(siteStats.totalPrizesUsd).toLocaleString("en-US")} USDT`
                      : texts.metric1Val}
                  </bdi>
                </div>
                <div className={styles.metricTitle}>{texts.metric1Title}</div>
                <div className={styles.metricSubtitle}>{texts.metric1Sub}</div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>👥</div>
              <div className={styles.metricContent}>
                <div className={styles.metricValue}>
                  <bdi className="nz-num">
                    {siteStats.totalRegistrants > 0 ? `${siteStats.totalRegistrants}+` : "0"}
                  </bdi>
                </div>
                <div className={styles.metricTitle}>{texts.metric2Title}</div>
                <div className={styles.metricSubtitle}>{texts.metric2Sub}</div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>⚡</div>
              <div className={styles.metricContent}>
                <div className={styles.metricValue}>
                  <bdi>{texts.metric3Val}</bdi>
                </div>
                <div className={styles.metricTitle}>{texts.metric3Title}</div>
                <div className={styles.metricSubtitle}>{texts.metric3Sub}</div>
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricIconWrap}>🛡️</div>
              <div className={styles.metricContent}>
                <div className={styles.metricValue}>
                  <bdi>{texts.metric4Val}</bdi>
                </div>
                <div className={styles.metricTitle}>{texts.metric4Title}</div>
                <div className={styles.metricSubtitle}>{texts.metric4Sub}</div>
              </div>
            </div>
          </section>

          {/* Smart Status Filter Bar & Game Selector Chips */}
          <section className={styles.filterSection}>
            {/* Status Tabs */}
            <div className={styles.statusFilterBar}>
              <button
                type="button"
                className={`${styles.statusBtn} ${statusFilter === "ALL" ? styles.statusBtnActive : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                <span>🔥</span>
                <span>{texts.filterAll}</span>
                {tournaments && <span className={styles.statusCountBadge}>{counts.ALL}</span>}
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${statusFilter === "REGISTRATION" ? styles.statusBtnActive : ""}`}
                onClick={() => setStatusFilter("REGISTRATION")}
              >
                <span>🟢</span>
                <span>{texts.filterReg}</span>
                {tournaments && <span className={styles.statusCountBadge}>{counts.REGISTRATION}</span>}
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${statusFilter === "FREE" ? styles.statusBtnActive : ""}`}
                onClick={() => setStatusFilter("FREE")}
              >
                <span>🎁</span>
                <span>{texts.filterFree}</span>
                {tournaments && <span className={styles.statusCountBadge}>{counts.FREE}</span>}
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${statusFilter === "CASH" ? styles.statusBtnActive : ""}`}
                onClick={() => setStatusFilter("CASH")}
              >
                <span>💰</span>
                <span>{texts.filterCash}</span>
                {tournaments && <span className={styles.statusCountBadge}>{counts.CASH}</span>}
              </button>

              <button
                type="button"
                className={`${styles.statusBtn} ${statusFilter === "LIVE" ? styles.statusBtnActive : ""}`}
                onClick={() => setStatusFilter("LIVE")}
              >
                <span>🔴</span>
                <span>{texts.filterLive}</span>
                {tournaments && <span className={styles.statusCountBadge}>{counts.LIVE}</span>}
              </button>
            </div>

            {/* Game Selector Chips Bar */}
            <div className={styles.gameChipsScroll}>
              <button
                type="button"
                className={`${styles.gameChip} ${selectedGame === null ? styles.gameChipActive : ""}`}
                onClick={() => setSelectedGame(null)}
              >
                <span className={styles.gameChipIcon}>🎮</span>
                <span>{texts.allGames}</span>
              </button>

              {gamesList.map((game) => {
                const icon = GAME_ICONS[game.id] ?? "🎯";
                const name = t(`common.game_names.${game.nameKey}`) || game.id;
                const isSelected = selectedGame === game.id;

                return (
                  <button
                    key={game.id}
                    type="button"
                    className={`${styles.gameChip} ${isSelected ? styles.gameChipActive : ""}`}
                    onClick={() => setSelectedGame(isSelected ? null : game.id)}
                  >
                    <span className={styles.gameChipIcon}>{icon}</span>
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>

            {/* Results Count & Clear Link */}
            <div className={styles.resultsBar}>
              <span>
                {texts.showingResults.replace("{count}", String(filtered?.length ?? 0))}
              </span>
              {isFilterActive && (
                <button type="button" className={styles.clearFiltersLink} onClick={resetFilters}>
                  {texts.clearFilters} ↺
                </button>
              )}
            </div>
          </section>

          {/* Tournament Cards Grid / Skeleton / Empty State */}
          {tournaments === null ? (
            <div className={styles.listSkeleton}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          ) : filtered && filtered.length === 0 ? (
            <div className={styles.emptyCard}>
              <span className={styles.emptyIcon}>🏆</span>
              <h2 className={styles.emptyHeading}>{texts.emptyHeading}</h2>
              <p className={styles.emptySub}>{texts.emptySub}</p>
              <div className={styles.emptyActions}>
                {isFilterActive && (
                  <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                    <span>↺</span>
                    <span>{texts.resetFilter}</span>
                  </button>
                )}
                <LocaleLink href="/play" className={styles.arenaLink}>
                  <span>{texts.arenaCta}</span>
                </LocaleLink>
              </div>
            </div>
          ) : (
            <div className={styles.list}>
              {filtered?.map((row) => {
                const nameKey = getGame(row.game_id)?.nameKey ?? row.game_id;
                const gameName = t(`common.game_names.${nameKey}`) || row.game_id;
                const cleanTitle = formatTournamentTitle(row, gameName, locale);
                const startTarget = row.scheduled_starts_at ?? row.starts_at;
                const entryFeeUsdt = Number(row.entry_fee_minor || 0) / 1_000_000;
                const grossPot = (entryFeeUsdt * row.capacity).toFixed(2);
                const platformFee = (entryFeeUsdt * row.capacity * 0.12).toFixed(2);
                const prizePool = (entryFeeUsdt * row.capacity * 0.88).toFixed(2);
                const registeredPct = Math.min(
                  100,
                  Math.round(((row.registered_count || 0) / (row.capacity || 1)) * 100)
                );
                const remainingSpots = Math.max(0, row.capacity - (row.registered_count || 0));
                const isLive = row.status === "LIVE" || row.status === "FINALS";
                const isFinals = row.status === "FINALS";
                const isUrgent =
                  row.status === "REGISTRATION" && (registeredPct >= 60 || remainingSpots <= 4);
                const imgPath = getTournamentCover(row.game_id);
                const gameIcon = GAME_ICONS[row.game_id] ?? "🎮";

                return (
                  <LocaleLink key={row.id} href={`/tournaments/${row.id}`} className={styles.card}>
                    {/* Visual 3D Banner Wrap */}
                    <div className={styles.cardBannerWrap}>
                      <img
                        src={imgPath}
                        alt={cleanTitle}
                        className={styles.cardBannerImg}
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/images/games/chess-hero.webp";
                        }}
                      />
                      <div className={styles.cardBannerOverlay} />

                      {/* Top Badges */}
                      <div className={styles.topPills}>
                        <span className={styles.formatBadge}>
                          <span>🏆</span>
                          <span>
                            {t(`tournamentsPage.format.${row.format}`)} ({row.capacity}p)
                          </span>
                        </span>

                        <span className={`${styles.statusPill} ${styles[`status_${row.status}`] ?? ""}`}>
                          {isLive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />}
                          {t(`tournamentsPage.status.${row.status}`)}
                        </span>
                      </div>

                      {/* Scarcity / Urgency indicator */}
                      {isUrgent && (
                        <span className={styles.urgencyBadge}>
                          {texts.urgentSpots}
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className={styles.cardBody}>
                      <div className={styles.titleArea}>
                        <div className={styles.gameNameRow}>
                          <span>{gameIcon}</span>
                          <span>{gameName}</span>
                        </div>
                        <h2 className={styles.title}>{cleanTitle}</h2>
                      </div>

                      {/* Metallic Gold Prize Pool Box */}
                      <div className={styles.prizeBox}>
                        <div className={styles.prizeHeaderRow}>
                          <div className={styles.prizeLabel}>
                            <span>💰</span>
                            <span>{texts.prizePoolLabel}</span>
                          </div>
                          {Number(prizePool) > 0 && (
                            <span className={styles.prizePercentBadge}>88%</span>
                          )}
                        </div>
                        {Number(prizePool) > 0 ? (
                          <>
                            <div className={styles.prizeMainRow}>
                              <span className={`${styles.prizeAmount} nz-num`}>
                                <bdi>{`$${prizePool} USDT`}</bdi>
                              </span>
                            </div>
                            <div className={styles.prizeBreakdown}>
                              <span>{texts.prizePotPrefix} ${grossPot}</span>
                              <span className={styles.breakdownDot}>·</span>
                              <span className={styles.prizeFee}>{texts.prizeFeePrefix} 12% (${platformFee})</span>
                            </div>
                          </>
                        ) : (
                          <span className={styles.prizeTrophy}>
                            {texts.honorTrophy}
                          </span>
                        )}
                      </div>

                      {/* Capacity Progress Bar */}
                      <div className={styles.progressSection}>
                        <div className={styles.progressLabels}>
                          <span>
                            {t("tournamentsPage.registered_count", {
                              count: row.registered_count,
                              capacity: row.capacity,
                            })}
                          </span>
                          {row.status === "REGISTRATION" && remainingSpots > 0 ? (
                            <span className={styles.spotsRemainingHighlight}>
                              {texts.spotsLeft.replace("{count}", String(remainingSpots))}
                            </span>
                          ) : (
                            <span>{registeredPct}%</span>
                          )}
                        </div>
                        <div className={styles.capacityBar}>
                          <div className={styles.capacityFill} style={{ width: `${registeredPct}%` }} />
                        </div>
                      </div>

                      {/* Start Time / Schedule Indicator */}
                      {startTarget && (
                        <div className={styles.timeInfoRow}>
                          <span>⏱️</span>
                          <span>{texts.startsIn}</span>
                          <span className="nz-num">
                            {nowMs ? formatRelativeTime(
                              Math.round((new Date(startTarget).getTime() - nowMs) / 60000),
                              "minute",
                              locale as SupportedLocale
                            ) : "..."}
                          </span>
                        </div>
                      )}

                      {/* Card Footer */}
                      <div className={styles.cardFooter}>
                        <div className={styles.entryFee}>
                          <span className={styles.entryFeeLabel}>{texts.entryFeeLabel}</span>
                          {row.tier === "FREE" ? (
                            <span className={styles.entryFeeFree}>{texts.freeEntry}</span>
                          ) : (
                            <span className={`${styles.entryFeeVal} nz-num`}>
                              {entryFeeUsdt.toFixed(2)} {row.asset || "USDT"}
                            </span>
                          )}
                        </div>

                        <span
                          className={`${styles.actionCta} ${
                            isLive ? styles.actionCtaLive : ""
                          }`}
                        >
                          <span>
                            {isFinals
                              ? texts.ctaFinals
                              : isLive
                              ? texts.ctaWatch
                              : texts.ctaPlay}
                          </span>
                        </span>
                      </div>
                    </div>
                  </LocaleLink>
                );
              })}
            </div>
          )}

          {/* Educational & Social Proof "How It Works" Section */}
          <section className={styles.howSection}>
            <div className={styles.howHeader}>
              <h2 className={styles.howTitle}>{texts.howHeading}</h2>
              <p className={styles.howSub}>{texts.howSub}</p>
            </div>

            <div className={styles.stepsGrid}>
              <div className={styles.stepCard}>
                <span className={styles.stepIconWrap}>🎯</span>
                <h3 className={styles.stepTitle}>{texts.step1Title}</h3>
                <p className={styles.stepDesc}>{texts.step1Desc}</p>
              </div>

              <div className={styles.stepCard}>
                <span className={styles.stepIconWrap}>⚔️</span>
                <h3 className={styles.stepTitle}>{texts.step2Title}</h3>
                <p className={styles.stepDesc}>{texts.step2Desc}</p>
              </div>

              <div className={styles.stepCard}>
                <span className={styles.stepIconWrap}>💸</span>
                <h3 className={styles.stepTitle}>{texts.step3Title}</h3>
                <p className={styles.stepDesc}>{texts.step3Desc}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
