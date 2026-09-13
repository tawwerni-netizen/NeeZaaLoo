export type GameFaqItem = {
  question: string;
  answer: string;
};

export type GameLocalizedContent = {
  title: string;
  tagline: string;
  coreCta: string;
  legalPrizeNotice: string;
  overview: string[];
  rules: {
    objective: string;
    setup: string;
    mechanics: string[];
    victoryConditions: string[];
  };
  beginner: {
    coreTips: string[];
    commonMistakes: string[];
  };
  strategy: {
    openingPrinciples: string[];
    tacticalPatterns: string[];
    midgameCoordination: string[];
  };
  advancedStrategy: {
    deepCalculation: string[];
    clockManagement: string[];
    endgameTechnique: string[];
  };
  faq: GameFaqItem[];
  tournament: {
    format: string;
    tieBreakers: string;
    prizeDistribution: string;
  };
  livePlay: {
    matchmaking: string;
    latencyProtection: string;
    fairPlayEngine: string;
  };
};

export type GameContentRegistryItem = {
  id: string;
  slug: string;
  turnModel: "ALTERNATING" | "SIMULTANEOUS";
  defaultDuration: string;
  locales: Record<string, GameLocalizedContent>;
};

export const GAMES_CONTENT: Record<string, GameContentRegistryItem> = {
  chess: {
    id: "chess",
    slug: "chess",
    turnModel: "ALTERNATING",
    defaultDuration: "3m - 10m",
    locales: {
      ar: {
        title: "الشطرنج التنافسي (Chess)",
        tagline: "سيدة ألعاب العقل والاستراتيجية الملكية عبر العصور",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: [
          "الشطرنج على منصة Nizalo هو صراع استراتيجي خالص بين عقلين على رقعة 64 مربعاً من خشب الأوبسيديان والذهب.",
          "تخضع جميع المباريات للتحكيم الآلي الدقيق لقوانين الاتحاد الدولي للشطرنج (FIDE) مع توقيت رقمي مركزي وحماية كاملة ضد الغش ومحركات الذكاء الاصطناعي."
        ],
        rules: {
          objective: "محاصرة ملك الخصم في وضعية (كش مات - Checkmate) لا يمكن الفرار منها.",
          setup: "جيشان متطابقان (16 قطعة لكل لاعب: ملك، وزير، قلعتان، حصانان، فيلان، و8 بيادق).",
          mechanics: [
            "حركات محددة لكل قطعة بدقة هندسية مطلقة.",
            "قواعد التبييت (Castling) والأخذ بالمرور (En Passant) وترقية البيادق.",
            "ساعة توقيت رقمية تدار مركزياً من السيرفر لمنع أي تلاعب بالتوقيت المحلي."
          ],
          victoryConditions: [
            "كش مات مباشر للملك.",
            "استسلام الخصم (Resignation).",
            "سقوط ساعة وقت الخصم (Timeout) مع امتلاك قطع كافية للإماتة."
          ]
        },
        beginner: {
          coreTips: [
            "سيطر على المربعات المركزية الأربعة (e4, d4, e5, d5) في النقلات الأولى.",
            "طوّر القطع الصغرى (الفرسان والفيلة) قبل تحريك الوزير مبكراً.",
            "أمّن ملكك بالتبييت في أسرع وقت ممكن وضع قلعتك في الأعمدة المفتوحة."
          ],
          commonMistakes: [
            "إخراج الوزير في بداية الدور وتعريضه للهجوم من قطع الخصم الأقل قيمة.",
            "ترك القطع بدون حماية كافية أو تجاهل تهديدات الخصم المباشرة."
          ]
        },
        strategy: {
          openingPrinciples: [
            "افتتاحيات السيطرة على الوسط: الدفاع الصقلي، افتتاح روي لوبيز، والدفاع الفرنسي.",
            "التناغم بين هيكل البيادق وفاعلية الفيلة والفرسان في المربعات القوية."
          ],
          tacticalPatterns: [
            "الشواكيش المزدوجة (Forks)، والربط (Pins)، والتشتيت (Decoys).",
            "التضحيات التكتيكية لفتح خطوط الهجوم المباشر نحو الملك."
          ],
          midgameCoordination: [
            "تحويل التفوق الطفيف في المساحة أو النشاط إلى ضغط هجومي لا مفر منه.",
            "تبسيط الموقف عند امتلاك أفضلية مادية لحسم النهاية."
          ]
        },
        advancedStrategy: {
          deepCalculation: [
            "حساب شجرة النقلات الإجبارية (Candidate Moves) حتى 5 أو 6 نقلات إلى الأمام.",
            "تقييم النهايات الحرجة والبيادق السالكة (Passed Pawns)."
          ],
          clockManagement: [
            "الحفاظ على وتيرة تفكير ثابتة في افتتاح الدور وتوفير الوقت للمواقف المعقدة في وسط الرقعة.",
            "استغلال وقت الخصم للتفكير في النقلات البديلة والاستعداد المسبق."
          ],
          endgameTechnique: [
            "قواعد المربعات الحرجة ومفهوم المعارضة (Opposition) في نهايات الملوك والبيادق.",
            "تقنيات جسر لوسينا (Lucena) ودفاع فيليدور (Philidor) في نهايات القلاع."
          ]
        },
        faq: [
          {
            question: "كيف يتم ضمان عدم استخدام الخصم لمحركات الذكاء الاصطناعي (مثل Stockfish)؟",
            answer: "تمتلك منصة Nizalo نظام فحص جنائي رقمي متقدم يحلل تطابق النقلات مع محركات الشطرنج، وأزمنة التفكير، والمسارات الحركية، ويتم تجميد أي حساب يخالف ميثاق اللعب النظيف فوراً."
          },
          {
            question: "ماذا يحدث إذا انقطع اتصالي بالإنترنت أثناء المباراة؟",
            answer: "يمنحك السيرفر نافذة سماح مدتها 60 ثانية لإعادة الاتصال واستكمال المباراة مباشرة دون أن تفقد دورك."
          }
        ],
        tournament: {
          format: "أنظمة الإقصاء الفردي المباشر (Single Elimination) أو النظام السويسري (Swiss).",
          tieBreakers: "مباراة خاطفة حاسمة (Blitz Tie-Break) بنظام الموت المفاجئ (Armageddon).",
          prizeDistribution: "توزيع آلي فوري للجوائز عبر دفتر الأستاذ المالي فور اعتماد النتائج."
        },
        livePlay: {
          matchmaking: "توفيق ذكي مبني على تصنيف ELO لضمان مباريات متكافئة وعادلة.",
          latencyProtection: "تعويض زمني ومزامنة فورية للشبكة لضمان سلاسة النقلات عالمياً.",
          fairPlayEngine: "حماية مطلقة من التواطؤ ومراقبة جنائية مستمرة للمباريات."
        }
      },
      en: {
        title: "Competitive Chess",
        tagline: "The Sovereign Strategy Battle of Minds Across Centuries",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: [
          "Chess on Nizalo is pure mental warfare conducted across a 64-square cyber-luxury grid.",
          "Every duel strictly enforces official FIDE rules with millisecond-accurate server clocks and automated anti-cheat telemetry."
        ],
        rules: {
          objective: "Checkmate the enemy King so it cannot escape capture.",
          setup: "Two equal armies (16 pieces each: King, Queen, 2 Rooks, 2 Knights, 2 Bishops, 8 Pawns).",
          mechanics: [
            "Rigid piece movement vectors governed by official FIDE standards.",
            "Castling, en passant pawn captures, and pawn promotions fully validated.",
            "Authoritative server clock synchronization."
          ],
          victoryConditions: [
            "Checkmate.",
            "Opponent resignation.",
            "Opponent timeout with sufficient mating material."
          ]
        },
        beginner: {
          coreTips: [
            "Control central squares early (e4, d4, e5, d5).",
            "Develop minor pieces before moving the Queen.",
            "Castle early to safeguard your King."
          ],
          commonMistakes: [
            "Premature Queen attacks that leave minor pieces undeveloped.",
            "Hanging unguarded pieces under tactical pressure."
          ]
        },
        strategy: {
          openingPrinciples: ["Control space, build pawn structures, and coordinate knights with bishops."],
          tacticalPatterns: ["Forks, skewers, pins, discovered attacks, and double threats."],
          midgameCoordination: ["Transform spatial advantages into breakthrough pawn storms."]
        },
        advancedStrategy: {
          deepCalculation: ["Calculate forcing variations through candidate move trees."],
          clockManagement: ["Pace time bank investments to reserve minutes for critical tactical knots."],
          endgameTechnique: ["Master king opposition, key squares, and Lucena/Philidor rook endings."]
        },
        faq: [
          {
            question: "How does Nizalo detect chess engine assistance?",
            answer: "Our automated telemetry compares moves against top neural engines and analyzes move-timing cadence to detect illicit assistance."
          }
        ],
        tournament: {
          format: "Single Elimination brackets and Swiss system tournaments.",
          tieBreakers: "Sudden-death blitz game with armageddon time advantages.",
          prizeDistribution: "Automated double-entry ledger payout upon verified final results."
        },
        livePlay: {
          matchmaking: "Real-time ELO rating pairing with latency thresholds.",
          latencyProtection: "Authoritative server-side rollback-free state sync.",
          fairPlayEngine: "Zero-tolerance anti-cheat surveillance."
        }
      },
      zh: {
        title: "竞技国际象棋 (Chess)",
        tagline: "千年智力博弈之王，巅峰对决",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["64格棋盘上的终极智力较量，严格遵循国际棋联 FIDE 官方规则，全方位反作弊保护。"],
        rules: {
          objective: "将死对方国王（Checkmate）。",
          setup: "双方各执16枚棋子在8x8黑白相间的棋盘上对决。",
          mechanics: ["王车易位、吃过路兵、兵的升变均由服务器引擎严格裁决。"],
          victoryConditions: ["将死对手、对手认输或对手超时。"]
        },
        beginner: {
          coreTips: ["抢占中心方格、迅速出子、尽早王车易位。"],
          commonMistakes: ["过早出后导致被对手轻子攻击。"]
        },
        strategy: {
          openingPrinciples: ["控制中心、协调子力。"],
          tacticalPatterns: ["双重攻击、牵制、串打。"],
          midgameCoordination: ["转化子力优势为胜势。"]
        },
        advancedStrategy: {
          deepCalculation: ["多步推演关键候选着法。"],
          clockManagement: ["把控用时节奏。"],
          endgameTechnique: ["精通车兵残局与对王技巧。"]
        },
        faq: [
          { question: "如何防止AI作弊？", answer: "平台配备法证级反作弊算法实时比对引擎吻合度与走子时钟指纹。" }
        ],
        tournament: {
          format: "单败淘汰制与瑞士轮制锦标赛。",
          tieBreakers: "加赛超快棋决胜。",
          prizeDistribution: "比赛结束经合规核验后由账本自动分发奖金。"
        },
        livePlay: {
          matchmaking: "基于 ELO 分数的公平匹配。",
          latencyProtection: "毫秒级低延迟同步。",
          fairPlayEngine: "零容忍反作弊风控。"
        }
      },
      es: {
        title: "Ajedrez Competitivo",
        tagline: "El Combate Estratégico Soberano de la Inteligencia",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Duelo mental puro en un tablero de 64 casillas con arbitraje digital certificado."],
        rules: {
          objective: "Dar jaque mate al rey rival.",
          setup: "16 piezas por bando con movimientos estandarizados por la FIDE.",
          mechanics: ["Enroque, captura al paso y coronación de peones."],
          victoryConditions: ["Jaque mate, rendición o tiempo agotado."]
        },
        beginner: {
          coreTips: ["Domine el centro, desarrolle caballos y alfiles, y enroque rápido."],
          commonMistakes: ["Mover la dama demasiado pronto."]
        },
        strategy: {
          openingPrinciples: ["Aperturas clásicas de control central."],
          tacticalPatterns: ["Horquillas, clavadas y ataques a la descubierta."],
          midgameCoordination: ["Coordinación de piezas pesadas en columnas abiertas."]
        },
        advancedStrategy: {
          deepCalculation: ["Cálculo profundo de jugadas candidatas."],
          clockManagement: ["Gestión disciplinada del reloj de juego."],
          endgameTechnique: ["Finales teóricos de torres y oposición de reyes."]
        },
        faq: [
          { question: "¿Cómo se previene el uso de motores?", answer: "Telemetría forense que analiza tiempos y coincidencias algorítmicas." }
        ],
        tournament: {
          format: "Eliminación directa o sistema suizo.",
          tieBreakers: "Partida blitz de desempate.",
          prizeDistribution: "Acreditación automatizada en el saldo del monedero."
        },
        livePlay: {
          matchmaking: "Emparejamiento por puntuación ELO.",
          latencyProtection: "Sincronización de reloj en el servidor.",
          fairPlayEngine: "Control riguroso de juego limpio."
        }
      },
      fr: {
        title: "Échecs de Compétition",
        tagline: "Le Duel Stratégique Suprême des Esprits à Travers les Siècles",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Affrontement cérébral sur un échiquier de 64 cases sous règles strictes de la FIDE."],
        rules: {
          objective: "Mettre le roi adverse échec et mat.",
          setup: "16 pièces par joueur avec règles de déplacement officielles.",
          mechanics: ["Roque, prise en passant et promotion des pions validés par le serveur."],
          victoryConditions: ["Échec et mat, abandon ou dépassement du temps."]
        },
        beginner: {
          coreTips: ["Contrôlez le centre, développez vos pièces mineures et roquez tôt."],
          commonMistakes: ["Sortir la dame trop tôt dans l'ouverture."]
        },
        strategy: {
          openingPrinciples: ["Développement harmonieux et occupation des cases clés."],
          tacticalPatterns: ["Fourchettes, clouages et attaques à la découverte."],
          midgameCoordination: ["Maîtrise des colonnes ouvertes avec les tours."]
        },
        advancedStrategy: {
          deepCalculation: ["Calcul de variantes forcées en arbre de décisions."],
          clockManagement: ["Gestion stricte du temps de réflexion."],
          endgameTechnique: ["Finales de tours et opposition des rois."]
        },
        faq: [
          { question: "Comment Nizalo détecte-t-il la triche par IA ?", answer: "Analyse médico-légale des coups et des distributions de temps." }
        ],
        tournament: {
          format: "Élimination directe ou rondes suisses.",
          tieBreakers: "Blitz de départage mort subite.",
          prizeDistribution: "Paiement automatisé via registre à double entrée."
        },
        livePlay: {
          matchmaking: "Appariement précis basé sur le score ELO.",
          latencyProtection: "Horloge autoritaire gérée par le serveur.",
          fairPlayEngine: "Surveillance anti-triche active."
        }
      },
      hi: {
        title: "प्रतियोगी शतरंज (Chess)",
        tagline: "बुद्धि और रणनीति की सर्वोच्च ऐतिहासिक लड़ाई",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["64 खानों पर चलने वाला शुद्ध बौद्धिक खेल, FIDE नियमों के अनुसार सर्वर-नियंत्रित।"],
        rules: {
          objective: "विरोधी राजा को शह और मात (Checkmate) देना।",
          setup: "दोनों खिलाड़ियों के पास 16-16 मोहरे।",
          mechanics: ["कैसलिंग, एन पासेंट और प्यादा पदोन्नति।"],
          victoryConditions: ["शह और मात, समर्पण या समय समाप्ति।"]
        },
        beginner: {
          coreTips: ["केंद्र पर नियंत्रण रखें, मोहरों को सक्रिय करें और जल्दी कैसलिंग करें।"],
          commonMistakes: ["रानी को खेल की शुरुआत में बाहर निकालना।"]
        },
        strategy: {
          openingPrinciples: ["सेंटर स्क्वायर का नियंत्रण और टुकड़ों का तालमेल।"],
          tacticalPatterns: ["फोर्क, पिन और दोहरा हमला।"],
          midgameCoordination: ["खुली फाइलों पर नियंत्रण।"]
        },
        advancedStrategy: {
          deepCalculation: ["चालों की गहरी गणना।"],
          clockManagement: ["समय प्रबंधन।"],
          endgameTechnique: ["राजा और प्यादे के अंतिम खेल के नियम।"]
        },
        faq: [
          { question: "धोखाधड़ी कैसे रोकी जाती है?", answer: "हमारा स्वचालित सिस्टम AI इंजन के उपयोग का तुरंत पता लगाता है।" }
        ],
        tournament: {
          format: "नॉकआउट और स्विस टूर्नामेंट।",
          tieBreakers: "ब्लिट्ज टाई-ब्रेकर।",
          prizeDistribution: "स्वचालित पुरस्कार वितरण।"
        },
        livePlay: {
          matchmaking: "ELO रेटिंग के आधार पर निष्पक्ष मैचमेकिंग।",
          latencyProtection: "कम लेटेंसी गेमप्ले।",
          fairPlayEngine: "निष्पक्ष खेल सुरक्षा।"
        }
      }
    }
  },

  checkers: {
    id: "checkers",
    slug: "checkers",
    turnModel: "ALTERNATING",
    defaultDuration: "3m - 7m",
    locales: {
      ar: {
        title: "الداما التنافسية (Checkers / Draughts)",
        tagline: "حرب الحصار والقفز الإجباري والتتويج الملكي",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: [
          "لعبة الداما على Nizalo تعتمد على التكتيك الرياضي والحساب الإجباري، حيث لا مجال للحظ أو الصدفة.",
          "تطبق المنصة قاعدة القفز والأسر الإجباري الصارمة مع التتويج التلقائي للملوك عند بلوغ الصف الأخير."
        ],
        rules: {
          objective: "أسر جميع قطع الخصم أو محاصرتها حتى تنعدم أي حركة قانونية متاحة.",
          setup: "12 قرصاً لكل لاعب على المربعات الداكنة للرقعة 8x8.",
          mechanics: [
            "التحرك القطري للأمام بمربع واحد للقطع العادية.",
            "القفز والأسر الإجباري للأمام (والخلف للملوك).",
            "التتويج إلى رتبة ملك (King) عند الوصول إلى الصف الخلفي للخصم."
          ],
          victoryConditions: [
            "أسر جميع أقراص الخصم بالكامل.",
            "محاصرة قطع الخصم ومنعه من الحركة (Stalemate / Blockade).",
            "سقوط وقت الخصم."
          ]
        },
        beginner: {
          coreTips: [
            "حافظ على صفك الخلفي محمياً قدر الإمكان لمنع تتويج ملوك الخصم.",
            "سيطر على المربعات المركزية وتجنب وضع الأقراص على الحواف الميتة."
          ],
          commonMistakes: [
            "تجاهل فرص الأسر المتعدد التي قد تمنح الخصم تفوقاً حاسماً."
          ]
        },
        strategy: {
          openingPrinciples: ["تطوير الأقراص بشكل هرمي متماسك لمنع الاختراقات."],
          tacticalPatterns: ["التضحيات الإجبارية (Shot Patterns) لجذب قطع الخصم لمصيدة الأسر المتعدد."],
          midgameCoordination: ["السيطرة على الخط القطري الطويل (Double Diagonal)."]
        },
        advancedStrategy: {
          deepCalculation: ["حساب تسلسلات القفز الإجباري حتى 6 حركات متتالية."],
          clockManagement: ["اتخاذ الحركات الإجبارية الفورية دون استهلاك وقت الساعة."],
          endgameTechnique: ["محاصرة الملك الفردي باستخدام ملكين في الزوايا المزدوجة."]
        },
        faq: [
          { question: "هل الأسر إجباري في الداما؟", answer: "نعم، وفق القواعد الرسمية المعمول بها على Nizalo، الأسر إلزامي عندما تتوفر النقلة." }
        ],
        tournament: {
          format: "إقصاء مباشر وجولات متتالية.",
          tieBreakers: "مباراة سريعة حاسمة.",
          prizeDistribution: "تحويل مباشر للمحفظة فور انتهاء المواجهة."
        },
        livePlay: {
          matchmaking: "تصنيف المهارة وتقييم GSS.",
          latencyProtection: "معالجة فورية وتأكيد حركات الخادم.",
          fairPlayEngine: "حظر البوتات والبرمجيات الخارجية."
        }
      },
      en: {
        title: "Competitive Checkers",
        tagline: "The Art of Mandatory Captures, Sacrifices, and King Sovereignty",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Mathematical precision meets tactical traps on an 8x8 grid with mandatory capture rules."],
        rules: {
          objective: "Capture all opposing checkers or leave them with no legal moves.",
          setup: "12 draughts per player positioned on the dark squares of the board.",
          mechanics: ["Diagonal moves forward, mandatory jumping captures, and promotion to King."],
          victoryConditions: ["Total capture of enemy pieces or immobilizing all legal moves."]
        },
        beginner: {
          coreTips: ["Anchor your baseline checkers to prevent enemy kings.", "Control central diagonals."],
          commonMistakes: ["Advancing edge pieces that get trapped without defensive support."]
        },
        strategy: {
          openingPrinciples: ["Form triangular phalanxes that guard against breakthrough leaps."],
          tacticalPatterns: ["The in-and-out shot, the slip trap, and forcing double jumps."],
          midgameCoordination: ["Dominate the long central diagonal."]
        },
        advancedStrategy: {
          deepCalculation: ["Calculate forced capture trees to execute multi-piece sweeps."],
          clockManagement: ["Instantly execute forced response jumps."],
          endgameTechnique: ["Trap solitary enemy kings using the double-corner technique."]
        },
        faq: [
          { question: "Is jumping mandatory?", answer: "Yes, standard competitive rules strictly mandate captures whenever legal." }
        ],
        tournament: {
          format: "Single Elimination brackets.",
          tieBreakers: "Rapid sudden-death match.",
          prizeDistribution: "Automated ledger crediting."
        },
        livePlay: {
          matchmaking: "Real-time GSS and ELO pairing.",
          latencyProtection: "Zero-latency server synchronization.",
          fairPlayEngine: "Forensic solver detection."
        }
      },
      zh: {
        title: "竞技西洋跳棋 (Checkers)",
        tagline: "强制吃子与封锁战术的终极考验",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["严格遵循强制吃子与王棋升变规则的纯策略跳棋比赛。"],
        rules: {
          objective: "消灭对手全部棋子或令其无子可走。",
          setup: "双方各执12枚棋子置于8x8棋盘深色格。",
          mechanics: ["斜向移动，强制跳吃，到达底线升变为王棋。"],
          victoryConditions: ["吃光对手棋子或完全封锁对手。"]
        },
        beginner: {
          coreTips: ["保护底线兵力，控制中心对角线。"],
          commonMistakes: ["忽视对手弃子陷阱。"]
        },
        strategy: {
          openingPrinciples: ["保持队形密集，避免单兵冒进。"],
          tacticalPatterns: ["引诱弃子连环跳吃。"],
          midgameCoordination: ["夺取主对角线控制权。"]
        },
        advancedStrategy: {
          deepCalculation: ["多步推演强制吃子分支。"],
          clockManagement: ["遇到强制吃子时秒下节省时间。"],
          endgameTechnique: ["利用双角封锁敌方王棋。"]
        },
        faq: [
          { question: "必须吃子吗？", answer: "是的，竞技规则强制执行吃子。" }
        ],
        tournament: { format: "单败淘汰制。", tieBreakers: "加赛超快棋。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "ELO 匹配。", latencyProtection: "低延迟同步。", fairPlayEngine: "严防脚本作弊。" }
      },
      es: {
        title: "Damas Clásicas",
        tagline: "El Arte de la Captura Obligatoria y la Coronación de Damas",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Competición táctica pura de 8x8 donde la captura es obligatoria."],
        rules: {
          objective: "Capturar todas las piezas rivales o bloquear sus movimientos.",
          setup: "12 fichas por jugador en casillas oscuras.",
          mechanics: ["Movimiento diagonal, saltos obligatorios y coronación como dama."],
          victoryConditions: ["Captura total o bloqueo absoluto."]
        },
        beginner: {
          coreTips: ["No mueva su fila trasera prematuramente.", "Ocupe casillas centrales."],
          commonMistakes: ["Dejar piezas sueltas en las bandas."]
        },
        strategy: {
          openingPrinciples: ["Avance compacto en cuña defensiva."],
          tacticalPatterns: ["Sacrificios calculados para forzar saltos múltiples."],
          midgameCoordination: ["Control de la gran diagonal."]
        },
        advancedStrategy: {
          deepCalculation: ["Cálculo de cadenas de saltos forzados."],
          clockManagement: ["Respuesta inmediata ante jugadas obligatorias."],
          endgameTechnique: ["Técnica de la doble esquina para atrapar damas enemigas."]
        },
        faq: [{ question: "¿Es obligatorio comer?", answer: "Sí, la captura es estrictamente obligatoria en Nizalo." }],
        tournament: { format: "Eliminación directa.", tieBreakers: "Partida de desempate.", prizeDistribution: "Saldo directo." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Reloj central.", fairPlayEngine: "Anti-trampas." }
      },
      fr: {
        title: "Dames Compétitives",
        tagline: "L'Excellence des Prises Forcées et de la Promotion",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Jeu de réflexion et de tactique à capture obligatoire sur damier 8x8."],
        rules: {
          objective: "Capturer tous les pions adverses ou bloquer toute possibilité de mouvement.",
          setup: "12 pions par joueur sur cases foncées.",
          mechanics: ["Déplacement en diagonale, saut obligatoire et promotion en dame."],
          victoryConditions: ["Capture totale ou blocage complet de l'adversaire."]
        },
        beginner: {
          coreTips: ["Gardez votre ligne de fond intacte le plus longtemps possible.", "Occupez le centre."],
          commonMistakes: ["Mettre des pions sur les bords où ils sont vulnérables."]
        },
        strategy: {
          openingPrinciples: ["Développement triangulaire solidaire."],
          tacticalPatterns: ["Combinaisons de sacrifices pour rafles multiples."],
          midgameCoordination: ["Maîtrise de la grande diagonale."]
        },
        advancedStrategy: {
          deepCalculation: ["Calcul des enchaînements forcés."],
          clockManagement: ["Jeu rapide sur les prises obligatoires."],
          endgameTechnique: ["Technique des doubles coins en finale de dames."]
        },
        faq: [{ question: "La prise est-elle obligatoire ?", answer: "Oui, la prise est strictement obligatoire selon les règles officielles." }],
        tournament: { format: "Tableau à élimination.", tieBreakers: "Blitz de départage.", prizeDistribution: "Paiement automatique." },
        livePlay: { matchmaking: "Algorithme ELO.", latencyProtection: "Zéro lag serveur.", fairPlayEngine: "Surveillance anti-bot." }
      },
      hi: {
        title: "प्रतियोगी चेकर्स (Checkers)",
        tagline: "अनिवार्य कैप्चर और किंग बनने की रणनीति",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["8x8 बोर्ड पर शुद्ध रणनीति और अनिवार्य चालों का खेल।"],
        rules: {
          objective: "विरोधी के सभी गोतियों को खत्म करना या उनकी चालें बंद करना।",
          setup: "प्रत्येक खिलाड़ी के पास 12 गोटियां।",
          mechanics: ["तिरछी चाल, अनिवार्य कूद (Capture) और किंग प्रमोशन।"],
          victoryConditions: ["सभी गोटियों को कैप्चर करना या गतिहीन करना।"]
        },
        beginner: {
          coreTips: ["पिछली पंक्ति को सुरक्षित रखें, केंद्र पर नियंत्रण रखें।"],
          commonMistakes: ["किनारे की गोटियों को असुरक्षित छोड़ना।"]
        },
        strategy: {
          openingPrinciples: ["मजबूत त्रिकोणीय संरचना।"],
          tacticalPatterns: ["बलिदान देकर कई गोटियां काटना।"],
          midgameCoordination: ["मुख्य विकर्ण का नियंत्रण।"]
        },
        advancedStrategy: {
          deepCalculation: ["अनिवार्य चालों की श्रृंखला की गणना।"],
          clockManagement: ["तुरंत निर्णय लेना।"],
          endgameTechnique: ["कोने में किंग को फंसाना।"]
        },
        faq: [{ question: "क्या कूदना अनिवार्य है?", answer: "हाँ, नियमों के अनुसार कैप्चर अनिवार्य है।" }],
        tournament: { format: "नॉकआउट टूर्नामेंट।", tieBreakers: "फास्ट टाई-ब्रेकर।", prizeDistribution: "तुरंत क्रेडिट।" },
        livePlay: { matchmaking: "निष्पक्ष ELO मिलान।", latencyProtection: "स्मूथ गेमप्ले।", fairPlayEngine: "बॉट सुरक्षा।" }
      }
    }
  },

  dominoes: {
    id: "dominoes",
    slug: "dominoes",
    turnModel: "ALTERNATING",
    defaultDuration: "4m - 8m",
    locales: {
      ar: {
        title: "الدومينو التنافسية (Dominoes)",
        tagline: "علم الاحتمالات الرياضية وإغلاق الطاولة التكتيكي",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["الدومينو على Nizalo ليست لعبة حظ؛ بل هي مبارزة في حساب القطع المتبقية، وتوقع يد الخصم، وقراءة الأرقام المفتوحة."],
        rules: {
          objective: "تفريغ يدك من القطع أولاً أو إنهاء المباراة بأقل مجموع نقاط عند قفل الطاولة (Block).",
          setup: "مجموعة الدومينو المزدوجة الستة (28 قطعة من 0-0 حتى 6-6)، 7 قطع لكل لاعب.",
          mechanics: ["مطابقة الأرقام على طرفي السلسلة، وقفل اللعب عند نفاد الحركات القانونية."],
          victoryConditions: ["إنهاء القطع بالكامل (Domino!) أو الفوز بأقل مجموع نقاط عند قفل اللعب."]
        },
        beginner: {
          coreTips: ["تخلص من القطع الثقيلة ذات النقاط العالية مبكراً (مثل 6-6 و 5-5).", "احتفظ بتنوع في أرقام يدك."],
          commonMistakes: ["لعب القطع المزدوجة بشكل متأخر مما يرفع نقاطك عند قفل الدور."]
        },
        strategy: {
          openingPrinciples: ["بدء الدور بالقطعة المزدوجة الأثقل للسيطرة على وتيرة اللعب."],
          tacticalPatterns: ["قراءة الأرقام التي يتجاوزها الخصم لمعرفة نقاط ضعفه وتوجيه اللعب نحوها."],
          midgameCoordination: ["توجيه طرفي السلسلة لنفس الرقم لإجبار الخصم على السحب أو التمرير."]
        },
        advancedStrategy: {
          deepCalculation: ["حساب جميع القطع الـ 28 وتحديد القطع المتبقية في يد الخصم بدقة حسابية."],
          clockManagement: ["تجنب التردد عند امتلاك خيار إجباري واحد."],
          endgameTechnique: ["تنفيذ إغلاق محسوب (Block) عندما يكون مجموع نقاطك أقل يقيناً من الخصم."]
        },
        faq: [{ question: "كيف تحسب النقاط عند قفل اللعبة؟", answer: "يتم جمع النقاط المتبقية في يد كل لاعب، ويفوز صاحب المجموع الأقل بفارق النقاط." }],
        tournament: { format: "مباريات نقاط أو إقصاء مباشر.", tieBreakers: "جولة حاسمة.", prizeDistribution: "توزيع تلقائي." },
        livePlay: { matchmaking: "توفيق بالمهارة.", latencyProtection: "مزامنة لحظية.", fairPlayEngine: "توزيع قطع مشفر عادل." }
      },
      en: {
        title: "Competitive Dominoes",
        tagline: "Mathematical Probabilities and Tactical Board Blocking",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Mental card counting and tile hand deductions on an official Double-Six board."],
        rules: {
          objective: "Empty your hand first or hold the lowest pip count when the game is blocked.",
          setup: "Standard 28-tile double-six set, 7 tiles dealt to each player.",
          mechanics: ["Matching pips on chain ends, tactical passes, and board blocking."],
          victoryConditions: ["First to play all tiles or lowest pip count on block."]
        },
        beginner: {
          coreTips: ["Unload heavy double tiles early.", "Maintain flexibility across suits."],
          commonMistakes: ["Holding high-pip tiles until the endgame."]
        },
        strategy: {
          openingPrinciples: ["Lead with highest double to dictate tempo."],
          tacticalPatterns: ["Deduce missing suits when opponent passes and feed those numbers."],
          midgameCoordination: ["Match both ends to identical numbers to restrict responses."]
        },
        advancedStrategy: {
          deepCalculation: ["Track all 28 tiles in real time to deduce the opponent's exact hand."],
          clockManagement: ["Instant plays on forced matches."],
          endgameTechnique: ["Calculate profitable blocks before executing closure."]
        },
        faq: [{ question: "How does blocking work?", answer: "When neither player can move, the player with the lowest total pips wins." }],
        tournament: { format: "Bracket elimination.", tieBreakers: "Sudden-death duel.", prizeDistribution: "Ledger payout." },
        livePlay: { matchmaking: "Skill rating pairing.", latencyProtection: "Server validated moves.", fairPlayEngine: "Cryptographic tile shuffling." }
      },
      zh: {
        title: "竞技多米诺骨牌 (Dominoes)",
        tagline: "点数概率算力与终极封牌战术",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["基于双六标准28张骨牌的纯数学心算与记牌竞技。"],
        rules: {
          objective: "率先出完所有骨牌，或在死局（封牌）时手中点数最小。",
          setup: "标准28张骨牌，每人开局7张。",
          mechanics: ["两端点数匹配，无法出牌时停手或抽牌。"],
          victoryConditions: ["清空手牌或死局点数最小者胜。"]
        },
        beginner: { coreTips: ["早出大点数双牌。", "保持手牌花色多样。"], commonMistakes: ["死留大牌导致扣分严重。"] },
        strategy: { openingPrinciples: ["先手出最大双牌。"], tacticalPatterns: ["根据对手过牌推导断门。"], midgameCoordination: ["双头同点数封堵。"] },
        advancedStrategy: { deepCalculation: ["全盘28张牌精确记牌。"], clockManagement: ["快速反应节约用时。"], endgameTechnique: ["胜算封牌收割战局。"] },
        faq: [{ question: "封牌如何判定胜负？", answer: "双方均无合法出牌时，手牌点数总和较小者获胜。" }],
        tournament: { format: "单败淘汰赛。", tieBreakers: "加赛一局。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "基于技能分匹配。", latencyProtection: "即时同步。", fairPlayEngine: "密码学公平洗牌。" }
      },
      es: {
        title: "Dominó Competitivo",
        tagline: "Probabilidad Matemática y Dominio del Cierre Táctico",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Cálculo mental y deducción de fichas en un juego oficial de Doble-Seis."],
        rules: {
          objective: "Deshacerse de todas las fichas o ganar por menor puntuación en cierre (tranca).",
          setup: "28 fichas estándar, 7 fichas por jugador.",
          mechanics: ["Emparejar números en los extremos y provocar el pase del rival."],
          victoryConditions: ["Dominó (sin fichas) o menor tanteo en tranca."]
        },
        beginner: { coreTips: ["Juegue fichas dobles altas al inicio.", "Conserve variedad de números."], commonMistakes: ["Guardar dobles pesados."] },
        strategy: { openingPrinciples: ["Salir con doble alto."], tacticalPatterns: ["Detectar los fallos del rival para repetir ese número."], midgameCoordination: ["Cuadrar la mesa al mismo número."] },
        advancedStrategy: { deepCalculation: ["Contar fichas jugadas y deducir la mano enemiga."], clockManagement: ["Juego veloz."], endgameTechnique: ["Trancar la partida con seguridad de puntos."] },
        faq: [{ question: "¿Cómo funciona la tranca?", answer: "Gana el jugador con menor suma de puntos en su mano." }],
        tournament: { format: "Eliminación directa.", tieBreakers: "Duelo decisivo.", prizeDistribution: "Pago instantáneo." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Sincronía total.", fairPlayEngine: "Reparto criptográfico." }
      },
      fr: {
        title: "Dominos de Compétition",
        tagline: "Calcul Probabiliste et Blocage Stratégique",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Dédication tactique et comptage rigoureux sur jeu de Double-Six officiel."],
        rules: {
          objective: "Poser tous ses dominos en premier ou avoir le moins de points en cas de blocage.",
          setup: "28 dominos officiels, 7 dominos par joueur.",
          mechanics: ["Pose aux extrémités ouvertes de la chaîne."],
          victoryConditions: ["Poser son dernier domino ou remporter le blocage."]
        },
        beginner: { coreTips: ["Évacuez vos doubles lourds au début.", "Gardez un éventail de chiffres."], commonMistakes: ["Garder des dominos à forts points."] },
        strategy: { openingPrinciples: ["Ouvrir avec le plus fort double."], tacticalPatterns: ["Mémoriser les passes de l'adversaire."], midgameCoordination: ["Fermer les deux bouts sur le même chiffre."] },
        advancedStrategy: { deepCalculation: ["Reconstitution intégrale de la main adverse."], clockManagement: ["Rythme soutenu."], endgameTechnique: ["Blocage calculé au millimètre."] },
        faq: [{ question: "Comment est compté le blocage ?", answer: "Le joueur totalisant le plus faible nombre de points gagne." }],
        tournament: { format: "Tournoi éliminatoire.", tieBreakers: "Manche décisive.", prizeDistribution: "Règlement automatique." },
        livePlay: { matchmaking: "Score GSS.", latencyProtection: "Validation serveur.", fairPlayEngine: "Distribution aléatoire sécurisée." }
      },
      hi: {
        title: "प्रतियोगी डोमिनोज़ (Dominoes)",
        tagline: "गणितीय संभावना और रणनीतिक बोर्ड ब्लॉकिंग",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["28 टाइलों के साथ दिमाग और याददाश्त की परीक्षा।"],
        rules: {
          objective: "सभी टाइलें पहले खत्म करना या ब्लॉक होने पर सबसे कम अंक रखना।",
          setup: "प्रत्येक खिलाड़ी को 7 टाइलें मिलती हैं।",
          mechanics: ["समान अंकों को मिलाना और विरोधी को चाल से रोकना।"],
          victoryConditions: ["सभी टाइलें समाप्त करना या कम स्कोर होना।"]
        },
        beginner: { coreTips: ["बड़ी टाइलें पहले चलें।", "हाथ में अलग-अलग नंबर रखें।"], commonMistakes: ["भारी टाइलें अंत तक बचा कर रखना।"] },
        strategy: { openingPrinciples: ["बड़े डबल से शुरुआत करें।"], tacticalPatterns: ["विरोधी की कमजोर टाइल का अनुमान लगाएं।"], midgameCoordination: ["दोनों तरफ एक ही अंक बनाना।"] },
        advancedStrategy: { deepCalculation: ["सभी 28 टाइलों का हिसाब रखना।"], clockManagement: ["तेज प्रतिक्रिया।"], endgameTechnique: ["सोच-समझकर गेम ब्लॉक करना।"] },
        faq: [{ question: "ब्लॉक होने पर क्या होता है?", answer: "कम अंकों वाला खिलाड़ी जीतता है।" }],
        tournament: { format: "नॉकआउट मैच।", tieBreakers: "टाई-ब्रेकर गेम।", prizeDistribution: "स्वचालित भुगतान।" },
        livePlay: { matchmaking: "कौशल आधारित रैंकिंग।", latencyProtection: "तेज़ सर्वर।", fairPlayEngine: "सुरक्षित शफ़ल।" }
      }
    }
  },

  backgammon: {
    id: "backgammon",
    slug: "backgammon",
    turnModel: "ALTERNATING",
    defaultDuration: "5m - 12m",
    locales: {
      ar: {
        title: "طاولة الزهر التنافسية (Backgammon)",
        tagline: "أعرق ألعاب الشرق في إدارة المخاطر وتأمين الأقراص",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["طاولة الزهر تجمع بين التكيف الاستراتيجي مع رميات النرد المشفرة وإدارة سباق القطع وحماية الأقراص الفردية (Blots)."],
        rules: {
          objective: "تحريك جميع أقراصك الـ 15 إلى الدار الخاصة بك وإخراجها (Bearing Off) قبل الخصم.",
          setup: "15 قرصاً لكل لاعب موزعة هندسياً على 24 مثلثاً (نقاط).",
          mechanics: ["التحرك وفق رمية النرد، ضرب الأقراص المفردة وإرسالها للعارضة (Bar)، والتجميع والإخراج."],
          victoryConditions: ["إخراج جميع الأقراص الـ 15 (فوز عادي أو مارس/Gammon أو كوز/Backgammon)."]
        },
        beginner: { coreTips: ["ابنِ أبراجاً (Anchors) في دار الخصم لتأمين خروج أقراصك.", "تجنب ترك أقراص منفردة في مرمى نرد الخصم."], commonMistakes: ["الاندفاع السريع دون حماية خطوط الإمداد."] },
        strategy: { openingPrinciples: ["السيطرة على النقطة الخامسة (Golden Point) والنقطة الرابعة."], tacticalPatterns: ["بناء الجدران (Primes) لمحاصرة أقراص الخصم الخلفية."], midgameCoordination: ["حساب نقاط السباق (Pip Count) لمعرفة متى تختار الهجوم أو الهروب."] },
        advancedStrategy: { deepCalculation: ["حساب احتمالات الرميات الـ 36 لكل ضربة محتملة."], clockManagement: ["التخطيط لحركات النرد مسبقاً."], endgameTechnique: ["الإخراج السريع الآمن للقطع دون التسبب في ضربات متأخرة."] },
        faq: [{ question: "كيف نضمن عدالة رمي النرد؟", answer: "تستخدم المنصة مولداً رقمياً مشفراً غير قابل للتلاعب (Cryptographic RNG) يضمن عشوائية فيزيائية عادلة." }],
        tournament: { format: "مباريات متعددة النقاط (Match Play).", tieBreakers: "نقطة حاسمة.", prizeDistribution: "تسوية فورية." },
        livePlay: { matchmaking: "توفيق بالرتبة.", latencyProtection: "حساب حركة متزامن.", fairPlayEngine: "مراقبة نزاهة النرد." }
      },
      en: {
        title: "Competitive Backgammon",
        tagline: "Ancient Mastery of Probability, Anchors, and Race Calculation",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Fast-paced strategic race governed by cryptographic RNG dice and tactical blocking."],
        rules: {
          objective: "Move all 15 checkers into your home board and bear them off before your opponent.",
          setup: "15 checkers per player distributed across 24 triangular points.",
          mechanics: ["Movement by dice rolls, hitting blots to the bar, and bearing off."],
          victoryConditions: ["First to bear off all 15 checkers (Single, Gammon, or Backgammon)."]
        },
        beginner: { coreTips: ["Establish anchors in enemy home boards.", "Avoid leaving single blots within direct roll range."], commonMistakes: ["Overextending without building primes."] },
        strategy: { openingPrinciples: ["Fight for the 5-point (Golden Point) and 4-point."], tacticalPatterns: ["Construct 6-point primes to create insurmountable walls."], midgameCoordination: ["Constantly calculate your Pip Count."] },
        advancedStrategy: { deepCalculation: ["Calculate odds based on all 36 dice combinations."], clockManagement: ["Pre-calculate standard moves."], endgameTechnique: ["Efficient bearing off without creating late-game vulnerabilities."] },
        faq: [{ question: "Is the dice roll fair?", answer: "Nizalo uses provably fair cryptographic RNG algorithms for every roll." }],
        tournament: { format: "Multi-point matches.", tieBreakers: "Deciding point game.", prizeDistribution: "Direct wallet credit." },
        livePlay: { matchmaking: "ELO skill matching.", latencyProtection: "Server-side state control.", fairPlayEngine: "Anti-bot telemetry." }
      },
      zh: {
        title: "竞技西洋双陆棋 (Backgammon)",
        tagline: "古老棋艺与概率学管理的完美融合",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["基于密码学真随机数掷骰的高速竞速棋盘博弈。"],
        rules: {
          objective: "将己方全部15枚棋子移入内盘并率先全部走空（Bearing Off）。",
          setup: "双方各执15枚棋子分布在24个尖刀三角形上。",
          mechanics: ["依骰子点数移动，击打孤子（Blot）送上中央界栏。"],
          victoryConditions: ["率先走空全部棋子。"]
        },
        beginner: { coreTips: ["占领敌方内盘锚点，避免孤子被击打。"], commonMistakes: ["盲目冒进未建立连续封锁壁。"] },
        strategy: { openingPrinciples: ["抢占黄金5点。"], tacticalPatterns: ["构建六联封锁壁（Prime）。"], midgameCoordination: ["严密计算步数计数（Pip Count）。"] },
        advancedStrategy: { deepCalculation: ["心算全部36种掷骰概率。"], clockManagement: ["熟练掌握标准开局下法。"], endgameTechnique: ["安全走空防止被反咬。"] },
        faq: [{ question: "骰子是否公平？", answer: "平台使用工业级密码学随机数发生器确保绝对公正。" }],
        tournament: { format: "多局积分赛。", tieBreakers: "决胜局加赛。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "技能匹配。", latencyProtection: "零延迟体验。", fairPlayEngine: "全天候作弊监控。" }
      },
      es: {
        title: "Backgammon Clásico",
        tagline: "Maestría en Probabilidad, Anclas y Carrera de Fichas",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Carrera estratégica gobernada por dados criptográficos y defensas calculadas."],
        rules: {
          objective: "Llevar las 15 fichas al tablero propio y sacarlas antes que el rival.",
          setup: "15 fichas por jugador en 24 puntos triangulares.",
          mechanics: ["Movimiento según dados, captura de fichas descubiertas al centro y extracción."],
          victoryConditions: ["Sacar todas las fichas primero."]
        },
        beginner: { coreTips: ["Construya anclas en casa rival.", "No deje fichas solas al alcance de tiro."], commonMistakes: ["Avanzar sin proteger la retaguardia."] },
        strategy: { openingPrinciples: ["Controlar el punto 5 dorado."], tacticalPatterns: ["Crear muros de seis puntos consecutivos."], midgameCoordination: ["Controlar la cuenta de pips."] },
        advancedStrategy: { deepCalculation: ["Calcular sobre las 36 combinaciones de dados."], clockManagement: ["Movimientos automáticos calculados."], endgameTechnique: ["Extracción perfecta de fichas."] },
        faq: [{ question: "¿Son los dados aleatorios?", answer: "Sí, generados mediante algoritmos criptográficos verificables." }],
        tournament: { format: "Partidas por puntos.", tieBreakers: "Mano decisiva.", prizeDistribution: "Pago en cuenta." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Reloj preciso.", fairPlayEngine: "Juego limpio." }
      },
      fr: {
        title: "Backgammon de Compétition",
        tagline: "L'Art Millénaire des Probabilités et de la Course de Pions",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Course tactique opposant deux joueurs sous arbitrage de dés cryptographiques."],
        rules: {
          objective: "Rapatrier ses 15 pions dans son jan intérieur et les sortir avant l'adversaire.",
          setup: "15 pions par joueur répartis sur 24 flèches.",
          mechanics: ["Lancer de dés, frappe des pions isolés et sortie des pions."],
          victoryConditions: ["Sortie des 15 pions en premier."]
        },
        beginner: { coreTips: ["Établissez des ancrages chez l'adversaire.", "Évitez les pions découverts."], commonMistakes: ["Courir trop tôt sans structure."] },
        strategy: { openingPrinciples: ["Prendre le point 5 d'or."], tacticalPatterns: ["Construire un prime de 6 flèches."], midgameCoordination: ["Calcul permanent du pip count."] },
        advancedStrategy: { deepCalculation: ["Probabilités sur 36 combinaisons."], clockManagement: ["Jeu rapide sur les coups forcés."], endgameTechnique: ["Sortie des pions sans laisser de blot."] },
        faq: [{ question: "Les lancers de dés sont-ils impartiaux ?", answer: "Absolument, générés par un RNG cryptographique certifié." }],
        tournament: { format: "Matchs aux points.", tieBreakers: "Manche décisive.", prizeDistribution: "Paiement direct." },
        livePlay: { matchmaking: "Score de compétence.", latencyProtection: "Serveur temps réel.", fairPlayEngine: "Contrôle anti-triche." }
      },
      hi: {
        title: "प्रतियोगी बैकगैमौन (Backgammon)",
        tagline: "संभावना और पासे की चालों का प्राचीन खेल",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["क्रिप्टोग्राफिक डाइस रोल और तेज दिमाग का खेल।"],
        rules: {
          objective: "अपने सभी 15 गोटियों को होम बोर्ड में लाकर पहले बाहर निकालना।",
          setup: "24 त्रिभुजों पर 15-15 गोटियां।",
          mechanics: ["पासे के अनुसार चाल चलना, अकेली गोटी को काटना।"],
          victoryConditions: ["सभी 15 गोटियों को सबसे पहले बोर्ड से निकालना।"]
        },
        beginner: { coreTips: ["विरोधी के क्षेत्र में मजबूत आधार बनाएं।", "गोटियों को अकेला न छोड़ें।"], commonMistakes: ["सुरक्षा के बिना आगे बढ़ना।"] },
        strategy: { openingPrinciples: ["मुख्य 5-पॉइंट पर कब्जा।"], tacticalPatterns: ["लगातार 6 पॉइंट्स की दीवार बनाना।"], midgameCoordination: ["पिप काउंट की गणना।"] },
        advancedStrategy: { deepCalculation: ["पासे के 36 संयोजनों का हिसाब।"], clockManagement: ["समय का सही उपयोग।"], endgameTechnique: ["सुरक्षित तरीके से गोटियां निकालना।"] },
        faq: [{ question: "क्या पासा निष्पक्ष है?", answer: "हाँ, पूरी तरह से सुरक्षित और निष्पक्ष RNG द्वारा पासा फेंका जाता है।" }],
        tournament: { format: "पॉइंट मैच।", tieBreakers: "निर्णायक गेम।", prizeDistribution: "स्वचालित भुगतान।" },
        livePlay: { matchmaking: "निष्पक्ष रेटिंग।", latencyProtection: "तेज चालें।", fairPlayEngine: "धोखाधड़ी से सुरक्षा।" }
      }
    }
  },

  seega: {
    id: "seega",
    slug: "seega",
    turnModel: "ALTERNATING",
    defaultDuration: "3m - 6m",
    locales: {
      ar: {
        title: "لعبة سيجة التنافسية (Seega)",
        tagline: "جوهرة ألعاب الذكاء الفرعونية والنوبية القديمة",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["سيجة هي لعبة استراتيجية مصرية ونوبية عريقة تقوم على رقعة 5x5، حيث يتم إنزال القطع أولاً ثم محاصرة قطع الخصم بين قطعتين."],
        rules: {
          objective: "أسر جميع قطع الخصم عبر مبدأ الأسر بالحصر (Custodial Capture).",
          setup: "12 حجراً لكل لاعب على رقعة 5x5 مع بقاء الخانة المركزية فارغة في البداية.",
          mechanics: ["مرحلة الإنزال بالتناوب (قطعتان لكل دور)، ثم مرحلة التحرك المتعامد وأسر القطع المحصورة."],
          victoryConditions: ["أسر جميع حجارة الخصم أو حصاره بالكامل."]
        },
        beginner: { coreTips: ["ضع حجارتك في مرحلة الإنزال بالقرب من الخانات المركزية.", "احذر من إدخال حجرك بين حجرين للخصم إلا إذا كان ذلك مقصوداً."], commonMistakes: ["ترك الخانة المركزية للخصم دون منافسة."] },
        strategy: { openingPrinciples: ["التوزيع المتوازن للحجارة لتفادي التعرض للأسر في النقلة الأولى."], tacticalPatterns: ["الأسر المتسلسل (Chain Capture) في نفس الدور عند فتح مسار جديد."], midgameCoordination: ["السيطرة على المربع المركزي المحمي."] },
        advancedStrategy: { deepCalculation: ["توقع مسارات الأسر المتعددة قبل فتح الخانات."], clockManagement: ["التخطيط لحركة الإنزال المسبقة."], endgameTechnique: ["تضييق الخناق على آخر حجارة الخصم."] },
        faq: [{ question: "هل الخانة المركزية تحمي الحجر؟", answer: "نعم، الحجر الموجود في المربع المركزي محمي ولا يجوز أسره داخله." }],
        tournament: { format: "إقصاء مباشر سريع.", tieBreakers: "جولة حاسمة.", prizeDistribution: "تسوية مباشرة." },
        livePlay: { matchmaking: "تقييم المهارة.", latencyProtection: "سيرفر فوري.", fairPlayEngine: "حماية تامة." }
      },
      en: {
        title: "Competitive Seega",
        tagline: "The Ancient Egyptian & Nubian Tactical Board Game",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Classic Nubian and ancient Egyptian strategic game played on a 5x5 grid with custodial capture."],
        rules: {
          objective: "Capture all enemy stones through custodial flanking.",
          setup: "12 stones each on a 5x5 grid with empty central sanctuary.",
          mechanics: ["Drop phase (2 stones per turn), followed by orthogonal moves and surrounding captures."],
          victoryConditions: ["Eliminating all enemy pieces."]
        },
        beginner: { coreTips: ["Place opening stones close to central lines.", "Control the center sanctuary."], commonMistakes: ["Leaving isolated stones vulnerable to flank traps."] },
        strategy: { openingPrinciples: ["Balanced drop distribution."], tacticalPatterns: ["Chain captures across multiple flanks."], midgameCoordination: ["Sanctuary defense."] },
        advancedStrategy: { deepCalculation: ["Calculate chain capture reactions."], clockManagement: ["Swift placement moves."], endgameTechnique: ["Cornering remaining stones."] },
        faq: [{ question: "Is the center square protected?", answer: "Yes, a stone occupying the central altar is safe from capture." }],
        tournament: { format: "Single elimination.", tieBreakers: "Sudden death.", prizeDistribution: "Instant credit." },
        livePlay: { matchmaking: "Skill score matching.", latencyProtection: "Fast sync.", fairPlayEngine: "Anti-bot monitoring." }
      },
      zh: {
        title: "古埃及塞加棋 (Seega)",
        tagline: "跨越千年的尼罗河智力博弈之宝",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["源自古埃及与努比亚的5x5夹吃策略棋盘竞技。"],
        rules: {
          objective: "通过夹吃机制消灭对手全部棋子。",
          setup: "5x5棋盘，双方各12枚棋子，中央天元开局留空。",
          mechanics: ["落子阶段与走子阶段，两端夹击即完成吃子。"],
          victoryConditions: ["吃光对手所有棋子。"]
        },
        beginner: { coreTips: ["抢占中央圣坛附近位置。"], commonMistakes: ["单兵孤立被夹击。"] },
        strategy: { openingPrinciples: ["阵型平衡落子。"], tacticalPatterns: ["连续多重夹吃。"], midgameCoordination: ["控制中央避难所。"] },
        advancedStrategy: { deepCalculation: ["计算多步夹吃分支。"], clockManagement: ["迅速落子。"], endgameTechnique: ["围堵对手残余棋子。"] },
        faq: [{ question: "中央格是否有保护？", answer: "是的，停在中央格的棋子处于保护状态不会被夹吃。" }],
        tournament: { format: "淘汰赛制。", tieBreakers: "加时赛。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "ELO 匹配。", latencyProtection: "毫秒同步。", fairPlayEngine: "公平风控。" }
      },
      es: {
        title: "Seega Clásico",
        tagline: "La Joya Estratégica del Antiguo Egipto y Nubia",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Juego táctico ancestral en tablero 5x5 con mecánicas de captura por flanqueo."],
        rules: {
          objective: "Capturar todas las piedras enemigas atrapándolas entre dos piezas propias.",
          setup: "12 fichas por bando en tablero de 5x5 con casilla central libre.",
          mechanics: ["Fase de colocación y fase de movimiento ortogonal con captura de custodia."],
          victoryConditions: ["Capturar todas las piezas rivales."]
        },
        beginner: { coreTips: ["Domine las cercanías del santuario central."], commonMistakes: ["Fichas desprotegidas en bandas."] },
        strategy: { openingPrinciples: ["Colocación estratégica balanceada."], tacticalPatterns: ["Capturas en cadena."], midgameCoordination: ["Defensa central."] },
        advancedStrategy: { deepCalculation: ["Cálculo de aperturas y capturas múltiples."], clockManagement: ["Respuesta ágil."], endgameTechnique: ["Acorralamiento de piezas."] },
        faq: [{ question: "¿Es segura la casilla central?", answer: "Sí, una piedra en el centro no puede ser capturada." }],
        tournament: { format: "Eliminación directa.", tieBreakers: "Mano rápida.", prizeDistribution: "Acreditación directa." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Sincronía total.", fairPlayEngine: "Juego limpio." }
      },
      fr: {
        title: "Seega Égyptien",
        tagline: "Le Trésor Tactique Ancestral des Bords du Nil",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Jeu de réflexion nubien et égyptien sur grille 5x5 avec prise par encadrement."],
        rules: {
          objective: "Capturer tous les pions adverses par prise en tenaille.",
          setup: "12 pions chacun sur grille 5x5 avec centre libre.",
          mechanics: ["Phase de pose puis phase de déplacement orthogonal."],
          victoryConditions: ["Prise intégrale des pions adverses."]
        },
        beginner: { coreTips: ["Approchez-vous du centre dès la pose."], commonMistakes: ["Pions isolés pris en sandwich."] },
        strategy: { openingPrinciples: ["Équilibre spatial de pose."], tacticalPatterns: ["Prises en chaîne spectaculaires."], midgameCoordination: ["Contrôle du sanctuaire."] },
        advancedStrategy: { deepCalculation: ["Anticipation des combinaisons d'encadrement."], clockManagement: ["Exécution rapide."], endgameTechnique: ["Enfermement final."] },
        faq: [{ question: "La case centrale est-elle protégée ?", answer: "Oui, un pion sur la case centrale est invulnérable." }],
        tournament: { format: "Élimination directe.", tieBreakers: "Manche décisive.", prizeDistribution: "Paiement direct." },
        livePlay: { matchmaking: "Score GSS.", latencyProtection: "Temps réel.", fairPlayEngine: "Anti-triche." }
      },
      hi: {
        title: "प्रतियोगी सीगा (Seega)",
        tagline: "प्राचीन मिस्र और नूबिया का ऐतिहासिक दिमागी खेल",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["5x5 ग्रिड पर घेराबंदी और रणनीति का अनूठा खेल।"],
        rules: {
          objective: "विरोधी की सभी गोटियों को दो गोटियों के बीच फंसाकर काटना।",
          setup: "5x5 बोर्ड पर 12-12 गोटियां, केंद्र खाली।",
          mechanics: ["पहले गोटियां रखना, फिर चाल चलना और घेरकर काटना।"],
          victoryConditions: ["विरोधी की सभी गोटियां खत्म करना।"]
        },
        beginner: { coreTips: ["केंद्र के पास गोटियां रखें।"], commonMistakes: ["गोटियों को अकेला छोड़ना।"] },
        strategy: { openingPrinciples: ["संतुलित प्लेसमेंट।"], tacticalPatterns: ["लगातार कई गोटियां काटना।"], midgameCoordination: ["केंद्र की सुरक्षा।"] },
        advancedStrategy: { deepCalculation: ["चालों की पूर्व-गणना।"], clockManagement: ["तेज चालें।"], endgameTechnique: ["अंतिम गोटियों को घेरना।"] },
        faq: [{ question: "क्या केंद्र सुरक्षित है?", answer: "हाँ, केंद्र में स्थित गोटी को काटा नहीं जा सकता।" }],
        tournament: { format: "नॉकआउट प्रारूप।", tieBreakers: "टाई-ब्रेकर।", prizeDistribution: "तुरंत वॉलेट में।" },
        livePlay: { matchmaking: "कौशल आधारित।", latencyProtection: "कम लेटेंसी।", fairPlayEngine: "सुरक्षित खेल।" }
      }
    }
  },

  "connect-four": {
    id: "connect-four",
    slug: "connect-four",
    turnModel: "ALTERNATING",
    defaultDuration: "2m - 5m",
    locales: {
      ar: {
        title: "كونكت 4 التنافسية (Connect Four)",
        tagline: "صراع الأعمدة العمودية والخطوط الرباعية القاتلة",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["لعبة ربط 4 أقراص عمودياً أو أفقياً أو قطرياً في شبكة 7 أعمدة و6 صفوف مع حساب دقيق للجاذبية."],
        rules: {
          objective: "تكوين خط مستقيم متصل من 4 أقراص من لونك قبل الخصم.",
          setup: "شبكة عمودية 7x6 فارغة وأقراص ذهبية وخضراء نيون.",
          mechanics: ["إسقاط الأقراص في الأعمدة بفعل الجاذبية بالتناوب."],
          victoryConditions: ["أول من يكون خطاً من 4 أقراص."]
        },
        beginner: { coreTips: ["ابدأ دائماً بإسقاط قرصك في العمود الأوسط (العمود 4).", "انتبه لخطوط الخصم الثلاثية وامنعها فوراً."], commonMistakes: ["عدم الانتباه للأوتار القطرية الصاعدة."] },
        strategy: { openingPrinciples: ["السيطرة على العمود الأوسط يمنحك فرص اتصال في جميع الاتجاهات."], tacticalPatterns: ["بناء الفخاخ المزدوجة (Double Threats) في صفوف مختلفة."], midgameCoordination: ["التحكم في ارتفاع الأعمدة الفردية والزوجية."] },
        advancedStrategy: { deepCalculation: ["حساب نظرية الأرقام الفردية والزوجية للتحكم في النقلات الأخيرة."], clockManagement: ["الرد الفوري على التهديدات المباشرة."], endgameTechnique: ["إجبار الخصم على النزول في خانة تمنحك الفوز."] },
        faq: [{ question: "هل العمود الأوسط حاسم في الفوز؟", answer: "نعم، رياضياً يمنح العمود الأوسط أعلى نسبة فرص هجومية في اللعبة." }],
        tournament: { format: "إقصاء سريع.", tieBreakers: "مباراة خاطفة.", prizeDistribution: "فوري." },
        livePlay: { matchmaking: "ELO سريع.", latencyProtection: "سيرفر موثوق.", fairPlayEngine: "حماية محركات." }
      },
      en: {
        title: "Competitive Connect Four",
        tagline: "The Vertical Battle of Gravity, Traps, and Four-in-a-Row Lines",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["High-speed mathematical duel on a 7x6 vertical gravity grid."],
        rules: {
          objective: "Be the first to connect four checkers horizontally, vertically, or diagonally.",
          setup: "7 columns by 6 rows vertical matrix with gravity drop.",
          mechanics: ["Alternating token drops into valid columns."],
          victoryConditions: ["Four aligned checkers."]
        },
        beginner: { coreTips: ["Always claim the center column early.", "Block three-in-a-row threats immediately."], commonMistakes: ["Missing diagonal alignments."] },
        strategy: { openingPrinciples: ["Center column domination."], tacticalPatterns: ["Double-threat traps that cannot be blocked simultaneously."], midgameCoordination: ["Odd/even column parity control."] },
        advancedStrategy: { deepCalculation: ["Parity calculations for final row sweeps."], clockManagement: ["Rapid defensive reflex."], endgameTechnique: ["Forcing Zugzwang moves."] },
        faq: [{ question: "Why is column 4 so vital?", answer: "Column 4 participates in the maximum possible winning combinations." }],
        tournament: { format: "Single elimination.", tieBreakers: "Blitz match.", prizeDistribution: "Ledger credit." },
        livePlay: { matchmaking: "Fast ELO pairing.", latencyProtection: "Realtime drop engine.", fairPlayEngine: "Solver protection." }
      },
      zh: {
        title: "竞技四子棋 (Connect Four)",
        tagline: "重力与四连珠维度的极速空间算力博弈",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["7x6垂直重力网格上的极速四连珠数学竞技。"],
        rules: { objective: "率先将四枚己方棋子连成横、竖或斜线。", setup: "7列6行重力棋盘。", mechanics: ["轮流下落棋子。"], victoryConditions: ["四子相连。"] },
        beginner: { coreTips: ["开局必占第4列中心位。", "及时阻截对手三连。"], commonMistakes: ["忽视斜向连线隐患。"] },
        strategy: { openingPrinciples: ["掌控中心列。"], tacticalPatterns: ["制造双重必胜陷阱。"], midgameCoordination: ["奇偶位掌控。"] },
        advancedStrategy: { deepCalculation: ["奇偶位数学推演。"], clockManagement: ["极速防守。"], endgameTechnique: ["逼迫对手入局。"] },
        faq: [{ question: "为什么第4列最关键？", answer: "第4列参与的四连组合数量最多。" }],
        tournament: { format: "极速淘汰赛。", tieBreakers: "决胜局。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "技能匹配。", latencyProtection: "超低延迟。", fairPlayEngine: "防脚本监控。" }
      },
      es: {
        title: "Conecta 4 Competitivo",
        tagline: "Batalla Vertical de Gravedad y Líneas de Cuatro Fichas",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Duelo vertical en una rejilla de 7 columnas y 6 filas con caída por gravedad."],
        rules: { objective: "Conectar cuatro fichas en línea recta.", setup: "Matriz 7x6.", mechanics: ["Inserción de fichas alternada."], victoryConditions: ["Línea de 4."] },
        beginner: { coreTips: ["Controle la columna central.", "Bloquee tres en línea inmediatamente."], commonMistakes: ["Descuidar las diagonales."] },
        strategy: { openingPrinciples: ["Dominio central."], tacticalPatterns: ["Amenazas dobles simultáneas."], midgameCoordination: ["Control de paridad."] },
        advancedStrategy: { deepCalculation: ["Cálculo de paridad."], clockManagement: ["Reflejos rápidos."], endgameTechnique: ["Forzar jugadas del rival."] },
        faq: [{ question: "¿Por qué la columna 4 es vital?", answer: "Contiene la mayor cantidad de combinaciones ganadoras." }],
        tournament: { format: "Eliminación.", tieBreakers: "Partida relámpago.", prizeDistribution: "Pago directo." },
        livePlay: { matchmaking: "ELO en vivo.", latencyProtection: "Sincronía total.", fairPlayEngine: "Seguridad anti-bots." }
      },
      fr: {
        title: "Puissance 4 Compétitif",
        tagline: "Le Défi Vertical de Gravité et d'Alignement par Quatre",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Duel stratégique rapide sur grille verticale 7x6."],
        rules: { objective: "Aligner 4 jetons de sa couleur.", setup: "Grille 7x6.", mechanics: ["Chute par gravité."], victoryConditions: ["Alignement de 4 jetons."] },
        beginner: { coreTips: ["Prenez la colonne centrale.", "Bloquez les menaces à trois."], commonMistakes: ["Oublier les diagonales montantes."] },
        strategy: { openingPrinciples: ["Maîtrise du centre."], tacticalPatterns: ["Pièges à double menace."], midgameCoordination: ["Gestion de la parité."] },
        advancedStrategy: { deepCalculation: ["Calculs de parité."], clockManagement: ["Jeu réflexe."], endgameTechnique: ["Zugzwang vertical."] },
        faq: [{ question: "Pourquoi la colonne 4 est cruciale ?", answer: "Elle offre le plus grand potentiel de lignes gagnantes." }],
        tournament: { format: "Élimination rapide.", tieBreakers: "Manche flash.", prizeDistribution: "Automatisé." },
        livePlay: { matchmaking: "Matchmaking ELO.", latencyProtection: "Zéro latence.", fairPlayEngine: "Contrôle équitable." }
      },
      hi: {
        title: "प्रतियोगी कनेक्ट 4 (Connect Four)",
        tagline: "ग्रेविटी और 4-इन-ए-रो की रोमांचक लड़ाई",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["7x6 ग्रिड पर चार गोटियां एक सीध में लाने का तेज खेल।"],
        rules: { objective: "क्षैतिज, लंबवत या तिरछे 4 गोटियां जोड़ना।", setup: "7x6 बोर्ड।", mechanics: ["ऊपर से गोटियां गिराना।"], victoryConditions: ["4 गोटियां एक लाइन में।"] },
        beginner: { coreTips: ["बीच की 4थी कॉलम पर कब्जा करें।", "विरोधी की 3 गोटियों को तुरंत रोकें।"], commonMistakes: ["तिरछी लाइनों को भूल जाना।"] },
        strategy: { openingPrinciples: ["सेंटर कॉलम का महत्व।"], tacticalPatterns: ["दोहरा खतरा (Double Trap) बनाना।"], midgameCoordination: ["ऊंचाई का नियंत्रण।"] },
        advancedStrategy: { deepCalculation: ["सटीक चालों का अनुमान।"], clockManagement: ["तेज प्रतिक्रिया।"], endgameTechnique: ["विरोधी को मजबूर करना।"] },
        faq: [{ question: "कॉलम 4 इतना महत्वपूर्ण क्यों है?", answer: "क्योंकि यह सबसे अधिक जीतने वाले संयोजन प्रदान करता है।" }],
        tournament: { format: "नॉकआउट गेम।", tieBreakers: "टाई-ब्रेकर।", prizeDistribution: "सीधा भुगतान।" },
        livePlay: { matchmaking: "ELO मिलान।", latencyProtection: "सुपर फास्ट।", fairPlayEngine: "सुरक्षित खेल।" }
      }
    }
  },

  xo: {
    id: "xo",
    slug: "xo",
    turnModel: "ALTERNATING",
    defaultDuration: "1m - 3m",
    locales: {
      ar: {
        title: "إكس أو التنافسية (XO / Tic-Tac-Toe)",
        tagline: "حرب الأعصاب الفورية على شبكة الليزر ثلاثية الأبعاد",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["أسرع مواجهة ذهنية؛ تتطلب دقة كاملة ورد فعل فوري لمنع أي ثغرة تكتيكية."],
        rules: { objective: "تكوين خط ثلاثي (X أو O).", setup: "شبكة 3x3.", mechanics: ["وضع العلامة بالتناوب."], victoryConditions: ["3 علامات متصلة أو انتهاء وقت الخصم."] },
        beginner: { coreTips: ["ابدأ بالزاوية أو المركز."], commonMistakes: ["إعطاء الخصم زوايا متقابلة مجاناً."] },
        strategy: { openingPrinciples: ["فخ الشوكة المزدوجة (Fork Trap)."], tacticalPatterns: ["الهجوم على زاويتين متجاورتين."], midgameCoordination: ["إجبار الخصم على الدفاع المستمر."] },
        advancedStrategy: { deepCalculation: ["حفظ شجرة الحالات الـ 9 بالكامل."], clockManagement: ["نقلات خلال أجزاء من الثانية."], endgameTechnique: ["استدراج الخصم للخطأ تحت ضغط الساعة."] },
        faq: [{ question: "هل تنتهي كل المباريات بالتعادل بين المحترفين؟", answer: "في الألعاب ذات التوقيت السريع الخاطف، يحسم عامل السرعة والضغط النفسي النتيجة." }],
        tournament: { format: "مباريات خاطفة سريعة.", tieBreakers: "نقطة الموت المفاجئ.", prizeDistribution: "فوري." },
        livePlay: { matchmaking: "توفيق فوري.", latencyProtection: "استجابة فائقة.", fairPlayEngine: "حماية تامة." }
      },
      en: {
        title: "Competitive XO (Tic-Tac-Toe)",
        tagline: "High-Octane Reflex and Fork Tactics on a 3x3 Cyber Grid",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Fastest mental duel demanding instantaneous pattern recognition and speed."],
        rules: { objective: "Align three markers in a row.", setup: "3x3 matrix.", mechanics: ["Alternating marker placement."], victoryConditions: ["Three in a line or opponent timeout."] },
        beginner: { coreTips: ["Control corners and the center square."], commonMistakes: ["Allowing double fork traps."] },
        strategy: { openingPrinciples: ["Corner openings for maximal fork potential."], tacticalPatterns: ["Two-way fork attacks."], midgameCoordination: ["Forcing defensive replies."] },
        advancedStrategy: { deepCalculation: ["Perfect knowledge of all 9 board states."], clockManagement: ["Sub-second execution."], endgameTechnique: ["Time pressure wins."] },
        faq: [{ question: "Can you win under time pressure?", answer: "Yes, speed-chess style blitz clocks turn micro-mistakes into instant wins." }],
        tournament: { format: "Fast elimination blitz.", tieBreakers: "Sudden death.", prizeDistribution: "Ledger credit." },
        livePlay: { matchmaking: "Instant pairing.", latencyProtection: "Zero latency.", fairPlayEngine: "Strict fair play." }
      },
      zh: {
        title: "竞技井字棋 (XO / Tic-Tac-Toe)",
        tagline: "3x3赛博网格上的极限反应与双杀分叉战术",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["极速智力对抗，考验心理抗压能力与毫秒级防守本能。"],
        rules: { objective: "连成三子一线。", setup: "3x3网格。", mechanics: ["轮流下子。"], victoryConditions: ["三子一线或对手超时。"] },
        beginner: { coreTips: ["抢占角落或中心。"], commonMistakes: ["被对手做出双杀叉子。"] },
        strategy: { openingPrinciples: ["角开局制造双杀。"], tacticalPatterns: ["双角两端夹击。"], midgameCoordination: ["强制防守。"] },
        advancedStrategy: { deepCalculation: ["全盘9格博弈树完全掌握。"], clockManagement: ["毫秒级操作。"], endgameTechnique: ["时钟压制。"] },
        faq: [{ question: "真的能在井字棋决出胜负吗？", answer: "在极速时钟压迫下，对手微小失误即可转化为致命胜势。" }],
        tournament: { format: "极限快棋赛。", tieBreakers: "一局定胜负。", prizeDistribution: "即刻到账。" },
        livePlay: { matchmaking: "即时匹配。", latencyProtection: "毫秒极速。", fairPlayEngine: "防脚本监控。" }
      },
      es: {
        title: "Tres en Raya Competitivo (XO)",
        tagline: "Duelo Mental Ultrarrápido de Reflejos y Trampas Dobles",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Enfrentamiento instantáneo donde el reloj y la precisión deciden al ganador."],
        rules: { objective: "Alinear 3 marcas.", setup: "Rejilla 3x3.", mechanics: ["Colocación por turnos."], victoryConditions: ["Línea de 3 o tiempo."] },
        beginner: { coreTips: ["Controle las esquinas."], commonMistakes: ["Permitir bifurcaciones dobles."] },
        strategy: { openingPrinciples: ["Aperturas en esquina."], tacticalPatterns: ["Creación de trampas en L."], midgameCoordination: ["Forzar defensas."] },
        advancedStrategy: { deepCalculation: ["Dominio del árbol de decisiones."], clockManagement: ["Reacción en milisegundos."], endgameTechnique: ["Presión de reloj."] },
        faq: [{ question: "¿Se puede ganar?", answer: "Bajo control de reloj estricto, los errores por prisa deciden partidas." }],
        tournament: { format: "Eliminación blitz.", tieBreakers: "Muerte súbita.", prizeDistribution: "Automático." },
        livePlay: { matchmaking: "Emparejamiento veloz.", latencyProtection: "Tiempo real.", fairPlayEngine: "Garantía de juego limpio." }
      },
      fr: {
        title: "Morpion Compétitif (XO)",
        tagline: "Rapidité Cérébrale et Pièges de Fourchette en Grille 3x3",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Duel le plus rapide de la plateforme, où le temps est une arme majeure."],
        rules: { objective: "Aligner 3 symboles.", setup: "Grille 3x3.", mechanics: ["Placement alterné."], victoryConditions: ["Alignement de 3 ou temps écoulé."] },
        beginner: { coreTips: ["Jouez les coins."], commonMistakes: ["Donner le double piège."] },
        strategy: { openingPrinciples: ["Attaque en coin."], tacticalPatterns: ["Fourchettes doubles."], midgameCoordination: ["Coups forcés."] },
        advancedStrategy: { deepCalculation: ["Mémorisation des 9 cases."], clockManagement: ["Cadence ultra-rapide."], endgameTechnique: ["Pression au chrono."] },
        faq: [{ question: "Y a-t-il des victoires ?", answer: "La cadence blitz génère des fautes directes décisives." }],
        tournament: { format: "Blitz éclair.", tieBreakers: "Mort subite.", prizeDistribution: "Direct." },
        livePlay: { matchmaking: "Instantané.", latencyProtection: "Zéro lag.", fairPlayEngine: "Intégrité garantie." }
      },
      hi: {
        title: "प्रतियोगी टिक-टैक-टो (XO)",
        tagline: "3x3 ग्रिड पर गति और रणनीति की तीव्र जंग",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["पलक झपकते ही निर्णय लेने वाला तीव्र दिमागी खेल।"],
        rules: { objective: "लगातार 3 X या O बनाना।", setup: "3x3 ग्रिड।", mechanics: ["बारी-बारी से मार्क लगाना।"], victoryConditions: ["3 की लाइन या समय समाप्ति।"] },
        beginner: { coreTips: ["कोनों और केंद्र पर ध्यान दें।"], commonMistakes: ["डबल ट्रैप बनने देना।"] },
        strategy: { openingPrinciples: ["कोने से शुरुआत।"], tacticalPatterns: ["दो तरफा खतरा।"], midgameCoordination: ["विरोधी को रोकना।"] },
        advancedStrategy: { deepCalculation: ["सभी 9 खानों की समझ।"], clockManagement: ["सेकंड से भी तेज चाल।"], endgameTechnique: ["टाइम प्रेशर जीत।"] },
        faq: [{ question: "क्या इसमें जीत संभव है?", answer: "तेज समय सीमा में छोटी सी चूक भी तुरंत जीत दिला देती है।" }],
        tournament: { format: "फास्ट टूर्नामेंट।", tieBreakers: "सडन डेथ।", prizeDistribution: "सीधा वॉलेट में।" },
        livePlay: { matchmaking: "तुरंत खेलें।", latencyProtection: "रियल-टाइम।", fairPlayEngine: "सुरक्षा।" }
      }
    }
  },

  "speed-math": {
    id: "speed-math",
    slug: "speed-math",
    turnModel: "SIMULTANEOUS",
    defaultDuration: "60s",
    locales: {
      ar: {
        title: "الحساب السريع (Speed Math)",
        tagline: "ساعة النبض الرقمي وحرب الـ 60 ثانية الحسابية",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["سباق حسابي متزامن لمدة 60 ثانية؛ يحل فيه اللاعبان نفس المعادلات الحسابية بأعلى سرعة ودقة ممكنة."],
        rules: {
          objective: "تحقيق أعلى مجموع نقاط عبر حل المسائل الرياضية الصحيحة خلال 60 ثانية.",
          setup: "ساعة مشتركة تعد تنازلياً من 60 إلى 0 ثانية.",
          mechanics: ["عمليات الجمع والطرح والضرب والقسمة المتتالية مع مكافآت السلاسل (Streaks)."],
          victoryConditions: ["صاحب أعلى مجموع نقاط عند انتهاء الوقت."]
        },
        beginner: { coreTips: ["الدقة أهم من السرعة العشوائية لتجنب خصم النقاط.", "استغل الأرقام القريبة من العشرات للحل الذهني السريع."], commonMistakes: ["التخمين العشوائي."] },
        strategy: { openingPrinciples: ["الحفاظ على سلسلة الإجابات الصحيحة لمضاعفة النقاط (Multiplier)."], tacticalPatterns: ["تقسيم العمليات المعقدة إلى خطوات ذهنية سريعة."], midgameCoordination: ["الثبات الانفعالي تحت ضغط الثواني الأخيرة."] },
        advancedStrategy: { deepCalculation: ["تقنيات الحساب الذهني الفيدي (Vedic Math) والضرب التقريبي."], clockManagement: ["استثمار كل ثانية دون توقف."], endgameTechnique: ["حسم المسائل الأخيرة لتعزيز الفارق."] },
        faq: [{ question: "هل يحصل كلا اللاعبين على نفس المسائل؟", answer: "نعم، يحل كلا اللاعبين نفس السلسلة الحسابية تماماً لضمان تكافؤ الفرص بنسبة 100%." }],
        tournament: { format: "تصفيات سريعة بدقيقة واحدة.", tieBreakers: "جولة فاصلة 30 ثانية.", prizeDistribution: "تحويل فوري." },
        livePlay: { matchmaking: "توفيق GSS.", latencyProtection: "تزامن وقت حقيقي.", fairPlayEngine: "مكافحة السكريبتات والبوتات." }
      },
      en: {
        title: "Competitive Speed Math",
        tagline: "The 60-Second Mental Arithmetic Flux Matrix",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Simultaneous 60-second real-time mental calculation duel solving identical equations."],
        rules: {
          objective: "Score the highest points by accurately solving rapid arithmetic within 60 seconds.",
          setup: "Shared synchronized 60-second clock.",
          mechanics: ["Addition, subtraction, multiplication, and division with streak multipliers."],
          victoryConditions: ["Highest aggregate score at zero clock."]
        },
        beginner: { coreTips: ["Accuracy preserves streak multipliers.", "Use mental rounding tricks."], commonMistakes: ["Wild guessing penalty."] },
        strategy: { openingPrinciples: ["Build streak multipliers early."], tacticalPatterns: ["Decompose large multiplications into friendly factors."], midgameCoordination: ["Maintain calm cadence under countdown."] },
        advancedStrategy: { deepCalculation: ["Vedic mental arithmetic shortcuts."], clockManagement: ["Zero idle time between answers."], endgameTechnique: ["Sprint the final 10 seconds."] },
        faq: [{ question: "Are questions identical for both players?", answer: "Yes, both competitors receive the exact same sequence of equations." }],
        tournament: { format: "1-minute elimination brackets.", tieBreakers: "30s sudden death.", prizeDistribution: "Automated ledger." },
        livePlay: { matchmaking: "GSS skill tier matching.", latencyProtection: "Sub-millisecond input capture.", fairPlayEngine: "Anti-script keystroke analysis." }
      },
      zh: {
        title: "竞技极速心算 (Speed Math)",
        tagline: "60秒同步心算算力巅峰对决",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["60秒内双方解答完全相同算式的极速心算竞技。"],
        rules: { objective: "60秒内获得最高答题积分。", setup: "共享60秒倒计时时钟。", mechanics: ["加减乘除与连击连胜乘数（Streak Multiplier）。"], victoryConditions: ["时间截止得分最高者胜。"] },
        beginner: { coreTips: ["准确率第一，确保连胜加分。"], commonMistakes: ["盲目瞎猜导致扣分。"] },
        strategy: { openingPrinciples: ["迅速建立连击倍率。"], tacticalPatterns: ["因数分解速算法。"], midgameCoordination: ["高压下保持心率稳定。"] },
        advancedStrategy: { deepCalculation: ["印度速算与首尾乘法。"], clockManagement: ["毫秒级无缝做题。"], endgameTechnique: ["最后10秒冲刺。"] },
        faq: [{ question: "题目完全一样吗？", answer: "是的，两位选手面对完全一致的随机算式流。" }],
        tournament: { format: "1分钟淘汰赛。", tieBreakers: "30秒加赛。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "算力匹配。", latencyProtection: "即时捕捉。", fairPlayEngine: "外挂脚本防范。" }
      },
      es: {
        title: "Cálculo Rápido (Speed Math)",
        tagline: "La Matriz de Aritmética Mental en 60 Segundos",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Duelo simultáneo de 60 segundos resolviendo operaciones matemáticas idénticas."],
        rules: { objective: "Lograr la mayor puntuación en 60 segundos.", setup: "Reloj común de 60s.", mechanics: ["Sumas, restas, multiplicaciones y multiplicadores de racha."], victoryConditions: ["Mayor puntuación."] },
        beginner: { coreTips: ["Priorice la precisión sobre la velocidad ciega."], commonMistakes: ["Adivinar al azar."] },
        strategy: { openingPrinciples: ["Mantener la racha para duplicar puntos."], tacticalPatterns: ["Descomposición mental."], midgameCoordination: ["Concentración bajo el reloj."] },
        advancedStrategy: { deepCalculation: ["Técnicas védicas de cálculo mental."], clockManagement: ["Sin pausas."], endgameTechnique: ["Aceleración final."] },
        faq: [{ question: "¿Las preguntas son idénticas?", answer: "Sí, ambos jugadores resuelven la misma secuencia exacta." }],
        tournament: { format: "Eliminación de 1 minuto.", tieBreakers: "Desempate de 30s.", prizeDistribution: "Automático." },
        livePlay: { matchmaking: "GSS emparejamiento.", latencyProtection: "Ultra rápido.", fairPlayEngine: "Anti-scripts." }
      },
      fr: {
        title: "Calcul Rapide (Speed Math)",
        tagline: "Le Sprint Cérébral d'Arithmétique Mentale en 60 Secondes",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Compétition simultanée de calcul mental sur équations identiques."],
        rules: { objective: "Marquer le maximum de points en 60 secondes.", setup: "Chrono partagé de 60 secondes.", mechanics: ["Opérations avec multiplicateurs de séries (streaks)."], victoryConditions: ["Plus haut score au gong."] },
        beginner: { coreTips: ["Privilégiez la précision pour garder le combo."], commonMistakes: ["Répondre au hasard."] },
        strategy: { openingPrinciples: ["Montez le multiplicateur dès le départ."], tacticalPatterns: ["Décomposition par dizaines."], midgameCoordination: ["Maîtrise du stress."] },
        advancedStrategy: { deepCalculation: ["Raccourcis de calcul mental."], clockManagement: ["Zéro temps mort."], endgameTechnique: ["Sprint dans les 10 dernières secondes."] },
        faq: [{ question: "Les équations sont-elles les mêmes ?", answer: "Oui, la séquence d'équations est rigoureusement identique pour les deux joueurs." }],
        tournament: { format: "Élimination 1 minute.", tieBreakers: "Mort subite 30s.", prizeDistribution: "Immédiat." },
        livePlay: { matchmaking: "Classement GSS.", latencyProtection: "Temps réel pur.", fairPlayEngine: "Détection de bots." }
      },
      hi: {
        title: "प्रतियोगी स्पीड मैथ (Speed Math)",
        tagline: "60 सेकंड का तीव्र मानसिक गणितीय मुकाबला",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["60 सेकंड में दोनों खिलाड़ियों के लिए समान सवालों का मुकाबला।"],
        rules: { objective: "60 सेकंड में सबसे अधिक अंक हासिल करना।", setup: "साझा 60-सेकंड की घड़ी।", mechanics: ["जोड़, घटाव, गुणा, भाग और स्ट्रीक बोनस।"], victoryConditions: ["समय समाप्त होने पर उच्चतम स्कोर।"] },
        beginner: { coreTips: ["सटीकता पर ध्यान दें ताकि स्ट्रीक बनी रहे।"], commonMistakes: ["तुक्का लगाना।"] },
        strategy: { openingPrinciples: ["शुरुआत से स्ट्रीक बनाएं।"], tacticalPatterns: ["संख्याओं को तोड़कर हल करना।"], midgameCoordination: ["शांत दिमाग।"] },
        advancedStrategy: { deepCalculation: ["वैदिक गणित के शॉर्टकट।"], clockManagement: ["लगातार उत्तर देना।"], endgameTechnique: ["अंतिम पलों में तेजी।"] },
        faq: [{ question: "क्या दोनों के सवाल एक जैसे होते हैं?", answer: "हाँ, दोनों खिलाड़ियों को बिल्कुल समान प्रश्न मिलते हैं।" }],
        tournament: { format: "1 मिनट नॉकआउट।", tieBreakers: "30 सेकंड टाई-ब्रेकर।", prizeDistribution: "स्वचालित भुगतान।" },
        livePlay: { matchmaking: "कौशल स्कोर मिलान।", latencyProtection: "अल्ट्रा फास्ट।", fairPlayEngine: "बॉट से पूर्ण सुरक्षा।" }
      }
    }
  },

  reversi: {
    id: "reversi",
    slug: "reversi",
    turnModel: "ALTERNATING",
    defaultDuration: "3m - 7m",
    locales: {
      ar: {
        title: "ريفيرسي التنافسية (Reversi / Othello)",
        tagline: "دقيقة لتعلمها.. وحياة كاملة لإتقان تقليب الأقراص",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["لعبة تقليب الأقراص على بساط زمردي 8x8؛ تحاصر فيها أقراص الخصم لتقلبها إلى لونك في كل نقلة."],
        rules: {
          objective: "امتلاك أكبر عدد من الأقراص الملونة بلونك عند ملء الرقعة.",
          setup: "رقعة 8x8 مع 4 أقراص في المركز (اثنان ذهبيان واثنان أوبسيديان).",
          mechanics: ["وضع قرص يحاصر قرصاً أو أكثر للخصم بينه وبين قرص من نفس لونك لقلبها فوراً."],
          victoryConditions: ["أكبر عدد من الأقراص عند امتلاء الرقعة أو انعدام النقلات لكلا اللاعبين."]
        },
        beginner: { coreTips: ["سيطر على الزوايا الأربع بأي ثمن؛ فالزوايا لا يمكن قلبها أبداً.", "لا تسارع لقلب عدد كبير من الأقراص في بداية الدور."], commonMistakes: ["اللعب في المربعات المجاورة للزوايا (X-Squares و C-Squares) مما يمنح الخصم الزاوية."] },
        strategy: { openingPrinciples: ["السيطرة المركزية الهادئة وتقليل عدد الأقراص الظاهرة لتوسيع خيارات حركتك."], tacticalPatterns: ["بناء الحواف المستقرة (Stable Edges)."], midgameCoordination: ["حرمان الخصم من خيارات الحركة (Mobility Restriction)."] },
        advancedStrategy: { deepCalculation: ["حساب الأقراص المستقرة غير القابلة للقلب."], clockManagement: ["الحذر عند اختيار نقلات الحواف."], endgameTechnique: ["الاجتياح الكامل (Parity Wipe) في النقلات الأخيرة."] },
        faq: [{ question: "هل الزوايا تضمن الفوز؟", answer: "الزوايا توفر استقراراً دفاعياً كبيراً وهي أهم المربعات التكتيكية في اللعبة." }],
        tournament: { format: "إقصاء مباشر.", tieBreakers: "مباراة فاصلة.", prizeDistribution: "فوري." },
        livePlay: { matchmaking: "تقييم ELO.", latencyProtection: "مزامنة سريعة.", fairPlayEngine: "حماية محركات." }
      },
      en: {
        title: "Competitive Reversi (Othello)",
        tagline: "A Minute to Learn, a Lifetime to Master Corner Flips",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Classic disc-flipping strategy game on an 8x8 emerald matrix."],
        rules: {
          objective: "Possess the majority of discs of your color when the board is full.",
          setup: "8x8 board with four centered alternating discs.",
          mechanics: ["Outflank opponent discs horizontally, vertically, or diagonally to flip them."],
          victoryConditions: ["Highest disc count when no legal moves remain."]
        },
        beginner: { coreTips: ["Capture the four immutable corners.", "Minimize your disc count early to preserve mobility."], commonMistakes: ["Playing into C-squares or X-squares adjacent to corners."] },
        strategy: { openingPrinciples: ["Quiet interior play."], tacticalPatterns: ["Corner grabs and stable edge anchoring."], midgameCoordination: ["Mobility starvation tactics."] },
        advancedStrategy: { deepCalculation: ["Stable disc frontier analysis."], clockManagement: ["Paced calculation on edge traps."], endgameTechnique: ["Board parity sweeps."] },
        faq: [{ question: "Can corner discs ever be flipped back?", answer: "Never. Once captured, corner discs are permanently stable." }],
        tournament: { format: "Single elimination.", tieBreakers: "Blitz decider.", prizeDistribution: "Direct wallet credit." },
        livePlay: { matchmaking: "ELO skill pairing.", latencyProtection: "Server clock authority.", fairPlayEngine: "Anti-engine forensics." }
      },
      zh: {
        title: "竞技黑白棋 (Reversi / Othello)",
        tagline: "易学难精，终极角点与翻子大翻盘战术",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["8x8祖母绿棋盘上的翻子经典博弈，绝地反击往往在最后数步。"],
        rules: { objective: "棋局结束时己方颜色的棋子数量最多。", setup: "8x8棋盘中央4子交叉放置。", mechanics: ["夹住对方棋子并全部翻转为己方颜色。"], victoryConditions: ["终局时棋子最多者胜。"] },
        beginner: { coreTips: ["死守四个死角，前期尽量少翻子保行动力。"], commonMistakes: ["过早抢占危险的星位（X-Square）。"] },
        strategy: { openingPrinciples: ["内聚走子，保留走子选择。"], tacticalPatterns: ["占角稳边。"], midgameCoordination: ["剥夺对手行动力（Mobility）。"] },
        advancedStrategy: { deepCalculation: ["稳定子边界计算。"], clockManagement: ["稳健走子。"], endgameTechnique: ["终局偶数位收网。"] },
        faq: [{ question: "角上的棋子会被翻转吗？", answer: "永远不会，一旦占角即为绝对稳定子。" }],
        tournament: { format: "淘汰制锦标赛。", tieBreakers: "加赛对决。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "ELO 匹配。", latencyProtection: "毫秒级同步。", fairPlayEngine: "防外挂引擎。" }
      },
      es: {
        title: "Reversi Clásico (Otelo)",
        tagline: "Un Minuto para Aprenderlo, una Vida para Dominar las Esquinas",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Estrategia pura de volteo de fichas en tablero de 8x8."],
        rules: { objective: "Tener la mayoría de discos de tu color.", setup: "4 discos en el centro.", mechanics: ["Flanquear y voltear fichas."], victoryConditions: ["Mayor número de discos."] },
        beginner: { coreTips: ["Conquiste las cuatro esquinas inmutables.", "Minimice fichas al principio."], commonMistakes: ["Jugar en casillas X adyacentes a esquinas."] },
        strategy: { openingPrinciples: ["Juego central discreto."], tacticalPatterns: ["Bordes estables."], midgameCoordination: ["Restricción de movilidad rival."] },
        advancedStrategy: { deepCalculation: ["Análisis de fichas estables."], clockManagement: ["Paciencia en bordes."], endgameTechnique: ["Control de paridad."] },
        faq: [{ question: "¿Se pueden voltear las esquinas?", answer: "No, las esquinas capturadas son inmutables." }],
        tournament: { format: "Eliminación directa.", tieBreakers: "Partida relámpago.", prizeDistribution: "Saldo directo." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Reloj central.", fairPlayEngine: "Juego limpio." }
      },
      fr: {
        title: "Reversi / Othello Compétitif",
        tagline: "Une Minute pour Apprendre, une Vie pour Maîtriser les Coins",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Jeu de retournement de pions sur grille 8x8 où les coins sont sacrés."],
        rules: { objective: "Avoir le plus grand nombre de pions à la fin.", setup: "4 pions centraux alternés.", mechanics: ["Encadrement et retournement immédiat."], victoryConditions: ["Majorité de pions."] },
        beginner: { coreTips: ["Prenez les 4 coins sans hésiter.", "Gardez peu de pions visibles au début."], commonMistakes: ["Jouer sur les cases X et C."] },
        strategy: { openingPrinciples: ["Jeu intérieur compact."], tacticalPatterns: ["Bords stables."], midgameCoordination: ["Affamement de mobilité."] },
        advancedStrategy: { deepCalculation: ["Calcul des pions stables."], clockManagement: ["Gestion du temps."], endgameTechnique: ["Gain par parité."] },
        faq: [{ question: "Les coins peuvent-ils être repris ?", answer: "Non, un pion dans un coin est définitivement stable." }],
        tournament: { format: "Tournoi d'élimination.", tieBreakers: "Blitz de départage.", prizeDistribution: "Paiement direct." },
        livePlay: { matchmaking: "Score de niveau.", latencyProtection: "Temps réel.", fairPlayEngine: "Anti-triche certifié." }
      },
      hi: {
        title: "प्रतियोगी रिवर्सी (Reversi / Othello)",
        tagline: "सीखने में एक मिनट, कोनों पर महारत हासिल करने में पूरी जिंदगी",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["8x8 बोर्ड पर गोटियों को पलटने का प्रसिद्ध खेल।"],
        rules: { objective: "खेल समाप्त होने पर अपने रंग की सबसे अधिक गोटियां होना।", setup: "केंद्र में 4 गोटियां।", mechanics: ["विरोधी की गोटियों को घेरकर अपने रंग में बदलना।"], victoryConditions: ["सबसे अधिक गोटियां।"] },
        beginner: { coreTips: ["चारों कोनों पर कब्जा करें।", "शुरुआत में कम गोटियां रखें ताकि चालें बची रहें।"], commonMistakes: ["कोने के ठीक बगल वाले खाने में चलना।"] },
        strategy: { openingPrinciples: ["अंदरूनी चालें।"], tacticalPatterns: ["कोनों और किनारों की स्थिरता।"], midgameCoordination: ["विरोधी की चालों को सीमित करना।"] },
        advancedStrategy: { deepCalculation: ["स्थिर गोटियों की गणना।"], clockManagement: ["सोच-समझकर चाल।"], endgameTechnique: ["अंतिम पलों में बोर्ड पलटना।"] },
        faq: [{ question: "क्या कोने की गोटी पलट सकती है?", answer: "नहीं, कोने की गोटी कभी नहीं पलटी जा सकती।" }],
        tournament: { format: "नॉकआउट मैच।", tieBreakers: "टाई-ब्रेकर।", prizeDistribution: "तुरंत भुगतान।" },
        livePlay: { matchmaking: "निष्पक्ष ELO रेटिंग।", latencyProtection: "सटीक टाइमर।", fairPlayEngine: "सुरक्षा।" }
      }
    }
  },

  gomoku: {
    id: "gomoku",
    slug: "gomoku",
    turnModel: "ALTERNATING",
    defaultDuration: "3m - 8m",
    locales: {
      ar: {
        title: "جوموكو التنافسية (Gomoku / Five in a Row)",
        tagline: "فن الخط الخماسي وتناغم الأحجار على شبكة زن الخيزرانية",
        coreCta: "اثبت مهارتك. العب. اكسب.",
        legalPrizeNotice: "اكسب الجوائز عبر منافسات المهارة المؤهلة",
        overview: ["لعبة الخمسة أحجار المتصلة على شبكة تقاطعات 15x15؛ حيث يلتقي عمق التخطيط بالدقة الصارمة."],
        rules: {
          objective: "تكوين خط مستقيم غير منقطع من 5 أحجار من لونك أفقياً أو عمودياً أو قطرياً.",
          setup: "رقعة تقاطعات 15x15 فارغة وأحجار أوبسيديان ولؤلؤية.",
          mechanics: ["وضع حجر واحد بالتناوب على تقاطعات الخطوط."],
          victoryConditions: ["أول من يكون 5 أحجار متصلة تماماً."]
        },
        beginner: { coreTips: ["كوّن خطوطاً مفتوحة من كلا الطرفين (Open Threes و Open Fours).", "دافع فوراً عند تكوين الخصم لثلاثة أحجار متصلة."], commonMistakes: ["التغافل عن التهديدات القطرية البعيدة."] },
        strategy: { openingPrinciples: ["السيطرة على نقطة النجم المركزية (Tengen) والتوسع المحوري."], tacticalPatterns: ["صناعة الهجوم المزدوج (Four-Three Trap) الذي يستحيل صده."], midgameCoordination: ["الربط بين هجومين منفصلين لفرض الاستسلام."] },
        advancedStrategy: { deepCalculation: ["حساب متواليات الفوز المتصل (Victory by Continuous Fours - VCF)."], clockManagement: ["الحفاظ على الإيقاع وسرعة حسم الهجوم."], endgameTechnique: ["إغلاق جميع محاولات الخصم العكسية قبل إتمام الخماسية."] },
        faq: [{ question: "هل تبدأ اللعبة من تقاطعات الخطوط؟", answer: "نعم، توضع الأحجار على تقاطعات الخطوط تماماً كما في قواعد لعبة جو الأصلية." }],
        tournament: { format: "إقصاء مباشر.", tieBreakers: "مباراة سريعة حاسمة.", prizeDistribution: "تحويل فوري." },
        livePlay: { matchmaking: "توفيق المهارة الذكي.", latencyProtection: "سيرفر متزامن لحظياً.", fairPlayEngine: "حظر حلول الآلة التلقائية." }
      },
      en: {
        title: "Competitive Gomoku (Five-in-a-Row)",
        tagline: "The Zen Symphony of Five Aligned Stones on a 15x15 Grid",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Ancient East Asian strategy game of pure alignment played on the intersections of a 15x15 grid."],
        rules: {
          objective: "Be the first player to form an unbroken chain of five stones horizontally, vertically, or diagonally.",
          setup: "15x15 intersection grid with alternating black and white stones.",
          mechanics: ["Placing one stone per turn on vacant intersections."],
          victoryConditions: ["Exactly five connected stones in a line."]
        },
        beginner: { coreTips: ["Build open-ended three-in-a-row sequences.", "Block enemy lines before they reach four."], commonMistakes: ["Focusing only on straight lines and missing diagonal lines."] },
        strategy: { openingPrinciples: ["Tengen central control."], tacticalPatterns: ["The lethal Four-Three (Double Threat) fork."], midgameCoordination: ["Dual offensive fronts."] },
        advancedStrategy: { deepCalculation: ["Victory by Continuous Fours (VCF) computation."], clockManagement: ["Decisive strike tempo."], endgameTechnique: ["Inflexible forcing sequences."] },
        faq: [{ question: "Are stones placed in squares or on intersections?", answer: "Stones are placed strictly on the grid line intersections, identical to traditional Go rules." }],
        tournament: { format: "Single elimination.", tieBreakers: "Sudden death duel.", prizeDistribution: "Direct ledger payout." },
        livePlay: { matchmaking: "Real-time ELO matching.", latencyProtection: "Instant input verification.", fairPlayEngine: "Forensic solver detection." }
      },
      zh: {
        title: "竞技五子棋 (Gomoku)",
        tagline: "十五道经纬上的五连绝杀与先手算力之争",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["15x15路交叉点上的黑白纯策略五连绝技对抗。"],
        rules: { objective: "率先形成横、竖、斜任意方向连续五子相连。", setup: "15x15交叉点网格。", mechanics: ["轮流在交叉点落子。"], victoryConditions: ["五子连珠即获胜。"] },
        beginner: { coreTips: ["做活三防死四，抢占天元。"], commonMistakes: ["漏看对手隐蔽斜向活三。"] },
        strategy: { openingPrinciples: ["中心开局，展开星位。"], tacticalPatterns: ["四三杀（双重杀）。"], midgameCoordination: ["双线联攻。"] },
        advancedStrategy: { deepCalculation: ["VCF（连续冲四胜）精确推演。"], clockManagement: ["算清后秒杀。"], endgameTechnique: ["强制步步为营。"] },
        faq: [{ question: "棋子是落在格子里还是交叉点？", answer: "严格落在经纬线交叉点上，与围棋一致。" }],
        tournament: { format: "单败淘汰制。", tieBreakers: "加时赛。", prizeDistribution: "自动到账。" },
        livePlay: { matchmaking: "技能匹配。", latencyProtection: "零延迟。", fairPlayEngine: "防AI引擎作弊。" }
      },
      es: {
        title: "Gomoku Competitivo (Cinco en Línea)",
        tagline: "La Sinfonía Zen de Alinear Cinco Piedras en Rejilla 15x15",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Juego milenario oriental de alineación pura sobre intersecciones de 15x15."],
        rules: { objective: "Alinear cinco piedras consecutivas.", setup: "Rejilla de 15x15.", mechanics: ["Colocación por turnos en intersecciones."], victoryConditions: ["Cinco en línea."] },
        beginner: { coreTips: ["Construya treses abiertos.", "Bloquee los ataques rivales a tiempo."], commonMistakes: ["Descuidar diagonales."] },
        strategy: { openingPrinciples: ["Control del punto central Tengen."], tacticalPatterns: ["Horquilla de cuatro y tres."], midgameCoordination: ["Frentes dobles."] },
        advancedStrategy: { deepCalculation: ["Secuencias de victoria por cuatros continuos (VCF)."], clockManagement: ["Velocidad de ejecución."], endgameTechnique: ["Remate forzado."] },
        faq: [{ question: "¿Dónde se colocan las piedras?", answer: "En las intersecciones de las líneas, exactamente como en el Go tradicional." }],
        tournament: { format: "Eliminación directa.", tieBreakers: "Partida decisiva.", prizeDistribution: "Acreditación directa." },
        livePlay: { matchmaking: "Emparejamiento ELO.", latencyProtection: "Reloj en tiempo real.", fairPlayEngine: "Juego limpio." }
      },
      fr: {
        title: "Gomoku Compétitif (Cinq en Ligne)",
        tagline: "L'Harmonie Zen des Cinq Pierres Alignées sur Grille 15x15",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["Art martial de l'alignement pur disputé sur les intersections d'un goban 15x15."],
        rules: { objective: "Aligner cinq pierres horizontalement, verticalement ou en diagonale.", setup: "Grille 15x15.", mechanics: ["Pose d'une pierre sur une intersection libre."], victoryConditions: ["Exactement cinq pierres alignées."] },
        beginner: { coreTips: ["Bâtissez des séries de trois ouvertes.", "Bloquez les menaces de quatre immédiatement."], commonMistakes: ["Oublier les diagonales lointaines."] },
        strategy: { openingPrinciples: ["Occupation du point central Tengen."], tacticalPatterns: ["La fourchette fatale quatre-trois."], midgameCoordination: ["Attaque bilatérale coordonnée."] },
        advancedStrategy: { deepCalculation: ["Calcul de victoires par attaques de quatre continues (VCF)."], clockManagement: ["Précision du timing."], endgameTechnique: ["Enchaînement forcé."] },
        faq: [{ question: "Pose-t-on sur les cases ou les intersections ?", answer: "Les pierres sont placées exclusivement sur les intersections des lignes." }],
        tournament: { format: "Élimination directe.", tieBreakers: "Blitz de départage.", prizeDistribution: "Automatique." },
        livePlay: { matchmaking: "Score ELO.", latencyProtection: "Temps réel.", fairPlayEngine: "Détection de solveurs." }
      },
      hi: {
        title: "प्रतियोगी गोमोकू (Gomoku / Five-in-a-Row)",
        tagline: "15x15 ग्रिड पर पांच पत्थरों को एक सीध में लाने की कला",
        coreCta: "PROVE. PLAY. WIN.",
        legalPrizeNotice: "earn prizes through eligible skill competitions",
        overview: ["15x15 ग्रिड के चौराहों (Intersections) पर खेला जाने वाला ऐतिहासिक खेल।"],
        rules: { objective: "क्षैतिज, लंबवत या तिरछे पांच पत्थर एक पंक्ति में जोड़ना।", setup: "15x15 ग्रिड।", mechanics: ["इंटरसेक्शन पर बारी-बारी से पत्थर रखना।"], victoryConditions: ["5 पत्थर एक सीध में।"] },
        beginner: { coreTips: ["ओपन थ्री बनाएं।", "विरोधी की तीन की लाइन को तुरंत रोकें।"], commonMistakes: ["तिरछी चालों पर ध्यान न देना।"] },
        strategy: { openingPrinciples: ["केंद्र पर कब्जा।"], tacticalPatterns: ["चार-तीन का दोहरा हमला (Double Threat)।"], midgameCoordination: ["दोनों तरफ से दबाव।"] },
        advancedStrategy: { deepCalculation: ["लगातार 4 की चालों की गणना (VCF)।"], clockManagement: ["तेज और सटीक चाल।"], endgameTechnique: ["मजबूर करने वाली चालें।"] },
        faq: [{ question: "गोटियां कहां रखी जाती हैं?", answer: "गोटियां हमेशा रेखाओं के कटान बिंदु (Intersections) पर रखी जाती हैं।" }],
        tournament: { format: "नॉकआउट मैच।", tieBreakers: "टाई-ब्रेकर।", prizeDistribution: "सीधा भुगतान।" },
        livePlay: { matchmaking: "सटीक रेटिंग।", latencyProtection: "तेज चालें।", fairPlayEngine: "सुरक्षित खेल।" }
      }
    }
  }
};

export function getGameContent(gameId: string, locale: string): GameLocalizedContent | null {
  const normId = gameId.replace(/_/g, "-");
  const game = GAMES_CONTENT[normId];
  if (!game) return null;
  const loc = (["ar", "en", "zh", "es", "fr", "hi"].includes(locale) ? locale : "en") as string;
  return (game.locales[loc] || game.locales.en) ?? null;
}
