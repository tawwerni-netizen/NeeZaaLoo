"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { JsonLd } from "@/components/seo/JsonLd";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { getGame, listGames } from "@/lib/games";
import { getGameContent, type GameLocalizedContent } from "@/lib/games/game-content";
import { getGameThemeTokens } from "@/lib/games/theme-tokens";
import styles from "./game-details.module.css";

// Last-resort fallback for a game with no real photography yet
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230D111A'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%23FFD700' stroke-opacity='0.45' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23FFD700' fill-opacity='0.7'/%3E%3C/svg%3E";

type TabKey =
  | "overview"
  | "rules"
  | "beginner"
  | "strategy"
  | "advanced"
  | "faq"
  | "tournament"
  | "livePlay"
  | "leaderboard";

type LeaderboardEntry = {
  player_id: string;
  handle: string;
  rating_x100: number;
  rd_x100: number;
  games_played: number;
};

type GamePageDict = {
  home: string;
  games: string;
  simultaneousTurns: string;
  alternatingTurns: string;
  turnModelLabel: string;
  simultaneous: string;
  alternating: string;
  avgDuration: string;
  competitiveMode: string;
  skillCeiling: string;
  highPureSkill: string;
  prizeActive: string;
  freePlayOnly: string;
  playNow: (name: string) => string;
  aboutGame: (name: string) => string;
  zeroRngTitle: string;
  zeroRngDesc: string;
  clockTitle: string;
  clockDesc: string;
  eloTitle: string;
  eloDesc: string;
  rulesBadge: string;
  rulesHeroHeading: (name: string) => string;
  rulesHeroTagline: string;
  primaryObj: string;
  primaryObjFallback: string;
  setupLayout: string;
  setupLayoutFallback: string;
  mechanics: string;
  mechanicsFallback: string;
  victoryCond: string;
  victoryCondFallback: string;
  beginnerTips: string;
  beginnerTipsFallback: string;
  mistakesToAvoid: string;
  mistakesFallback: string;
  openingPrinciples: string;
  openingFallback: string;
  tacticalPatterns: string;
  tacticalFallback: string;
  midgameCoord: string;
  midgameFallback: string;
  deepCalc: string;
  deepCalcFallback: string;
  clockMgmt: string;
  clockMgmtFallback: string;
  endgamePrecision: string;
  endgameFallback: string;
  noFaq: string;
  tournamentFormat: string;
  tournamentFormatFallback: string;
  tieBreakers: string;
  tieBreakersFallback: string;
  prizeDist: string;
  prizeDistFallback: string;
  matchmaking: string;
  matchmakingFallback: string;
  latencyProtection: string;
  latencyFallback: string;
  fairPlayShield: string;
  fairPlayFallback: string;
  topRanked: (name: string) => string;
  exploreOther: string;
  coreCtaFallback: string;
  legalNoticeFallback: string;
};

