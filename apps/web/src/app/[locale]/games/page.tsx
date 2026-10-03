"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { GameRegistry, type GameDefinition, type GameCategory } from "@/lib/games";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import styles from "./games.module.css";

const CATEGORIES_SPEC: Array<{ id: GameCategory; icon: string; labelEn: string; labelAr: string }> = [
  { id: "ALL", icon: "🌟", labelEn: "All Games", labelAr: "جميع الألعاب" },
  { id: "STRATEGY", icon: "🧠", labelEn: "Strategy", labelAr: "استراتيجية" },
  { id: "SPEED", icon: "⚡", labelEn: "Speed & Reflexes", labelAr: "السرعة والبديهة" },
  { id: "BOARD", icon: "🎲", labelEn: "Board & Tabletop", labelAr: "ألعاب الطاولة" },
  { id: "CASUAL", icon: "🎯", labelEn: "Casual & Quick", labelAr: "سريعة وتنافسية" },
  { id: "SKILL", icon: "🏆", labelEn: "Skill Games", labelAr: "ألعاب المهارة" },
  { id: "FREE_TO_PLAY", icon: "🆓", labelEn: "Free to Play", labelAr: "لعب مجاني" },
  { id: "CASH_ELIGIBLE", icon: "💰", labelEn: "Cash Eligible", labelAr: "مبارزات الجوائز" },
  { id: "AVAILABLE_NOW", icon: "🟢", labelEn: "Available Now", labelAr: "متاحة الآن" },
  { id: "POPULAR", icon: "🔥", labelEn: "Popular", labelAr: "الأكثر طلباً" },
  { id: "NEW", icon: "✨", labelEn: "New Releases", labelAr: "إصدارات جديدة" },
];

