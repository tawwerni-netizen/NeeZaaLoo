/**
 * Nizalo Authoritative Ruleset Registry
 *
 * Single source of truth across both backend execution and frontend presentation.
 * Every game and variant registers its authoritative rules document here.
 * Fully localized with authoritative Arabic (Ar) and English (En) text.
 * Marketing copy is strictly derived from this document to guarantee:
 * marketing description === actual engine rules.
 */

export const RulesetRegistry = {
  // 1. CHESS
  chess: {
    game: "chess",
    defaultVariant: "standard",
    variants: {
      standard: {
        variant: "standard",
        name: "Standard FIDE",
        nameAr: "شطرنج كلاسيكي معتمد (FIDE)",
        version: "FIDE-2023",
        source: "FIDE (Fédération Internationale des Échecs) Laws of Chess",
        sourceAr: "قوانين الشطرنج الرسمية الصادرة عن الاتحاد الدولي للشطرنج (FIDE)",
        effectiveDate: "2023-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "Standard 32 pieces, White on ranks 1-2, Black on ranks 7-8",
          setupDescriptionAr: "الرقعة الكلاسيكية 8x8، القطع البيضاء في الصفين 1-2، والقطع السوداء في الصفين 7-8 (32 قطعة إجمالاً).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_3_2", "blitz_5_3", "rapid_10_0", "classical_15_10"],
        },
        rulesDocument: {
          overview: "FIDE standard chess played on an 8x8 board. The objective is to checkmate the opponent's king.",
          overviewAr: "شطرنج كلاسيكي معتمد وفق القوانين الرسمية للاتحاد الدولي للشطرنج (FIDE) على رقعة 8x8. الهدف الأسمى هو محاصرة ملك الخصم وإعلانه (كش مات).",
          setup: "16 White pieces and 16 Black pieces arranged according to standard international FIDE initial setup.",
          setupAr: "32 قطعة (16 قطعة بيضاء في الصفين 1-2، و16 قطعة سوداء في الصفين 7-8) موزعة حسب الترتيب الدولي المعتمد.",
          legalMoves: "Pawns advance forward, capture diagonally, option of initial double-step; Knights move in L-shape; Bishops diagonally; Rooks horizontally/vertically; Queen combines Rook and Bishop; King moves 1 square in any direction. Special moves include Castling (kingside/queenside, valid only if king and rook have not moved, squares between are clear, and king does not move through or into check), En Passant (capturing an enemy pawn that just made a double-step), and Promotion (pawn reaching 8th rank must promote to Queen, Rook, Bishop, or Knight).",
          legalMovesAr: "البيادق تتقدم خطوة للأمام وتأكل قطرياً (مع إمكانية التقدم خطوتين في النقلة الأولى)؛ الفرسان تتحرك على شكل حرف L وتتخطى القطع؛ الفيلة تتحرك قطرياً؛ القلاع أفقياً ورأسياً؛ الوزير يجمع حركة القلعة والفيل؛ الملك يتحرك خطوة واحدة في أي اتجاه. تتضمن الحركات الخاصة: التبييت (قصير أو طويل بشرط عدم تحرك الملك أو القلعة مسبقاً وخلو المربعات وعدم التعرض لكش)، الأكل بالمرور (En Passant)، وترقية البيدق فور وصوله للصف الثامن إلى وزير أو قلعة أو فيل أو حصان.",
          winConditions: [
            "Checkmate (opponent king is under attack and has no legal move to escape)",
            "Resignation",
            "Opponent timeout on clock (provided player has mating material)"
          ],
          winConditionsAr: [
            "كش مات (مهاجمة ملك الخصم مع انعدام أي حركة قانونية للهروب)",
            "استسلام الخصم",
            "سقوط راية الخصم (نفاد وقته على الساعة مع امتلاك اللاعب عتاداً كافياً للإماتة)"
          ],
          drawConditions: [
            "Stalemate (player has no legal moves and king is not in check)",
            "Threefold repetition (exact same board position, turn, castling, and en passant rights repeated 3 times)",
            "50-move rule (50 consecutive moves by each side with no pawn advance and no piece capture)",
            "Insufficient material (King vs King, King + Bishop vs King, King + Knight vs King, King + Bishop vs King + Bishop on same-colored squares)",
            "Mutual draw agreement",
          ],
          drawConditionsAr: [
            "الكش المخنوق / التعادل الإجباري (Stalemate - انعدام أي حركة قانونية للمنافس مع عدم وجود كش على ملكه)",
            "تكرار الوضعية 3 مرات (نفس وضعية اللوح والأدوار وحقوق التبييت والأكل بالمرور)",
            "قاعدة الـ 50 نقلة (مرور 50 نقلة متتالية لكل طرف دون تحريك أي بيدق ودون أكل أي قطعة)",
            "عدم كفاية العتاد للإماتة (ملك ضد ملك، أو ملك وفيل ضد ملك، أو ملك وحصان ضد ملك، أو ملك وفيل ضد ملك وفيل على نفس لون المربعات)",
            "اتفاق الطرفين على التعادل"
          ],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero random number generation or luck mechanics.",
          rngDescriptionAr: "مهارة ذهنية حتمية 100%. بدون أي توليد أرقام عشوائية أو تدخل للحظ.",
          fairPlay: "Moves validated strictly server-side. Zero external engine assistance permitted.",
          fairPlayAr: "تدقيق جميع الحركات على الخادم بصرامة تامة. حظر تام لمحركات ومساعدات الذكاء الاصطناعي."
        },
      },
      blitz: {
        variant: "blitz",
        name: "FIDE Blitz (3m + 2s)",
        nameAr: "شطرنج خاطف 3+2 (FIDE Blitz)",
        version: "FIDE-2023-BLITZ",
        source: "FIDE Handbook Appendix B: Blitz Rules",
        sourceAr: "الملحق B من دليل الاتحاد الدولي للشطرنج (FIDE) لقواعد الشطرنج الخاطف",
        effectiveDate: "2023-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "Standard 32 pieces, White on ranks 1-2, Black on ranks 7-8",
          setupDescriptionAr: "لوح 8x8 قياسي مع التوزيع الدولي الكامل لـ 32 قطعة.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_3_2",
          allowedProfiles: ["blitz_3_2", "blitz_5_0"],
        },
        rulesDocument: {
          overview: "Fast-paced FIDE Blitz chess rules where speed and tactical intuition are paramount.",
          overviewAr: "شطرنج خاطف (بليتز) بقوانين FIDE الصارمة، حيث السرعة والبديهة التكتيكية تصنعان الفارق تحت ضغط الوقت.",
          setup: "Standard FIDE board and piece configuration.",
          setupAr: "التوزيع الكلاسيكي لقطع الشطرنج الدولية على لوح 8x8.",
          legalMoves: "Standard FIDE move rules apply. Strict clock management.",
          legalMovesAr: "تنطبق كافة قواعد شطرنج FIDE الكلاسيكي مع انضباط شديد لزمن الساعة.",
          winConditions: ["Checkmate", "Resignation", "Timeout with sufficient mating material"],
          winConditionsAr: ["كش مات", "استسلام الخصم", "نفاد وقت المنافس مع وجود عتاد إماتة كافٍ"],
          drawConditions: ["Stalemate", "Threefold repetition", "50-move rule", "Insufficient material", "Mutual draw agreement"],
          drawConditionsAr: ["الكش المخنوق", "تكرار الوضعية 3 مرات", "قاعدة 50 نقلة", "عدم كفاية العتاد", "اتفاق الطرفين"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill.",
          rngDescriptionAr: "مهارة ذهنية خالصة 100% بدون أي حظ.",
          fairPlay: "Strict move latency monitoring and behavioral anti-cheat.",
          fairPlayAr: "مراقبة دقيقة لزمن استجابة النقلات ونظام حماية سلوكي ضد الغش."
        },
      },
    },
  },

  // 2. DOMINOES
  dominoes: {
    game: "dominoes",
    defaultVariant: "traditional_block",
    variants: {
      traditional_block: {
        variant: "traditional_block",
        name: "Traditional Block Dominoes",
        nameAr: "دومينو السحب التقليدي (بلوك)",
        version: "NIZALO-DOMINOES-BLOCK-v1",
        source: "International Domino Federation (FID) Block Standard",
        sourceAr: "المعايير الرسمية للاتحاد الدولي للدومينو (FID) لدومينو البلوك",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "open-chain",
          setupDescription: "Double-six set of 28 tiles. 7 tiles dealt to each player in 2p duel; 14 tiles out of play.",
          setupDescriptionAr: "مجموعة دبل ستة من 28 حجراً. 7 حجارة لكل لاعب في المبارزة الثنائية، و14 حجراً خارج اللعب.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "Classic two-player double-six block dominoes. No drawing from boneyard; tiles must match open ends.",
          overviewAr: "دومينو السحب التقليدي لشخصين بمجموعة الدبل ستة (28 قطعة). بدون سحب إضافي، وتوصيل الحجارة وفق أرقام الأطراف المفتوحة.",
          setup: "28 bones (0-0 to 6-6). Each player is dealt 7 tiles. The remaining 14 tiles remain undealt and out of play.",
          setupAr: "مجموعة الدبل ستة (من 0-0 حتى 6-6) بإجمالي 28 حجراً. يحصل كل لاعب على 7 حجارة، وتبقى الـ 14 حجراً الأخرى خارج اللعب.",
          legalMoves: "Opening player is determined by the highest double in hand (6-6 leads, or 5-5, etc.). If no player holds a double, the heaviest single tile leads. Subsequent moves must match the exposed pip count on either open end of the board chain.",
          legalMovesAr: "يبدأ اللاعب صاحب أعلى دبل (6-6، أو 5-5، إلخ)، وإذا لم يمتلك أي لاعب دبل يبدأ الحجر الأثقل. تُلعب النقلات التالية بمطابقة عدد نقاط أحد طرفي السلسلة المفتوحة على اللوح.",
          passRule: "If a player has no tile in hand that matches either open end, they MUST pass. Passing when a legal move is in hand is illegal and rejected by the engine.",
          passRuleAr: "إذا لم يمتلك اللاعب أي حجر يطابق أطراف اللوح المفتوحة، يجب عليه التمرير (باص) إجبارياً. التمرير مع وجود حجر صالح مرفوض ويمنعه المحرك تلقائياً.",
          winConditions: [
            "Domino Out: First player to empty their hand of tiles wins immediately, scoring the sum of all pips in the opponent's hand.",
            "Blocked Game: When both players pass consecutively and no further move is possible, the player with the LOWER total pip count in hand wins, scoring the difference between the two hands.",
          ],
          winConditionsAr: [
            "قفل الدومينو وإنهاء اليد: أول لاعب ينهي جميع أحجاره يفوز فوراً ويحصل على مجموع نقاط الأحجار المتبقية في يد الخصم.",
            "إغلاق اللعب (القفلة): عند تمرير كلا اللاعبين وتوقف إمكانية اللعب، يفوز اللاعب صاحب مجموع النقاط الأقل، محققاً فارق النقاط بين اليدين."
          ],
          drawConditions: ["Blocked game where both players hold an exactly equal total pip count."],
          drawConditionsAr: ["إغلاق اللعب مع تعادل مجموع نقاط أحجار كلا اللاعبين بدقة."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "The initial tile shuffle and deal is generated from a cryptographically secure server seed with verifiable hash commitment.",
          rngDescriptionAr: "خلط وتوزيع الأحجار يتم عبر بذور عشوائية مشفرة CSPRNG على الخادم قابلة للتدقيق والتحقق.",
          fairPlay: "All tile matching and pip calculations evaluated authoritatively server-side.",
          fairPlayAr: "مطابقة الحجارة واحتساب النقاط يتم بالكامل على الخادم دون أي تلاعب محلي."
        },
      },
      all_fives: {
        variant: "all_fives",
        name: "American All-Fives (Muggins)",
        nameAr: "دومينو أمريكي (أول فايفز)",
        version: "NIZALO-DOMINOES-ALL-FIVES-v1",
        source: "World Domino Championship All-Fives / Muggins Rules",
        sourceAr: "قواعد بطولة العالم للدومينو لنظام الخمسات (Muggins)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "open-chain-spinner",
          setupDescription: "Double-six set of 28 tiles. 7 tiles dealt; remaining 14 form the boneyard.",
          setupDescriptionAr: "مجموعة دبل ستة من 28 حجراً. 7 أحجار لكل لاعب، و14 حجراً تشكل بنك السحب.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "American All-Fives dominoes where points are scored during play whenever the exposed open ends sum to a multiple of 5 (5, 10, 15, 20).",
          overviewAr: "دومينو الخمسات الأمريكية (All-Fives / Muggins) حيث تحسب النقاط أثناء اللعب كلما كان مجموع الأطراف المفتوحة مضاعفاً للرقم 5 (5، 10، 15، 20).",
          setup: "28 bones. 7 tiles dealt per player in 2-player mode. Remaining tiles constitute the boneyard.",
          setupAr: "مجموعة 28 حجراً، 7 حجارة لكل متسابق، وبقية الحجارة تشكل بنك السحب (Boneyard).",
          legalMoves: "Highest double leads. Players match open ends. If a player cannot make a legal play, they must draw from the boneyard until a playable tile is acquired or the boneyard contains 2 tiles remaining.",
          legalMovesAr: "يبدأ أعلى دبل. يطابق المتنافسون الأطراف المفتوحة. في حال عدم وجود نقلة صالحة، يسحب اللاعب من البنك حتى يجد حجراً قابلاً للعب أو يتبقى حجران في البنك.",
          scoring: "Whenever a played tile causes the exposed ends of the board to sum to a multiple of 5, the player scores that exact total immediately. On domino-out or block, the winner scores the opponent's pip total rounded to the nearest multiple of 5.",
          scoringAr: "كلما كان مجموع نهايات السلسلة مضاعفاً للـ 5، يكسب اللاعب تلك النقاط فوراً. عند إنهاء اليد أو القفلة، يكسب الفائز نقاط الخصم مقربة لأقرب مضاعف للـ 5.",
          winConditions: ["First player to reach the target score (typically 100 or 150 points) across rounds, or highest score in single match."],
          winConditionsAr: ["أول متسابق يصل إلى النقاط المستهدفة (غالباً 100 أو 150 نقطة)، أو صاحب أعلى نقاط عند نهاية الجولات."],
          drawConditions: ["Equal scores at round limit when mutually agreed."],
          drawConditionsAr: ["تساوي النقاط عند نهاية الجولات بالاتفاق المتبادل."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "Shuffle and boneyard draws are generated via auditable cryptographic seed commitment.",
          rngDescriptionAr: "خلط الأحجار والسحب مشفر بالكامل ومسجل في سجل التحقق الخادومي.",
          fairPlay: "Server automatically calculates all open end combinations, multi-branch spinner sums, and pip roundings.",
          fairPlayAr: "الخادم يحتسب نهايات السلسلة وتفرعات السبينر ومضاعفات الخمسة آلياً بدقة متناهية."
        },
      },
    },
  },

  // 3. LUDO ROYALE
  ludo: {
    game: "ludo",
    defaultVariant: "classic_1v1",
    variants: {
      classic_1v1: {
        variant: "classic_1v1",
        name: "Ludo Royale 1v1",
        nameAr: "لودو رويال مبارزة 1 ضد 1",
        version: "NIZALO-LUDO-1V1-v1",
        source: "International Ludo Federation Standard Cross Track Rules",
        sourceAr: "القواعد المعتمدة للاتحاد الدولي للودو لمضمار الصليب (Cross Track)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "cross-track",
          setupDescription: "Cross board with 52 perimeter track tiles, 8 safe squares, and 4 home columns.",
          setupDescriptionAr: "لوح الصليب الكلاسيكي بـ 52 مربعاً على المسار، 8 مربعات نجوم آمنة، و4 ممرات نهائية.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["blitz_5_0", "rapid_10_0", "rapid_15_0"],
        },
        rulesDocument: {
          overview: "Competitive 1v1 Ludo on a cross-shaped circuit with dice rolling, capturing, safe zones, and home run.",
          overviewAr: "سباق لودو رويال التنافسي 1 ضد 1 على مضمار الصليب الكلاسيكي برمي النرد، قنص الخصوم، المربعات الآمنة، والسباق نحو المثلث الأخير.",
          setup: "Each player has 4 tokens in their respective yard. Players sit at opposite ends (offset 26 tiles).",
          setupAr: "لكل لاعب 4 قواطع في قاعدته الخاصة. يجلس اللاعبان في أطراف متقابلة (بفارق 26 مربعاً على المضمار).",
          legalMoves: "A roll of 6 is required to enter a token onto the track at the starting square. Tokens move clockwise by the rolled dice count (1-6). Rolling a 6 grants a bonus consecutive turn (maximum 3 consecutive sixes before turn forfeit).",
          legalMovesAr: "يلزم الحصول على الرقم (6) لإخراج القاطعة من القاعدة إلى نقطة البداية. تتحرك القواطع باتجاه عقارب الساعة بعدد نقاط النرد (1-6). رمي الرقم 6 يمنح رمية إضافية متتالية (بحد أقصى ثلاث رميات 6 متتالية قبل إسقاط الدور).",
          capturesAndSafety: "Landing on an opposing player's token on a non-safe square captures it and sends it back to the owner's yard. Star tiles and starting tiles are safe squares where tokens cannot be captured.",
          capturesAndSafetyAr: "الهبوط على قاطعة الخصم في مربع غير آمن يقصيها ويعيدها إلى قاعدتها. مربعات النجوم ومربعات الانطلاق مربعات آمنة محصنة لا يمكن أكل القواطع فيها.",
          homeRules: "Tokens travel 51 track spaces before entering their colored 5-space home stretch. Tokens can only reach the final Home triangle with an EXACT roll.",
          homeRulesAr: "تقطع القاطعة 51 مربعاً حول المضمار قبل دخول الممر الآمن الخاص بلونها (5 مربعات). لا يمكن دخول مثلث النهاية إلا برقم نرد مطابق تماماً للمسافة المتبقية.",
          winConditions: ["First player to bring all 4 tokens into the Home triangle wins immediately."],
          winConditionsAr: ["أول متسابق يدخل قواطعه الأربعة جميعاً إلى مثلث النهاية يفوز فوراً."],
          drawConditions: ["None. A game always concludes with a decisive winner."],
          drawConditionsAr: ["لا يوجد تعادل. تنتهي اللعبة دائماً بفائز حتمي."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: Dice outcomes are generated using a cryptographically auditable PRNG seed committed at match start. Not a zero-RNG game.",
          rngDescriptionAr: "لعبة تعتمد على النرد التكتيكي: رميات النرد مولدة ببذور عشوائية خادومية مشفرة (CSPRNG) ومثبتة قبل كل رمية. نزاهة رياضية 100%.",
          fairPlay: "Dice rolls and token movement bounds are enforced 100% server-side.",
          fairPlayAr: "رمي النرد وحركة القواطع والتحقق من المربعات الآمنة محكومة بالكامل من الخادم."
        },
      },
      classic_4p: {
        variant: "classic_4p",
        name: "Ludo Royale 4-Player",
        nameAr: "لودو رويال 4 لاعبين",
        version: "NIZALO-LUDO-4P-v1",
        source: "International Ludo Federation 4-Player Championship Rules",
        sourceAr: "قواعد بطولات الاتحاد الدولي للودو للنزالات الرباعية",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "cross-track",
          setupDescription: "Full 4-quadrant cross board with Red, Green, Yellow, Blue home bases.",
          setupDescriptionAr: "لوح لودو كامل بـ 4 أرباع وقواعد حمراء، خضراء، صفراء، وزرقاء.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_15_0",
          allowedProfiles: ["rapid_15_0", "rapid_20_0"],
        },
        rulesDocument: {
          overview: "4-player free-for-all Ludo. 4 tokens each, standard turn rotation clockwise.",
          overviewAr: "نزال لودو الرباعي المفتوح لـ 4 لاعبين. 4 رموز لكل لاعب، ودوران الأدوار في اتجاه عقارب الساعة مع قنص متعدد.",
          setup: "4 players in seats 0, 1, 2, 3 with starting squares at relative offsets 0, 13, 26, 39.",
          setupAr: "4 لاعبين في المقاعد 0، 1، 2، 3 بنقاط انطلاق موزعة بالتساوي (فوارق 13 مربعاً).",
          legalMoves: "Same move, capture, safe squares, and exact finish rules as 1v1.",
          legalMovesAr: "نفس قواعد الحركة، الأكل، المربعات الآمنة، والدخول الدقيق للمثلث النهائي المطبقة في الـ 1v1.",
          winConditions: ["First player to bear all 4 tokens home wins 1st place. Subsequent placements ranked by finish order."],
          winConditionsAr: ["أول متسابق يوصل قواطعه الأربعة للنهاية يفوز بالمركز الأول، وترتب بقية المراكز حسب تسلسل الوصول."],
          drawConditions: ["None."],
          drawConditionsAr: ["لا يوجد تعادل."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: Verifiable PRNG dice seed.",
          rngDescriptionAr: "نرد خادومي مشفر ومؤمن بالكامل.",
          fairPlay: "Multiplayer turn timers, disconnect grace period, and strict anti-collusion monitoring.",
          fairPlayAr: "مراقبة صارمة لزمن الأدوار ونظام مكافحة التواطؤ بين المتنافسين."
        },
      },
    },
  },

  // 4. BACKGAMMON
  backgammon: {
    game: "backgammon",
    defaultVariant: "standard_tavla",
    variants: {
      standard_tavla: {
        variant: "standard_tavla",
        name: "Classic Backgammon (Tavla)",
        nameAr: "طاولة الزهر الكلاسيكية (WBF)",
        version: "NIZALO-BACKGAMMON-TAVLA-v1",
        source: "World Backgammon Federation (WBF) Tournament Rules",
        sourceAr: "قواعد بطولات الاتحاد العالمي للباكجامون (WBF)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "points-24",
          setupDescription: "24 triangular points. 15 checkers per side (2 on 24, 5 on 13, 3 on 8, 5 on 6 mirrored).",
          setupDescriptionAr: "لوح من 24 نقطة مثلثة، 15 قشاطاً لكل لاعب (2 على النقطة 24، 5 على 13، 3 على 8، 5 على 6).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_10_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0", "classical_15_0"],
        },
        rulesDocument: {
          overview: "WBF tournament standard backgammon. Roll dice, advance checkers, hit opposing blots, and bear off.",
          overviewAr: "طاولة الزهر العالمية المعتمدة من الاتحاد العالمي (WBF). رمي النرد، تحريك القواشيط، ضرب الحصى المنفردة، وسباق الخروج.",
          setup: "15 checkers per player positioned on the 24-point board in standard layout. Seat 0 moves counter-clockwise (24->1); Seat 1 moves clockwise (1->24).",
          setupAr: "15 قشاطاً لكل متنافس موزعة على نقاط اللوح الـ 24 وفق التوزيع الدولي. المقعد 0 يتحرك عكس عقارب الساعة (24 إلى 1)، والمقعد 1 مع عقارب الساعة (1 إلى 24).",
          legalMoves: "A turn consists of 2 dice rolls (or 4 identical moves if doubles are rolled). Checkers on the bar MUST enter into the opponent's home board before any other checker may move. Landing on a single opposing checker ('blot') hits it to the bar. Points with 2 or more enemy checkers are blocked.",
          legalMovesAr: "يتكون الدور من رمي حجري نرد (أو 4 نقلات متطابقة عند رمي الدوبل). القواشيط المعلقة على البار (الحاجز) يجب أن تدخل بيت الخصم أولاً قبل تحريك أي قشاط آخر. الهبوط على قشاط منفرد للخصم (Blot) يضربه إلى البار. الأبواب التي بها قشاطان أو أكثر للخصم مغلقة ومحمية.",
          forcedMoveLogic: "Players must play both numbers of a roll if possible (or all four of a double). If only one number can be played, the larger number must be played.",
          forcedMoveLogicAr: "يجب على اللاعب لعب كلا رقمي النرد إذا كان ذلك متاحاً (أو الحركات الأربع للدوبل). إذا أمكن لعب رقم واحد فقط، يجب لعب الرقم الأكبر وجوباً.",
          bearingOff: "Once all 15 checkers are inside the player's home board, they may be borne off. A checker can be borne off if the die roll exactly matches its distance to the edge, or with an overage die if no checkers remain on higher points.",
          bearingOffAr: "عندما تتجمع قواشيط اللاعب الـ 15 كاملة داخل بيته الأخير، يحق له البدء بإخراجها من اللوح. يخرج القشاط برقم نرد يطابق بعده عن الحافة تماماً، أو برقم أكبر إذا لم تتبق قواشيط في نقاط أعلى.",
          winConditions: [
            "Single Win: First player to bear off all 15 checkers (1x stake).",
            "Gammon: Winner bears off all 15 checkers before opponent bears off any checker (2x stake).",
            "Backgammon: Winner bears off all checkers while loser has borne off none and still has a checker on the bar or in the winner's home board (3x stake).",
          ],
          winConditionsAr: [
            "الفوز العادي: أول لاعب يخرج جميع قواشيطه الـ 15 (مضاعف 1x من الجائزة).",
            "المارس (Gammon): الفوز وإخراج جميع القواشيط قبل أن يخرج الخصم أي قشاط على الإطلاق (مضاعف 2x).",
            "الباكجامون (Backgammon): الفوز والخصم لم يخرج أي قشاط ولديه قشاط على البار أو داخل بيت الفائز (مضاعف 3x)."
          ],
          drawConditions: ["None. Backgammon is mathematically decisive."],
          drawConditionsAr: ["لا يوجد تعادل في طاولة الزهر."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "RNG-BASED GAME: All dice pairs are rolled authoritatively server-side via cryptographic seeds. Auditable dice roll history.",
          rngDescriptionAr: "لعبة تعتمد على نرد تكتيكي: النرد يرمى مشفراً على الخادم ببذور CSPRNG مع سجل رميات غير قابل للتعديل.",
          fairPlay: "Forced move logic and legal bearing off are computed and validated exclusively on the server.",
          fairPlayAr: "قواعد الإجبار وأهلية الخروج محتسبة ومحققة حصرياً على الخادم."
        },
      },
    },
  },

  // 5. SPEED MATH
  speed_math: {
    game: "speed_math",
    defaultVariant: "arithmetic_race",
    variants: {
      arithmetic_race: {
        variant: "arithmetic_race",
        name: "Arithmetic Sprint (60s)",
        nameAr: "سباق الرياضيات السريعة (60 ثانية)",
        version: "NIZALO-SPEED-MATH-v1",
        source: "Nizalo Pure Mental Calculation Standard",
        sourceAr: "معيار نيزالو للحساب الذهني التنافسي فائق السرعة",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "equation-panel",
          setupDescription: "Shared 60-second simultaneous race. Synchronized problem sequence generated from seed.",
          setupDescriptionAr: "لوحة حسابية رقمية مشتركة بسباق 60 ثانية متزامن ومتطابق الأسئلة.",
        },
        turnModel: "SIMULTANEOUS",
        timeControls: {
          defaultProfile: "shared_60s",
          allowedProfiles: ["shared_30s", "shared_60s", "shared_90s"],
        },
        rulesDocument: {
          overview: "Simultaneous 1v1 mental arithmetic race. Both players receive the exact same problems at the exact same instant.",
          overviewAr: "سباق الحساب الذهني الخاطف 1 ضد 1. يتلقى المتسابقان نفس المسائل الحسابية في نفس اللحظة تحت عداد متزامن مشترك.",
          setup: "Synchronized match countdown with a shared 60-second timer. Identical problem stack generated deterministically from the match seed.",
          setupAr: "عداد زمني موحد وتنازلي مدته 60 ثانية لكلا اللاعبين. حزمة مسائل حسابية متطابقة تولد حتمياً من بذرة النزال.",
          legalMoves: "Players submit numerical answers via numeric keypad or keyboard. Server checks correctness instantaneously.",
          legalMovesAr: "يقوم اللاعب بإدخال الإجابة العددية عبر لوحة الأرقام أو الكيبورد. يتحقق الخادم من صحة الحل في أجزاء من الألف من الثانية.",
          scoring: "Each correct answer awards 100 base points plus time speed bonuses. Streak multipliers: 3 correct in a row awards 1.2x multiplier; 5+ in a row awards 1.5x multiplier. Incorrect answers reset streaks and deduct 50 points.",
          scoringAr: "تمنح الإجابة الصحيحة 100 نقطة أساسية بالإضافة لمكافأة سرعة. مضاعف الكومبو: 3 إجابات صحيحة متتالية تمنح مضاعف x1.2، و5 فأكثر تمنح x1.5. الإجابة الخاطئة تصفر الكومبو وتخصم 50 نقطة.",
          winConditions: ["Player with the highest total score at the expiration of the 60-second clock wins."],
          winConditionsAr: ["اللاعب صاحب أعلى مجموع نقاط عند نفاد العداد الزمني (60 ثانية) يفوز بالنزال."],
          drawConditions: ["Equal scores at clock expiry. Tie-break resolved by lowest average response time among correct submissions."],
          drawConditionsAr: ["تساوي النقاط عند الصفر الزمني. في حال التعادل يحسم الفوز لأقل متوسط زمن إجابة للمسائل الصحيحة."],
          rngPolicy: "SERVER_SEEDED",
          rngDescription: "Problem sequence generated from match seed; 100% identical for both contenders.",
          rngDescriptionAr: "المسائل تولد من بذرة النزال الرقمية، متطابقة تماماً لكلا المتنافسين.",
          fairPlay: "Anti-bot telemetry enforces millisecond-level input timing; submissions faster than human sensory threshold (< 120ms) are flagged and rejected.",
          fairPlayAr: "قياس دقيق لزمن الإدخال بالميلي ثانية، واستبعاد تلقائي لأي إدخال يقل عن العتبة الحسية البشرية الطبيعية (< 120ms)."
        },
      },
    },
  },

  // 6. XO (TIC-TAC-TOE)
  xo: {
    game: "xo",
    defaultVariant: "standard_3x3",
    variants: {
      standard_3x3: {
        variant: "standard_3x3",
        name: "Classic Tic-Tac-Toe (3x3)",
        nameAr: "إكس أو الكلاسيكية (3x3)",
        version: "NIZALO-XO-STANDARD-v1",
        source: "Standard International Combinatorial Game Theory Specification",
        sourceAr: "المواصفة الدولية لنظرية الألعاب التوافقية الكلاسيكية",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: false, // Solved game policy: Free to play only
        tournamentEligible: false,
        boardDefinition: {
          type: "grid-3x3",
          dimensions: [3, 3],
          setupDescription: "9 empty squares on a 3x3 grid. Player 1 is X, Player 2 is O.",
          setupDescriptionAr: "9 مربعات فارغة على شبكة 3x3.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_1_0",
          allowedProfiles: ["bullet_30s", "blitz_1_0"],
        },
        rulesDocument: {
          overview: "Standard 3x3 Tic-Tac-Toe. Perfect play under standard rules leads to a draw. Reserved for free training.",
          overviewAr: "إكس أو الكلاسيكية (3x3). اللعب المثالي يقود للتعادل، وهي مخصصة للتدريب والتحديات السريعة.",
          setup: "Empty 3x3 grid. Seat 0 plays X and moves first. Seat 1 plays O.",
          setupAr: "شبكة فارغة 3x3. المقعد 0 يبدأ بالعلامة X، والمقعد 1 بالعلامة O.",
          legalMoves: "A player places their mark on any unoccupied cell (0 to 8).",
          legalMovesAr: "يضع كل متنافس علامته في أي مربع شاغر من المربعات التسعة.",
          winConditions: ["Three of the player's marks in a horizontal, vertical, or diagonal line."],
          winConditionsAr: ["تشكيل خط مستقيم من 3 علامات أفقياً، رأسياً، أو قطرياً."],
          drawConditions: ["All 9 cells filled without either player achieving 3 in a line (Cat's Game)."],
          drawConditionsAr: ["امتلاء المربعات التسعة دون تشكيل أي خط ثلاثي مكتمل."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic zero luck. Solved game.",
          rngDescriptionAr: "حتمية 100% بدون أي عنصر حظ.",
          fairPlay: "Exhaustive state space validation (765 essentially unique positions) prevents any illegal states.",
          fairPlayAr: "التحقق الشامل من فضاء الحالات (765 حالة فريدة) لمنع أي وضعيات غير قانونية."
        },
      },
    },
  },

  // 7. CONNECT FOUR
  connect_four: {
    game: "connect_four",
    defaultVariant: "standard_7x6",
    variants: {
      standard_7x6: {
        variant: "standard_7x6",
        name: "Standard Connect Four (7x6)",
        nameAr: "أربعة على التوالي (7x6)",
        version: "NIZALO-CONNECT-FOUR-v1",
        source: "Milton Bradley / Hasbro Official Tournament Specification",
        sourceAr: "مواصفة البطولات الرسمية للعبة فور-إن-أ-رو الرأسية",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: false, // Solved game policy: Free to play only
        tournamentEligible: false,
        boardDefinition: {
          type: "grid-7x6-gravity",
          dimensions: [7, 6],
          setupDescription: "Vertical grid of 7 columns and 6 rows.",
          setupDescriptionAr: "شبكة رأسية من 7 أعمدة و6 صفوف (42 خانة).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "blitz_3_0",
          allowedProfiles: ["blitz_1_0", "blitz_3_0", "rapid_5_0"],
        },
        rulesDocument: {
          overview: "Official standard 7x6 vertical Connect Four. Drop colored discs into columns under gravity to connect 4 in a line.",
          overviewAr: "أربعة على التوالي (7x6) الرأسية الكلاسيكية. إسقاط الأقراص الملونة في الأعمدة بالجاذبية للربط الرباعي.",
          setup: "7 columns, 6 rows. Red moves first (Seat 0), Yellow second (Seat 1).",
          setupAr: "لوح رأسي بـ 7 أعمدة و6 صفوف. الأحمر يبدأ (المقعد 0)، والأصفر ثانياً (المقعد 1).",
          legalMoves: "Discs are dropped into any of the 7 columns that has not yet reached its maximum capacity of 6 discs. The disc falls by gravity to the lowest unoccupied slot in that column.",
          legalMovesAr: "تسقط الأقراص في أي عمود لم يستنفد طاقته الاستيعابية (6 أقراص)، ويهبط القرص بالجاذبية لأدنى خانة شاغرة.",
          winConditions: ["First player to form a continuous line of 4 discs horizontally, vertically, or diagonally wins immediately."],
          winConditionsAr: ["أول متسابق يربط 4 أقراص متصلة من لونه في خط أفقي أو رأسي أو قطري يفوز فوراً."],
          drawConditions: ["All 42 slots filled without a 4-in-a-row combination."],
          drawConditionsAr: ["امتلاء جميع خانات اللوح الـ 42 دون تحقيق أي خط رباعي متصل."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic combinatorial game. Zero luck.",
          rngDescriptionAr: "لعبة مهارية استراتيجية حتمية 100% بدون حظ.",
          fairPlay: "Column bounds and gravity mechanics are computed authoritatively on the server.",
          fairPlayAr: "حساب الجاذبية وحدود الأعمدة يتم بدقة تامة على الخادم."
        },
      },
    },
  },

  // 8. CHECKERS
  checkers: {
    game: "checkers",
    defaultVariant: "american_standard",
    variants: {
      american_standard: {
        variant: "american_standard",
        name: "American Checkers / English Draughts",
        nameAr: "الداما الأمريكية / الإنجليزية (8x8)",
        version: "WCDF-AMERICAN-v1",
        source: "World Checkers / Draughts Federation (WCDF) Rules",
        sourceAr: "قواعد الاتحاد العالمي للداما / الشيكرز (WCDF)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8-dark-cells",
          dimensions: [8, 8],
          setupDescription: "8x8 checkerboard. 12 pieces per side positioned on dark squares in ranks 1-3 and 6-8.",
          setupDescriptionAr: "لوح داما 8x8، 12 قطعة لكل متسابق على المربعات الداكنة في الصفوف 1-3 و 6-8.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["blitz_3_2", "rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "WCDF American Checkers / English Draughts. Mandatory jump captures, multi-jumping, and king crowning.",
          overviewAr: "الداما الأمريكية / الإنجليزية المعتمدة من الاتحاد العالمي (WCDF). أكل إجباري بالقفز، قفز متعدد متتابع، وتتويج الملوك.",
          setup: "Played on the 32 dark squares of an 8x8 board. Dark pieces (Seat 0) move first, Light pieces (Seat 1) move second.",
          setupAr: "32 مربعاً داكناً على لوح 8x8. 12 قطعة لكل متنافس في الصفوف 1-3 والصفوف 6-8.",
          legalMoves: "Uncrowned pieces move diagonally forward 1 step to an adjacent unoccupied dark square. When an opponent piece is diagonally adjacent and the square immediately beyond is vacant, jumping is MANDATORY. If multiple jumps are available, the player may choose which jump sequence to initiate, but MUST complete all consecutive jumps in that chain. Reaching the opponent's back rank crowns a piece as a King, ending that turn. Kings can move and jump both forwards and backwards.",
          legalMovesAr: "القطع العادية تتحرك قطرياً للأمام خطوة واحدة لمربع داكن شاغر. عندما تتجاور قطعة الخصم قطرياً والمربع الذي يليها شاغر، يكون الأكل بالقفز إجبارياً (Mandatory Jump). في حال تعدد خيارات القفز، يختار اللاعب السلسلة التي يريدها ولكن يجب إكمال جميع القفزات المتاحة فيها. وصول القطعة للصف الأخير للخصم يتوجها ملكاً، والملوك تملك حرية الحركة والقفز للأمام والخلف.",
          winConditions: ["Capture all opponent pieces", "Leave opponent with zero legal moves", "Resignation", "Opponent clock timeout"],
          winConditionsAr: ["أكل جميع قطع الخصم", "حصار الخصم وتجريده من أي حركة قانونية", "استسلام الخصم", "نفاد وقت ساعة المنافس"],
          drawConditions: ["40 consecutive moves by each side with no capture and no king promotion", "Threefold position repetition", "Mutual draw agreement"],
          drawConditionsAr: ["40 نقلة متتالية لكل جانب دون أكل ودون ترقية ملك", "تكرار الوضعية 3 مرات", "اتفاق الطرفين على التعادل"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          rngDescriptionAr: "مهارة تكتيكية حتمية 100% بدون حظ.",
          fairPlay: "Mandatory capture enforcement is validated strictly server-side.",
          fairPlayAr: "إلزامية الأكل بالقفز محكومة بدقة وصارمة على الخادم."
        },
      },
    },
  },

  // 9. REVERSI / OTHELLO
  reversi: {
    game: "reversi",
    defaultVariant: "standard_othello",
    variants: {
      standard_othello: {
        variant: "standard_othello",
        name: "World Othello Federation Standard (8x8)",
        nameAr: "ريفيرسي / أوثيلو الدولية (8x8)",
        version: "WOF-OTHELLO-v1",
        source: "World Othello Federation (WOF) Official Tournament Rules",
        sourceAr: "قواعد البطولات الرسمية للاتحاد العالمي للأوثيلو (WOF)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-8x8",
          dimensions: [8, 8],
          setupDescription: "8x8 board with center 4 squares occupied: d4=White, e4=Black, d5=Black, e5=White.",
          setupDescriptionAr: "لوح 8x8، مع 4 أقراص مركزية متقاطعة (d4=أبيض، e4=أسود، d5=أسود، e5=أبيض).",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "WOF official Reversi/Othello. Trap and outflank opponent discs between your own to flip them.",
          overviewAr: "ريفيرسي / أوثيلو الدولية المعتمدة من الاتحاد العالمي (WOF). تطويق أقراص الخصم بين قرصين من لونك لقلبها شلالياً.",
          setup: "8x8 board. Black (Seat 0) moves first. White (Seat 1) moves second.",
          setupAr: "لوح 8x8 يبدأ بـ 4 أقراص في المنتصف متعاكسة الألوان. الأسود (المقعد 0) يبدأ أولاً، والأبيض ثانياً.",
          legalMoves: "A legal move consists of placing a disc on an empty square such that at least one continuous line of opponent discs (in any orthogonal or diagonal direction) is trapped between the newly placed disc and another disc of the moving player's color. All trapped discs are flipped.",
          legalMovesAr: "توضع الأقراص على المربعات الفارغة بشرط تطويق قرص أو أكثر للخصم بين القرص الجديد وقرص موجود مسبقاً على نفس الخط (أفقياً أو رأسياً أو قطرياً). جميع الأقراص المحصورة تنقلب إلى لون اللاعب.",
          forcedPass: "If a player has no legal move available, they MUST pass their turn. If neither player can make a legal move (or board is full), the game ends immediately.",
          forcedPassAr: "إذا لم يمتلك اللاعب أي نقلة تطويق قانونية، يجب عليه التمرير (Pass) إجبارياً. إذا عجز كلا اللاعبين عن الحركة أو امتلأ اللوح، تنتهي المباراة فوراً.",
          winConditions: ["Player with the greater number of discs of their color on the board at game end wins."],
          winConditionsAr: ["اللاعب صاحب أكبر عدد من الأقراص من لونه على اللوح عند نهاية المباراة."],
          drawConditions: ["Exact tie in disc counts at game end (e.g. 32-32)."],
          drawConditionsAr: ["تساوي عدد أقراص الطرفين بالضبط عند نهاية المباراة (مثل 32-32)."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          rngDescriptionAr: "لعبة مهارية استراتيجية حتمية 100%.",
          fairPlay: "Outflanking lines and multi-directional flips are processed atomically on the server.",
          fairPlayAr: "التطويق والانقلاب متعدد المحاور محوسب وموثق على الخادم بدقة."
        },
      },
    },
  },

  // 10. GOMOKU
  gomoku: {
    game: "gomoku",
    defaultVariant: "standard_freestyle",
    variants: {
      standard_freestyle: {
        variant: "standard_freestyle",
        name: "International Gomoku (Freestyle)",
        nameAr: "جوموكو الحرة (خمسة أو أكثر)",
        version: "RIF-GOMOKU-FREESTYLE-v1",
        source: "Renju International Federation (RIF) Gomoku Division",
        sourceAr: "الاتحاد الدولي للرينجو (RIF) - قسم الجوموكو الحرة",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-15x15",
          dimensions: [15, 15],
          setupDescription: "15x15 grid of 225 intersection points. Center point is H8.",
          setupDescriptionAr: "شبكة 15x15 بـ 225 تقاطعاً. النقطة المركزية هي H8.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["blitz_3_0", "rapid_5_0"],
        },
        rulesDocument: {
          overview: "Renju International Federation standard Freestyle Gomoku. First player to place an unbroken line of 5 or more stones wins.",
          overviewAr: "جوموكو الحرة المعتمدة من الاتحاد الدولي للرينجو (RIF). أول لاعب يشكل خطاً مستقيماً من 5 أحجار أو أكثر يفوز فوراً.",
          setup: "Empty 15x15 grid. Black (Seat 0) plays first at center intersection H8. White (Seat 1) plays second.",
          setupAr: "شبكة 15x15 تحوي 225 تقاطعاً. الأسود (المقعد 0) يبدأ عند التقاطع الأوسط H8، والأبيض (المقعد 1) ثانياً.",
          legalMoves: "Stones are placed alternately on any unoccupied intersection of the 15x15 grid. Once placed, stones are never moved or captured.",
          legalMovesAr: "توضع الأحجار بالتناوب على تقاطعات الشبكة الشاغرة. لا يمكن تحريك أو أكل الأحجار بعد وضعها على اللوح.",
          winConditions: ["First player to form an unbroken horizontal, vertical, or diagonal chain of 5 or more stones wins immediately."],
          winConditionsAr: ["أول متسابق يربط 5 أحجار متصلة أو أكثر (أفقياً، رأسياً، أو قطرياً) يفوز فوراً."],
          drawConditions: ["All 225 intersections filled without either player achieving 5 in a row."],
          drawConditionsAr: ["امتلاء جميع التقاطعات الـ 225 دون تشكيل خط خماسي متصل."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          rngDescriptionAr: "مهارة استراتيجية حتمية 100%.",
          fairPlay: "Line detection across all 4 axes is verified strictly on the server.",
          fairPlayAr: "كشف الخطوط الخماسية على المحاور الأربعة يجري بصرامة على الخادم."
        },
      },
      rif_tournament: {
        variant: "rif_tournament",
        name: "RIF Tournament Gomoku (Exact 5)",
        nameAr: "جوموكو بطولات RIF (خمسة بالضبط)",
        version: "RIF-GOMOKU-EXACT5-v1",
        source: "Renju International Federation (RIF) Tournament Rules",
        sourceAr: "قواعد بطولات الاتحاد الدولي للرينجو (RIF)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-15x15",
          dimensions: [15, 15],
          setupDescription: "15x15 grid of 225 intersection points. Mandatory opening at H8 (112).",
          setupDescriptionAr: "شبكة 15x15 بـ 225 تقاطعاً. بداية إلزامية في المركز H8.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "classical_10_0"],
        },
        rulesDocument: {
          overview: "Official RIF tournament Gomoku with strict center opening and exact-five winning condition (overlines do not count as wins).",
          overviewAr: "جوموكو البطولات الرسمية للاتحاد الدولي (RIF) ببدء مركزي إلزامي وقاعدة الفوز بخمسة أحجار بالضبط (الستة أو أكثر لا تحتسب فوزاً).",
          setup: "Empty 15x15 grid. Black must place first stone at H8 (cell 112).",
          setupAr: "شبكة 15x15 بـ 225 تقاطعاً. الحجر الأول للأسود يجب أن يوضع في التقاطع المركزي H8 (الخانة 112).",
          legalMoves: "Stones are placed alternately on any unoccupied intersection. First move must be H8.",
          legalMovesAr: "توضع الأحجار بالتناوب. النقلة الأولى مقيدة بالمركز H8.",
          winConditions: ["First player to form an unbroken chain of EXACTLY five stones wins. Overlines (6+ stones) do NOT award a win."],
          winConditionsAr: ["أول متسابق يشكل خطاً متصلاً من خمسة أحجار بالضبط. الخطوط التي تزيد عن خمسة (Overline) لا تعتبر فوزاً."],
          drawConditions: ["All 225 intersections filled without either player achieving an exact 5."],
          drawConditionsAr: ["امتلاء اللوح دون تحقيق 5 أحجار بالضبط."],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          rngDescriptionAr: "حتمية 100%.",
          fairPlay: "Strict center opening and exact-five overline validation enforced server-side.",
          fairPlayAr: "التحقق الخادومي من البداية المركزية وشرط الخمسة الدقيق."
        },
      },
    },
  },

  // 11. SEEGA
  seega: {
    game: "seega",
    defaultVariant: "traditional_bedouin_5x5",
    variants: {
      traditional_bedouin_5x5: {
        variant: "traditional_bedouin_5x5",
        name: "Traditional Bedouin Seega (5x5)",
        nameAr: "السيجة التراثية البدوية (5x5)",
        version: "NIZALO-SEEGA-BEDOUIN-v1",
        source: "Historical Egyptian & North African Bedouin Mancala/Board Game Archives (Lane, 1836; Bell, 1960)",
        sourceAr: "أرشيفات الألعاب التراثية المصرية والبدوية في شمال أفريقيا (Lane, 1836; Bell, 1960)",
        effectiveDate: "2024-01-01",
        engineVersion: 1,
        cashEligible: true,
        tournamentEligible: true,
        boardDefinition: {
          type: "grid-5x5",
          dimensions: [5, 5],
          setupDescription: "5x5 grid of 25 squares. Center square (al-wasat) remains empty in phase 1.",
          setupDescriptionAr: "لوح شبكي 5x5 بـ 25 خانة، مع ترك خانة الوسط شاغرة في مرحلة الإنزال الأولى.",
        },
        turnModel: "ALTERNATING",
        timeControls: {
          defaultProfile: "rapid_5_0",
          allowedProfiles: ["rapid_5_0", "rapid_10_0"],
        },
        rulesDocument: {
          overview: "Traditional historical Arabic tactical board game played in two distinct phases: Drop Phase followed by Custodial Capture Movement.",
          overviewAr: "لعبة السيجة التراثية البدوية العريقة بمرحلتيها المتميزتين: مرحلة الإنزال بالتناوب (حجرين بكل دور) تليها مرحلة التحريك التكتيكي والأكل بالحصر الساندويتشي.",
          setup: "5x5 board. Each player has 12 stones. Phase 1: Players alternate placing 2 stones at a time on empty squares, leaving the central square ('al-wasat') vacant until all 24 stones are placed.",
          setupAr: "لوح 5x5 يحوي 25 مربعاً. 12 حجراً لكل متسابق. المرحلة الأولى: ينزل كل لاعب حجرين بالتناوب في المربعات الفارغة مع إبقاء المربع الأوسط (الوسط) شاغراً حتى تكتمل الـ 24 حجراً.",
          legalMoves: "Phase 1: Place 2 stones on empty squares (except center). Phase 2: Slide orthogonally into an adjacent vacant square. Custodial capture removes enemy stone flanked on opposite sides. Center square (al-wasat) provides sanctuary.",
          legalMovesAr: "المرحلة الأولى: إنزال حجرين في الخانات الشاغرة (ما عدا الوسط). المرحلة الثانية: انزلاق الحجر خطوة واحدة رأسياً أو أفقياً إلى خانة شاغرة مجاورة. الأكل بالحصر: محاصرة حجر الخصم بين حجرين من لونك على نفس الخط يقصيه من اللوح. عند نجاح الأكل، يواصل نفس اللاعب الحركة بنفس الحجر إذا توفر أكل تالٍ.",
          sanctuaryRule: "The central square (al-wasat) confers sanctuary: a piece occupying the center square cannot be captured by flanking.",
          sanctuaryRuleAr: "المربع الأوسط (الوسط) مربع حصانة وأمان: أي حجر يستقر في الوسط محصن تماماً ولا يمكن أكله بالحصر.",
          winConditions: ["Capture all opponent stones", "Block the opponent so they have no legal moves remaining", "Resignation", "Clock timeout"],
          winConditionsAr: ["أكل جميع أحجار الخصم", "حصار الخصم بالكامل وتجريده من أي نقلة صالحة", "استسلام الخصم", "نفاد وقت ساعة المنافس"],
          drawConditions: ["Threefold repetition of board position", "Both players reduced to equal stones with no further captures possible"],
          drawConditionsAr: ["تكرار الوضعية 3 مرات", "انخفاض أحجار الطرفين وتساويها مع استحالة حدوث أي أكل إضافي"],
          rngPolicy: "DETERMINISTIC",
          rngDescription: "100% deterministic pure skill. Zero luck.",
          rngDescriptionAr: "مهارة استراتيجية وتكتيكية حتمية 100% بدون أي حظ.",
          fairPlay: "Two-phase game state transitions and multi-capture sequences enforced authoritatively on the server.",
          fairPlayAr: "التحول الخادومي الآلي بين مرحلتي الإنزال والتحريك ومتابعة سلاسل الأكل المتتالية."
        },
      },
    },
  },
};

/**
 * Helper to retrieve an authoritative ruleset for a game and variant.
 */
export function getRuleset(gameId, variantId = null) {
  const normalizedGame = gameId.replace(/-/g, "_");
  const entry = RulesetRegistry[normalizedGame] || RulesetRegistry[gameId];
  if (!entry) throw new Error(`Unknown game in RulesetRegistry: '${gameId}'`);

  const variantKey = variantId || entry.defaultVariant;
  const variant = entry.variants[variantKey] || entry.variants[entry.defaultVariant];
  if (!variant) throw new Error(`Unknown variant '${variantId}' for game '${gameId}'`);

  return {
    game: entry.game,
    ...variant,
  };
}

/**
 * Returns all rulesets in a flat list for discovery and auditing.
 */
export function listAllRulesets() {
  const result = [];
  for (const [gameKey, gameEntry] of Object.entries(RulesetRegistry)) {
    for (const [variantKey, variant] of Object.entries(gameEntry.variants)) {
      result.push({
        game: gameEntry.game,
        ...variant,
      });
    }
  }
  return result;
}