const GAME_PAGE_I18N: Record<string, GamePageDict> = {
  ar: {
    home: "الرئيسية",
    games: "الألعاب",
    simultaneousTurns: "أدوار متزامنة",
    alternatingTurns: "أدوار متبادلة",
    turnModelLabel: "نموذج اللعب",
    simultaneous: "متزامن",
    alternating: "متبادل",
    avgDuration: "متوسط الجولة",
    competitiveMode: "النمط التنافسي",
    skillCeiling: "مستوى التحدي",
    highPureSkill: "عالي / استراتيجي",
    prizeActive: "منافسات مهارية بجوائز",
    freePlayOnly: "لعب مجاني وتدريب",
    playNow: (name) => `تحدَّ الآن في ${name}`,
    aboutGame: (name) => `عن لعبة ${name}`,
    zeroRngTitle: "نزاهة كاملة بدون حظ",
    zeroRngDesc: "تعتمد نتائج المباريات كلياً على البراعة الذهنية والسرعة الحركية والتخطيط الاستراتيجي، دون تدخل أي عنصر من عناصر الحظ أو الصدفة.",
    clockTitle: "توقيت مركزي محمي",
    clockDesc: "تتم مزامنة ساعات المباريات بالمللي ثانية على خوادم Nizalo السحابية لمنع التلاعب بالتوقيت أو هجمات تأخير الاتصال.",
    eloTitle: "تصنيف ELO عادل ومستمر",
    eloDesc: "يتم احتساب تصنيفك بدقة بعد كل مباراة باستخدام خوارزميات Glicko-2 الرسمية لضمان مواجهة خصوم من نفس المستوى التنافسي.",
    rulesBadge: "القواعد المعتمدة رسمياً في نيزالو",
    rulesHeroHeading: (name) => `قوانين وميكانيكا التحدي: ${name}`,
    rulesHeroTagline: "معايير منافسة مهارية عادلة 100% بدون أي عنصر حظ. احتساب دقيق للوقت مع تطبيق بروتوكول مكافحة الغش المعتمد.",
    primaryObj: "الهدف الأساسي للمباراة",
    primaryObjFallback: "تحقيق شروط الفوز المحددة لقواعد اللعبة الرسمية قبل الخصم أو عند استنفاد وقته.",
    setupLayout: "إعدادات الرقعة / اللوحة",
    setupLayoutFallback: "يتم توزيع القطع وتعيين المواقع الابتدائية تلقائياً بدقة هندسية موحدة لكلتا الجهتين.",
    mechanics: "آليات اللعب وقوانين الحركة",
    mechanicsFallback: "تطبيق القواعد الرسمية المعتمدة دولياً.",
    victoryCond: "شروط حسم الانتصار",
    victoryCondFallback: "تحقيق شروط الإماتة أو النقاط المحددة.",
    beginnerTips: "نصائح جوهرية للمبتدئين",
    beginnerTipsFallback: "ركز على السيطرة على المركز وإدارة الوقت.",
    mistakesToAvoid: "أخطاء شائعة يجب تجنبها",
    mistakesFallback: "التسرع في التحريك دون فحص ردود الخصم.",
    openingPrinciples: "مبادئ الافتتاح والانتشار",
    openingFallback: "تطوير سريع ومدروس للقطع.",
    tacticalPatterns: "الأنماط التكتيكية الحاسمة",
    tacticalFallback: "البحث عن نقاط الضعف المزدوجة.",
    midgameCoord: "تنسيق وسط الدور",
    midgameFallback: "فتح مسارات الضغط المتزامن.",
    deepCalc: "الحساب العميق والشجري",
    deepCalcFallback: "حساب 4 إلى 6 نقلات حاسمة للأمام.",
    clockMgmt: "إدارة الوقت والضغط النفسي",
    clockMgmtFallback: "الحفاظ على تفوق زمني للضغط على الخصم.",
    endgamePrecision: "تقنيات حسم النهايات",
    endgameFallback: "تحويل التفوق الطفيف إلى فوز مؤكد.",
    noFaq: "لا توجد أسئلة شائعة مسجلة حالياً.",
    tournamentFormat: "نظام وهيكل البطولات",
    tournamentFormatFallback: "تصفيات خروج المغلوب بنظام السويسري أو الإقصاء المباشر.",
    tieBreakers: "قواعد كسر التعادل",
    tieBreakersFallback: "جولة حاسمة سريعة (Blitz Armageddon) لحسم المتأهل.",
    prizeDist: "توزيع الجوائز المعتمد",
    prizeDistFallback: "إيداع فوري ومؤتمت في المحفظة لحاملي المراكز الأولى.",
    matchmaking: "خوارزمية التوفيق التنافسي",
    matchmakingFallback: "مطابقة آنية مبنية على تقارب نقاط التصنيف ومعدل الثقة.",
    latencyProtection: "حماية تأخير الاتصال (Lag Protection)",
    latencyFallback: "تعويض زمني عادل يعزل تقلبات الإنترنت غير المتوقعة.",
    fairPlayShield: "محرك النزاهة وكشف الغش",
    fairPlayFallback: "فحص وتحليل إحصائي آني لحركات اللعب لمنع المحركات والمساعدات.",
    topRanked: (name) => `أفضل اللاعبين في ${name}`,
    exploreOther: "اكتشف ألعاب المهارة الأخرى",
    coreCtaFallback: "اثبت مهارتك. العب. اكسب.",
    legalNoticeFallback: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
  },
  en: {
    home: "Home",
    games: "Games",
    simultaneousTurns: "Simultaneous Turns",
    alternatingTurns: "Alternating Turns",
    turnModelLabel: "Turn Model",
    simultaneous: "Simultaneous",
    alternating: "Alternating",
    avgDuration: "Avg Duration",
    competitiveMode: "Competitive Mode",
    skillCeiling: "Skill Ceiling",
    highPureSkill: "High / Pure Skill",
    prizeActive: "Prize Tournaments Active",
    freePlayOnly: "Free Play Only",
    playNow: (name) => `Play ${name} Now`,
    aboutGame: (name) => `About ${name}`,
    zeroRngTitle: "Zero RNG / Pure Skill",
    zeroRngDesc: "Outcomes are determined solely by cognitive precision, strategic planning, and execution speed. Random number generators (RNG) do not influence results.",
    clockTitle: "Centralized Authoritative Clock",
    clockDesc: "Clocks are synchronized down to the millisecond on Nizalo's edge cloud, neutralizing local client clock spoofing and lag abuse.",
    eloTitle: "Glicko-2 & ELO Precision",
    eloDesc: "Ratings evolve dynamically after every sanctioned match using calibrated Glicko-2 mathematics to guarantee fair, balanced matchmaking.",
    rulesBadge: "Nizalo Official Sanctioned Standard",
    rulesHeroHeading: (name) => `${name}: Sanctioned Tournament Rules`,
    rulesHeroTagline: "100% skill-based competitive layout with deterministic state engine and anti-cheat validation.",
    primaryObj: "Primary Objective",
    primaryObjFallback: "Fulfill the sanctioned victory condition before your opponent or force a timeout win.",
    setupLayout: "Setup & Layout",
    setupLayoutFallback: "Pieces and boards initialize instantaneously following certified competitive layouts.",
    mechanics: "Core Mechanics",
    mechanicsFallback: "Official tournament rules apply.",
    victoryCond: "Victory Conditions",
    victoryCondFallback: "Decisive tactical checkmate or score threshold.",
    beginnerTips: "Fundamental Beginner Tips",
    beginnerTipsFallback: "Focus on board center and time preservation.",
    mistakesToAvoid: "Costly Mistakes to Avoid",
    mistakesFallback: "Premature attacks without calculation.",
    openingPrinciples: "Opening Principles",
    openingFallback: "Rapid harmonious piece development.",
    tacticalPatterns: "Tactical Patterns",
    tacticalFallback: "Exploiting overloaded enemy positions.",
    midgameCoord: "Midgame Coordination",
    midgameFallback: "Coordinated pressure across open lines.",
    deepCalc: "Deep Calculation",
    deepCalcFallback: "Visualizing 4 to 6 forced plies ahead.",
    clockMgmt: "Clock Management",
    clockMgmtFallback: "Maintaining temporal advantage for endgame leverage.",
    endgamePrecision: "Endgame Precision",
    endgameFallback: "Converting fractional positional edges into victory.",
    noFaq: "No FAQs currently recorded.",
    tournamentFormat: "Tournament Format",
    tournamentFormatFallback: "Single elimination or Swiss bracket tournament structure.",
    tieBreakers: "Tie-Breaker Rules",
    tieBreakersFallback: "Decisive Blitz sudden-death blitz playoff.",
    prizeDist: "Prize Distribution",
    prizeDistFallback: "Immediate audited smart escrow settlement to eligible winners.",
    matchmaking: "Skill Matchmaking",
    matchmakingFallback: "Real-time rating tolerance expansion for minimal waiting times.",
    latencyProtection: "Latency Protection",
    latencyFallback: "Server-side state reconciliation with lag compensation.",
    fairPlayShield: "Fair Play Shield",
    fairPlayFallback: "Continuous behavioral telemetry against engine assistance.",
    topRanked: (name) => `Top Ranked Players in ${name}`,
    exploreOther: "Explore Other Skill Games",
    coreCtaFallback: "PROVE. PLAY. WIN.",
    legalNoticeFallback: "earn prizes through eligible skill competitions",
  },
  es: {
    home: "Inicio",
    games: "Juegos",
    simultaneousTurns: "Turnos simultáneos",
    alternatingTurns: "Turnos alternos",
    turnModelLabel: "Modelo de juego",
    simultaneous: "Simultáneo",
    alternating: "Alterno",
    avgDuration: "Duración media",
    competitiveMode: "Modo competitivo",
    skillCeiling: "Nivel de habilidad",
    highPureSkill: "Alto / Habilidad pura",
    prizeActive: "Torneos con premios activos",
    freePlayOnly: "Juego libre y práctica",
    playNow: (name) => `¡Juega a ${name} ahora!`,
    aboutGame: (name) => `Acerca de ${name}`,
    zeroRngTitle: "Cero azar / Habilidad pura",
    zeroRngDesc: "Los resultados se deciden exclusivamente por agilidad mental, estrategia y velocidad, sin intervención del azar.",
    clockTitle: "Reloj centralizado seguro",
    clockDesc: "Sincronización al milisegundo en los servidores Nizalo para evitar cualquier manipulación local o trampas de retraso.",
    eloTitle: "Precisión ELO y Glicko-2",
    eloDesc: "Tu puntuación se recalcula tras cada partida oficial con fórmulas Glicko-2 para garantizar emparejamientos equitativos.",
    rulesBadge: "Estándar oficial sancionado por Nizalo",
    rulesHeroHeading: (name) => `Reglas oficiales de torneo: ${name}`,
    rulesHeroTagline: "Competición 100% basada en habilidad con motor de estados determinista y validación antitrampas.",
    primaryObj: "Objetivo principal",
    primaryObjFallback: "Cumplir las condiciones oficiales de victoria antes que el rival o ganar por tiempo.",
    setupLayout: "Disposición del tablero",
    setupLayoutFallback: "Fichas y tableros se configuran automáticamente siguiendo estándares de competición certificados.",
    mechanics: "Mecánicas de juego",
    mechanicsFallback: "Se aplican las reglas oficiales de torneo.",
    victoryCond: "Condiciones de victoria",
    victoryCondFallback: "Victoria táctica decisiva o superación del umbral de puntos.",
    beginnerTips: "Consejos clave para principiantes",
    beginnerTipsFallback: "Domina el centro del tablero y gestiona con precisión el reloj.",
    mistakesToAvoid: "Errores costosos a evitar",
    mistakesFallback: "Ataques prematuros sin cálculo previo de respuestas rivales.",
    openingPrinciples: "Principios de apertura",
    openingFallback: "Desarrollo rápido y equilibrado de las piezas.",
    tacticalPatterns: "Patrones tácticos",
    tacticalFallback: "Explotar posiciones sobrecargadas y debilidades del rival.",
    midgameCoord: "Coordinación en medio juego",
    midgameFallback: "Presión coordinada a través de líneas abiertas.",
    deepCalc: "Cálculo profundo",
    deepCalcFallback: "Visualizar de 4 a 6 jugadas forzadas hacia adelante.",
    clockMgmt: "Gestión del tiempo",
    clockMgmtFallback: "Mantener ventaja temporal para presionar en el final de partida.",
    endgamePrecision: "Precisión en finales",
    endgameFallback: "Convertir ventajas posicionales mínimas en victoria asegurada.",
    noFaq: "No hay preguntas frecuentes registradas actualmente.",
    tournamentFormat: "Formato de torneo",
    tournamentFormatFallback: "Estructura de eliminación directa o sistema suizo.",
    tieBreakers: "Reglas de desempate",
    tieBreakersFallback: "Desempate decisivo relámpago con muerte súbita.",
    prizeDist: "Distribución de premios",
    prizeDistFallback: "Liquidación inmediata y auditada en billetera para los ganadores.",
    matchmaking: "Emparejamiento por habilidad",
    matchmakingFallback: "Tolerancia dinámica en tiempo real para emparejarte en segundos con rivales de tu nivel.",
    latencyProtection: "Protección contra latencia",
    latencyFallback: "Reconciliación de estados en el servidor para neutralizar fluctuaciones de red.",
    fairPlayShield: "Escudo de juego limpio",
    fairPlayFallback: "Telemetría de comportamiento continuo contra motores de asistencia.",
    topRanked: (name) => `Mejores jugadores en ${name}`,
    exploreOther: "Explora otros juegos de habilidad",
    coreCtaFallback: "DEMUESTRA. JUEGA. GANA.",
    legalNoticeFallback: "gana premios en competiciones de habilidad cualificadas",
  },
  fr: {
    home: "Accueil",
    games: "Jeux",
    simultaneousTurns: "Tours simultanés",
    alternatingTurns: "Tours alternés",
    turnModelLabel: "Modèle de jeu",
    simultaneous: "Simultané",
    alternating: "Alterné",
    avgDuration: "Durée moyenne",
    competitiveMode: "Mode compétitif",
    skillCeiling: "Plafond de compétence",
    highPureSkill: "Élevé / Habileté pure",
    prizeActive: "Tournois dotés actifs",
    freePlayOnly: "Entraînement et jeu libre",
    playNow: (name) => `Jouer à ${name} maintenant`,
    aboutGame: (name) => `À propos de ${name}`,
    zeroRngTitle: "Zéro hasard / Habileté pure",
    zeroRngDesc: "Les résultats dépendent exclusivement de la précision cognitive et de la vitesse stratégique, sans influence du hasard.",
    clockTitle: "Horloge centralisée sécurisée",
    clockDesc: "Horloges synchronisées à la milliseconde près sur le cloud Nizalo contre toute triche de latence.",
    eloTitle: "Précision ELO & Glicko-2",
    eloDesc: "Classement dynamique calculé après chaque match officiel selon les formules mathématiques Glicko-2.",
    rulesBadge: "Norme officielle sanctionnée Nizalo",
    rulesHeroHeading: (name) => `Règles officielles de tournoi : ${name}`,
    rulesHeroTagline: "Compétition 100% basée sur le talent avec moteur déterministe et contrôle anti-triche.",
    primaryObj: "Objectif principal",
    primaryObjFallback: "Remplir les conditions officielles de victoire avant l'adversaire ou forcer un gain au temps.",
    setupLayout: "Disposition du plateau",
    setupLayoutFallback: "Initialisation instantanée selon les configurations certifiées de compétition.",
    mechanics: "Mécaniques de jeu",
    mechanicsFallback: "Application des règles de tournois internationaux.",
    victoryCond: "Conditions de victoire",
    victoryCondFallback: "Victoire tactique décisive ou seuil de points atteint.",
    beginnerTips: "Conseils fondamentaux débutants",
    beginnerTipsFallback: "Contrôlez le centre et préservez précieusement votre temps.",
    mistakesToAvoid: "Erreurs courantes à éviter",
    mistakesFallback: "Attaques prématurées sans calcul approfondi.",
    openingPrinciples: "Principes d'ouverture",
    openingFallback: "Développement harmonieux et rapide des pièces.",
    tacticalPatterns: "Schémas tactiques",
    tacticalFallback: "Exploitation méthodique des faiblesses et surcharges.",
    midgameCoord: "Coordination en milieu de jeu",
    midgameFallback: "Pression coordonnée à travers les lignes ouvertes.",
    deepCalc: "Calcul approfondi",
    deepCalcFallback: "Visualisation rigoureuse de 4 à 6 demi-coups forcés.",
    clockMgmt: "Gestion du temps",
    clockMgmtFallback: "Maintien d'un avantage temporel pour faire plier l'adversaire.",
    endgamePrecision: "Précision en finale",
    endgameFallback: "Conversion des micro-avantages en victoire incontestable.",
    noFaq: "Aucune question fréquente enregistrée actuellement.",
    tournamentFormat: "Format de tournoi",
    tournamentFormatFallback: "Arbre à élimination directe ou système suisse.",
    tieBreakers: "Règles de départage",
    tieBreakersFallback: "Partie blitz décisive mort subite.",
    prizeDist: "Attribution des prix",
    prizeDistFallback: "Versement immédiat et audité sur portefeuille pour les gagnants.",
    matchmaking: "Matchmaking par niveau",
    matchmakingFallback: "Tolérance dynamique pour trouver instantanément un rival à votre mesure.",
    latencyProtection: "Protection contre la latence",
    latencyFallback: "Réconciliation des états côté serveur pour neutraliser les décalages de réseau.",
    fairPlayShield: "Bouclier de jeu équitable",
    fairPlayFallback: "Télémétrie comportementale continue contre les moteurs d'assistance.",
    topRanked: (name) => `Meilleurs joueurs sur ${name}`,
    exploreOther: "Découvrir les autres jeux de compétence",
    coreCtaFallback: "PROUVEZ. JOUEZ. GAGNEZ.",
    legalNoticeFallback: "gagnez des prix lors de compétitions d'habileté éligibles",
  },
  hi: {
    home: "होम",
    games: "गेम्स",
    simultaneousTurns: "एक साथ चालें",
    alternatingTurns: "बारी-बारी से चालें",
    turnModelLabel: "खेल मॉडल",
    simultaneous: "एक साथ",
    alternating: "बारी-बारी",
    avgDuration: "औसत समय",
    competitiveMode: "प्रतिस्पर्धी मोड",
    skillCeiling: "कौशल स्तर",
    highPureSkill: "उच्च / शुद्ध कौशल",
    prizeActive: "पुरस्कार टूर्नामेंट सक्रिय",
    freePlayOnly: "मुफ्त खेल और अभ्यास",
    playNow: (name) => `अब ${name} खेलें`,
    aboutGame: (name) => `${name} के बारे में`,
    zeroRngTitle: "शून्य भाग्य / पूर्ण कौशल",
    zeroRngDesc: "परिणाम पूरी तरह से मानसिक चपलता, रणनीति और गति पर निर्भर करते हैं, भाग्य का कोई प्रभाव नहीं होता।",
    clockTitle: "सुरक्षित केंद्रीयकृत घड़ी",
    clockDesc: "निज़ालो क्लाउड पर मिलीसेकंड तक सटीक समय समकालन, ताकि कोई समय से छेड़छाड़ न कर सके।",
    eloTitle: "सटीक Glicko-2 और ELO रेटिंग",
    eloDesc: "प्रत्येक आधिकारिक मैच के बाद सटीक गणितीय सूत्रों से निष्पक्ष प्रतिद्वंद्वी मुकाबला सुनिश्चित होता है।",
    rulesBadge: "निज़ालो आधिकारिक मान्यता प्राप्त मानक",
    rulesHeroHeading: (name) => `${name}: आधिकारिक टूर्नामेंट नियम`,
    rulesHeroTagline: "100% कौशल-आधारित निष्पक्ष खेल और उन्नत एंटी-चीट सुरक्षा प्रणाली।",
    primaryObj: "मुख्य उद्देश्य",
    primaryObjFallback: "विरोधी से पहले आधिकारिक जीत की शर्तें पूरी करें या समय समाप्त कराएं।",
    setupLayout: "बोर्ड व्यवस्था",
    setupLayoutFallback: "प्रमाणित टूर्नामेंट लेआउट के अनुसार मोहरे तुरंत सज जाते हैं।",
    mechanics: "खेल तंत्र",
    mechanicsFallback: "आधिकारिक टूर्नामेंट नियम लागू होते हैं।",
    victoryCond: "जीत की शर्तें",
    victoryCondFallback: "निर्णायक रणनीतिक बढ़त या स्कोर सीमा तक पहुंचना।",
    beginnerTips: "शुरुआती सुझाव",
    beginnerTipsFallback: "बोर्ड के केंद्र को नियंत्रित करें और समय का ध्यान रखें।",
    mistakesToAvoid: "बचने योग्य गलतियाँ",
    mistakesFallback: "बिना सोचे-समझे जल्दबाजी में चालें चलना।",
    openingPrinciples: "शुरुआती सिद्धांत",
    openingFallback: "मोहरों का तेजी से और संतुलित फैलाव।",
    tacticalPatterns: "रणनीतिक पैटर्न",
    tacticalFallback: "विरोधी की कमजोरियों का फायदा उठाना।",
    midgameCoord: "मध्य-खेल समन्वय",
    midgameFallback: "खुली लाइनों पर एकजुट दबाव बनाना।",
    deepCalc: "गहरी गणना",
    deepCalcFallback: "4 से 6 अग्रिम चालों का पूर्वानुमान।",
    clockMgmt: "समय प्रबंधन",
    clockMgmtFallback: "अंत में बढ़त बनाए रखने के लिए समय का सदुपयोग।",
    endgamePrecision: "अंतिम चालों में सटीकता",
    endgameFallback: "छोटी बढ़त को निश्चित जीत में बदलना।",
    noFaq: "वर्तमान में कोई प्रश्न दर्ज नहीं है।",
    tournamentFormat: "टूर्नामेंट प्रारूप",
    tournamentFormatFallback: "सिंगल एलिमिनेशन या स्विस ब्रैकेट संरचना।",
    tieBreakers: "टाई-ब्रेकर नियम",
    tieBreakersFallback: "निर्णायक ब्लिट्ज़ सडन डेथ मुकाबला।",
    prizeDist: "पुरस्कार वितरण",
    prizeDistFallback: "विजेताओं के वॉलेट में तत्काल और पारदर्शी भुगतान।",
    matchmaking: "कौशल-आधारित मैचमेकिंग",
    matchmakingFallback: "समान स्तर के प्रतिद्वंद्वी से तुरंत जुड़ने की प्रणाली।",
    latencyProtection: "विलंबता संरक्षण (Lag Protection)",
    latencyFallback: "इंटरनेट उतार-चढ़ाव को बेअसर करने के लिए सर्वर-साइड समन्वय।",
    fairPlayShield: "फेयर प्ले शील्ड",
    fairPlayFallback: "स्वचालित बॉट और सहायता के खिलाफ 24/7 निगरानी।",
    topRanked: (name) => `${name} में शीर्ष खिलाड़ी`,
    exploreOther: "अन्य कौशल खेल देखें",
    coreCtaFallback: "साबित करें. खेलें. जीतें.",
    legalNoticeFallback: "पात्र कौशल प्रतियोगिताओं के माध्यम से पुरस्कार अर्जित करें",
  },
  zh: {
    home: "首页",
    games: "游戏",
    simultaneousTurns: "实时同步回合",
    alternatingTurns: "交替落子回合",
    turnModelLabel: "回合机制",
    simultaneous: "同步进行",
    alternating: "轮流交替",
    avgDuration: "平均时长",
    competitiveMode: "竞技模式",
    skillCeiling: "操作上限",
    highPureSkill: "极高 / 纯技巧博弈",
    prizeActive: "高额锦标赛进行中",
    freePlayOnly: "自由排位与练习",
    playNow: (name) => `立即体验 ${name}`,
    aboutGame: (name) => `关于 ${name}`,
    zeroRngTitle: "零运气干扰 / 绝对硬核",
    zeroRngDesc: "胜负完全取决于脑力决策、战术布局和反应速度，不存在任何随机概率干预。",
    clockTitle: "毫秒级权威中央时钟",
    clockDesc: "对局时钟在 Nizalo 边缘云端毫秒级强同步，杜绝本地时间篡改与网络延迟作弊。",
    eloTitle: "权威 Glicko-2 与 ELO 天梯",
    eloDesc: "每场认证天梯赛后实时重算动态分值，确保精准匹配旗鼓相当的对手。",
    rulesBadge: "Nizalo 官方认证赛事标准",
    rulesHeroHeading: (name) => `${name}：官方竞技规则体系`,
    rulesHeroTagline: "100%纯技术博弈，搭载确定性状态引擎与顶级反作弊防护网。",
    primaryObj: "核心胜利目标",
    primaryObjFallback: "先于对手达成官方胜利条件或迫使对手超时认负。",
    setupLayout: "棋盘与初始开局",
    setupLayoutFallback: "所有棋子与棋盘依据国际认证比赛标准毫秒级精准初始化。",
    mechanics: "核心对决机制",
    mechanicsFallback: "严格遵照国际赛事权威准则执行。",
    victoryCond: "终局胜负判定",
    victoryCondFallback: "达成致命将死或达到指定计分阈值判定胜负。",
    beginnerTips: "入门核心指引",
    beginnerTipsFallback: "优先控制棋盘核心要道，时刻关注时钟节奏。",
    mistakesToAvoid: "新手高频误区",
    mistakesFallback: "切忌未经深度推演盲目激进出击。",
    openingPrinciples: "开局布局哲学",
    openingFallback: "协调子力快速高效占领战略要地。",
    tacticalPatterns: "制胜战术定式",
    tacticalFallback: "精准洞察并打击对手防线重叠弱点。",
    midgameCoord: "中局协同压制",
    midgameFallback: "在开放路线上形成多维度联合施压。",
    deepCalc: "多步深度推演",
    deepCalcFallback: "推演后续4至6步强制应手走向。",
    clockMgmt: "时钟与心理博弈",
    clockMgmtFallback: "维持合理时钟优势，在残局制造压倒性心理压力。",
    endgamePrecision: "残局终结技巧",
    endgameFallback: "将微弱的局面优势转化为无可逆转的胜局。",
    noFaq: "暂无记录的常见疑问。",
    tournamentFormat: "赛事锦标赛赛制",
    tournamentFormatFallback: "单败淘汰制或瑞士轮积分赛结构。",
    tieBreakers: "决胜加赛规则",
    tieBreakersFallback: "超快棋猝死加赛决出晋级资格。",
    prizeDist: "奖金即时结算",
    prizeDistFallback: "优胜者奖金经智能合约自动审计，秒级即时划拨至钱包。",
    matchmaking: "精准天梯匹配",
    matchmakingFallback: "动态容差算法，秒速锁定水平最接近的全球顶尖对手。",
    latencyProtection: "抗弱网延迟补偿",
    latencyFallback: "服务端权威状态对齐，全面消除网络波动对操作的影响。",
    fairPlayShield: "反作弊公平天网",
    fairPlayFallback: "毫秒级操作行为学特征识别，全天候阻断引擎与外挂辅助。",
    topRanked: (name) => `${name} 全球天梯精英榜`,
    exploreOther: "探索更多竞技脑力项目",
    coreCtaFallback: "实力证明。即刻对决。赢取奖励。",
    legalNoticeFallback: "通过符合资格的技巧竞技赢取丰厚奖励",
  },
};

