"use client";

/**
 * The pre-match flow for any registered game: Mode -> (Difficulty ->)
 * Stake -> matchmaking/creation, entirely driven by the resolved
 * GamePlugin's own capabilities (supportsAI, difficulties, cashEnabled) --
 * never a gameId switch.
 *
 * VS_COMPUTER never sees a stake step at all -- FREE ONLY, full stop: a
 * computer opponent must never be presented as a real-money opponent, so
 * this file simply never routes that mode through StakeSelect the way
 * FRIEND and RANDOM_OPPONENT both do. TOURNAMENT never opens a step here
 * either; its card in ModeSelect links straight into the standalone
 * /tournaments surface.
 */
import { use, useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MatchmakingFlow } from "@/components/matchmaking/MatchmakingFlow";
import { ModeSelect, type PlayMode } from "@/components/play/ModeSelect";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { DifficultySelect } from "@/components/play/DifficultySelect";
import { StakeSelect, type StakeChoice } from "@/components/play/StakeSelect";
import { FriendChallenge } from "@/components/play/FriendChallenge";
import { TimeControlSelect, type TimeProfile } from "@/components/play/TimeControlSelect";
import { getGame, type Difficulty } from "@/lib/games";
import { post, setTokens } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { ChessTimePerMoveSelect } from "@/components/play/ChessTimePerMoveSelect";
import { GameSpecificConfig, type GameSpecificConfigValue } from "@/components/play/GameSpecificConfig";
import { getGameCapability } from "@/lib/games/capabilities";
import { getGameThemeTokens } from "@/lib/games/theme-tokens";
import { useI18n } from "@/lib/i18n/context";
import styles from "./playGame.module.css";

// Last-resort fallback for a game with no real photography yet (e.g. a
// brand-new game shipped before its JPG assets exist) -- a small inline
// placeholder beats a broken-image icon on the pre-match screen.
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230D111A'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%23FFD700' stroke-opacity='0.45' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23FFD700' fill-opacity='0.7'/%3E%3C/svg%3E";

type Step =
  | { name: "mode" }
  | { name: "game_config"; targetMode: "VS_COMPUTER" | "RANDOM_OPPONENT" | "FRIEND" }
  | { name: "difficulty" }
  | { name: "time_control"; difficulty: Difficulty | null }
  | { name: "friend_stake" }
  | { name: "random_stake" }
  | { name: "friend"; stake: StakeChoice }
  | { name: "matchmaking"; stake: StakeChoice };

interface RuleItem {
  title: Record<string, string>;
  desc: Record<string, string>;
  titleAr?: string;
  titleEn?: string;
  descAr?: string;
  descEn?: string;
}

interface GameIdentitySpec {
  timingBadge: Record<string, string>;
  natureBadge: Record<string, string>;
  dopamineBadge: Record<string, string>;
  subtitle: Record<string, string>;
  rules: RuleItem[];
}