const ONBOARDING_I18N: Record<string, {
  q1: string; a1: string;
  q2: string; a2: string;
  q3: string; a3: string;
  searchPlaceholder: string;
  clearSearch: string;
  emptyTitle: string;
  emptyDesc: string;
  resetFilter: string;
  durationLabel: string;
  modeLabel: string;
  skillLabel: string;
  rngLabel: string;
  playersInArena: string;
  playCta: string;
  rulesCta: string;
  hubTitle: string;
  hubSub: string;
  coreActionLabel: string;
  winningGoalLabel: string;
  instantPracticeCta: string;
  arenaCta: string;
}> = {
  ar: {
    q1: "ماذا يمكنني أن ألعب؟",
    a1: "11 لعبة ذهنية وتكتيكية معتمدة رسمياً. تحكيم آلي حازم، بدون أي أفضلية للدار، وتنافس عادل 100%.",
    q2: "كم تبلغ تكلفة اللعب؟",
    a2: "مجانية بالكامل للتدريب والنزالات الودية، أو مبارزات كاش تبدأ من 1$ إلى 2,000$ بسحب USDT فوري.",
    q3: "كيف أبدأ الآن؟",
    a3: "اختر لعبتك المفضلة أدناه، واضغط «العب الآن» للانضمام إلى نزال مباشر خلال أقل من 5 ثوانٍ.",
    searchPlaceholder: "ابحث عن لعبة بالاسم أو الفئة...",
    clearSearch: "مسح",
    emptyTitle: "لا توجد ألعاب تطابق بحثك",
    emptyDesc: "جرّب تغيير كلمات البحث أو إعادة تعيين الفلاتر لاستعراض جميع الألعاب الـ 11.",
    resetFilter: "عرض جميع الألعاب",
    durationLabel: "المدة",
    modeLabel: "النمط",
    skillLabel: "المستوى",
    rngLabel: "النموذج",
    playersInArena: "لاعب في الميدان",
    playCta: "العب الآن",
    rulesCta: "القواعد والاستراتيجية",
    hubTitle: "مركز ألعاب نيزالو التنافسية",
    hubSub: "11 رياضة ذهنية معتمدة. اختر لعبتك، تعرّف على قواعدها وتكتيكاتها، وانطلق في النزال فوراً.",
    coreActionLabel: "طريقة اللعب:",
    winningGoalLabel: "شرط الفوز:",
    instantPracticeCta: "تجربة فورية ⚡",
    arenaCta: "دخول الأرينا ⚔️",
  },
  en: {
    q1: "What can I play?",
    a1: "11 authentic, certified mind sports & tabletop games. Deterministic rules, zero house edge, 100% player skill.",
    q2: "How much does it cost?",
    a2: "100% Free practice & friendly duels, or real Cash Duels from $1 to $2,000 with instant USDT payouts.",
    q3: "How do I start?",
    a3: "Pick any game below, click 'Play Now', and enter instant server-side matchmaking in under 5 seconds.",
    searchPlaceholder: "Search games by name, category or rules...",
    clearSearch: "Clear",
    emptyTitle: "No games found matching your search",
    emptyDesc: "Try adjusting your search query or reset the filter to browse all 11 games.",
    resetFilter: "Show All Games",
    durationLabel: "Duration",
    modeLabel: "Mode",
    skillLabel: "Skill Level",
    rngLabel: "Engine",
    playersInArena: "players in arena",
    playCta: "Play Now",
    rulesCta: "Rules & Tactics",
    hubTitle: "Nizalo Game Hub",
    hubSub: "11 authentic mind sports & tabletop games. Discover, master the rules, and enter the arena instantly.",
    coreActionLabel: "Core Action:",
    winningGoalLabel: "Winning Goal:",
    instantPracticeCta: "Free Practice ⚡",
    arenaCta: "Enter Arena ⚔️",
  },
  es: {
    q1: "¿A qué puedo jugar?",
    a1: "11 juegos mentales y de mesa certificados. Reglas oficiales, sin ventaja de la casa y 100% habilidad.",
    q2: "¿Cuánto cuesta?",
    a2: "100% gratis para practicar, o duelos con dinero real desde $1 hasta $2,000 con retiros USDT inmediatos.",
    q3: "¿Cómo empiezo?",
    a3: "Elige cualquier juego abajo, haz clic en 'Jugar Ahora' y entra al emparejamiento en menos de 5 segundos.",
    searchPlaceholder: "Buscar por nombre o categoría...",
    clearSearch: "Borrar",
    emptyTitle: "No se encontraron juegos",
    emptyDesc: "Intenta cambiar los términos de búsqueda o restablecer los filtros.",
    resetFilter: "Ver todos los juegos",
    durationLabel: "Duración",
    modeLabel: "Modo",
    skillLabel: "Nivel",
    rngLabel: "Motor",
    playersInArena: "jugadores en la arena",
    playCta: "Jugar Ahora",
    rulesCta: "Reglas y Guía",
    hubTitle: "Centro de Juegos Nizalo",
    hubSub: "11 deportes mentales auténticos. Elige un juego, comprende sus reglas y compite al instante.",
    coreActionLabel: "Mecánica:",
    winningGoalLabel: "Objetivo:",
    instantPracticeCta: "Práctica Gratis ⚡",
    arenaCta: "Entrar a la Arena ⚔️",
  },
  fr: {
    q1: "À quoi puis-je jouer ?",
    a1: "11 jeux cérébraux et de plateau certifiés. Règles authentiques, aucun avantage maison, 100% compétence.",
    q2: "Combien cela coûte-t-il ?",
    a2: "100% gratuit pour s'entraîner, ou duels en argent réel dès 1$ à 2 000$ avec retraits instantanés en USDT.",
    q3: "Comment démarrer ?",
    a3: "Choisissez votre jeu ci-dessous, cliquez sur 'Jouer' et trouvez un adversaire en moins de 5 secondes.",
    searchPlaceholder: "Rechercher par nom ou catégorie...",
    clearSearch: "Effacer",
    emptyTitle: "Aucun jeu trouvé",
    emptyDesc: "Essayez de modifier votre recherche ou réinitialisez les filtres.",
    resetFilter: "Afficher tous les jeux",
    durationLabel: "Durée",
    modeLabel: "Mode",
    skillLabel: "Niveau",
    rngLabel: "Moteur",
    playersInArena: "joueurs dans l'arène",
    playCta: "Jouer",
    rulesCta: "Règles & Stratégie",
    hubTitle: "Hub des Jeux Nizalo",
    hubSub: "11 sports cérébraux de référence. Choisissez, découvrez les règles et entrez en duel.",
    coreActionLabel: "Mécanique :",
    winningGoalLabel: "Victoire :",
    instantPracticeCta: "Essai Gratuit ⚡",
    arenaCta: "Rejoindre l'Arène ⚔️",
  },
  hi: {
    q1: "मैं क्या खेल सकता हूँ?",
    a1: "11 प्रमाणित माइंड स्पोर्ट्स और टेबलटॉप गेम। बिना किसी हाउस एज के 100% कौशल-आधारित खेल।",
    q2: "इसकी लागत कितनी है?",
    a2: "अभ्यास के लिए 100% मुफ़्त, या $1 से $2,000 तक नकद द्वंद्व और तत्काल USDT निकासी।",
    q3: "मैं कैसे शुरुआत करूँ?",
    a3: "नीचे से कोई भी खेल चुनें, 'अभी खेलें' पर क्लिक करें और 5 सेकंड से कम समय में मैच शुरू करें।",
    searchPlaceholder: "खेल या श्रेणी खोजें...",
    clearSearch: "हटाएं",
    emptyTitle: "कोई खेल नहीं मिला",
    emptyDesc: "कृपया अन्य कीवर्ड खोजें या फ़िल्टर रीसेट करें।",
    resetFilter: "सभी खेल देखें",
    durationLabel: "अवधि",
    modeLabel: "मोड",
    skillLabel: "स्तर",
    rngLabel: "इंजन",
    playersInArena: "मैदान में खिलाड़ी",
    playCta: "अभी खेलें",
    rulesCta: "नियम और रणनीति",
    hubTitle: "निज़ालो गेम हब",
    hubSub: "11 प्रामाणिक माइंड स्पोर्ट्स। खेल खोजें, नियम समझें और तुरंत खेलें।",
    coreActionLabel: "मुख्य नियम:",
    winningGoalLabel: "जीत का लक्ष्य:",
    instantPracticeCta: "मुफ़्त अभ्यास ⚡",
    arenaCta: "एरीना में जाएं ⚔️",
  },
  zh: {
    q1: "我可以玩什么？",
    a1: "11 款权威认证的智力竞技与经典桌游。绝对公平、无平台暗箱、100% 纯技术对抗。",
    q2: "需要花费多少？",
    a2: "完全免费练习与友谊赛，或参与 $1 至 $2,000 的现金争霸，USDT 秒级提现到账。",
    q3: "如何立即开始？",
    a3: "在下方选择心仪游戏，点击“即刻开战”，5秒内极速匹配真实在线对手。",
    searchPlaceholder: "搜索游戏名称或分类...",
    clearSearch: "清空",
    emptyTitle: "未找到匹配的游戏",
    emptyDesc: "请尝试更改搜索词或重置筛选条件浏览全部 11 款游戏。",
    resetFilter: "浏览全部游戏",
    durationLabel: "时长",
    modeLabel: "模式",
    skillLabel: "段位",
    rngLabel: "判定引擎",
    playersInArena: "在线竞技玩家",
    playCta: "即刻开战",
    rulesCta: "规则与进阶攻略",
    hubTitle: "Nizalo 游戏探索中心",
    hubSub: "11 款殿堂级智力竞技游戏。发现游戏、掌握战术、秒级开赛。",
    coreActionLabel: "核心操作：",
    winningGoalLabel: "获胜目标：",
    instantPracticeCta: "即刻练习 ⚡",
    arenaCta: "进入竞技场 ⚔️",
  },
};

