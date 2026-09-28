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
import { use, useState, useEffect, Suspense } from "react";
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
import { useI18n } from "@/lib/i18n/context";
import styles from "./playGame.module.css";

// Last-resort fallback for a game with no real photography yet (e.g. a
// brand-new game shipped before its JPG assets exist) -- a small inline
// placeholder beats a broken-image icon on the pre-match screen.
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230D111A'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%23FFD700' stroke-opacity='0.45' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23FFD700' fill-opacity='0.7'/%3E%3C/svg%3E";

type Step =
  | { name: "mode" }
  | { name: "difficulty" }
  | { name: "time_control"; difficulty: Difficulty | null }
  | { name: "friend_stake" }
  | { name: "random_stake" }
  | { name: "friend"; stake: StakeChoice }
  | { name: "matchmaking"; stake: StakeChoice };

interface RuleItem {
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
}

interface GameIdentitySpec {
  timingBadge: { ar: string; en: string };
  natureBadge: { ar: string; en: string };
  dopamineBadge: { ar: string; en: string };
  subtitle: { ar: string; en: string };
  rules: RuleItem[];
}

const GAME_IDENTITY_REGISTRY: Record<string, GameIdentitySpec> = {
  chess: {
    timingBadge: { ar: "⏱️ ساعة فيد الرسمية (3+2 أو 60ث)", en: "⏱️ Official FIDE Clock (3+2 / 60s)" },
    natureBadge: { ar: "🧠 ذكاء وتكتيك حتمي 100%", en: "🧠 100% Deterministic Skill" },
    dopamineBadge: { ar: "💥 كش مات مهيب وصعود ELO", en: "💥 Checkmate Freeze-Frame & ELO" },
    subtitle: {
      ar: "معركة الملوك الخالدة بقواعد الاتحاد الدولي للشطرنج (FIDE) كاملة وصارمة.",
      en: "The timeless battle of grandmasters under strict international FIDE laws."
    },
    rules: [
      {
        titleAr: "التبييت القانوني (Castling)",
        titleEn: "Castling Maneuver",
        descAr: "حماية الملك بالتبادل مع القلعة شرط ألا يكون الملك أو مساره تحت التهديد، ولم تتحرك القطعتان مسبقاً.",
        descEn: "Secure your King with the Rook provided neither has moved and the traversed squares are safe."
      },
      {
        titleAr: "الأخذ بالتجاوز (En Passant)",
        titleEn: "En Passant Capture",
        descAr: "أكل بيدق الخصم فور تحركه خطوتين للأمام إذا جاور بيدقك، وتسقط هذه الفرصة بعد النقلة مباشرة.",
        descEn: "Capture an opponent pawn that advanced two squares immediately on the very next turn."
      },
      {
        titleAr: "ترقية البيادق (Pawn Promotion)",
        titleEn: "Pawn Promotion",
        descAr: "بلوغ البيدق الصف الثامن للخصم يمنحه الترقية الإجبارية الفورية لوزير أو قلعة أو فيل أو حصان.",
        descEn: "Reaching the 8th rank instantly crowns your pawn into a Queen, Rook, Bishop, or Knight."
      },
      {
        titleAr: "قواعد التعادل المعتمدة",
        titleEn: "Official Draw Conditions",
        descAr: "تعادل الكش الميت (Stalemate)، تكرار الموقف 3 مرات، أو مرور 50 نقلة دون أكل أو تحريك أي بيدق.",
        descEn: "Stalemate, threefold repetition, or 50 moves without a capture or pawn advance."
      }
    ]
  },
  dominoes: {
    timingBadge: { ar: "⏱️ 25 ثانية لكل نقلة", en: "⏱️ 25s Move Timer" },
    natureBadge: { ar: "🀄 قراءة بنك وتطابق أطراف", en: "🀄 Tile Tracking & Open Ends" },
    dopamineBadge: { ar: "🀄 خبطة الدومينو وإغلاق القفل", en: "🀄 Domino Slam & Game Block" },
    subtitle: {
      ar: "لعبة المقاهي العريقة بحسابات البنك والأطراف المفتوحة بالنمط العادي والأمريكي.",
      en: "The classic tile-shedding duel of deduction and bone control in Traditional and American All-Fives."
    },
    rules: [
      {
        titleAr: "مطابقة الأطراف المفتوحة",
        titleEn: "Open End Matching",
        descAr: "يجب أن يتطابق رقم البلاطة مع أحد الطرفين المفتوحين على الطاولة، وإلا يلزم السحب من البنك.",
        descEn: "Played tiles must match one of the active open ends; otherwise draw from the boneyard."
      },
      {
        titleAr: "النمط العادي (Draw/Block)",
        titleEn: "Traditional Draw & Block",
        descAr: "الفوز بإنهاء كل البلاطات في يدك أولاً، أو الحصول على أقل مجموع نقاط عند غلق اللعبة (القفل).",
        descEn: "Win by shedding all your tiles first or holding the lowest pip sum during a dead block."
      },
      {
        titleAr: "النمط الأمريكي (All-Fives)",
        titleEn: "American All-Fives",
        descAr: "تسجيل فوري للنقاط عند لعب بلاطة تجعل مجموع الأطراف المفتوحة يقبل القسمة على 5.",
        descEn: "Score points immediately whenever the sum of exposed ends forms a multiple of 5."
      },
      {
        titleAr: "إغلاق اللعبة (القفل)",
        titleEn: "Blocked Game Resolution",
        descAr: "عند نفاد البنك واستحالة لعب أي حركة من الطرفين، يُحسب مجموع نقاط يد كل لاعب لحسم الفائز.",
        descEn: "When the boneyard empties and neither can play, lowest remaining pip count claims victory."
      }
    ]
  },
  ludo: {
    timingBadge: { ar: "⏱️ 20 ثانية مع رمي تلقائي مريح", en: "⏱️ 20s Auto-Roll Pacing" },
    natureBadge: { ar: "🎲 سباق تكتيكي وحظ عادل", en: "🎲 Tactical Race & Fair Dice" },
    dopamineBadge: { ar: "🔥 الستة الذهبية وتشقلب النرد 3D", en: "🔥 3D Cyber-Die & Golden 6" },
    subtitle: {
      ar: "سباق الحظ والتكتيك الأسطوري بنرد ثلاثي الأبعاد وغرف خاصة بدون مستويات مصطنعة.",
      en: "The legendary race of fortune and ambush with 3D Cyber-Dice and private friend rooms."
    },
    rules: [
      {
        titleAr: "الخروج من القاعدة (الرقم 6)",
        titleEn: "Base Spawn with 6",
        descAr: "يتطلب خروج أي قاطعة من قاعدتها إلى نقطة الانطلاق رمي الرقم (6) حصراً.",
        descEn: "Spawning any token from your home yard to the start square requires rolling exactly a 6."
      },
      {
        titleAr: "الرمية الإضافية المجانية (Bonus Roll)",
        titleEn: "Bonus Extra Roll",
        descAr: "تمنح رمية إضافية فورية عند رمي (6)، أو أكل قاطعة للخصم، أو وصول قاطعة لخط النهاية.",
        descEn: "Earn a free extra roll upon rolling a 6, capturing an enemy token, or reaching home triangle."
      },
      {
        titleAr: "عقوبة الثلاث ستات (Three 6s Rule)",
        titleEn: "Three Consecutive 6s Penalty",
        descAr: "إذا رمى اللاعب (6) ثلاث مرات متتالية، تسقط رميته الثالثة وينقل الدور فوراً منعاً للاحتكار.",
        descEn: "Rolling three consecutive 6s cancels the third roll and passes the turn immediately."
      },
      {
        titleAr: "المربعات الآمنة (8 نجوم)",
        titleEn: "8 Star Safe Zones",
        descAr: "المربعات المميزة بعلامة النجمة آمنة تماماً ولا يمكن أكل أي قاطعة تستقر فوقها.",
        descEn: "Tokens stationed on star-marked squares are completely immune from enemy captures."
      },
      {
        titleAr: "الوصول الدقيق للنهاية",
        titleEn: "Exact Finishing Roll",
        descAr: "لدخول المثلث الأخير وإنهاء مسار القاطعة، يلزم الحصول على رقم النرد المطابق تماماً للمربعات المتبقية.",
        descEn: "Entering the final home victory triangle requires the exact remaining roll count."
      }
    ]
  },
  backgammon: {
    timingBadge: { ar: "⏱️ 25 ثانية لكل نقلة", en: "⏱️ 25s Move Timer" },
    natureBadge: { ar: "🎲 احتمالات تكتيكية ومكعب مضاعفة", en: "🎲 Tactical Odds & Doubling Cube" },
    dopamineBadge: { ar: "🎲 دحرجة الزهر العاجي ومضاعفة 64x", en: "🎲 Ivory Dice & 64x Doubling" },
    subtitle: {
      ar: "أعرق ألعاب الشرق بالتناغم بين احتمالات النرد والتكتيك ومضاعفة الرهان.",
      en: "The imperial contest of board control, bearing off, and doubling stakes."
    },
    rules: [
      {
        titleAr: "رمية الدوبل (Double Roll)",
        titleEn: "Double Dice Rule",
        descAr: "الحصول على نردين متطابقين (مثلاً 5-5) يمنحك 4 حركات كاملة بنفس القيمة بدلاً من اثنتين.",
        descEn: "Rolling matched dice (e.g. 5-5) grants four full moves of that value instead of two."
      },
      {
        titleAr: "أكل القرص المنفرد (Blot Hit)",
        titleEn: "Single Blot Capture",
        descAr: "الهبوط على نقطة بها قرص وحيد للخصم يطرده فوراً إلى الحاجز الأوسط (Bar) ولا يلعب حتى يخرج.",
        descEn: "Landing on an isolated enemy checker hits it to the Bar, requiring re-entry before other moves."
      },
      {
        titleAr: "مكعب المضاعفة (Doubling Cube)",
        titleEn: "Doubling Cube Stakes",
        descAr: "حق رفع قيمة رهان المباراة (2x, 4x, 8x...) ليختار الخصم بين القبول أو الانسحاب الفوري.",
        descEn: "Propose doubling match stakes (2x, 4x, 8x...); opponent must either accept or forfeit."
      },
      {
        titleAr: "إخراج الأقراص (Bearing Off)",
        titleEn: "Bearing Off to Victory",
        descAr: "لا يحق للاعب إخراج أي قرص من اللوح حتى تجتمع جميع أقراصه الـ 15 في بيته الأخير.",
        descEn: "You cannot bear off any checkers until all 15 of your checkers arrive inside your home board."
      }
    ]
  },
  "speed-math": {
    timingBadge: { ar: "⏱️ 60 ثانية متزامنة مشتركة", en: "⏱️ 60s Shared Sprint" },
    natureBadge: { ar: "⚡ سرعة بديهة وحساب ذهني", en: "⚡ Mental Arithmetic & Reflex" },
    dopamineBadge: { ar: "🔥 مضاعف الكومبو الناري x5", en: "🔥 Combo Multiplier Rush x5" },
    subtitle: {
      ar: "سباق الأدرينالين الخالص وجهاً لوجه في الحساب السريع تحت ضغط العداد المتزامن.",
      en: "Pure adrenaline head-to-head arithmetic sprint against the synchronous clock."
    },
    rules: [
      {
        titleAr: "ساعة مشتركة 60 ثانية",
        titleEn: "Synchronous 60s Race",
        descAr: "نفس الأسئلة الحسابية تعرض لكلا المتسابقين في نفس اللحظة بدون أي تأخير.",
        descEn: "Identical arithmetic questions appear simultaneously for both competitors in real time."
      },
      {
        titleAr: "مضاعف الكومبو (Streak Multiplier)",
        titleEn: "Streak Combo Multiplier",
        descAr: "كل إجابة صحيحة متتالية ترفع مضاعف النقاط (x2, x3, x5) وتشعل شاشتك باللهب.",
        descEn: "Consecutive correct answers trigger point multipliers (x2, x3, x5) and ignite fire combos."
      },
      {
        titleAr: "عقوبة الخطأ وتصفير السلسلة",
        titleEn: "Mistake Penalty & Reset",
        descAr: "الإجابة الخاطئة تكسر سلسلة الكومبو فوراً وتمنح الخصم أسبقية التقدم في عداد النقاط.",
        descEn: "An incorrect answer instantly breaks your multiplier streak and forfeits momentum."
      }
    ]
  },
  xo: {
    timingBadge: { ar: "⚡ 5 ثوانٍ لكل حركة (موت مفاجئ)", en: "⚡ 5s Sudden Death Turn" },
    natureBadge: { ar: "❌ سرعة رد فعل وتفادي الفخاخ", en: "❌ Quick Insight & Trap Evasion" },
    dopamineBadge: { ar: "☄️ شطب الفوز النيزكي الليزري", en: "☄️ Meteor Laser Win-Strike" },
    subtitle: {
      ar: "معركة السرعة الخاطفة لمنع التعادل بضربة نيزكية قاضية في 5 ثوانٍ فقط.",
      en: "Lightning-fast turn limit to break repetitive draws with a decisive laser strike."
    },
    rules: [
      {
        titleAr: "وقت الحركة الصارم (5 ثوانٍ)",
        titleEn: "Strict 5s Turn Clock",
        descAr: "لكل لاعب 5 ثوانٍ فقط لوضع علامته (X أو O)؛ انتهاء الوقت يعني الخسارة الفورية.",
        descEn: "Each player has exactly 5 seconds per turn; timeout results in immediate forfeiture."
      },
      {
        titleAr: "الخط المستقيم الثلاثي",
        titleEn: "3-in-a-Row Alignment",
        descAr: "أول من يشكل خطاً مستقيماً من 3 علامات (أفقياً، رأسياً، أو قطرياً) يفوز بالنزال.",
        descEn: "First player to connect 3 marks horizontally, vertically, or diagonally wins instantly."
      },
      {
        titleAr: "كسر جمود التعادل",
        titleEn: "Fast-Paced Decisiveness",
        descAr: "الضغط الزمني يحفز الأخطاء التكتيكية والانتصارات السريعة وتجنب التعادل المتكرر.",
        descEn: "High time pressure rewards tactical intuition and eliminates slow, boring draws."
      }
    ]
  },
  "connect-four": {
    timingBadge: { ar: "⏱️ 20 ثانية لكل إسقاط", en: "⏱️ 20s Drop Timer" },
    natureBadge: { ar: "🔴 تكتيك الجاذبية والتطويق", en: "🔴 Gravity Strategy & Traps" },
    dopamineBadge: { ar: "🎯 فخ التوصيل الرباعي المتتالي", en: "🎯 Tactical Quad-Drop Trap" },
    subtitle: {
      ar: "تحدي الجاذبية الذكي لإسقاط الأقراص وصنع الفخاخ الرباعية المزدوجة.",
      en: "The vertical strategy battle of gravity drops and multi-threat traps."
    },
    rules: [
      {
        titleAr: "إسقاط الأقراص الرأسي",
        titleEn: "Vertical Gravity Drop",
        descAr: "تسقط الأقراص بالتناوب في أي من الأعمدة الـ 7 لتستقر في أدنى خانة فارغة متاحة.",
        descEn: "Discs drop alternately into any of the 7 columns, falling to the lowest vacant slot."
      },
      {
        titleAr: "توصيل 4 أقراص متصلة",
        titleEn: "Connect Four to Win",
        descAr: "الفوز الفوري يتحقق لأول من يربط 4 أقراص من لونه في خط أفقي أو رأسي أو قطري.",
        descEn: "The first player to form an unbroken line of 4 discs in any direction claims victory."
      },
      {
        titleAr: "الأعمدة المكتملة",
        titleEn: "Column Capacity Limit",
        descAr: "العمود الذي يكتمل بـ 6 أقراص يُغلق تلقائياً ولا يمكن الإسقاط داخله مجدداً.",
        descEn: "Columns filled to max capacity (6 discs) are locked against further drops."
      }
    ]
  },
  checkers: {
    timingBadge: { ar: "⏱️ 30 ثانية لكل نقلة", en: "⏱️ 30s Move Timer" },
    natureBadge: { ar: "👑 تضحيات إجبارية وتتويج ملوكي", en: "👑 Forced Jumps & Royal Kings" },
    dopamineBadge: { ar: "👑 أكل ثلاثي متتابع وتتويج الملك", en: "👑 Multi-Jump Chain & Coronation" },
    subtitle: {
      ar: "لعبة التحريض والتضحية الذكية لسحب الخصم إلى الفخاخ وتتويج الملوك.",
      en: "The classic game of mandatory captures, cascading jumps, and crowning royal kings."
    },
    rules: [
      {
        titleAr: "القفز الإجباري (Mandatory Capture)",
        titleEn: "Mandatory Capture",
        descAr: "إذا توفرت قفزة أكل لقطعة الخصم، يجب تنفيذها إجبارياً ولا يسمح بأي حركة عادية بديلة.",
        descEn: "If a capture jump is available, it is strictly mandatory and must be executed."
      },
      {
        titleAr: "سلسلة القفز المتعدد (Multi-Jump)",
        titleEn: "Cascading Multi-Jump",
        descAr: "عند أكل قطعة وتوفر أكل تالٍ لنفس القطعة، يواصل اللاعب الأكل في نفس النقلة.",
        descEn: "Continue jumping and capturing multiple pieces in a single sequence if available."
      },
      {
        titleAr: "تتويج الملك (King Coronation)",
        titleEn: "King Coronation",
        descAr: "وصول القطعة للصف الأخير للخصم يتوجها ملكاً يملك حرية التحرك والقفز للأمام والخلف.",
        descEn: "Reaching the enemy back row crowns the piece as a King, unlocking forward and backward moves."
      }
    ]
  },
  reversi: {
    timingBadge: { ar: "⏱️ 30 ثانية لكل نقلة", en: "⏱️ 30s Move Timer" },
    natureBadge: { ar: "🔄 حصر جانبي وسيطرة زوايا", en: "🔄 Flank Traps & Corner Control" },
    dopamineBadge: { ar: "🌊 شلال انقلاب الأقراص المتتابع", en: "🌊 Multi-Disc Cascade Flip" },
    subtitle: {
      ar: "دقيقة واحدة لتتعلمها، وعمر كامل لتتقن فن قلب الطاولة في النقلة الأخيرة.",
      en: "A minute to learn, a lifetime to master: turn the entire board in one move."
    },
    rules: [
      {
        titleAr: "الحصر والتطويق الإلزامي",
        titleEn: "Mandatory Enclosure",
        descAr: "يجب أن تطوق قرصاً أو أكثر للخصم بين قرصك الجديد وقرص موجود مسبقاً من لونك.",
        descEn: "Every move must bracket one or more enemy discs between your new and existing pieces."
      },
      {
        titleAr: "انقلاب الأقراص الشلالي",
        titleEn: "Cascading Disc Flips",
        descAr: "جميع أقراص الخصم المحصورة أفقياً ورأسياً وقطرياً تنقلب دفعة واحدة إلى لونك.",
        descEn: "All bracketed discs horizontally, vertically, and diagonally flip to your color."
      },
      {
        titleAr: "حصانة الزوايا الأربع",
        titleEn: "Corner Immunity",
        descAr: "الاستيلاء على زوايا اللوح الأربع يمنح أقراصك حصانة أبدية لا يمكن للخصم قلبها.",
        descEn: "Capturing any of the 4 corner squares permanently locks those discs from being flipped."
      }
    ]
  },
  gomoku: {
    timingBadge: { ar: "⏱️ دقيقة واحدة لكل حركة", en: "⏱️ 60s Strategic Focus" },
    natureBadge: { ar: "⚪ تركيز عميق وتطويق شرقي", en: "⚪ Oriental Alignment & Focus" },
    dopamineBadge: { ar: "✨ رنين حجر الخشب وتكامل الـ 5", en: "✨ Resonant Click & 5-in-a-Row" },
    subtitle: {
      ar: "فن الحصار الشرقي العريق على لوح غو 15x15 بنقاء الفكر والتناغم.",
      en: "The ancient eastern art of alignment and subtle encirclement on 15x15."
    },
    rules: [
      {
        titleAr: "التناوب على تقاطعات اللوح",
        titleEn: "Intersection Placement",
        descAr: "يوضع حجر واحد بالتناوب على تقاطعات اللوح الـ 15x15 ولا يمكن تحريك الحجر بعد تثبيته.",
        descEn: "Players alternate placing one stone on grid intersections; placed stones never move."
      },
      {
        titleAr: "ربط 5 أحجار غير منقطعة",
        titleEn: "Five in a Row Wins",
        descAr: "الفوز الفوري يتحقق لأول من يربط 5 أحجار متصلة أفقياً أو رأسياً أو قطرياً.",
        descEn: "First player to create an unbroken row of 5 stones in any direction wins immediately."
      },
      {
        titleAr: "التطويق الوقائي والمباغتة",
        titleEn: "Preventive Encirclement",
        descAr: "إغلاق مسارات الخصم قبل تشكيل الخطوط المفتوحة هو جوهر الاستراتيجية والانتصار.",
        descEn: "Blocking opponent open-ended lines early is crucial to prevent unblockable setups."
      }
    ]
  },
  seega: {
    timingBadge: { ar: "⏱️ 25 ثانية لكل نقلة", en: "⏱️ 25s Move Timer" },
    natureBadge: { ar: "🏺 تراث فرعوني وإطباق مزدوج", en: "🏺 Pharaonic Ambush Tactics" },
    dopamineBadge: { ar: "⚔️ الإطباق الساندويتشي على الحصى", en: "⚔️ Double Sandwich Enclosure" },
    subtitle: {
      ar: "أقدم ألعاب الدهاء التكتيكي في التاريخ الفرعوني (شبكة 5x5) بمرحلتي الإنزال والتحريك.",
      en: "The ancient pharaonic game of cunning drop phases and flanking ambushes on 5x5."
    },
    rules: [
      {
        titleAr: "مرحلة الإنزال بالتناوب",
        titleEn: "Alternating Drop Phase",
        descAr: "ينزل كل لاعب حجرين بالتناوب على اللوح مع ترك المربع الأوسط فارغاً تماماً.",
        descEn: "Players alternate placing two stones at a time, keeping the center square empty."
      },
      {
        titleAr: "مرحلة التحريك التكتيكي",
        titleEn: "Movement Phase",
        descAr: "تتحرك الحجارة خطوة واحدة نحو أي مربع فارغ مجاور أفقياً أو رأسياً.",
        descEn: "Stones move one orthogonal step into adjacent vacant squares."
      },
      {
        titleAr: "الأكل بالحصر (Sandwich Capture)",
        titleEn: "Flanking Sandwich Capture",
        descAr: "محاصرة حجر الخصم بين حجرين من لونك يقصيه من اللوح، ويمنحك حركة إضافية فورية.",
        descEn: "Trapping an enemy stone between two of yours captures it and grants an extra move."
      }
    ]
  }
};

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

  function handleBack() {
    switch (step.name) {
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
      case "random_stake":
        setStep({ name: "mode" });
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
      if (gameId === "ludo") {
        // Ludo has authentic relaxed turn timers and no artificial difficulty level
        void startVsComputer(null, "STANDARD");
      } else if (plugin!.difficulties.length > 0) {
        setStep({ name: "difficulty" });
      } else {
        setStep({ name: "time_control", difficulty: null });
      }
    } else if (mode === "FRIEND") {
      if (!player) {
        openPopup();
        return;
      }
      setStep({ name: "friend_stake" });
    } else {
      setStep({ name: "random_stake" });
    }
  }

  async function startVsComputer(chosenDifficulty: Difficulty | null, chosenProfile: string = "STANDARD") {
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
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId,
        difficulty: chosenDifficulty ?? "MEDIUM",
        timeProfile: chosenProfile,
        ...(gameId === "dominoes" ? { variant: dominoesVariant } : {}),
        ...(gameId === "ludo" ? { mode: ludoPlayerCount === 4 ? "standard-4p" : "standard" } : {}),
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

            <div className={styles.gameBadge}>
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
                step.name === "difficulty" || step.name === "friend_stake" || step.name === "random_stake"
                  ? styles.stepItemActive
                  : step.name === "time_control" || step.name === "friend" || step.name === "matchmaking"
                  ? styles.stepItemCompleted
                  : ""
              }`}
            >
              2. {step.name === "difficulty" || step.name === "time_control"
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

        {/* Dominoes Variant Selector Banner */}
        {gameId === "dominoes" && (
          <div className={styles.variantBanner}>
            <div className={styles.variantInfo}>
              <span className={styles.variantIcon}>🀄</span>
              <div>
                <div className={styles.variantHeading}>
                  {t("play.dominoes.variant_heading")}
                </div>
                <div className={styles.variantDesc}>
                  {dominoesVariant === "TRADITIONAL"
                    ? t("play.dominoes.desc_traditional")
                    : t("play.dominoes.desc_american")}
                </div>
              </div>
            </div>
            <div className={styles.variantTabs}>
              <button
                type="button"
                className={dominoesVariant === "TRADITIONAL" ? styles.variantTabActive : styles.variantTab}
                onClick={() => setDominoesVariant("TRADITIONAL")}
              >
                {t("play.dominoes.traditional")}
              </button>
              <button
                type="button"
                className={dominoesVariant === "AMERICAN" ? styles.variantTabActive : styles.variantTab}
                onClick={() => setDominoesVariant("AMERICAN")}
              >
                {t("play.dominoes.american")}
              </button>
            </div>
          </div>
        )}

        {/* Ludo Player Count Selector Banner */}
        {gameId === "ludo" && (
          <div className={styles.variantBanner}>
            <div className={styles.variantInfo}>
              <span className={styles.variantIcon}>🎲</span>
              <div>
                <div className={styles.variantHeading}>
                  {t("play.ludo.variant_heading") || "Players"}
                </div>
                <div className={styles.variantDesc}>
                  {ludoPlayerCount === 2
                    ? (t("play.ludo.desc_2p") || "Classic 1vs1 Duel")
                    : (t("play.ludo.desc_4p") || "4-Player Free-For-All")}
                </div>
              </div>
            </div>
            <div className={styles.variantTabs}>
              <button
                type="button"
                className={ludoPlayerCount === 2 ? styles.variantTabActive : styles.variantTab}
                onClick={() => setLudoPlayerCount(2)}
              >
                1vs1
              </button>
              <button
                type="button"
                className={ludoPlayerCount === 4 ? styles.variantTabActive : styles.variantTab}
                onClick={() => setLudoPlayerCount(4)}
              >
                4 Players
              </button>
            </div>
          </div>
        )}

        {step.name === "mode" && (
          <>
            <div className={styles.heroBanner}>
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
                <h1 className={styles.heroTitle}>{gameName}</h1>
                <p className={styles.heroSubtitle}>
                  {spec?.subtitle ? (isRtl ? spec.subtitle.ar : spec.subtitle.en) : t("play.hero_subtitle")}
                </p>

                {spec && (
                  <>
                    <div className={styles.heroChips}>
                      <span className={styles.heroChip}>
                        {isRtl ? spec.timingBadge.ar : spec.timingBadge.en}
                      </span>
                      <span className={styles.heroChip}>
                        {isRtl ? spec.natureBadge.ar : spec.natureBadge.en}
                      </span>
                      <span className={styles.heroChip}>
                        {isRtl ? spec.dopamineBadge.ar : spec.dopamineBadge.en}
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
                          {isRtl ? "القوانين الرسمية المعتمدة عالمياً" : "Official International Rules & Specs"}
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
                                  {isRtl ? rule.titleAr : rule.titleEn}
                                </span>
                              </div>
                              <p className={styles.ruleDesc}>
                                {isRtl ? rule.descAr : rule.descEn}
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
                  // Easy mode: Open/unlimited time, instant guest start!
                  void startVsComputer("EASY", "UNLIMITED");
                } else if (d === "EXPERT") {
                  // Expert mode: Mandatory official strict rules (1m per move anti-cheat)
                  void startVsComputer("EXPERT", "PER_MOVE_60S");
                } else {
                  setStep({ name: "time_control", difficulty: d });
                }
              } else {
                // All other games use their authentic intrinsic timing model:
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
          <FriendChallenge gameId={gameId} stake={step.stake} />
        )}

        {step.name === "matchmaking" && (
          <MatchmakingFlow 
            gameId={gameId} 
            stake={step.stake} 
            {...(gameId === "ludo" ? { mode: ludoPlayerCount === 4 ? "standard-4p" : "standard" } : {})}
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