const GAME_IDENTITY_REGISTRY: Record<string, GameIdentitySpec> = {
  chess: {
    timingBadge: {
      ar: "⏱️ ساعة فيد الرسمية (3+2 أو 60ث)",
      en: "⏱️ Official FIDE Clock (3+2 / 60s)",
      es: "⏱️ Reloj oficial FIDE (3+2 / 60s)",
      fr: "⏱️ Pendule officielle FIDE (3+2 / 60s)",
      hi: "⏱️ आधिकारिक FIDE घड़ी (3+2 / 60s)",
      zh: "⏱️ 国际棋联官方时钟 (3+2 / 60秒)",
    },
    natureBadge: {
      ar: "🧠 ذكاء وتكتيك حتمي 100%",
      en: "🧠 100% Deterministic Skill",
      es: "🧠 Habilidad determinista 100%",
      fr: "🧠 100% Compétence déterministe",
      hi: "🧠 100% बौद्धिक और रणनीतिक कौशल",
      zh: "🧠 100% 绝对硬核棋艺",
    },
    dopamineBadge: {
      ar: "💥 كش مات مهيب وصعود ELO",
      en: "💥 Checkmate Freeze-Frame & ELO",
      es: "💥 Jaque mate épico y ascenso ELO",
      fr: "💥 Échec et mat magistral & montée ELO",
      hi: "💥 शानदार चेकमेट और ELO बढ़त",
      zh: "💥 震撼绝杀将死 & 冲榜天梯",
    },
    subtitle: {
      ar: "معركة الملوك الخالدة بقواعد الاتحاد الدولي للشطرنج (FIDE) كاملة وصارمة.",
      en: "The timeless battle of grandmasters under strict international FIDE laws.",
      es: "La batalla eterna de los grandes maestros bajo las estrictas reglas de la FIDE.",
      fr: "La bataille intemporelle des grands maîtres selon les règles strictes de la FIDE.",
      hi: "अंतर्राष्ट्रीय FIDE नियमों के तहत बुद्धि और रणनीति की शाश्वत लड़ाई।",
      zh: "遵循国际棋联严谨规则的终极智力巅峰对决。",
    },
    rules: [
      {
        title: {
          ar: "التبييت القانوني (Castling)",
          en: "Castling Maneuver",
          es: "Enroque legal",
          fr: "Roque réglementaire",
          hi: "कैसलिंग दांव",
          zh: "王车易位",
        },
        desc: {
          ar: "حماية الملك بالتبادل مع القلعة شرط ألا يكون الملك أو مساره تحت التهديد، ولم تتحرك القطعتان مسبقاً.",
          en: "Secure your King with the Rook provided neither has moved and the traversed squares are safe.",
          es: "Protege al Rey con la Torre siempre que ninguna se haya movido y las casillas no estén amenazadas.",
          fr: "Mettez le Roi à l'abri avec la Tour si aucune des deux pièces n'a bougé et que la voie est libre.",
          hi: "राजा को किश्ती के साथ सुरक्षित करें यदि दोनों नहीं हिले हों और बीच के वर्ग सुरक्षित हों।",
          zh: "王与车协同移动入堡保卫，前提是二者未曾移动且途径方格无威胁。",
        },
      },
      {
        title: {
          ar: "الأخذ بالتجاوز (En Passant)",
          en: "En Passant Capture",
          es: "Captura al paso",
          fr: "Prise en passant",
          hi: "एन पासेंट चाल",
          zh: "吃过路兵",
        },
        desc: {
          ar: "أكل بيدق الخصم فور تحركه خطوتين للأمام إذا جاور بيدقك، وتسقط هذه الفرصة بعد النقلة مباشرة.",
          en: "Capture an opponent pawn that advanced two squares immediately on the very next turn.",
          es: "Captura un peón rival que avance dos casillas inmediatamente en el siguiente turno.",
          fr: "Capturez un pion adverse ayant avancé de deux cases immédiatement au coup suivant.",
          hi: "विरोधी के मोहरे को दो कदम आगे बढ़ते ही तुरंत अगली चाल में काटें।",
          zh: "对手兵前进两格越过相邻兵时，须立即在下一回合执行吃过路兵。",
        },
      },
      {
        title: {
          ar: "ترقية البيادق (Pawn Promotion)",
          en: "Pawn Promotion",
          es: "Promoción del peón",
          fr: "Promotion du pion",
          hi: "मोहरे की पदोन्नति",
          zh: "兵的升变",
        },
        desc: {
          ar: "بلوغ البيدق الصف الثامن للخصم يمنحه الترقية الإجبارية الفورية لوزير أو قلعة أو فيل أو حصان.",
          en: "Reaching the 8th rank instantly crowns your pawn into a Queen, Rook, Bishop, or Knight.",
          es: "Llegar a la 8ª fila transforma de inmediato tu peón en Reina, Torre, Alfil o Caballo.",
          fr: "Atteindre la 8e rangée transforme immédiatement le pion en Dame, Tour, Fou ou Cavalier.",
          hi: "8वीं पंक्ति तक पहुंचने पर मोहरा तुरंत वज़ीर, किश्ती, ऊंट या घोड़े में बदल जाता है।",
          zh: "兵到达底线第八排时，立即强制升变为后、车、象或马。",
        },
      },
      {
        title: {
          ar: "قواعد التعادل المعتمدة",
          en: "Official Draw Conditions",
          es: "Condiciones de tablas",
          fr: "Conditions de nulle",
          hi: "आधिकारिक ड्रॉ नियम",
          zh: "法定和棋规则",
        },
        desc: {
          ar: "تعادل الكش الميت (Stalemate)، تكرار الموقف 3 مرات، أو مرور 50 نقلة دون أكل أو تحريك أي بيدق.",
          en: "Stalemate, threefold repetition, or 50 moves without a capture or pawn advance.",
          es: "Rey ahogado, triple repetición de posición o 50 movimientos sin capturas ni avance de peones.",
          fr: "Pat, triple répétition de position ou 50 coups sans capture ni poussée de pion.",
          hi: "स्टेलमेट, तीन बार दोहराव, या बिना किसी चाल के 50 चालों का नियम।",
          zh: "逼和（无子可动）、三次重复局面或五十回合无吃子推进规则。",
        },
      },
    ],
  },
  dominoes: {
    timingBadge: {
      ar: "⏱️ 25 ثانية لكل نقلة",
      en: "⏱️ 25s Move Timer",
      es: "⏱️ 25s por jugada",
      fr: "⏱️ 25s par coup",
      hi: "⏱️ 25 सेकंड प्रति चाल",
      zh: "⏱️ 25秒出牌时限",
    },
    natureBadge: {
      ar: "🀄 قراءة بنك وتطابق أطراف",
      en: "🀄 Tile Tracking & Open Ends",
      es: "🀄 Conteo de fichas y extremos abiertos",
      fr: "🀄 Lecture du talon & bouts ouverts",
      hi: "🀄 टाइल ट्रैकिंग और रणनीति",
      zh: "🀄 记牌推演与两端掌控",
    },
    dopamineBadge: {
      ar: "🀄 خبطة الدومينو وإغلاق القفل",
      en: "🀄 Domino Slam & Game Block",
      es: "🀄 Golpe de ficha y cierre maestro",
      fr: "🀄 Claquement de domino & blocage",
      hi: "🀄 डोमिनोज़ स्लैम और लॉक",
      zh: "🀄 震撼扣牌绝杀与封门",
    },
    subtitle: {
      ar: "لعبة المقاهي العريقة بحسابات البنك والأطراف المفتوحة بالنمط العادي والأمريكي.",
      en: "The classic tile-shedding duel of deduction and bone control in Traditional and American All-Fives.",
      es: "El clásico duelo de fichas y deducción en modalidades Tradicional y Americana.",
      fr: "Le duel classique de déduction et de pose en modes Traditionnel et Américain.",
      hi: "पारंपरिक और अमेरिकी ऑल-फाइव्स शैलियों में क्लासिक डोमिनोज़ द्वंद्व।",
      zh: "经典骨牌博弈，支持传统抽牌点数与美式全五计分双模式。",
    },
    rules: [
      {
        title: {
          ar: "مطابقة الأطراف المفتوحة",
          en: "Open End Matching",
          es: "Emparejamiento de extremos",
          fr: "Correspondance des bouts",
          hi: "खुले सिरों का मिलान",
          zh: "牌端匹配规则",
        },
        desc: {
          ar: "يجب أن يتطابق رقم البلاطة مع أحد الطرفين المفتوحين على الطاولة، وإلا يلزم السحب من البنك.",
          en: "Played tiles must match one of the active open ends; otherwise draw from the boneyard.",
          es: "Las fichas jugadas deben coincidir con un extremo libre o robar del pozo.",
          fr: "Le domino posé doit correspondre à l'un des bouts ouverts, sinon piochez au talon.",
          hi: "खेली गई टाइल खुले सिरों में से एक से मेल खानी चाहिए, अन्यथा बैंक से उठाएं।",
          zh: "所出骨牌的点数必须与场上开放两端之一吻合，否则需从牌堆摸牌。",
        },
      },
      {
        title: {
          ar: "النمط العادي (Draw/Block)",
          en: "Traditional Draw & Block",
          es: "Modo Tradicional (Robo/Cierre)",
          fr: "Traditionnel (Pioche/Blocage)",
          hi: "पारंपरिक शैली",
          zh: "传统摸牌与封顶",
        },
        desc: {
          ar: "الفوز بإنهاء كل البلاطات في يدك أولاً، أو الحصول على أقل مجموع نقاط عند غلق اللعبة (القفل).",
          en: "Win by shedding all your tiles first or holding the lowest pip sum during a dead block.",
          es: "Gana quien coloque todas sus fichas primero o tenga menos puntos en un cierre.",
          fr: "Gagnez en posant tous vos dominos en premier ou en ayant le moins de points au blocage.",
          hi: "अपनी सभी टाइलें पहले समाप्त करके या बंद होने पर सबसे कम अंक रखकर जीतें।",
          zh: "率先打光手牌者获胜；死局封顶时，手中点数最少者取得胜利。",
        },
      },
      {
        title: {
          ar: "النمط الأمريكي (All-Fives)",
          en: "American All-Fives",
          es: "Modo Americano (All-Fives)",
          fr: "Américain (All-Fives)",
          hi: "अमेरिकन ऑल-फाइव्स",
          zh: "美式全五计分",
        },
        desc: {
          ar: "تسجيل فوري للنقاط عند لعب بلاطة تجعل مجموع الأطراف المفتوحة يقبل القسمة على 5.",
          en: "Score points immediately whenever the sum of exposed ends forms a multiple of 5.",
          es: "Suma puntos al instante cuando los extremos abiertos sumen un múltiplo de 5.",
          fr: "Marquez immédiatement des points quand la somme des bouts forme un multiple de 5.",
          hi: "जब भी खुले सिरों का योग 5 का गुणज हो, तुरंत अंक अर्जित करें।",
          zh: "当两端外露点数之和能被5整除时，立即计入对应分数。",
        },
      },
      {
        title: {
          ar: "إغلاق اللعبة (القفل)",
          en: "Blocked Game Resolution",
          es: "Resolución de juego cerrado",
          fr: "Résolution de partie bloquée",
          hi: "ब्लॉक गेम समाधान",
          zh: "死锁终局结算",
        },
        desc: {
          ar: "عند نفاد البنك واستحالة لعب أي حركة من الطرفين، يُحسب مجموع نقاط يد كل لاعب لحسم الفائز.",
          en: "When the boneyard empties and neither can play, lowest remaining pip count claims victory.",
          es: "Cuando nadie puede jugar, el jugador con menor suma de puntos se lleva la victoria.",
          fr: "Si le jeu est bloqué, le joueur possédant le moins de points l'emporte.",
          hi: "खेल रुकने पर, सबसे कम अंकों वाला खिलाड़ी जीत हासिल करता है।",
          zh: "当牌堆摸尽且双方皆无合法出牌时，手牌点数总和较小者获胜。",
        },
      },
    ],
  },
  ludo: {
    timingBadge: {
      ar: "⏱️ 20 ثانية مع رمي تلقائي مريح",
      en: "⏱️ 20s Auto-Roll Pacing",
      es: "⏱️ 20s con tirada asistida",
      fr: "⏱️ 20s avec lancer assisté",
      hi: "⏱️ 20 सेकंड ऑटो-रोल गति",
      zh: "⏱️ 20秒节奏辅助掷骰",
    },
    natureBadge: {
      ar: "🎲 سباق تكتيكي وحظ عادل",
      en: "🎲 Tactical Race & Fair Dice",
      es: "🎲 Carrera táctica y dados justos",
      fr: "🎲 Course tactique & dés équitables",
      hi: "🎲 रणनीतिक दौड़ और निष्पक्ष पासा",
      zh: "🎲 战术竞速与防作弊骰子",
    },
    dopamineBadge: {
      ar: "🔥 الستة الذهبية وتشقلب النرد 3D",
      en: "🔥 3D Cyber-Die & Golden 6",
      es: "🔥 Dado 3D y el 6 de oro",
      fr: "🔥 Dé Cyber 3D & 6 d'Or",
      hi: "🔥 3D पासा और सुनहरा 6",
      zh: "🔥 3D赛博骰子与黄金6点",
    },
    subtitle: {
      ar: "سباق الحظ والتكتيك الأسطوري بنرد ثلاثي الأبعاد وغرف خاصة بدون مستويات مصطنعة.",
      en: "The legendary race of fortune and ambush with 3D Cyber-Dice and private friend rooms.",
      es: "La legendaria carrera de estrategia y dados 3D en salas privadas sin niveles artificiales.",
      fr: "La course légendaire de fortune et d'embuscades avec dés 3D et salons privés.",
      hi: "3D पासे और निजी कमरों के साथ भाग्य और रणनीति की प्रसिद्ध दौड़।",
      zh: "经典飞行棋竞技重塑，搭载纯真物理3D赛博骰子与实时好友房间。",
    },
    rules: [
      {
        title: {
          ar: "الخروج من القاعدة (الرقم 6)",
          en: "Base Spawn with 6",
          es: "Salida de base con 6",
          fr: "Sortie de base avec un 6",
          hi: "6 पर बेस से बाहर",
          zh: "掷6起飞",
        },
        desc: {
          ar: "يتطلب خروج أي قاطعة من قاعدتها إلى نقطة الانطلاق رمي الرقم (6) حصراً.",
          en: "Spawning any token from your home yard to the start square requires rolling exactly a 6.",
          es: "Sacar una ficha de la base a la casilla de inicio requiere sacar un 6 en el dado.",
          fr: "Sortir un pion de sa base vers la case de départ nécessite d'obtenir un 6.",
          hi: "अपने मोहरे को बेस से निकालने के लिए पासे पर 6 लाना अनिवार्य है।",
          zh: "棋子必须掷出数字6方可从停机坪起飞进入起始格。",
        },
      },
      {
        title: {
          ar: "الرمية الإضافية المجانية (Bonus Roll)",
          en: "Bonus Extra Roll",
          es: "Tirada extra de bonificación",
          fr: "Lancer bonus gratuit",
          hi: "बोनस रोल",
          zh: "奖励连掷",
        },
        desc: {
          ar: "تمنح رمية إضافية فورية عند رمي (6)، أو أكل قاطعة للخصم، أو وصول قاطعة لخط النهاية.",
          en: "Earn a free extra roll upon rolling a 6, capturing an enemy token, or reaching home triangle.",
          es: "Obtén otra tirada al sacar un 6, capturar una ficha rival o llegar a la meta.",
          fr: "Obtenez un lancer supplémentaire en faisant un 6, en capturant un pion ou en atteignant l'arrivée.",
          hi: "6 लाने पर, विरोधी का मोहरा काटने पर या घर पहुंचने पर अतिरिक्त चाल मिलती है।",
          zh: "掷出6、击杀对手棋子或己方棋子抵达成终点时，获得额外掷骰奖励。",
        },
      },
      {
        title: {
          ar: "عقوبة الثلاث ستات (Three 6s Rule)",
          en: "Three Consecutive 6s Penalty",
          es: "Penalización por tres 6 seguidos",
          fr: "Pénalité des trois 6",
          hi: "लगातार तीन 6 पर पेनल्टी",
          zh: "连续三连6惩罚",
        },
        desc: {
          ar: "إذا رمى اللاعب (6) ثلاث مرات متتالية، تسقط رميته الثالثة وينقل الدور فوراً منعاً للاحتكار.",
          en: "Rolling three consecutive 6s cancels the third roll and passes the turn immediately.",
          es: "Sacar tres 6 consecutivos anula la tercera tirada y pasa el turno al siguiente.",
          fr: "Obtenir trois 6 consécutifs annule le dernier lancer et passe immédiatement le tour.",
          hi: "लगातार तीन बार 6 आने पर तीसरी चाल रद्द होकर पारी समाप्त हो जाती है।",
          zh: "连续投出三次6点将取消第三次有效行动，强制移交回合。",
        },
      },
      {
        title: {
          ar: "المربعات الآمنة (8 نجوم)",
          en: "8 Star Safe Zones",
          es: "Casillas seguras con estrella",
          fr: "Cases étoiles sécurisées",
          hi: "8 स्टार सुरक्षित क्षेत्र",
          zh: "八处安全星格",
        },
        desc: {
          ar: "المربعات المميزة بعلامة النجمة آمنة تماماً ولا يمكن أكل أي قاطعة تستقر فوقها.",
          en: "Tokens stationed on star-marked squares are completely immune from enemy captures.",
          es: "Las casillas con estrella son zonas seguras donde las fichas no pueden ser capturadas.",
          fr: "Les pions situés sur une case marquée d'une étoile sont totalement protégés.",
          hi: "स्टार वाले वर्गों पर मौजूद मोहरों को विरोधी द्वारा नहीं काटा जा सकता।",
          zh: "停留于星号标记安全格内的棋子享有绝对豁免权，免疫敌方击飞。",
        },
      },
      {
        title: {
          ar: "الوصول الدقيق للنهاية",
          en: "Exact Finishing Roll",
          es: "Llegada exacta a meta",
          fr: "Arrivée exacte au centre",
          hi: "सटीक घर पहुंच",
          zh: "精确进垒撞线",
        },
        desc: {
          ar: "لدخول المثلث الأخير وإنهاء مسار القاطعة، يلزم الحصول على رقم النرد المطابق تماماً للمربعات المتبقية.",
          en: "Entering the final home victory triangle requires the exact remaining roll count.",
          es: "Entrar al triángulo de meta requiere el número exacto de casillas restantes.",
          fr: "Atteindre le triangle final exige le nombre de pas exact restant.",
          hi: "अंतिम घर में प्रवेश करने के लिए पासे पर शेष कदमों का सटीक अंक आना आवश्यक है।",
          zh: "棋子进入中央终点必须摇出与剩余步数完全吻合的精确点数。",
        },
      },
    ],
  },
  backgammon: {
    timingBadge: {
      ar: "⏱️ 25 ثانية لكل نقلة",
      en: "⏱️ 25s Move Timer",
      es: "⏱️ 25s por jugada",
      fr: "⏱️ 25s par coup",
      hi: "⏱️ 25 सेकंड प्रति चाल",
      zh: "⏱️ 25秒出步时限",
    },
    natureBadge: {
      ar: "🎲 احتمالات تكتيكية ومكعب مضاعفة",
      en: "🎲 Tactical Odds & Doubling Cube",
      es: "🎲 Probabilidades tácticas y dado doblador",
      fr: "🎲 Probabilités tactiques & videau",
      hi: "🎲 रणनीतिक संभावनाएं और डबलिंग क्यूब",
      zh: "🎲 概率推演与双倍骰博弈",
    },
    dopamineBadge: {
      ar: "🎲 دحرجة الزهر العاجي ومضاعفة 64x",
      en: "🎲 Ivory Dice & 64x Doubling",
      es: "🎲 Dados de marfil y duplicación 64x",
      fr: "🎲 Dés d'ivoire et doublement 64x",
      hi: "🎲 हाथीदांत पासा और 64x गुणन",
      zh: "🎲 象牙掷骰质感与64倍狂飙",
    },
    subtitle: {
      ar: "أعرق ألعاب الشرق بالتناغم بين احتمالات النرد والتكتيك ومضاعفة الرهان.",
      en: "The imperial contest of board control, bearing off, and doubling stakes.",
      es: "La contienda imperial de control del tablero, retirada y apuestas dobladas.",
      fr: "La joute impériale de contrôle du tablier, de sortie et de doublage de mise.",
      hi: "बोर्ड नियंत्रण, गोटियों को बाहर निकालने और दांव दोगुना करने की शाही प्रतियोगिता।",
      zh: "东方古老文明竞技瑰宝，运筹帷幄步步为营，双倍骰决战巅峰。",
    },
    rules: [
      {
        title: {
          ar: "رمية الدوبل (Double Roll)",
          en: "Double Dice Rule",
          es: "Tirada de dobles",
          fr: "Règle du double",
          hi: "डबल डाइस नियम",
          zh: "同点双倍四掷",
        },
        desc: {
          ar: "الحصول على نردين متطابقين (مثلاً 5-5) يمنحك 4 حركات كاملة بنفس القيمة بدلاً من اثنتين.",
          en: "Rolling matched dice (e.g. 5-5) grants four full moves of that value instead of two.",
          es: "Sacar dados iguales (ej. 5-5) otorga 4 movimientos completos de ese valor en vez de dos.",
          fr: "Obtenir un double (ex. 5-5) accorde 4 déplacements complets de cette valeur au lieu de deux.",
          hi: "समान पासा आने पर दो के बजाय उस मान की 4 पूरी चालें मिलती हैं।",
          zh: "掷出相同点数（如5-5）时，可获得4次该点数的完整走子步数。",
        },
      },
      {
        title: {
          ar: "أكل القرص المنفرد (Blot Hit)",
          en: "Single Blot Capture",
          es: "Captura de ficha aislada",
          fr: "Frappe de pion isolé",
          hi: "एकल मोहरा काटना",
          zh: "击杀单兵出局",
        },
        desc: {
          ar: "الهبوط على نقطة بها قرص وحيد للخصم يطرده فوراً إلى الحاجز الأوسط (Bar) ولا يلعب حتى يخرج.",
          en: "Landing on an isolated enemy checker hits it to the Bar, requiring re-entry before other moves.",
          es: "Caer sobre una ficha rival solitaria la manda a la barra y debe reingresar antes de mover.",
          fr: "Tomber sur un pion ennemi isolé le renvoie sur la barre centrale jusqu'à sa réintroduction.",
          hi: "अकेले दुश्मन मोहरे पर उतरने से वह बाहर हो जाता है और पुनः प्रवेश करना पड़ता है।",
          zh: "落在敌方落单棋子所在三角形格时，该敌子被击飞至中梁，须重新入场。",
        },
      },
      {
        title: {
          ar: "مكعب المضاعفة (Doubling Cube)",
          en: "Doubling Cube Stakes",
          es: "Dado de doblaje",
          fr: "Videau multiplicateur",
          hi: "डबलिंग क्यूब दांव",
          zh: "双倍方块加倍机制",
        },
        desc: {
          ar: "حق رفع قيمة رهان المباراة (2x, 4x, 8x...) ليختار الخصم بين القبول أو الانسحاب الفوري.",
          en: "Propose doubling match stakes (2x, 4x, 8x...); opponent must either accept or forfeit.",
          es: "Propón duplicar la apuesta de la partida; el rival debe aceptar o retirarse de inmediato.",
          fr: "Proposez de doubler l'enjeu du match ; l'adversaire doit accepter ou déclarer forfait.",
          hi: "मैच के दांव को दोगुना करने का प्रस्ताव; विरोधी को स्वीकार करना होगा या हार माननी होगी।",
          zh: "提议对局赌注加倍（2倍、4倍、8倍…），对手必须选择迎战或立即弃局认负。",
        },
      },
      {
        title: {
          ar: "إخراج الأقراص (Bearing Off)",
          en: "Bearing Off to Victory",
          es: "Retirada de fichas",
          fr: "Sortie finale des pions",
          hi: "गोटियों को बाहर निकालना",
          zh: "收回棋子奔向胜利",
        },
        desc: {
          ar: "لا يحق للاعب إخراج أي قرص من اللوح حتى تجتمع جميع أقراصه الـ 15 في بيته الأخير.",
          en: "You cannot bear off any checkers until all 15 of your checkers arrive inside your home board.",
          es: "No puedes retirar fichas del tablero hasta que las 15 estén en tu cuadrante de casa.",
          fr: "Vous ne pouvez sortir de pions avant d'avoir rassemblé vos 15 pions dans votre jan intérieur.",
          hi: "आप तब तक गोटियां बाहर नहीं निकाल सकते जब तक कि सभी 15 गोटियां घर में न आ जाएं।",
          zh: "在所有15颗棋子全部安全集结于己方内盘之前，不得开始收回棋子。",
        },
      },
    ],
  },
  "speed-math": {
    timingBadge: {
      ar: "⏱️ 60 ثانية متزامنة مشتركة",
      en: "⏱️ 60s Shared Sprint",
      es: "⏱️ 60s sprint simultáneo",
      fr: "⏱️ Sprint partagé 60s",
      hi: "⏱️ 60 सेकंड साझा दौड़",
      zh: "⏱️ 60秒实时竞速冲刺",
    },
    natureBadge: {
      ar: "⚡ سرعة بديهة وحساب ذهني",
      en: "⚡ Mental Arithmetic & Reflex",
      es: "⚡ Cálculo mental y reflejos",
      fr: "⚡ Calcul mental & réflexes",
      hi: "⚡ मानसिक अंकगणित और सजगता",
      zh: "⚡ 极速心算与极限反射",
    },
    dopamineBadge: {
      ar: "🔥 مضاعف الكومبو الناري x5",
      en: "🔥 Combo Multiplier Rush x5",
      es: "🔥 Racha multiplicadora de fuego x5",
      fr: "🔥 Multiplicateur combo en feu x5",
      hi: "🔥 फायर कॉम्बो मल्टीप्लायर x5",
      zh: "🔥 连击狂暴点燃5倍暴击",
    },
    subtitle: {
      ar: "سباق الأدرينالين الخالص وجهاً لوجه في الحساب السريع تحت ضغط العداد المتزامن.",
      en: "Pure adrenaline head-to-head arithmetic sprint against the synchronous clock.",
      es: "Pura adrenalina en una carrera cara a cara de cálculo mental contra el reloj sincronizado.",
      fr: "Sprint d'adrénaline pure en calcul mental au coude à coude contre la pendule.",
      hi: "समान समय सीमा के तहत आमने-सामने की तेज अंकगणितीय दौड़।",
      zh: "肾上腺素飙升的毫秒级心算冲刺，纯粹脑力极限碰撞。",
    },
    rules: [
      {
        title: {
          ar: "ساعة مشتركة 60 ثانية",
          en: "Synchronous 60s Race",
          es: "Carrera simultánea de 60s",
          fr: "Course synchrone de 60s",
          hi: "60 सेकंड की साझा दौड़",
          zh: "60秒实时竞速赛钟",
        },
        desc: {
          ar: "نفس الأسئلة الحسابية تعرض لكلا المتسابقين في نفس اللحظة بدون أي تأخير.",
          en: "Identical arithmetic questions appear simultaneously for both competitors in real time.",
          es: "Las mismas preguntas aritméticas aparecen a ambos rivales al mismo tiempo.",
          fr: "Les mêmes équations s'affichent simultanément pour les deux concurrents en temps réel.",
          hi: "समान अंकगणितीय प्रश्न दोनों प्रतिस्पर्धियों के सामने एक ही समय में आते हैं।",
          zh: "完全相同的计算题目实时同步推送到双方对战界面，无任何延迟差。",
        },
      },
      {
        title: {
          ar: "مضاعف الكومبو (Streak Multiplier)",
          en: "Streak Combo Multiplier",
          es: "Multiplicador por racha",
          fr: "Multiplicateur de série",
          hi: "स्ट्रीक कॉम्बो मल्टीप्लायर",
          zh: "连胜连击倍率暴击",
        },
        desc: {
          ar: "كل إجابة صحيحة متتالية ترفع مضاعف النقاط (x2, x3, x5) وتشعل شاشتك باللهب.",
          en: "Consecutive correct answers trigger point multipliers (x2, x3, x5) and ignite fire combos.",
          es: "Las respuestas correctas consecutivas aumentan los multiplicadores de puntos (x2, x3, x5).",
          fr: "Les réponses correctes d'affilée augmentent les points (x2, x3, x5) et enflamment l'écran.",
          hi: "लगातार सही उत्तर देने पर अंक गुणक (x2, x3, x5) बढ़ता है।",
          zh: "连续回答正确将触发连击积分倍增（2倍、3倍、5倍）并点亮炽热火焰特效。",
        },
      },
      {
        title: {
          ar: "عقوبة الخطأ وتصفير السلسلة",
          en: "Mistake Penalty & Reset",
          es: "Penalización por error y reinicio",
          fr: "Pénalité d'erreur & réinitialisation",
          hi: "गलती पर पेनल्टी और रीसेट",
          zh: "失误惩罚与连击清零",
        },
        desc: {
          ar: "الإجابة الخاطئة تكسر سلسلة الكومبو فوراً وتمنح الخصم أسبقية التقدم في عداد النقاط.",
          en: "An incorrect answer instantly breaks your multiplier streak and forfeits momentum.",
          es: "Una respuesta incorrecta rompe tu racha de inmediato y da ventaja al rival.",
          fr: "Une réponse fausse brise net votre série multiplicatrice et cède l'avantage.",
          hi: "एक गलत उत्तर तुरंत आपकी स्ट्रीक को तोड़ देता है और प्रतिद्वंद्वी को बढ़त देता है।",
          zh: "任何一次错误输入将立即截断当前的连击倍率加成，将势头拱手让予对手。",
        },
      },
    ],
  },
  xo: {
    timingBadge: {
      ar: "⚡ 5 ثوانٍ لكل حركة (موت مفاجئ)",
      en: "⚡ 5s Sudden Death Turn",
      es: "⚡ Muerte súbita de 5s por turno",
      fr: "⚡ Mort subite 5s par tour",
      hi: "⚡ 5 सेकंड सडन डेथ टर्न",
      zh: "⚡ 5秒猝死闪击回合",
    },
    natureBadge: {
      ar: "❌ سرعة رد فعل وتفادي الفخاخ",
      en: "❌ Quick Insight & Trap Evasion",
      es: "❌ Visión rápida y evasión de trampas",
      fr: "❌ Coup d'œil rapide & esquive de pièges",
      hi: "❌ त्वरित अंतर्दृष्टि और जाल से बचाव",
      zh: "❌ 极速洞察与规避破绽",
    },
    dopamineBadge: {
      ar: "☄️ شطب الفوز النيزكي الليزري",
      en: "☄️ Meteor Laser Win-Strike",
      es: "☄️ Golpe láser ganador meteórico",
      fr: "☄️ Rayon laser météore de victoire",
      hi: "☄️ लेज़र स्ट्राइक जीत",
      zh: "☄️ 贯穿光束激光终结技",
    },
    subtitle: {
      ar: "معركة السرعة الخاطفة لمنع التعادل بضربة نيزكية قاضية في 5 ثوانٍ فقط.",
      en: "Lightning-fast turn limit to break repetitive draws with a decisive laser strike.",
      es: "Límite de tiempo ultra rápido para evitar empates con un certero golpe láser.",
      fr: "Limite de temps ultra rapide pour briser les nuls avec une frappe laser décisive.",
      hi: "लगातार ड्रॉ से बचने और निर्णायक लेज़र स्ट्राइक से जीतने की तीव्र लड़ाई।",
      zh: "严苛5秒极速行动，打破传统和棋僵局，一击贯穿胜负。",
    },
    rules: [
      {
        title: {
          ar: "وقت الحركة الصارم (5 ثوانٍ)",
          en: "Strict 5s Turn Clock",
          es: "Reloj estricto de 5s",
          fr: "Chrono strict de 5s par tour",
          hi: "सख्त 5 सेकंड टर्न घड़ी",
          zh: "严苛5秒回合时限",
        },
        desc: {
          ar: "لكل لاعب 5 ثوانٍ فقط لوضع علامته (X أو O)؛ انتهاء الوقت يعني الخسارة الفورية.",
          en: "Each player has exactly 5 seconds per turn; timeout results in immediate forfeiture.",
          es: "Cada jugador tiene 5 segundos por turno; agotar el tiempo significa derrota inmediata.",
          fr: "Chaque joueur a 5 secondes par tour ; le dépassement entraîne une défaite immédiate.",
          hi: "प्रत्येक खिलाड़ी के पास केवल 5 सेकंड होते हैं; समय समाप्त होने पर तत्काल हार होती है।",
          zh: "每位玩家仅有5秒思考与落子时间，计时归零直接判负。",
        },
      },
      {
        title: {
          ar: "الخط المستقيم الثلاثي",
          en: "3-in-a-Row Alignment",
          es: "Alineación de 3 en línea",
          fr: "Alignement de 3 en ligne",
          hi: "3-इन-ए-रो संरेखण",
          zh: "三子直线连珠贯穿",
        },
        desc: {
          ar: "أول من يشكل خطاً مستقيماً من 3 علامات (أفقياً، رأسياً، أو قطرياً) يفوز بالنزال.",
          en: "First player to connect 3 marks horizontally, vertically, or diagonally wins instantly.",
          es: "El primer jugador en alinear 3 marcas en horizontal, vertical o diagonal gana al instante.",
          fr: "Le premier à aligner 3 symboles horizontalement, verticalement ou en diagonale l'emporte.",
          hi: "क्षैतिज, लंबवत या तिरछे 3 चिह्नों को जोड़ने वाला पहला खिलाड़ी तुरंत जीतता है।",
          zh: "首位在横向、纵向或对角线连通三枚符号者立即斩获胜局。",
        },
      },
      {
        title: {
          ar: "كسر جمود التعادل",
          en: "Fast-Paced Decisiveness",
          es: "Decisión y velocidad",
          fr: "Décision à haute vitesse",
          hi: "तेज़ गति और निर्णायकता",
          zh: "高速对抗杜绝和棋",
        },
        desc: {
          ar: "الضغط الزمني يحفز الأخطاء التكتيكية والانتصارات السريعة وتجنب التعادل المتكرر.",
          en: "High time pressure rewards tactical intuition and eliminates slow, boring draws.",
          es: "La presión del tiempo premia la intuición táctica y elimina empates aburridos.",
          fr: "La pression du chronomètre favorise l'intuition et élimine les nuls répétitifs.",
          hi: "समय का दबाव त्वरित अंतर्दृष्टि को पुरस्कृत करता है और सुस्त ड्रॉ को समाप्त करता है।",
          zh: "极致时间压迫激发极限战术直觉，彻底消灭沉闷乏味的传统和局。",
        },
      },
    ],
  },
  "connect-four": {
    timingBadge: {
      ar: "⏱️ 20 ثانية لكل إسقاط",
      en: "⏱️ 20s Drop Timer",
      es: "⏱️ 20s para soltar ficha",
      fr: "⏱️ 20s par lâcher de jeton",
      hi: "⏱️ 20 सेकंड ड्रॉप टाइमर",
      zh: "⏱️ 20秒落子时限",
    },
    natureBadge: {
      ar: "🔴 تكتيك الجاذبية والتطويق",
      en: "🔴 Gravity Strategy & Traps",
      es: "🔴 Estrategia de gravedad y trampas",
      fr: "🔴 Stratégie de gravité & embuscades",
      hi: "🔴 गुरुत्वाकर्षण रणनीति और जाल",
      zh: "🔴 重力落子与多重杀阵",
    },
    dopamineBadge: {
      ar: "🎯 فخ التوصيل الرباعي المتتالي",
      en: "🎯 Tactical Quad-Drop Trap",
      es: "🎯 Trampa táctica de cuatro en línea",
      fr: "🎯 Piège tactique de quatre alignés",
      hi: "🎯 चार कनेक्ट करने का शानदार जाल",
      zh: "🎯 四子连珠绝杀锁定",
    },
    subtitle: {
      ar: "تحدي الجاذبية الذكي لإسقاط الأقراص وصنع الفخاخ الرباعية المزدوجة.",
      en: "The vertical strategy battle of gravity drops and multi-threat traps.",
      es: "La batalla de estrategia vertical de caída de fichas y amenazas dobles.",
      fr: "Le défi tactique vertical de chute de jetons et de pièges à double menace.",
      hi: "गोटियों को गिराकर चार को एक पंक्ति में जोड़ने की रणनीतिक लड़ाई।",
      zh: "纵向空间重力博弈，构造致命双头杀局一招制胜。",
    },
    rules: [
      {
        title: {
          ar: "إسقاط الأقراص الرأسي",
          en: "Vertical Gravity Drop",
          es: "Caída vertical por gravedad",
          fr: "Chute verticale par gravité",
          hi: "लंबवत गुरुत्वाकर्षण ड्रॉप",
          zh: "垂直重力下落",
        },
        desc: {
          ar: "تسقط الأقراص بالتناوب في أي من الأعمدة الـ 7 لتستقر في أدنى خانة فارغة متاحة.",
          en: "Discs drop alternately into any of the 7 columns, falling to the lowest vacant slot.",
          es: "Las fichas caen por turnos en cualquiera de las 7 columnas hasta la ranura libre inferior.",
          fr: "Les jetons tombent à tour de rôle dans l'une des 7 colonnes vers la case vide la plus basse.",
          hi: "गोटियां बारी-बारी से 7 स्तंभों में से किसी एक में सबसे निचले खाली स्थान पर गिरती हैं।",
          zh: "棋子按回合轮流投入7列之一，并在重力作用下跌落至该列最底部空槽。",
        },
      },
      {
        title: {
          ar: "توصيل 4 أقراص متصلة",
          en: "Connect Four to Win",
          es: "Conecta 4 para ganar",
          fr: "Aligner 4 pour gagner",
          hi: "जीतने के लिए 4 कनेक्ट करें",
          zh: "四子相连定乾坤",
        },
        desc: {
          ar: "الفوز الفوري يتحقق لأول من يربط 4 أقراص من لونه في خط أفقي أو رأسي أو قطري.",
          en: "The first player to form an unbroken line of 4 discs in any direction claims victory.",
          es: "El primer jugador en formar una línea continua de 4 fichas en cualquier dirección gana.",
          fr: "Le premier joueur à aligner 4 jetons dans n'importe quelle direction remporte la victoire.",
          hi: "किसी भी दिशा में 4 गोटियों की निरंतर रेखा बनाने वाला पहला खिलाड़ी जीतता है।",
          zh: "率先在横排、竖列或对角线方向连成不间断四枚同色棋子者即刻胜出。",
        },
      },
      {
        title: {
          ar: "الأعمدة المكتملة",
          en: "Column Capacity Limit",
          es: "Límite de capacidad de columna",
          fr: "Limite de colonne atteinte",
          hi: "स्तंभ क्षमता सीमा",
          zh: "立柱容量封顶规则",
        },
        desc: {
          ar: "العمود الذي يكتمل بـ 6 أقراص يُغلق تلقائياً ولا يمكن الإسقاط داخله مجدداً.",
          en: "Columns filled to max capacity (6 discs) are locked against further drops.",
          es: "Las columnas llenas con 6 fichas se bloquean automáticamente contra más tiradas.",
          fr: "Les colonnes remplies au maximum (6 jetons) sont verrouillées contre tout nouveau coup.",
          hi: "6 गोटियों से भरे स्तंभ स्वचालित रूप से आगे की चालों के लिए बंद हो जाते हैं।",
          zh: "任一列填满6枚棋子后将自动闭合锁定，无法再向该列投入新子。",
        },
      },
    ],
  },
  checkers: {
    timingBadge: {
      ar: "⏱️ 30 ثانية لكل نقلة",
      en: "⏱️ 30s Move Timer",
      es: "⏱️ 30s por jugada",
      fr: "⏱️ 30s par coup",
      hi: "⏱️ 30 सेकंड प्रति चाल",
      zh: "⏱️ 30秒落子时限",
    },
    natureBadge: {
      ar: "👑 تضحيات إجبارية وتتويج ملوكي",
      en: "👑 Forced Jumps & Royal Kings",
      es: "👑 Capturas obligatorias y reyes coronados",
      fr: "👑 Prises obligatoires & couronnement de Dames",
      hi: "👑 अनिवार्य चालें और शाही ताज",
      zh: "👑 强制连跳与王者加冕",
    },
    dopamineBadge: {
      ar: "👑 أكل ثلاثي متتابع وتتويج الملك",
      en: "👑 Multi-Jump Chain & Coronation",
      es: "👑 Cadena de saltos múltiples y coronación",
      fr: "👑 Rafle en chaîne & couronnement",
      hi: "👑 बहु-कूद श्रृंखला और ताजपोशी",
      zh: "👑 霸气连环三连斩与加冕",
    },
    subtitle: {
      ar: "لعبة التحريض والتضحية الذكية لسحب الخصم إلى الفخاخ وتتويج الملوك.",
      en: "The classic game of mandatory captures, cascading jumps, and crowning royal kings.",
      es: "El clásico juego de capturas obligatorias, saltos en cadena y coronación.",
      fr: "Le jeu classique de captures obligatoires, de rafles et de couronnement.",
      hi: "अनिवार्य चालों, कूदने की श्रृंखला और राजा की ताजपोशी का क्लासिक खेल।",
      zh: "经典跳棋对决，强制吃子机制与深谋远虑的王者加冕之旅。",
    },
    rules: [
      {
        title: {
          ar: "القفز الإجباري (Mandatory Capture)",
          en: "Mandatory Capture",
          es: "Captura obligatoria",
          fr: "Prise obligatoire",
          hi: "अनिवार्य कैप्चर",
          zh: "强制吃子跳跃",
        },
        desc: {
          ar: "إذا توفرت قفزة أكل لقطعة الخصم، يجب تنفيذها إجبارياً ولا يسمح بأي حركة عادية بديلة.",
          en: "If a capture jump is available, it is strictly mandatory and must be executed.",
          es: "Si existe un salto de captura disponible, es estrictamente obligatorio ejecutarlo.",
          fr: "Si une prise est possible, elle est strictement obligatoire et doit être jouée.",
          hi: "यदि विरोधी के मोहरे को काटने की चाल उपलब्ध है, तो उसे चलना अनिवार्य है।",
          zh: "若盘面存在合法的吃子跳跃路线，则必须强制执行，不得采取常规位移。",
        },
      },
      {
        title: {
          ar: "سلسلة القفز المتعدد (Multi-Jump)",
          en: "Cascading Multi-Jump",
          es: "Cadena de saltos múltiples",
          fr: "Rafle multiple en chaîne",
          hi: "मल्टी-जंप श्रृंखला",
          zh: "连环跨越连续吃子",
        },
        desc: {
          ar: "عند أكل قطعة وتوفر أكل تالٍ لنفس القطعة، يواصل اللاعب الأكل في نفس النقلة.",
          en: "Continue jumping and capturing multiple pieces in a single sequence if available.",
          es: "Continúa saltando y capturando varias fichas seguidas en una sola jugada.",
          fr: "Continuez à sauter et à rafler plusieurs pions consécutifs en un seul coup si la voie le permet.",
          hi: "उपलब्ध होने पर एक ही चाल में कई मोहरों को काटना जारी रखें।",
          zh: "当一枚棋子完成吃子后仍有后续合法吃子目标时，须在当回合继续连跳连吃。",
        },
      },
      {
        title: {
          ar: "تتويج الملك (King Coronation)",
          en: "King Coronation",
          es: "Coronación de rey",
          fr: "Couronnement de la Dame",
          hi: "राजा की ताजपोशी",
          zh: "底线王者加冕",
        },
        desc: {
          ar: "وصول القطعة للصف الأخير للخصم يتوجها ملكاً يملك حرية التحرك والقفز للأمام والخلف.",
          en: "Reaching the enemy back row crowns the piece as a King, unlocking forward and backward moves.",
          es: "Llegar a la última fila rival corona la ficha como Rey, permitiendo avanzar y retroceder.",
          fr: "Atteindre la dernière rangée ennemie couronne le pion en Dame, débloquant les déplacements arrière.",
          hi: "विरोधी की अंतिम पंक्ति तक पहुंचने पर मोहरा राजा बन जाता है और आगे-पीछे चल सकता है।",
          zh: "普通棋子推进至敌方底线排立即加冕为王，解锁前后全向位移与跳跃特权。",
        },
      },
    ],
  },
  reversi: {
    timingBadge: {
      ar: "⏱️ 30 ثانية لكل نقلة",
      en: "⏱️ 30s Move Timer",
      es: "⏱️ 30s por jugada",
      fr: "⏱️ 30s par coup",
      hi: "⏱️ 30 सेकंड प्रति चाल",
      zh: "⏱️ 30秒落子时限",
    },
    natureBadge: {
      ar: "🔄 حصر جانبي وسيطرة زوايا",
      en: "🔄 Flank Traps & Corner Control",
      es: "🔄 Trampas de flanco y control de esquinas",
      fr: "🔄 Prises en tenaille & contrôle des coins",
      hi: "🔄 किनारों का घेराव और कोनों का नियंत्रण",
      zh: "🔄 夹击包抄与四角绝对掌控",
    },
    dopamineBadge: {
      ar: "🌊 شلال انقلاب الأقراص المتتابع",
      en: "🌊 Multi-Disc Cascade Flip",
      es: "🌊 Volteo en cascada de múltiples fichas",
      fr: "🌊 Cascade de retournements de pions",
      hi: "🌊 कैस्केड डिस्क फ्लिप",
      zh: "🌊 惊涛骇浪般的连锁翻盘",
    },
    subtitle: {
      ar: "دقيقة واحدة لتتعلمها، وعمر كامل لتتقن فن قلب الطاولة في النقلة الأخيرة.",
      en: "A minute to learn, a lifetime to master: turn the entire board in one move.",
      es: "Un minuto para aprender, una vida para dominar: cambia todo el tablero en un solo movimiento.",
      fr: "Une minute pour apprendre, une vie pour maîtriser : retournez la table en un coup.",
      hi: "सीखने में एक मिनट, महारत हासिल करने में जीवन भर: एक चाल में पासा पलटें।",
      zh: "一分钟学会，一辈子精通：最后一击翻转全局大逆转。",
    },
    rules: [
      {
        title: {
          ar: "الحصر والتطويق الإلزامي",
          en: "Mandatory Enclosure",
          es: "Encierro obligatorio",
          fr: "Prise en tenaille obligatoire",
          hi: "अनिवार्य घेराबंदी",
          zh: "两端夹击强制包抄",
        },
        desc: {
          ar: "يجب أن تطوق قرصاً أو أكثر للخصم بين قرصك الجديد وقرص موجود مسبقاً من لونك.",
          en: "Every move must bracket one or more enemy discs between your new and existing pieces.",
          es: "Cada jugada debe atrapar una o más fichas rivales entre tu ficha nueva y una existente.",
          fr: "Chaque coup doit encadrer un ou plusieurs pions adverses entre votre nouveau pion et un pion existant.",
          hi: "हर चाल में विरोधी की एक या अधिक गोटियों को अपने दो मोहरों के बीच फंसाना होगा।",
          zh: "每一次合法落子必须在新棋子与原有同色棋子之间夹住一枚或多枚敌方棋子。",
        },
      },
      {
        title: {
          ar: "انقلاب الأقراص الشلالي",
          en: "Cascading Disc Flips",
          es: "Volteo en cascada",
          fr: "Retournements en cascade",
          hi: "कैस्केड डिस्क फ्लिप",
          zh: "连锁翻转乾坤逆转",
        },
        desc: {
          ar: "جميع أقراص الخصم المحصورة أفقياً ورأسياً وقطرياً تنقلب دفعة واحدة إلى لونك.",
          en: "All bracketed discs horizontally, vertically, and diagonally flip to your color.",
          es: "Todas las fichas rivales atrapadas en horizontal, vertical o diagonal se voltean a tu color.",
          fr: "Tous les pions adverses encadrés horizontalement, verticalement ou diagonalement se retournent.",
          hi: "क्षैतिज, लंबवत या तिरछे फंसी सभी विरोधी गोटियां आपके रंग में बदल जाती हैं।",
          zh: "所有在横向、纵向或对角线上被夹击的敌方棋子将全部同步翻转为您所属的颜色。",
        },
      },
      {
        title: {
          ar: "حصانة الزوايا الأربع",
          en: "Corner Immunity",
          es: "Inmunidad de las esquinas",
          fr: "Immunité des coins",
          hi: "कोनों की प्रतिरक्षा",
          zh: "四角死局免疫特权",
        },
        desc: {
          ar: "الاستيلاء على زوايا اللوح الأربع يمنح أقراصك حصانة أبدية لا يمكن للخصم قلبها.",
          en: "Capturing any of the 4 corner squares permanently locks those discs from being flipped.",
          es: "Conquistar cualquiera de las 4 esquinas protege permanentemente esas fichas de ser volteadas.",
          fr: "Prendre l'un des 4 coins verrouille définitivement ces pions qui ne peuvent plus être retournés.",
          hi: "बोर्ड के 4 कोनों पर कब्जा करने से वे गोटियां हमेशा के लिए सुरक्षित हो जाती हैं।",
          zh: "夺取棋盘四角中任意一格，将永久锁定该棋子，对手永远无法将其翻转。",
        },
      },
    ],
  },
  gomoku: {
    timingBadge: {
      ar: "⏱️ دقيقة واحدة لكل حركة",
      en: "⏱️ 60s Strategic Focus",
      es: "⏱️ 60s de enfoque estratégico",
      fr: "⏱️ 60s de concentration stratégique",
      hi: "⏱️ 60 सेकंड रणनीतिक ध्यान",
      zh: "⏱️ 60秒大局运筹思考",
    },
    natureBadge: {
      ar: "⚪ تركيز عميق وتطويق شرقي",
      en: "⚪ Oriental Alignment & Focus",
      es: "⚪ Alineación oriental y foco absoluto",
      fr: "⚪ Alignement oriental & focus profond",
      hi: "⚪ गहरी एकाग्रता और पूर्वी घेराबंदी",
      zh: "⚪ 东方棋道静思与潜伏杀招",
    },
    dopamineBadge: {
      ar: "✨ رنين حجر الخشب وتكامل الـ 5",
      en: "✨ Resonant Click & 5-in-a-Row",
      es: "✨ Chasquido de piedra y cinco en línea",
      fr: "✨ Claquement sonore & cinq en ligne",
      hi: "✨ गोटियों की खनक और 5-इन-ए-रो",
      zh: "✨ 落子生脆声响与五子成线",
    },
    subtitle: {
      ar: "فن الحصار الشرقي العريق على لوح غو 15x15 بنقاء الفكر والتناغم.",
      en: "The ancient eastern art of alignment and subtle encirclement on 15x15.",
      es: "El antiguo arte oriental de alineación y sutil cerco en tablero 15x15.",
      fr: "L'art oriental ancien de l'alignement et de l'encerclement subtil sur 15x15.",
      hi: "15x15 बोर्ड पर पूर्वी रणनीति और सूक्ष्म घेराबंदी की प्राचीन कला।",
      zh: "15x15格黑白世界，方寸之间见真章，五子连珠定江山。",
    },
    rules: [
      {
        title: {
          ar: "التناوب على تقاطعات اللوح",
          en: "Intersection Placement",
          es: "Colocación en intersecciones",
          fr: "Pose sur les intersections",
          hi: "प्रतिच्छेदन पर स्थान",
          zh: "交叉点轮流布子",
        },
        desc: {
          ar: "يوضع حجر واحد بالتناوب على تقاطعات اللوح الـ 15x15 ولا يمكن تحريك الحجر بعد تثبيته.",
          en: "Players alternate placing one stone on grid intersections; placed stones never move.",
          es: "Los jugadores se turnan para colocar una piedra en las intersecciones; no se pueden mover después.",
          fr: "Les joueurs posent alternativement une pierre sur les intersections ; les pierres ne bougent plus.",
          hi: "खिलाड़ी बारी-बारी से ग्रिड चौराहों पर एक गोटी रखते हैं; रखी गई गोटियां कभी नहीं हिलतीं।",
          zh: "双方轮流在15×15网格交叉点上落下一子，落子定格后不得移动或移位。",
        },
      },
      {
        title: {
          ar: "ربط 5 أحجار غير منقطعة",
          en: "Five in a Row Wins",
          es: "Cinco en línea gana",
          fr: "Cinq alignés pour la victoire",
          hi: "लगातार 5 गोटियां जीतने का नियम",
          zh: "五连成线即刻问鼎",
        },
        desc: {
          ar: "الفوز الفوري يتحقق لأول من يربط 5 أحجار متصلة أفقياً أو رأسياً أو قطرياً.",
          en: "First player to create an unbroken row of 5 stones in any direction wins immediately.",
          es: "El primer jugador en crear una línea continua de 5 piedras en cualquier dirección gana.",
          fr: "Le premier joueur à créer une ligne continue de 5 pierres dans n'importe quelle direction gagne.",
          hi: "किसी भी दिशा में 5 गोटियों की निरंतर रेखा बनाने वाला पहला खिलाड़ी तुरंत जीतता है।",
          zh: "率先在任一横列、纵行或斜线上连成连续不间断五子者即刻取得辉煌胜利。",
        },
      },
      {
        title: {
          ar: "التطويق الوقائي والمباغتة",
          en: "Preventive Encirclement",
          es: "Bloqueo preventivo",
          fr: "Blocage préventif",
          hi: "निवारक घेराबंदी",
          zh: "防患未然提前封堵",
        },
        desc: {
          ar: "إغلاق مسارات الخصم قبل تشكيل الخطوط المفتوحة هو جوهر الاستراتيجية والانتصار.",
          en: "Blocking opponent open-ended lines early is crucial to prevent unblockable setups.",
          es: "Bloquear las líneas abiertas del rival a tiempo es esencial para evitar amenazas imparables.",
          fr: "Bloquer à temps les lignes ouvertes adverses est crucial pour prévenir les attaques imparables.",
          hi: "अजेय स्थिति से बचने के लिए विरोधी की खुली लाइनों को समय रहते रोकना महत्वपूर्ण है।",
          zh: "及早洞悉并封死对手双头开放活三连线，是化解致命绝杀的核心防御战略。",
        },
      },
    ],
  },
  seega: {
    timingBadge: {
      ar: "⏱️ 25 ثانية لكل نقلة",
      en: "⏱️ 25s Move Timer",
      es: "⏱️ 25s por jugada",
      fr: "⏱️ 25s par coup",
      hi: "⏱️ 25 सेकंड प्रति चाल",
      zh: "⏱️ 25秒落子时限",
    },
    natureBadge: {
      ar: "🏺 تراث فرعوني وإطباق مزدوج",
      en: "🏺 Pharaonic Ambush Tactics",
      es: "🏺 Tácticas de emboscada faraónica",
      fr: "🏺 Tactiques d'embuscade pharaonique",
      hi: "🏺 प्राचीन मिस्र की रणनीति और घेराव",
      zh: "🏺 古埃及法老智慧与伏击夹杀",
    },
    dopamineBadge: {
      ar: "⚔️ الإطباق الساندويتشي على الحصى",
      en: "⚔️ Double Sandwich Enclosure",
      es: "⚔️ Captura envolvente en sándwich",
      fr: "⚔️ Prise en tenaille en sandwich",
      hi: "⚔️ डबल सैंडविच घेराबंदी",
      zh: "⚔️ 双面包夹绞杀与连击收割",
    },
    subtitle: {
      ar: "أقدم ألعاب الدهاء التكتيكي في التاريخ الفرعوني (شبكة 5x5) بمرحلتي الإنزال والتحريك.",
      en: "The ancient pharaonic game of cunning drop phases and flanking ambushes on 5x5.",
      es: "El juego de astucia táctica más antiguo de Egipto en tablero 5x5.",
      fr: "Le plus ancien jeu tactique pharaonique d'embuscades sur grille 5x5.",
      hi: "प्राचीन मिस्र की रणनीति और चालों का 5x5 ग्रिड पर प्रसिद्ध खेल।",
      zh: "源自古埃及文明的智慧竞技（5x5网格），包含布子与行棋双阶段。",
    },
    rules: [
      {
        title: {
          ar: "مرحلة الإنزال بالتناوب",
          en: "Alternating Drop Phase",
          es: "Fase de colocación alterna",
          fr: "Phase de pose alternée",
          hi: "बारी-बारी से रखने का चरण",
          zh: "轮流布子初始阶段",
        },
        desc: {
          ar: "ينزل كل لاعب حجرين بالتناوب على اللوح مع ترك المربع الأوسط فارغاً تماماً.",
          en: "Players alternate placing two stones at a time, keeping the center square empty.",
          es: "Los jugadores se turnan para colocar dos piedras a la vez, dejando el centro vacío.",
          fr: "Chaque joueur pose deux pions par tour en laissant impérativement la case centrale vide.",
          hi: "खिलाड़ी बारी-बारी से दो गोटियां रखते हैं, बीच के वर्ग को खाली रखते हैं।",
          zh: "对弈双方轮流在棋盘上每次布设两枚棋子，唯独正中央一格必须始终留空。",
        },
      },
      {
        title: {
          ar: "مرحلة التحريك التكتيكي",
          en: "Movement Phase",
          es: "Fase de movimiento táctico",
          fr: "Phase de déplacement tactique",
          hi: "रणनीतिक चाल चरण",
          zh: "正交位移进攻阶段",
        },
        desc: {
          ar: "تتحرك الحجارة خطوة واحدة نحو أي مربع فارغ مجاور أفقياً أو رأسياً.",
          en: "Stones move one orthogonal step into adjacent vacant squares.",
          es: "Las piedras se mueven un paso ortogonal a casillas adyacentes vacías.",
          fr: "Les pions avancent d'une case orthogonalement vers un espace adjacent libre.",
          hi: "गोटियां आसपास के खाली वर्गों में एक कदम आगे बढ़ती हैं।",
          zh: "布子结束后，棋子沿横向或纵向单步移入相邻的空格进行围追堵截。",
        },
      },
      {
        title: {
          ar: "الأكل بالحصر (Sandwich Capture)",
          en: "Flanking Sandwich Capture",
          es: "Captura envolvente en sándwich",
          fr: "Prise en tenaille en sandwich",
          hi: "सैंडविच कैप्चर",
          zh: "三明治双向夹击吃子",
        },
        desc: {
          ar: "محاصرة حجر الخصم بين حجرين من لونك يقصيه من اللوح، ويمنحك حركة إضافية فورية.",
          en: "Trapping an enemy stone between two of yours captures it and grants an extra move.",
          es: "Atrapar una piedra rival entre dos tuyas la captura y otorga un turno extra.",
          fr: "Coincer un pion ennemi entre deux des vôtres le capture et octroie un coup bonus.",
          hi: "दुश्मन की गोटी को अपने दो मोहरों के बीच फंसाने से वह कट जाती है और अतिरिक्त चाल मिलती है।",
          zh: "将一枚敌子精准夹在己方两枚棋子之间即可实现捕杀，并即刻赢得追加移动回合。",
        },
      },
    ],
  },
};