const GAME_MICRO_IDENTITIES: Record<string, {
  coreAction: Record<string, string>;
  expectedOutcome: Record<string, string>;
}> = {
  chess: {
    coreAction: {
      ar: "حرّك القطع التكتيكية واستحوذ على رقعة الـ 64",
      en: "Move tactical pieces & control the 64 squares",
      es: "Mueve piezas tácticas y controla las 64 casillas",
      fr: "Déplacez les pièces et contrôlez les 64 cases",
      zh: "掌控棋子布局，主导64格战场",
      hi: "टुकड़ों को चालें और 64 खानों पर नियंत्रण रखें",
    },
    expectedOutcome: {
      ar: "كش مات للملك وتتويج الأستاذية",
      en: "Checkmate the King to claim victory",
      es: "Jaque mate al Rey para ganar",
      fr: "Échec et mat au Roi pour remporter la victoire",
      zh: "将死敌方国王赢得胜利",
      hi: "शह और मात देकर विजय प्राप्त करें",
    },
  },
  dominoes: {
    coreAction: {
      ar: "طابق عيون الأحجار وأغلق منافذ الطاولة",
      en: "Match tile pips & strategically block routes",
      es: "Empareja los puntos y bloquea las salidas",
      fr: "Associez les points et bloquez les sorties",
      zh: "匹配骨牌点数，精妙封锁通路",
      hi: "गोटियों के बिंदु मिलाएं और रास्ते रोकें",
    },
    expectedOutcome: {
      ar: "تفريغ اليد أولاً أو الفوز بالقفلة",
      en: "Empty hand first or win by tactical block",
      es: "Vaciar la mano primero o ganar por bloqueo",
      fr: "Vider sa main en premier ou gagner par blocage",
      zh: "率先出完手牌或以封牌得分获胜",
      hi: "पहले हाथ खाली करें या लॉक करके जीतें",
    },
  },
  ludo: {
    coreAction: {
      ar: "حرك بيادقك الـ 4 واقتنص قطع الخصم",
      en: "Race your 4 tokens & strike down opponent pieces",
      es: "Mueve tus 4 fichas y captura a los rivales",
      fr: "Avancez vos 4 pions et capturez vos adversaires",
      zh: "驱动4颗棋子并拦截捕获对手",
      hi: "अपनी 4 गोटियां चलाएं और प्रतिद्वंद्वी को काटें",
    },
    expectedOutcome: {
      ar: "إدخال جميع البيادق لمثلث النصر",
      en: "Escort all 4 tokens into the center triangle",
      es: "Llevar todas las fichas a la meta central",
      fr: "Mener tous vos pions au triangle de victoire",
      zh: "将所有棋子送达中央胜利三角",
      hi: "सभी गोटियों को विजय त्रिकोण तक पहुंचाएं",
    },
  },
  backgammon: {
    coreAction: {
      ar: "ناور بالأقراص حول الطاولة واضرب الحجر المكشوف",
      en: "Maneuver checkers around the board & hit blots",
      es: "Maniobra tus fichas y captura las desprotegidas",
      fr: "Manoeuvrez vos pions et frappez les cases vulnérables",
      zh: "运筹棋子行进，击打落单敌棋",
      hi: "मोहरों को आगे बढ़ाएं और खुली गोटियों को मारें",
    },
    expectedOutcome: {
      ar: "إخراج كافة الأقراص وتحقيق المارش",
      en: "Bear off all checkers or achieve Gammon",
      es: "Retirar todas las fichas o lograr Gammon",
      fr: "Sortir tous vos pions ou réussir un Gammon",
      zh: "收回所有棋子或赢取双倍大胜",
      hi: "सभी मोहरे बाहर निकालें या गैमन जीतें",
    },
  },
  "speed-math": {
    coreAction: {
      ar: "احسب العمليات الذهنية واضغط الحل فوراً",
      en: "Calculate rapid mental equations & tap answer",
      es: "Resuelve operaciones mentales rápidas y pulsa",
      fr: "Calculez de tête et cliquez immédiatement",
      zh: "极速心算并在毫秒间选择正解",
      hi: "मानसिक गणना करें और तुरंत उत्तर चुनें",
    },
    expectedOutcome: {
      ar: "أعلى مجموع نقاط قبل نفاد الثواني",
      en: "Score the highest points before clock expires",
      es: "Mayor puntuación antes de que expire el tiempo",
      fr: "Score le plus élevé avant la fin du chrono",
      zh: "在倒计时结束前斩获最高积分",
      hi: "समय समाप्त होने से पहले सर्वाधिक अंक प्राप्त करें",
    },
  },
  xo: {
    coreAction: {
      ar: "خطط ثلاث خطوات للأمام في شبكة 3x3",
      en: "Plot 3 moves ahead on a 3x3 grid",
      es: "Planifica 3 jugadas en la cuadrícula 3x3",
      fr: "Anticipez 3 coups sur la grille 3x3",
      zh: "在3x3棋盘上预判3步连线",
      hi: "3x3 ग्रिड में 3 चाल आगे की सोचें",
    },
    expectedOutcome: {
      ar: "اصنع خطاً ثلاثياً متواصلاً واكسب",
      en: "Align 3 symbols in a row to win instantly",
      es: "Alinear 3 símbolos seguidos para ganar",
      fr: "Aligner 3 symboles consécutifs pour gagner",
      zh: "达成三连线即刻获胜",
      hi: "एक पंक्ति में 3 मिलाकर तुरंत जीतें",
    },
  },
  "connect-four": {
    coreAction: {
      ar: "أسقط الأقراص عمودياً واحبك الفخاخ القطاعية",
      en: "Drop discs strategically & set diagonal traps",
      es: "Suelta discos y prepara trampas diagonales",
      fr: "Lâchez vos jetons et tendez des pièges",
      zh: "竖直投子设局，编织纵横对角陷阱",
      hi: "गोटियां नीचे गिराएं और जाल बिछाएं",
    },
    expectedOutcome: {
      ar: "وصال 4 أقراص متتالية أفقياً أو قطرياً",
      en: "Connect 4 consecutive discs in any direction",
      es: "Conectar 4 discos consecutivos",
      fr: "Aligner 4 jetons consécutifs",
      zh: "连成4颗相同颜色的棋子",
      hi: "लगातार 4 गोटियां जोड़कर जीतें",
    },
  },
  checkers: {
    coreAction: {
      ar: "اقفز فوق قطع الخصم إجبارياً للالتهام",
      en: "Execute mandatory jumps to capture pieces",
      es: "Salta sobre las piezas rivales para capturarlas",
      fr: "Sautez par-dessus les pions adverses pour capturer",
      zh: "执行强制连跳，吃尽敌方棋子",
      hi: "विरोधी की गोटियों पर छलांग लगाकर खाएं",
    },
    expectedOutcome: {
      ar: "ترقية الملوك ومحو جيش الخصم",
      en: "Promote Kings & wipe out the opposing army",
      es: "Coronar Damas y eliminar las fichas rivales",
      fr: "Promouvoir des Dames et anéantir l'ennemi",
      zh: "加冕王者并消灭对手所有棋子",
      hi: "राजा बनाएं और विरोधी की सेना समाप्त करें",
    },
  },
  reversi: {
    coreAction: {
      ar: "حاصر أقراص الخصم واقلبها إلى لونك",
      en: "Flank opponent lines & flip discs to your color",
      es: "Encierra fichas rivales y voltéalas a tu color",
      fr: "Prenez en étau les pions adverses pour les retourner",
      zh: "夹击包围敌子，成片翻转为己方颜色",
      hi: "विरोधी की गोटियों को घेरें और अपने रंग में बदलें",
    },
    expectedOutcome: {
      ar: "السيطرة على أكثرية الرقعة عند الامتلاء",
      en: "Dominate the majority of discs at full board",
      es: "Dominar la mayoría del tablero al completarse",
      fr: "Posséder la majorité des pions sur le plateau",
      zh: "棋盘填满时持有最多棋子",
      hi: "बोर्ड भरने पर अधिकांश गोटियों पर नियंत्रण रखें",
    },
  },
  gomoku: {
    coreAction: {
      ar: "انشر أحجارك على رقعة الـ 15x15 دون مقاطعة",
      en: "Place stones strategically on the 15x15 grid",
      es: "Coloca piedras estratégicamente en 15x15",
      fr: "Posez vos pierres stratégiquement sur le 15x15",
      zh: "在15x15网格上铺展攻防棋子",
      hi: "15x15 ग्रिड पर रणनीति से गोटियां रखें",
    },
    expectedOutcome: {
      ar: "محاذاة 5 أحجار غير منقطعة",
      en: "Form an unbroken row of 5 stones",
      es: "Formar una línea continua de 5 piedras",
      fr: "Former une ligne ininterrompue de 5 pierres",
      zh: "五子连珠，先成五者为胜",
      hi: "लगातार 5 गोटियों की पंक्ति बनाएं",
    },
  },
  seega: {
    coreAction: {
      ar: "أنزل البيادق واقتنص بالحصار الثنائي المحكم",
      en: "Deploy tokens & capture via custodian sandwich",
      es: "Despliega fichas y captura mediante cerco doble",
      fr: "Déployez vos pions et capturez en étau",
      zh: "分兵落子，以双向夹击俘获敌方阵脚",
      hi: "मोहरे तैनात करें और दोनों तरफ से घेरकर मारें",
    },
    expectedOutcome: {
      ar: "شل حركة الخصم وإبادة قطعه",
      en: "Immobilize or eradicate all enemy tokens",
      es: "Inmovilizar o erradicar las fichas enemigas",
      fr: "Immobiliser ou éliminer tous les pions adverses",
      zh: "封锁敌方行动或歼灭所有敌子",
      hi: "विरोधी की चालें रोकें या समाप्त करें",
    },
  },
};

