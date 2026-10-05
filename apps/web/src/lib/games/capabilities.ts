export type GameSetupType =
  | "time_control"
  | "variant_select"
  | "player_count"
  | "match_points"
  | "sprint_config"
  | "series_format"
  | "canonical_direct";

export interface TimeControlOption {
  id: string;
  nameEn: string;
  nameAr: string;
  timeEn: string;
  timeAr: string;
  descEn: string;
  descAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface VariantOption {
  id: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface MatchPointOption {
  id: string;
  points: number;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  durationEn: string;
  durationAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface SprintOption {
  id: string;
  questions: number;
  durationSec: number;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  operationsEn: string;
  operationsAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface SeriesOption {
  id: string;
  gamesCount: number;
  targetWins: number;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface PlayerCountOption {
  id: string;
  count: 2 | 4;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  badge?: string;
  icon: string;
  isDefault?: boolean;
}

export interface GameCapability {
  gameId: string;
  setupType: GameSetupType;
  titleEn: string;
  titleAr: string;
  taglineEn: string;
  taglineAr: string;
  badgeEn: string;
  badgeAr: string;
  supportsAI: boolean;
  timeControls?: TimeControlOption[];
  variants?: VariantOption[];
  matchPoints?: MatchPointOption[];
  sprintOptions?: SprintOption[];
  seriesOptions?: SeriesOption[];
  playerCountOptions?: PlayerCountOption[];
  defaultStakeUsd: number;
  recommendedStakes: number[];
}

export const GAME_CAPABILITIES: Record<string, GameCapability> = {
  chess: {
    gameId: "chess",
    setupType: "time_control",
    titleEn: "Chess (FIDE)",
    titleAr: "الشطرنج الدولي (FIDE)",
    taglineEn: "Master-level 1v1 battle of Kings under strict FIDE rules.",
    taglineAr: "معركة الملوك الخالدة بقواعد الاتحاد الدولي للشطرنج كاملة وصارمة.",
    badgeEn: "Strict FIDE Clocks",
    badgeAr: "ساعات فيد الرسمية",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50, 100],
    timeControls: [
      {
        id: "BLITZ_3_2",
        nameEn: "Blitz (3+2)",
        nameAr: "خاطف (3+2)",
        timeEn: "3 min + 2s increment",
        timeAr: "3 دقائق + ثانيتان لكل نقلة",
        descEn: "The premier competitive esports standard. Fast tactical play with increment.",
        descAr: "المعيار الرسمي التنافسي المعتمد عالمياً. لعب تكتيكي سريع مع تعويض زمني.",
        badge: "Official Standard",
        icon: "⚡",
        isDefault: true,
      },
      {
        id: "BULLET_1_0",
        nameEn: "Bullet (1+0)",
        nameAr: "رصاصة (1+0)",
        timeEn: "1 min sudden death",
        timeAr: "دقيقة واحدة موت مفاجئ",
        descEn: "Ultra-fast adrenaline rush. Intuitive reflexes and split-second tactics.",
        descAr: "حماس وأدرينالين فائق السرعة. يعتمد على سرعة البديهة والحدس الفوري.",
        badge: "Fast Pace",
        icon: "🔥",
      },
      {
        id: "RAPID_10_0",
        nameEn: "Rapid (10+0)",
        nameAr: "سريع (10+0)",
        timeEn: "10 min clock",
        timeAr: "10 دقائق لكل لاعب",
        descEn: "Deep calculation and positional mastery with sufficient think time.",
        descAr: "حسابات عميقة ومناورات استراتيجية دقيقة مع متسع كافٍ من الوقت.",
        badge: "Deep Tactics",
        icon: "🧠",
      },
      {
        id: "PER_MOVE_60S",
        nameEn: "Anti-Cheat (60s/move)",
        nameAr: "مكافحة الغش (60ث/نقلة)",
        timeEn: "60 seconds per move",
        timeAr: "60 ثانية لكل نقلة",
        descEn: "Strict time window per move with behavioral analysis and flagging.",
        descAr: "نافذة زمنية صارمة لكل حركة مع مراقبة خوارزمية لسقوط الراية.",
        badge: "Fair Play",
        icon: "🛡️",
      },
    ],
  },

  dominoes: {
    gameId: "dominoes",
    setupType: "variant_select",
    titleEn: "Dominoes",
    titleAr: "الدومينو التنافسية",
    taglineEn: "Classic tile matching and pip deduction with authentic bank rules.",
    taglineAr: "لعبة المقاهي العريقة بحسابات البنك والأطراف المفتوحة والعد الحاسم.",
    badgeEn: "Authentic Variants",
    badgeAr: "أنماط لعب معتمدة",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50],
    variants: [
      {
        id: "TRADITIONAL",
        nameEn: "Traditional Draw & Block",
        nameAr: "النمط العادي (سحب وقفل)",
        descEn: "First to empty hand wins, or lowest pip sum wins upon a dead block.",
        descAr: "الفوز بإنهاء كل البلاطات في يدك أولاً، أو الحصول على أقل مجموع نقاط عند غلق اللعبة (القفل).",
        badge: "Classic",
        icon: "🀄",
        isDefault: true,
      },
      {
        id: "AMERICAN",
        nameEn: "American All-Fives",
        nameAr: "النمط الأمريكي (All-Fives)",
        descEn: "Score points when open ends total a multiple of 5. Race to 150 points.",
        descAr: "احتساب النقاط فوراً عند وصول مجموع الأطراف لمضاعفات الرقم 5. السباق نحو 150 نقطة.",
        badge: "High Strategy",
        icon: "🎯",
      },
    ],
  },

  ludo: {
    gameId: "ludo",
    setupType: "player_count",
    titleEn: "Ludo of Legends",
    titleAr: "لودو الأساطير",
    taglineEn: "Fast-paced cross-board pawn race with tactical captures and CSPRNG dice.",
    taglineAr: "سباق البيادق الأسطوري نحو خط النهاية مع التجميد والأكل ونرد خوارزمي عادل.",
    badgeEn: "Live 1v1 & 4P",
    badgeAr: "مواجهات ثنائية ورباعية",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [1, 2, 5, 10, 25, 50],
    playerCountOptions: [
      {
        id: "2P",
        count: 2,
        nameEn: "1v1 Quick Duel",
        nameAr: "مواجهة 1 ضد 1 سريعة",
        descEn: "Head-to-head sprint across opposite corridors. Quick and intense.",
        descAr: "نزال ثنائي مباشر عبر الممرات المتقابلة. حسم سريع وإثارة متواصلة.",
        badge: "Fast 1v1",
        icon: "⚔️",
        isDefault: true,
      },
      {
        id: "4P",
        count: 4,
        nameEn: "4-Player Royale",
        nameAr: "ملحمة 4 أبطال (Royale)",
        descEn: "Full 4-corner board battle. High-stakes showdown with huge pot rewards.",
        descAr: "معركة شاملة تضم 4 لاعبين في كل ركن من الرقعة مع جائزة كبرى مضاعفة.",
        badge: "Big Pot",
        icon: "👑",
      },
    ],
  },

  backgammon: {
    gameId: "backgammon",
    setupType: "match_points",
    titleEn: "Backgammon (Tawla)",
    titleAr: "طاولة الزهر (Backgammon)",
    taglineEn: "Ancient duel of pip races, blockades, bearing off, and doubling strategy.",
    taglineAr: "صراع الزهر والقطع العريق، الركض نحو الربع الأخير والهروب ومكعب المضاعفة.",
    badgeEn: "WBF Match Play",
    badgeAr: "مباريات بنظام النقاط",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50, 100],
    matchPoints: [
      {
        id: "1_POINT",
        points: 1,
        nameEn: "Single Game (1 Pt)",
        nameAr: "مباراة سريعة (نقطة واحدة)",
        descEn: "Sudden death single-game duel. Fast resolution with pure tempo racing.",
        descAr: "حسم فوري من جولة واحدة. وتيرة فائقة السرعة للمواجهات السريعة.",
        durationEn: "3-5 min",
        durationAr: "3-5 دقائق",
        badge: "Quick Duel",
        icon: "⚡",
        isDefault: true,
      },
      {
        id: "3_POINTS",
        points: 3,
        nameEn: "Mini Match (3 Pts)",
        nameAr: "مباراة قصيرة (3 نقاط)",
        descEn: "Balanced strategic series featuring the Doubling Cube and gammon wins.",
        descAr: "سلسلة متوازنة تشمل استخدام مكعب المضاعفة والفوز بالمارس.",
        durationEn: "8-12 min",
        durationAr: "8-12 دقيقة",
        badge: "Competitive",
        icon: "🎲",
      },
      {
        id: "5_POINTS",
        points: 5,
        nameEn: "Championship (5 Pts)",
        nameAr: "مباراة بطولة (5 نقاط)",
        descEn: "Full official tournament standard with the Crawford Rule applied.",
        descAr: "المعيار المعتمد في البطولات الدولية مع تطبيق قاعدة كروفورد الرسمية.",
        durationEn: "15-20 min",
        durationAr: "15-20 دقيقة",
        badge: "Tournament",
        icon: "🏆",
      },
    ],
  },

  "speed-math": {
    gameId: "speed-math",
    setupType: "sprint_config",
    titleEn: "Speed Math Duel",
    titleAr: "تحدي الرياضيات السريع",
    taglineEn: "Simultaneous real-time mental calculation sprint. Speed and accuracy.",
    taglineAr: "تحدٍ ذهني لحظي متزامن في الحساب الذهني الخارق. السرعة والدقة المطلقة.",
    badgeEn: "Simultaneous Sprint",
    badgeAr: "تنافس لحظي متزامن",
    supportsAI: true,
    defaultStakeUsd: 2,
    recommendedStakes: [1, 2, 5, 10, 20],
    sprintOptions: [
      {
        id: "BLITZ_10",
        questions: 10,
        durationSec: 60,
        nameEn: "10-Question Blitz",
        nameAr: "سبرنت 10 أسئلة (فائق السرعة)",
        descEn: "60-second ultra-fast calculation sprint. First to answer with high accuracy.",
        descAr: "سبرنت في 60 ثانية لحل 10 مسائل حسابية متتالية بسرعة فائقة.",
        operationsEn: "+, -, ×",
        operationsAr: "+، -، ×",
        badge: "Fast Blitz",
        icon: "⚡",
        isDefault: true,
      },
      {
        id: "MARATHON_20",
        questions: 20,
        durationSec: 120,
        nameEn: "20-Question Marathon",
        nameAr: "ماراثون 20 مسألة (تحدي الدقة)",
        descEn: "120-second endurance sprint testing stamina, consistency, and complex arithmetic.",
        descAr: "اختبار الدقة والتركيز الذهني المستمر عبر 20 مسألة حسابية متقدمة.",
        operationsEn: "+, -, ×, ÷",
        operationsAr: "+، -، ×، ÷",
        badge: "High Focus",
        icon: "🧠",
      },
    ],
  },

  xo: {
    gameId: "xo",
    setupType: "series_format",
    titleEn: "Tic-Tac-Toe (XO)",
    titleAr: "إكس أو (XO)",
    taglineEn: "Classic grid tactical duel. Played in multi-round series to eliminate draw bias.",
    taglineAr: "المواجهة الكلاسيكية المحبوبة. تُلعب بنظام السلسلة لتحديد الفائز وحسم التعادل.",
    badgeEn: "Series Match",
    badgeAr: "سلسلة جولات حاسمة",
    supportsAI: true,
    defaultStakeUsd: 1,
    recommendedStakes: [1, 2, 5],
    seriesOptions: [
      {
        id: "BEST_OF_3",
        gamesCount: 3,
        targetWins: 2,
        nameEn: "Best of 3 (First to 2)",
        nameAr: "الأفضل من 3 جولات (أول من يفوز بـ 2)",
        descEn: "Standard esports series format. Ensures both players experience first and second turn.",
        descAr: "المعيار التنافسي المعتمد لضمان تكافؤ فرص البداية بين اللاعبين.",
        badge: "Recommended",
        icon: "⚔️",
        isDefault: true,
      },
      {
        id: "BEST_OF_5",
        gamesCount: 5,
        targetWins: 3,
        nameEn: "Best of 5 (First to 3)",
        nameAr: "الأفضل من 5 جولات (أول من يفوز بـ 3)",
        descEn: "Extended series demanding consistent focus and opening versatility.",
        descAr: "سلسلة مطولة تختبر التركيز التام وتنوع افتتاحيات اللعب.",
        badge: "Championship",
        icon: "🏆",
      },
    ],
  },

  "connect-four": {
    gameId: "connect-four",
    setupType: "series_format",
    titleEn: "Connect Four",
    titleAr: "أربعة على التوالي (Connect 4)",
    taglineEn: "Vertical gravity alignment duel. Form 4 discs horizontally, vertically, or diagonally.",
    taglineAr: "نزال إسقاط الأقراص العمودي بذكاء وتوقع الفخاخ لتكوين 4 أقراص متصلة.",
    badgeEn: "Series Duel",
    badgeAr: "مواجهة سلسلة",
    supportsAI: true,
    defaultStakeUsd: 2,
    recommendedStakes: [1, 2, 5, 10],
    seriesOptions: [
      {
        id: "SINGLE",
        gamesCount: 1,
        targetWins: 1,
        nameEn: "Single Duel (1 Game)",
        nameAr: "مباراة واحدة حاسمة",
        descEn: "Quick vertical showdown. One mistake decides the duel.",
        descAr: "مباراة سريعة ومباشرة. خطأ واحد في إغلاق المسارات يحسم النتيجة.",
        badge: "Sudden Death",
        icon: "⚡",
        isDefault: true,
      },
      {
        id: "BEST_OF_3",
        gamesCount: 3,
        targetWins: 2,
        nameEn: "Best of 3 (First to 2)",
        nameAr: "الأفضل من 3 جولات",
        descEn: "High-tactics series balancing first-turn advantage.",
        descAr: "سلسلة تكتيكية متوازنة تمنح كلا اللاعبين فرصة الهجوم والدفاع.",
        badge: "Balanced",
        icon: "🔴",
      },
    ],
  },

  checkers: {
    gameId: "checkers",
    setupType: "canonical_direct",
    titleEn: "Checkers (Draughts)",
    titleAr: "الداما الرسمية (Checkers)",
    taglineEn: "8x8 diagonal battle with mandatory jumps, crowning, and board control.",
    taglineAr: "صراع الخطوط المائلة 8×8 مع إلزامية القفز وتتويج الملوك والسيطرة على المركز.",
    badgeEn: "Official Rules",
    badgeAr: "القواعد الرسمية 8×8",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50],
  },

  reversi: {
    gameId: "reversi",
    setupType: "canonical_direct",
    titleEn: "Reversi (Othello)",
    titleAr: "ريفيرسي (عطيل)",
    taglineEn: "Tactical disc flips on an 8x8 grid. Dominate corners and claim final disc count.",
    taglineAr: "لعبة قلب الأقراص الاستراتيجية 8×8، السيطرة على الزوايا واحتكار الأقراص النهائية.",
    badgeEn: "8x8 Canonical",
    badgeAr: "القواعد القياسية 8×8",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50],
  },