function getSpecText(map: Record<string, string> | undefined, locale: string, fallback: string = ""): string {
  if (!map) return fallback;
  return map[locale] || map["en"] || Object.values(map)[0] || fallback;
}

function InnerPlayGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { t, locale, dir } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const isRtl = dir === "rtl";
  const router = useRouter();
  const searchParams = useSearchParams();
  const plugin = getGame(gameId);
  const spec = GAME_IDENTITY_REGISTRY[gameId];

  const [step, setStep] = useState<Step>(() => {
    const tier = searchParams.get("tier");
    const stake = searchParams.get("stake");
    if (tier === "CASH" && stake && !isNaN(Number(stake))) {
      return {
        name: "matchmaking",
        stake: { tier: "CASH", stakeMinor: String(Number(stake) * 1_000_000), asset: "USDT" },
      };
    }
    return { name: "mode" };
  });
  const capability = useMemo(() => getGameCapability(gameId), [gameId]);
  const [gameConfig, setGameConfig] = useState<GameSpecificConfigValue>(() => ({
    timeProfile: capability.timeControls?.find((t: any) => t.isDefault)?.id || capability.timeControls?.[0]?.id || "BLITZ_3_2",
    variant: capability.variants?.find((v: any) => v.isDefault)?.id || capability.variants?.[0]?.id || "TRADITIONAL",
    playerCount: (capability.playerCountOptions?.find((p: any) => p.isDefault)?.count as 2 | 4 | undefined) || 2,
    matchPoints: capability.matchPoints?.find((m: any) => m.isDefault)?.points || 1,
    sprintOption: capability.sprintOptions?.find((s: any) => s.isDefault)?.id || "BLITZ_10",
    seriesOption: capability.seriesOptions?.find((s: any) => s.isDefault)?.id || "BEST_OF_3",
  }));
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [dominoesVariant, setDominoesVariant] = useState<"TRADITIONAL" | "AMERICAN">("TRADITIONAL");
  const [ludoPlayerCount, setLudoPlayerCount] = useState<2 | 4>(2);
  const [showRules, setShowRules] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!plugin) {
    return (
      <>
        <Header />
        <main className="nz-container"><p>{t("common.unknown_game")}</p></main>
        <Footer />
      </>
    );
  }

  const gameName = t(`common.game_names.${plugin.nameKey}`) || plugin.id;
  const gameTokens = useMemo(() => getGameThemeTokens(gameId), [gameId]);

  function handleBack() {
    switch (step.name) {
      case "game_config":
        setStep({ name: "mode" });
        break;
      case "difficulty":
        setStep({ name: "mode" });
        break;
      case "time_control":
        if (plugin?.difficulties && plugin.difficulties.length > 0) {
          setStep({ name: "difficulty" });
        } else {
          setStep({ name: "mode" });
        }
        break;
      case "friend_stake":
        if (capability.setupType !== "canonical_direct") {
          setStep({ name: "game_config", targetMode: "FRIEND" });
        } else {
          setStep({ name: "mode" });
        }
        break;
      case "random_stake":
        if (capability.setupType !== "canonical_direct") {
          setStep({ name: "game_config", targetMode: "RANDOM_OPPONENT" });
        } else {
          setStep({ name: "mode" });
        }
        break;
      case "friend":
        setStep({ name: "friend_stake" });
        break;
      case "matchmaking":
        setStep({ name: "random_stake" });
        break;
      case "mode":
      default:
        router.push(`/${locale}/play`);
        break;
    }
  }

  function handleMode(mode: PlayMode) {
    if (mode === "VS_COMPUTER") {
      if (capability.setupType !== "canonical_direct") {
        setStep({ name: "game_config", targetMode: "VS_COMPUTER" });
      } else if (plugin!.difficulties.length > 0) {
        setStep({ name: "difficulty" });
      } else {
        void startVsComputer("MEDIUM", "STANDARD");
      }
    } else if (mode === "FRIEND") {
      if (!player) {
        openPopup();
        return;
      }
      if (capability.setupType !== "canonical_direct") {
        setStep({ name: "game_config", targetMode: "FRIEND" });
      } else {
        setStep({ name: "friend_stake" });
      }
    } else {
      if (capability.setupType !== "canonical_direct") {
        setStep({ name: "game_config", targetMode: "RANDOM_OPPONENT" });
      } else {
        setStep({ name: "random_stake" });
      }
    }
  }

  async function startVsComputer(chosenDifficulty: Difficulty | null = null, chosenProfile?: string) {
    setCreating(true);
    try {
      if (!player) {
        try {
          const guestRes = await post<{ accessToken: string; refreshToken: string }>("/v1/auth/guest", {});
          setTokens(guestRes.accessToken, guestRes.refreshToken, true);
        } catch {
          // Non-fatal, attempt proceed
        }
      }
      const finalProfile = chosenProfile || gameConfig.timeProfile || "STANDARD";
      const finalMode =
        gameId === "ludo"
          ? (gameConfig.playerCount === 4 ? "standard-4p" : "standard")
          : gameId === "dominoes"
          ? (gameConfig.variant || dominoesVariant)
          : gameId === "backgammon"
          ? String(gameConfig.matchPoints || 1)
          : gameId === "speed-math"
          ? (gameConfig.sprintOption || "standard")
          : gameId === "xo" || gameId === "connect-four"
          ? (gameConfig.seriesOption || "standard")
          : "standard";

      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId,
        difficulty: chosenDifficulty ?? "MEDIUM",
        timeProfile: finalProfile,
        mode: finalMode,
        ...(gameId === "dominoes" ? { variant: gameConfig.variant || dominoesVariant } : {}),
        ...(gameId === "ludo" ? { mode: gameConfig.playerCount === 4 ? "standard-4p" : "standard" } : {}),
      });
      router.push(`/${locale}/game/${r.duelId}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Navigation & Back Header */}
        <div className={styles.navBar}>
          <div className={styles.leftGroup}>
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBack}
              aria-label={t("play.nav.back_step")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isRtl ? "scaleX(-1)" : "none" }}
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>
                {step.name === "mode"
                  ? t("play.nav.all_games")
                  : t("play.nav.back")}
              </span>
            </button>

            <div
              className={styles.gameBadge}
              style={{
                borderColor: gameTokens.palette.border,
                background: gameTokens.palette.surface,
              }}
            >
              <img
                src={`/images/games/${plugin.id}-badge.jpg`}
                alt={gameName}
                className={styles.gameThumb}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.fallbackStage) {
                    img.dataset.fallbackStage = "plain";
                    img.src = `/images/games/${plugin.id}.jpg`;
                  } else {
                    img.onerror = null;
                    img.src = IMG_PLACEHOLDER;
                  }
                }}
              />
              <span className={styles.gameTitle}>{gameName}</span>
            </div>
          </div>

          {/* Stepper Trail */}
          <div className={styles.stepper}>
            <button
              type="button"
              className={`${styles.stepItem} ${step.name === "mode" ? styles.stepItemActive : styles.stepItemClickable}`}
              onClick={() => setStep({ name: "mode" })}
            >
              1. {t("play.nav.step_mode")}
            </button>

            <span className={styles.stepSep}>›</span>

            <span
              className={`${styles.stepItem} ${
                step.name === "game_config" || step.name === "difficulty" || step.name === "friend_stake" || step.name === "random_stake"
                  ? styles.stepItemActive
                  : step.name === "time_control" || step.name === "friend" || step.name === "matchmaking"
                  ? styles.stepItemCompleted
                  : ""
              }`}
            >
              2. {step.name === "game_config"
                  ? (isRtl ? "إعدادات المواجهة" : "Match Setup")
                  : step.name === "difficulty" || step.name === "time_control"
                  ? t("play.nav.step_difficulty")
                  : t("play.nav.step_stake")}
            </span>

            <span className={styles.stepSep}>›</span>

            <span
              className={`${styles.stepItem} ${
                step.name === "time_control" || step.name === "friend" || step.name === "matchmaking"
                  ? styles.stepItemActive
                  : ""
              }`}
            >
              3. {step.name === "time_control"
                  ? t("play.nav.step_time_control")
                  : t("play.nav.step_duel")}
            </span>
          </div>
        </div>

        {step.name === "mode" && (
          <>
            <div
              className={styles.heroBanner}
              style={{
                boxShadow: `0 16px 40px rgba(0,0,0,0.5), 0 0 50px ${gameTokens.palette.glow}`,
                border: `1px solid ${gameTokens.palette.border}`,
              }}
            >
              <img 
                src={`/images/games/${plugin.id}-hero.jpg`} 
                className={styles.heroBackground} 
                alt=""
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.fallbackStage) {
                    img.dataset.fallbackStage = "plain";
                    img.src = `/images/games/${plugin.id}.jpg`;
                  } else {
                    img.onerror = null;
                    img.src = IMG_PLACEHOLDER;
                  }
                }}
              />
              <div className={styles.heroOverlay} />
              <div className={styles.heroContent}>
                <div
                  className={styles.heroPersonaBadge}
                  style={{
                    borderColor: gameTokens.palette.border,
                    color: gameTokens.palette.accent,
                    boxShadow: `0 0 16px ${gameTokens.palette.glow}`,
                  }}
                >
                  <span className={styles.heroPersonaDot} style={{ background: gameTokens.palette.accent }} />
                  <span>{gameTokens.persona[locale] || gameTokens.persona.en}</span>
                </div>
                <h1
                  className={styles.heroTitle}
                  style={{
                    background: `linear-gradient(135deg, #ffffff 0%, ${gameTokens.palette.accent} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {gameName}
                </h1>
                <p className={styles.heroSubtitle}>
                  {spec?.subtitle ? (spec.subtitle[locale] || (isRtl ? spec.subtitle.ar : spec.subtitle.en) || spec.subtitle.en) : t("play.hero_subtitle")}
                </p>

                {spec && (
                  <>
                    <div className={styles.heroChips}>
                      <span className={styles.heroChip}>
                        {spec.timingBadge[locale] || (isRtl ? spec.timingBadge.ar : spec.timingBadge.en) || spec.timingBadge.en}
                      </span>
                      <span className={styles.heroChip}>
                        {spec.natureBadge[locale] || (isRtl ? spec.natureBadge.ar : spec.natureBadge.en) || spec.natureBadge.en}
                      </span>
                      <span className={styles.heroChip}>
                        {spec.dopamineBadge[locale] || (isRtl ? spec.dopamineBadge.ar : spec.dopamineBadge.en) || spec.dopamineBadge.en}
                      </span>
                    </div>

                    <div className={styles.rulesAccordion}>
                      <button
                        type="button"
                        className={styles.rulesToggleBtn}
                        onClick={() => setShowRules((prev) => !prev)}
                        aria-expanded={showRules}
                      >
                        <span className={styles.rulesToggleIcon}>📜</span>
                        <span className={styles.rulesToggleText}>
                          {locale === "ar"
                            ? "القوانين الرسمية المعتمدة عالمياً"
                            : locale === "es"
                            ? "Reglas y especificaciones oficiales internacionales"
                            : locale === "fr"
                            ? "Règles et spécifications officielles internationales"
                            : locale === "hi"
                            ? "आधिकारिक अंतर्राष्ट्रीय नियम और विनिर्देश"
                            : locale === "zh"
                            ? "国际公认官方规则与规范"
                            : "Official International Rules & Specs"}
                        </span>
                        <span className={`${styles.rulesChevron} ${showRules ? styles.chevronOpen : ""}`}>
                          ▼
                        </span>
                      </button>

                      {showRules && (
                        <div className={styles.rulesGrid}>
                          {spec.rules.map((rule, idx) => (
                            <div key={idx} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <span className={styles.ruleIndex}>{idx + 1}</span>
                                <span className={styles.ruleTitle}>
                                  {rule.title[locale] || (isRtl ? rule.title.ar : rule.title.en) || rule.title.en || rule.titleAr || ""}
                                </span>
                              </div>
                              <p className={styles.ruleDesc}>
                                {rule.desc[locale] || (isRtl ? rule.desc.ar : rule.desc.en) || rule.desc.en || rule.descAr || ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <ModeSelect plugin={plugin} gameId={gameId} onSelect={handleMode} />
            <div style={{ marginTop: "48px" }}>
              <LiveDuelLobby filterGameId={gameId} />
            </div>
          </>
        )}

        {step.name === "game_config" && (
          <GameSpecificConfig
            capability={capability}
            gameName={gameName}
            plugin={plugin}
            config={gameConfig}
            onChangeConfig={(newCfg) => {
              setGameConfig(newCfg);
              if (newCfg.variant && (newCfg.variant === "TRADITIONAL" || newCfg.variant === "AMERICAN")) {
                setDominoesVariant(newCfg.variant);
              }
              if (newCfg.playerCount) {
                setLudoPlayerCount(newCfg.playerCount);
              }
            }}
            isVsComputer={step.targetMode === "VS_COMPUTER"}
            loading={creating}
            onContinue={() => {
              if (step.targetMode === "VS_COMPUTER") {
                void startVsComputer("MEDIUM", gameConfig.timeProfile);
              } else if (step.targetMode === "FRIEND") {
                setStep({ name: "friend_stake" });
              } else {
                setStep({ name: "random_stake" });
              }
            }}
          />
        )}

        {step.name === "difficulty" && (
          <DifficultySelect
            plugin={plugin}
            gameName={gameName}
            onSelect={(d) => {
              if (d !== "EASY" && !player) {
                openPopup();
                return;
              }
              setDifficulty(d);
              if (gameId === "chess") {
                if (d === "EASY") {
                  void startVsComputer("EASY", "UNLIMITED");
                } else if (d === "EXPERT") {
                  void startVsComputer("EXPERT", "PER_MOVE_60S");
                } else {
                  setStep({ name: "time_control", difficulty: d });
                }
              } else {
                void startVsComputer(d, "STANDARD");
              }
            }}
          />
        )}

        {step.name === "time_control" && (
          gameId === "chess" ? (
            <ChessTimePerMoveSelect
              onSelect={(profile) => void startVsComputer(step.difficulty, profile)}
              loading={creating}
            />
          ) : (
            <TimeControlSelect
              plugin={plugin}
              onSelect={(profile) => void startVsComputer(step.difficulty, profile)}
            />
          )
        )}

        {step.name === "friend_stake" && (
          <StakeSelect plugin={plugin} onContinue={(stake) => setStep({ name: "friend", stake })} />
        )}

        {step.name === "random_stake" && (
          <StakeSelect plugin={plugin} onContinue={async (stake) => {
            if (!player) {
              if (stake.tier === "FREE") {
                setCreating(true);
                try {
                  const guestRes = await post<{ accessToken: string; refreshToken: string }>("/v1/auth/guest", {});
                  setTokens(guestRes.accessToken, guestRes.refreshToken, true);
                  setStep({ name: "matchmaking", stake });
                } catch {
                  openPopup();
                } finally {
                  setCreating(false);
                }
              } else {
                openPopup();
              }
            } else {
              setStep({ name: "matchmaking", stake });
            }
          }} />
        )}

        {step.name === "friend" && (
          <FriendChallenge
            gameId={gameId}
            stake={step.stake}
            mode={
              gameId === "ludo"
                ? (gameConfig.playerCount === 4 ? "standard-4p" : "standard")
                : gameId === "dominoes"
                ? (gameConfig.variant || dominoesVariant)
                : gameId === "backgammon"
                ? String(gameConfig.matchPoints || 1)
                : gameId === "speed-math"
                ? (gameConfig.sprintOption || "standard")
                : gameId === "xo" || gameId === "connect-four"
                ? (gameConfig.seriesOption || "standard")
                : "standard"
            }
            {...(gameConfig.timeProfile ? { timeProfile: gameConfig.timeProfile } : {})}
          />
        )}

        {step.name === "matchmaking" && (
          <MatchmakingFlow 
            gameId={gameId} 
            stake={step.stake} 
            mode={
              gameId === "ludo"
                ? (gameConfig.playerCount === 4 ? "standard-4p" : "standard")
                : gameId === "dominoes"
                ? (gameConfig.variant || dominoesVariant)
                : gameId === "backgammon"
                ? String(gameConfig.matchPoints || 1)
                : gameId === "speed-math"
                ? (gameConfig.sprintOption || "standard")
                : gameId === "xo" || gameId === "connect-four"
                ? (gameConfig.seriesOption || "standard")
                : "standard"
            }
            {...(gameConfig.timeProfile ? { timeProfile: gameConfig.timeProfile } : {})}
          />
        )}

        {creating && (
          <div className={styles.creatingOverlay}>
            <div className={styles.spinner} />
            <p aria-live="polite">{t("game.connecting") || "Creating match..."}</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}


export default function PlayGamePage(props: { params: Promise<{ gameId: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InnerPlayGamePage {...props} />
    </Suspense>
  );
}