export default function GamesHubPage() {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const copy = ONBOARDING_I18N[locale] ?? ONBOARDING_I18N["en"]!;

  const allGames = useMemo(() => GameRegistry.getAll(), []);
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGames = useMemo(() => {
    let list = selectedCategory === "ALL" ? allGames : GameRegistry.filter(selectedCategory);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => {
        const localizedName = t(`common.game_names.${g.nameKey}`).toLowerCase();
        return (
          localizedName.includes(q) ||
          g.id.toLowerCase().includes(q) ||
          g.tagline.toLowerCase().includes(q) ||
          g.taglineAr.includes(q) ||
          g.shortDescription.toLowerCase().includes(q) ||
          g.shortDescriptionAr.includes(q)
        );
      });
    }

    return list;
  }, [allGames, selectedCategory, searchQuery, t]);

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Hub Header */}
        <header className={styles.hubHeader}>
          <h1 className={styles.heading}>{copy.hubTitle}</h1>
          <p className={styles.subhead}>{copy.hubSub}</p>
        </header>

        {/* 5-Second Clarity Onboarding Banner: FIND A GAME → UNDERSTAND IT → PLAY IT */}
        <section className={styles.journeyBanner} aria-label="First-time player guide">
          <div className={styles.journeyGrid}>
            <div className={styles.journeyPillar}>
              <div className={styles.journeyPillarHead}>
                <span className={styles.journeyIcon}>🎯</span>
                <h2 className={styles.journeyQuestion}>{copy.q1}</h2>
              </div>
              <p className={styles.journeyAnswer}>{copy.a1}</p>
            </div>

            <div className={styles.journeyPillar}>
              <div className={styles.journeyPillarHead}>
                <span className={styles.journeyIcon}>💵</span>
                <h2 className={styles.journeyQuestion}>{copy.q2}</h2>
              </div>
              <p className={styles.journeyAnswer}>{copy.a2}</p>
            </div>

            <div className={styles.journeyPillar}>
              <div className={styles.journeyPillarHead}>
                <span className={styles.journeyIcon}>🚀</span>
                <h2 className={styles.journeyQuestion}>{copy.q3}</h2>
              </div>
              <p className={styles.journeyAnswer}>{copy.a3}</p>
            </div>
          </div>
        </section>

        {/* Discovery & Filter Bar */}
        <section className={styles.discoveryControls} aria-label="Game discovery filters">
          {/* Quick Search Input */}
          <div className={styles.searchBarWrap}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={copy.searchPlaceholder}
              className={styles.searchInput}
              aria-label="Search games"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={styles.searchClearBtn}
              >
                ✕ {copy.clearSearch}
              </button>
            )}
          </div>

          {/* Canonical Category Taxonomy Pills */}
          <div className={styles.categoryScroll} role="tablist" aria-label="Filter games by category">
            {CATEGORIES_SPEC.map((cat) => {
              const active = selectedCategory === cat.id;
              const count = cat.id === "ALL" ? allGames.length : GameRegistry.filter(cat.id).length;
              const label = isRtl ? cat.labelAr : cat.labelEn;

              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? styles.filterPillActive : styles.filterPill}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <span>{cat.icon}</span>
                  <span>{label}</span>
                  <span className={styles.filterCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dynamic Games Grid */}
        <div className={styles.grid}>
          {filteredGames.length > 0 ? (
            filteredGames.map((game) => (
              <GameHubCard key={game.id} game={game} copy={copy} locale={locale} isRtl={isRtl} />
            ))
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🎲</div>
              <h3 className={styles.emptyTitle}>{copy.emptyTitle}</h3>
              <p className={styles.emptyDesc}>{copy.emptyDesc}</p>
              <button
                type="button"
                className={styles.emptyResetBtn}
                onClick={() => {
                  setSelectedCategory("ALL");
                  setSearchQuery("");
                }}
              >
                {copy.resetFilter}
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function GameHubCard({
  game,
  copy,
  locale,
  isRtl,
}: {
  game: GameDefinition;
  copy: (typeof ONBOARDING_I18N)["en"];
  locale: string;
  isRtl: boolean;
}) {
  const { t } = useI18n();
  const name = t(`common.game_names.${game.nameKey}`) || game.id;
  const description = isRtl ? game.shortDescriptionAr : game.shortDescription;
  const duration = isRtl ? game.typicalDurationAr : game.typicalDuration;
  const mode = isRtl ? game.playerModeDisplayAr : game.playerModeDisplay;
  const skill = isRtl ? game.skillLevelAr : game.skillLevel;
  const rngEngine = game.rules.hasRng
    ? (isRtl ? "نرد/قطع مشفرة CSPRNG" : "CSPRNG Dice/Tiles")
    : (isRtl ? "حتمي 100% بدون أي حظ" : "100% Deterministic");

  return (
    <article className={styles.card}>
      {/* Visual Thumbnail with Badges */}
      <div className={styles.thumbnailWrap}>
        <LocaleLink href={`/play/${game.id}`} aria-label={`${name} - ${copy.playCta}`}>
          <GameThumbnail
            gameId={game.id}
            title={name}
            duration={duration}
            {...(game.turnModel === "SIMULTANEOUS" ? { badge: isRtl ? "متزامن" : "Simultaneous" } : {})}
          />
        </LocaleLink>
        <div className={styles.cardBadgeOverlay}>
          {game.isPopular && <span className={styles.popularBadge}>🔥 {isRtl ? "شائع" : "Popular"}</span>}
          {game.isNew && <span className={styles.newBadge}>✨ {isRtl ? "جديد" : "New"}</span>}
        </div>
      </div>

      <div className={styles.cardContent}>
        {/* Card Header: Icon, Name, and Live Availability */}
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <span className={styles.cardIcon}>{game.icon}</span>
            <h2 className={styles.cardTitle}>
              <LocaleLink href={`/play/${game.id}`} className={styles.cardTitleLink}>
                {name}
              </LocaleLink>
            </h2>
          </div>
          <div className={styles.livePlayerBadge}>
            <span className={styles.pulseDot} />
            <span>{game.availability.onlinePlayersBenchmark} {copy.playersInArena}</span>
          </div>
        </div>

        {/* Stake Eligibility Badges */}
        <div className={styles.stakeBadgeRow}>
          {game.stakeEligibility.isCashEligible ? (
            <>
              <span className={styles.cashEligibleBadge}>
                💰 {isRtl ? "نزالات كاش 1$-2,000$" : "Cash Duels $1-$2,000"}
              </span>
              <span className={styles.freePlayBadge}>
                🆓 {isRtl ? "لعب مجاني متاح" : "Free Play"}
              </span>
            </>
          ) : (
            <span className={styles.freeOnlyBadge} title={game.stakeEligibility.reasonIfNotEligible}>
              🆓 {isRtl ? "مجاني بالكامل (لعبة محسومة)" : "100% Free Only (Solved Game)"}
            </span>
          )}
        </div>

        {/* Factual Short Description */}
        <p className={styles.cardDescription}>{description}</p>

        {/* Factual Game Metadata Specification Grid */}
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{copy.durationLabel}</span>
            <span className={styles.metaValue}>{duration}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{copy.modeLabel}</span>
            <span className={styles.metaValue}>{mode}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{copy.skillLabel}</span>
            <span className={styles.metaValue}>{skill}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{copy.rngLabel}</span>
            <span className={styles.metaValue}>{rngEngine}</span>
          </div>
        </div>

        {/* 3-Second Game Test: Core Action & Winning Goal */}
        {GAME_MICRO_IDENTITIES[game.id] && (
          <div className={styles.gameMicroSummary}>
            <div className={styles.microItem}>
              <span className={styles.microIcon}>⚡</span>
              <div className={styles.microText}>
                <span className={styles.microLabel}>{copy.coreActionLabel}</span>
                <span className={styles.microVal}>
                  {GAME_MICRO_IDENTITIES[game.id]!.coreAction[locale] || GAME_MICRO_IDENTITIES[game.id]!.coreAction.en}
                </span>
              </div>
            </div>
            <div className={styles.microItem}>
              <span className={styles.microIcon}>🏆</span>
              <div className={styles.microText}>
                <span className={styles.microLabel}>{copy.winningGoalLabel}</span>
                <span className={styles.microVal}>
                  {GAME_MICRO_IDENTITIES[game.id]!.expectedOutcome[locale] || GAME_MICRO_IDENTITIES[game.id]!.expectedOutcome.en}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions: Instant Free Practice + Arena / Matchmaking + Rules */}
        <div className={styles.cardActions}>
          <LocaleLink
            href={`/play/${game.id}?mode=practice`}
            className={styles.instantPracticeCta}
            title={copy.instantPracticeCta}
          >
            <span>⚡</span>
            <span>{copy.instantPracticeCta}</span>
          </LocaleLink>
          <LocaleLink href={`/play/${game.id}`} className={styles.playCta}>
            <span>⚔️</span>
            <span>{copy.arenaCta}</span>
          </LocaleLink>
          <LocaleLink href={`/games/${game.id}`} className={styles.rulesCta}>
            <span>📖</span>
            <span>{copy.rulesCta}</span>
          </LocaleLink>
        </div>
      </div>
    </article>
  );
}