  gomoku: {
    gameId: "gomoku",
    setupType: "canonical_direct",
    titleEn: "Gomoku (Five in a Row)",
    titleAr: "جوموكو (خمسة في خط)",
    taglineEn: "15x15 pure freestyle line creation. Connect 5 continuous stones to claim victory.",
    taglineAr: "الاستراتيجية اليابانية الخالدة على رقعة 15×15. أول من يصف 5 أحجار متصلة يفوز.",
    badgeEn: "15x15 Freestyle",
    badgeAr: "النمط الحر 15×15",
    supportsAI: true,
    defaultStakeUsd: 5,
    recommendedStakes: [2, 5, 10, 20, 50],
  },

  seega: {
    gameId: "seega",
    setupType: "canonical_direct",
    titleEn: "Seega",
    titleAr: "السيجة المصرية القديمة",
    taglineEn: "Ancient Pharaohs' 5x5 board duel with tactical piece placement and flank captures.",
    taglineAr: "لعبة الفراعنة التكتيكية العريقة 5×5، مرحلة إنزال استراتيجي وحصار واقتناص متتالي.",
    badgeEn: "5x5 Heritage",
    badgeAr: "لعبة التراث 5×5",
    supportsAI: true,
    defaultStakeUsd: 2,
    recommendedStakes: [1, 2, 5, 10, 20],
  },
};

export function getGameCapability(gameId: string): GameCapability {
  const norm = gameId.replace(/_/g, "-");
  return (
    GAME_CAPABILITIES[norm] ||
    GAME_CAPABILITIES[gameId] || {
      gameId,
      setupType: "canonical_direct",
      titleEn: gameId,
      titleAr: gameId,
      taglineEn: "Competitive 1v1 duel",
      taglineAr: "مواجهة تنافسية 1 ضد 1",
      badgeEn: "1v1 Duel",
      badgeAr: "مواجهة 1 ضد 1",
      supportsAI: true,
      defaultStakeUsd: 2,
      recommendedStakes: [2, 5, 10, 20],
    }
  );
}