export function GameDetailClient({
  locale,
  gameId,
}: {
  locale: string;
  gameId: string;
}) {
  const { t } = useI18n();
  const plugin = getGame(gameId);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const pageDict = (GAME_PAGE_I18N[locale] ?? GAME_PAGE_I18N["en"])!;

  const gameContent: GameLocalizedContent | null = getGameContent(gameId, locale);
  const allGames = listGames();

  if (!plugin) {
    return (
      <>
        <Header />
        <main className="nz-container">
          <p className={styles.unknown}>{t("common.unknown_game")}</p>
        </main>
        <Footer />
      </>
    );
  }

  const isRtl = locale === "ar";
  const gameName = gameContent?.title || t(`common.game_names.${plugin.nameKey}`);
  const tagline = gameContent?.tagline || t(`home.games.${plugin.nameKey}.description`);
  const coreCta = gameContent?.coreCta || pageDict.coreCtaFallback;
  const legalNotice = gameContent?.legalPrizeNotice || pageDict.legalNoticeFallback;

  const gameTokens = getGameThemeTokens(plugin.id);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nizalo.com";
  const canonicalUrl = `${siteUrl}/${locale}/games/${plugin.id}`;

  // Structured Data
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: pageDict.home,
        item: `${siteUrl}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: pageDict.games,
        item: `${siteUrl}/${locale}/games`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: gameName,
        item: canonicalUrl,
      },
    ],
  };

  const videoGameLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: gameName,
    description: tagline,
    genre: ["Skill Game", "Board Game", "Competitive Strategy"],
    gamePlatform: ["Web Browser", "Android", "iOS"],
    applicationCategory: "Game",
    inLanguage: locale,
    url: canonicalUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: {
      "@type": "Organization",
      name: "Nizalo Arena",
      url: siteUrl,
    },
  };

  const faqLd = gameContent?.faq && gameContent.faq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: gameContent.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }
    : null;

  const tabLabels: Record<TabKey, Record<string, string>> = {
    overview: { ar: "نظرة عامة", en: "Overview", es: "Resumen", fr: "Aperçu", hi: "अवलोकन", zh: "概览" },
    rules: { ar: "القواعد الرسمية", en: "Rules", es: "Reglas", fr: "Règles", hi: "नियम", zh: "规则" },
    beginner: { ar: "دليل المبتدئين", en: "Beginner Guide", es: "Guía para principiantes", fr: "Guide débutant", hi: "शुरुआती गाइड", zh: "新手指南" },
    strategy: { ar: "الاستراتيجية التكتيكية", en: "Tactics & Strategy", es: "Tácticas y Estrategia", fr: "Tactiques & Stratégie", hi: "रणनीति और रणनीति", zh: "战术与策略" },
    advanced: { ar: "الاحتراف المتقدم", en: "Advanced Mastery", es: "Dominio Avanzado", fr: "Maîtrise Avancée", hi: "उन्नत महारत", zh: "高级进阶" },
    faq: { ar: "الأسئلة الشائعة", en: "FAQ", es: "Preguntas frecuentes", fr: "FAQ", hi: "अक्सर पूछे जाने वाले प्रश्न", zh: "常见问题" },
    tournament: { ar: "البطولات والتصفيات", en: "Tournaments", es: "Torneos", fr: "Tournois", hi: "टूर्नामेंट", zh: "锦标赛" },
    livePlay: { ar: "اللعب المباشر والنزاهة", en: "Live & Fair Play", es: "En vivo y Juego Limpio", fr: "Direct & Jeu Équitable", hi: "लाइव और निष्पक्ष खेल", zh: "实时与公平竞技" },
    leaderboard: { ar: "لوحة المتصدرين", en: "Leaderboard", es: "Clasificación", fr: "Classement", hi: "लीडरबोर्ड", zh: "排行榜" },
  };

  const getTabLabel = (tab: TabKey) => (tabLabels[tab][locale] ?? tabLabels[tab]["en"])!;

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={videoGameLd} />
      {faqLd && <JsonLd data={faqLd} />}

      <Header />
      <main className="nz-container" dir={isRtl ? "rtl" : "ltr"}>
        {/* Breadcrumb Navigation */}
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <LocaleLink href="/" className={styles.breadcrumbLink}>
            {pageDict.home}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <LocaleLink href="/games" className={styles.breadcrumbLink}>
            {pageDict.games}
          </LocaleLink>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>{gameName}</span>
        </nav>

        {/* Hero Section */}
        <header
          className={styles.hero}
          style={{
            "--game-accent": gameTokens.palette.accent,
            "--game-glow": gameTokens.palette.glow,
            "--game-border": gameTokens.palette.border,
          } as React.CSSProperties}
        >
          <div className={styles.heroContent}>
            <div className={styles.badgeRow}>
              <div
                className={styles.personaBadge}
                style={{
                  borderColor: gameTokens.palette.border,
                  color: gameTokens.palette.accent,
                  boxShadow: `0 0 16px ${gameTokens.palette.glow}`,
                }}
              >
                <span className={styles.personaDot} style={{ background: gameTokens.palette.accent }} />
                <span>{gameTokens.persona[locale] || gameTokens.persona.en}</span>
              </div>
              <span className={styles.badgeTag}>
                {plugin.turnModel === "SIMULTANEOUS"
                  ? pageDict.simultaneousTurns
                  : pageDict.alternatingTurns}
              </span>
              <span className={styles.badgeTag}>
                {t(`home.games.${plugin.nameKey}.duration`)}
              </span>
              <span
                className={styles.badgeTag}
                style={{
                  color: plugin.cashEnabled ? "#10b981" : "var(--nz-text-3)",
                  borderColor: plugin.cashEnabled ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.1)",
                }}
              >
                {plugin.cashEnabled
                  ? pageDict.prizeActive
                  : pageDict.freePlayOnly}
              </span>
            </div>

            <h1
              className={styles.heading}
              style={{
                background: `linear-gradient(135deg, #ffffff 0%, ${gameTokens.palette.accent} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {gameName}
            </h1>
            <p className={styles.tagline}>{tagline}</p>

            <dl className={styles.factsBar}>
              <div className={styles.factItem}>
                <dt>{pageDict.turnModelLabel}</dt>
                <dd>
                  {plugin.turnModel === "SIMULTANEOUS"
                    ? pageDict.simultaneous
                    : pageDict.alternating}
                </dd>
              </div>
              <div className={styles.factItem}>
                <dt>{pageDict.avgDuration}</dt>
                <dd>{t(`home.games.${plugin.nameKey}.duration`)}</dd>
              </div>
              <div className={styles.factItem}>
                <dt>{pageDict.competitiveMode}</dt>
                <dd>{t(`home.games.${plugin.nameKey}.mode`)}</dd>
              </div>
              <div className={styles.factItem}>
                <dt>{pageDict.skillCeiling}</dt>
                <dd>{pageDict.highPureSkill}</dd>
              </div>
            </dl>

            <div className={styles.ctaBox}>
              <div className={styles.ctaActions}>
                <LocaleLink href={`/play/${plugin.id}`}>
                  <Button variant="primary">
                    {pageDict.playNow(gameName)}
                  </Button>
                </LocaleLink>
                <span className={styles.coreCtaBanner}>{coreCta}</span>
              </div>
              <p className={styles.complianceNote}>{legalNotice}</p>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <GameThumbnail gameId={plugin.id} title={gameName} variant="hero" />
          </div>
        </header>

        {/* Tab Navigation */}
        <div className={styles.tabsNav} role="tablist">
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <section className={styles.tabContent}>
          {/* 1. OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {pageDict.aboutGame(gameName)}
                </h2>
                {gameContent?.overview && gameContent.overview.length > 0 ? (
                  gameContent.overview.map((paragraph, idx) => (
                    <p key={idx} className={styles.cardText}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className={styles.cardText}>{t(`home.games.${plugin.nameKey}.description`)}</p>
                )}
              </div>

              <div className={styles.listGrid}>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {pageDict.zeroRngTitle}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {pageDict.zeroRngDesc}
                  </p>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {pageDict.clockTitle}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {pageDict.clockDesc}
                  </p>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {pageDict.eloTitle}
                  </h3>
                  <p className={styles.cardText} style={{ fontSize: "13px" }}>
                    {pageDict.eloDesc}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. RULES */}
          {activeTab === "rules" && (
            <div>
              <div className={styles.rulesHeroVisual}>
                <div className={styles.rulesHeroBanner}>
                  <img
                    src={`/images/games/${plugin.id.replace(/_/g, "-")}-versus.jpg`}
                    alt={`${gameName} Rules & Tactics`}
                    className={styles.rulesHeroImage}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.onerror = null;
                      img.src = IMG_PLACEHOLDER;
                    }}
                  />
                  <div className={styles.rulesHeroOverlay}>
                    <span className={styles.rulesBadge}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      {pageDict.rulesBadge}
                    </span>
                    <h2 className={styles.rulesHeroHeading}>
                      {pageDict.rulesHeroHeading(gameName)}
                    </h2>
                    <p className={styles.rulesHeroTagline}>
                      {pageDict.rulesHeroTagline}
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {pageDict.primaryObj}
                </h2>
                <p className={styles.cardText}>
                  {gameContent?.rules.objective || pageDict.primaryObjFallback}
                </p>

                <h3 className={styles.featureBoxHeading} style={{ marginTop: "20px" }}>
                  {pageDict.setupLayout}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.rules.setup || pageDict.setupLayoutFallback}
                </p>
              </div>

              <div className={styles.listGrid}>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {pageDict.mechanics}
                  </h3>
                  <ul className={styles.featureBoxList}>
                    {gameContent?.rules.mechanics.map((mech, idx) => (
                      <li key={idx}>{mech}</li>
                    )) || (
                      <li>{pageDict.mechanicsFallback}</li>
                    )}
                  </ul>
                </div>
                <div className={styles.featureBox}>
                  <h3 className={styles.featureBoxHeading}>
                    {pageDict.victoryCond}
                  </h3>
                  <ul className={styles.featureBoxList}>
                    {gameContent?.rules.victoryConditions.map((cond, idx) => (
                      <li key={idx}>{cond}</li>
                    )) || (
                      <li>{pageDict.victoryCondFallback}</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 3. BEGINNER */}
          {activeTab === "beginner" && (
            <div className={styles.listGrid}>
              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {pageDict.beginnerTips}
                </h2>
                <ul className={styles.featureBoxList}>
                  {gameContent?.beginner.coreTips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  )) || (
                    <li>{pageDict.beginnerTipsFallback}</li>
                  )}
                </ul>
              </div>

              <div className={styles.contentCard}>
                <h2 className={styles.cardTitle}>
                  {pageDict.mistakesToAvoid}
                </h2>
                <ul className={styles.featureBoxList}>
                  {gameContent?.beginner.commonMistakes.map((mistake, idx) => (
                    <li key={idx} style={{ color: "#ff8b8b" }}>
                      {mistake}
                    </li>
                  )) || (
                    <li>{pageDict.mistakesFallback}</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* 4. STRATEGY */}
          {activeTab === "strategy" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.openingPrinciples}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.openingPrinciples.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.openingFallback}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.tacticalPatterns}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.tacticalPatterns.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.tacticalFallback}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.midgameCoord}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.strategy.midgameCoordination.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.midgameFallback}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* 5. ADVANCED */}
          {activeTab === "advanced" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.deepCalc}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.deepCalculation.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.deepCalcFallback}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.clockMgmt}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.clockManagement.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.clockMgmtFallback}</li>}
                </ul>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.endgamePrecision}
                </h3>
                <ul className={styles.featureBoxList}>
                  {gameContent?.advancedStrategy.endgameTechnique.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  )) || <li>{pageDict.endgameFallback}</li>}
                </ul>
              </div>
            </div>
          )}

          {/* 6. FAQ */}
          {activeTab === "faq" && (
            <div>
              {gameContent?.faq && gameContent.faq.length > 0 ? (
                gameContent.faq.map((item, idx) => (
                  <details key={idx} className={styles.faqItem}>
                    <summary className={styles.faqSummary}>{item.question}</summary>
                    <p className={styles.faqAnswer}>{item.answer}</p>
                  </details>
                ))
              ) : (
                <p className={styles.empty}>{pageDict.noFaq}</p>
              )}
            </div>
          )}

          {/* 7. TOURNAMENT */}
          {activeTab === "tournament" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.tournamentFormat}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.format || pageDict.tournamentFormatFallback}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.tieBreakers}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.tieBreakers || pageDict.tieBreakersFallback}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.prizeDist}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.tournament.prizeDistribution || pageDict.prizeDistFallback}
                </p>
              </div>
            </div>
          )}

          {/* 8. LIVE PLAY */}
          {activeTab === "livePlay" && (
            <div className={styles.listGrid}>
              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.matchmaking}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.matchmaking || pageDict.matchmakingFallback}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.latencyProtection}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.latencyProtection || pageDict.latencyFallback}
                </p>
              </div>

              <div className={styles.featureBox}>
                <h3 className={styles.featureBoxHeading}>
                  {pageDict.fairPlayShield}
                </h3>
                <p className={styles.cardText}>
                  {gameContent?.livePlay.fairPlayEngine || pageDict.fairPlayFallback}
                </p>
              </div>
            </div>
          )}

          {/* 9. LEADERBOARD */}
          {activeTab === "leaderboard" && (
            <div className={styles.contentCard}>
              <h2 className={styles.cardTitle}>
                {pageDict.topRanked(gameName)}
              </h2>
              <Leaderboard gameId={plugin.id} />
            </div>
          )}
        </section>

        {/* Internal Linking: Other Games Carousel / Grid */}
        <section style={{ borderTop: "1px solid var(--nz-line)", paddingBlock: "var(--nz-space-8)" }}>
          <h2 className={styles.cardTitle}>
            {pageDict.exploreOther}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--nz-space-4)",
              marginTop: "var(--nz-space-4)",
            }}
          >
            {allGames
              .filter((g) => g.id !== plugin.id)
              .map((g) => (
                <LocaleLink
                  key={g.id}
                  href={`/games/${g.id}`}
                  style={{
                    textDecoration: "none",
                    background: "var(--nz-surface-1, #12141a)",
                    border: "1px solid var(--nz-line)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  <div style={{ aspectRatio: "16 / 9" }}>
                    <GameThumbnail gameId={g.id} title={t(`common.game_names.${g.nameKey}`)} />
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "14px",
                        color: "var(--nz-text)",
                        marginBottom: "4px",
                      }}
                    >
                      {t(`common.game_names.${g.nameKey}`)}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--nz-text-3)" }}>
                      {t(`home.games.${g.nameKey}.duration`)}
                    </div>
                  </div>
                </LocaleLink>
              ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Leaderboard({ gameId }: { gameId: string }) {
  const { t } = useI18n();
  const { player, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!player) {
      setSignedOut(true);
      return;
    }
    let cancelled = false;
    void get<{ gameId: string; entries: LeaderboardEntry[] }>(
      `/v1/leaderboard?game=${encodeURIComponent(gameId)}&limit=10`
    )
      .then((r) => {
        if (!cancelled) setEntries(r.entries);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setSignedOut(true);
        else setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, player, loading]);

  if (signedOut)
    return (
      <p className={styles.empty}>{t("gameDetailsPage.leaderboard_signed_out")}</p>
    );
  if (entries === null) return null;
  if (entries.length === 0)
    return <p className={styles.empty}>{t("gameDetailsPage.leaderboard_empty")}</p>;

  return (
    <ol className={styles.leaderboard}>
      {entries.map((e, i) => (
        <li key={e.player_id} className={styles.leaderboardRow}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.handle}>{e.handle}</span>
          <span className={styles.played}>
            {t("gameDetailsPage.leaderboard_games_played", { count: e.games_played })}
          </span>
          <span className={`nz-num ${styles.rating}`}>
            {Math.round(e.rating_x100 / 100)}
          </span>
        </li>
      ))}
    </ol>
  );
}
