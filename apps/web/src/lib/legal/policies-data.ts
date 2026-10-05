export type PolicySection = {
  title: string;
  content: string[];
  callout?: string;
};

export type PolicyLocaleContent = {
  title: string;
  category: string;
  summary: string;
  lastUpdated: string;
  sections: PolicySection[];
};

export type PolicyItem = {
  id: string;
  version: string;
  is_mandatory: boolean;
  icon: string;
  locales: {
    ar: PolicyLocaleContent;
    en: PolicyLocaleContent;
    zh: PolicyLocaleContent;
    es: PolicyLocaleContent;
    fr: PolicyLocaleContent;
    hi: PolicyLocaleContent;
  };
};

export const POLICIES_DATA: PolicyItem[] = [
  {
    "id": "terms_of_service",
    "version": "2.0.0",
    "is_mandatory": true,
    "icon": "⚖️",
    "locales": {
      "ar": {
        "title": "الشروط والأحكام العامة وقواعد الاستخدام الصارمة",
        "category": "وثيقة قانونية إلزامية ملزمة",
        "summary": "الاتفاقية التعاقدية الشاملة الحاكمة لاستخدام المنصة، وحسابات اللاعبين، والسياسات الصارمة لمكافحة الغش، وحق الإدارة المطلق في إيقاف الحسابات ومصادرة الأموال.",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. الموافقة القانونية الإلزامية ونطاق العقد",
            "content": [
              "بإنشاء حساب، أو تنزيل أي برمجيات تابعة للمنصة، أو إيداع أي أصول رقمية (USDT)، أو الضغط على خانة 'أوافق على الشروط والأحكام' أثناء التسجيل، فإنك تدخل في عقد قانوني ملزم ونهائي مع إدارة منصة Nizalo، وتوافق دون قيد أو شرط على الامتثال لكافة البنود الواردة في هذه الوثيقة، وميثاق اللعب النظيف، وسياسة الخصوصية، وقواعد البطولات، وكافة السياسات التنظيمية المكملة لها.",
              "إذا كنت لا توافق على هذه الشروط بأكملها وبدون تحفظ، يُحظر عليك تماماً الوصول إلى المنصة أو إنشاء حساب أو المشاركة في أي مسابقة، ويتعين عليك التوقف فوراً عن استخدام خدماتنا."
            ]
          },
          {
            "title": "2. الأهلية والحد الأدنى للسن والولاية القضائية لمسابقات المهارة",
            "content": [
              "يجب ألا يقل عمر المستخدم عن 18 عاماً ميلادياً كاملاً (أو سن الرشد القانوني المعمول به في ولايتك القضائية، أيهما أعلى) لإنشاء حساب أو المشاركة في أي مسابقة أو إجراء معاملات مالية.",
              "مسابقات المهارة ذات الجوائز المالية أو المعتمدة على العملات المستقرة (USDT) متاحة حصرياً في الدول والمناطق التي تجيز قوانينها مسابقات الألعاب القائمة على المهارة والذكاء الخالص. يتحمل المستخدم وحده المسؤولية القانونية الكاملة عن التحقق من مشروعية مشاركته وفقاً لقوانين موطنه أو محل إقامته.",
              "استخدام الأصول الرقمية المشفرة (USDT) لا يمنح أي إعفاء من القوانين واللوائح التنظيمية المعمول بها محلياً. تُعد كافة المسابقات باطلة ولاغية بقوة القانون في أي ولاية قضائية تحظر ذلك."
            ],
            "callout": "إشعار قانوني حاسم: منصة Nizalo لا تقدم أي عوائد استثمارية أو أرباح مضمونة؛ الفوز والجوائز يعتمدان كلياً وحصرياً على المهارة الفردية والقدرات الذهنية والسرعة الحسابية للمتسابق."
          },
          {
            "title": "3. سياسة الحساب الفردي الواحد والتحقق من الهوية (KYC/AML)",
            "content": [
              "يُسمح لكل شخص طبيعي بامتلاك حساب واحد فقط (1) نشط وموثق على المنصة. يُحظر حظراً تاماً وباتاً إنشاء حسابات متعددة لنفس الشخص، أو استخدام حسابات بالوكالة، أو إنشاء حسابات وهمية (Smurfs)، أو تسجيل حسابات بأسماء أفراد العائلة أو الغير للالتفاف على التصنيفات أو القيود.",
              "تحتفظ المنصة بالحق الكامل في طلب التحقق من الهوية الرسمية (KYC) وإثبات العنوان ومصدر الأموال في أي وقت، ولا سيما قبل تسوية طلبات السحب للامتثال للمعايير الدولية لمكافحة غسيل الأموال."
            ]
          },
          {
            "title": "4. الحظر المطلق للغش ومحركات الذكاء الاصطناعي وحق المصادرة الكاملة للأموال",
            "content": [
              "تطبق Nizalo سياسة عدم التسامح المطلق (Zero-Tolerance) مع أي شكل من أشكال الغش أو التلاعب أو المساعدة الخارجية. يُحظر تماماً وبشكل قاطع على أي لاعب استخدام أي من الآتي في ألعاب المنصة العشر:",
              "أ) محركات الشطرنج أو التحليل الذاتي (مثل Stockfish، Leela Chess Zero وغيرها) أو أي خوارزميات برمجية تقترح أو تقيم أو تحسب النقلات.",
              "ب) الروبوتات الآلية (Bots)، أو البرمجيات الخبيثة، أو سكريبتات الحقن البرمجي، أو أدوات استقراء الشاشة (Screen Readers / OCR) أو تعديل حزم البيانات (Packet Manipulation).",
              "ج) التواطؤ مع الخصم (Collusion)، أو التلاعب بالنتائج (Match-Fixing)، أو تعمد الخسارة لتخفيض التصنيف (Sandbagging)، أو مشاركة الشاشات مع أطراف ثالثة لتقديم المساعدة التكتيكية.",
              "د) استغلال أي ثغرات تقنية أو أخطاء برمجية (Exploits / Glitches) في اللعبة بدلاً من الإبلاغ الفوري عنها للإدارة.",
              "صلاحيات الإدارة وحق المصادرة القانوني الصارم: إذا ثبت للمنصة—بناءً على تحليلات منظومة الفحص الجنائي الرقمي ومؤشرات التيليمتري والذكاء الاصطناعي—قيام أي لاعب بارتكاب أي من أفعال الغش أو الاحتيال المذكورة، فإن لإدارة المنصة الحق المطلق والنهائي وغير القابل للطعن في اتخاذ كافة الإجراءات التالية:",
              "1. الإيقاف والحظر النهائي والدائم والفوري لحساب اللاعب وحظر بصمة أجهزته (Hardware ID) وعنوان بروتوكول الإنترنت (IP).",
              "2. الشطب والإلغاء الفوري لجميع نتائج المباريات والبطولات التي شارك فيها واسترداد كافة نقاط التصنيف والجوائز غير المستحقة.",
              "3. المصادرة الشاملة والفورية والنهائية لكافة الأموال والأرصدة المتاحة والمجمدة في محفظة اللاعب—بما في ذلك مبالغ الإيداعات المتبقية، وأرباح المباريات، وجوائز البطولات—دون الحاجة إلى إنذار مسبق أو حكم قضائي، ويتم تحويل تلك الأموال لمصلحة الخزينة وصندوق حماية المتضررين كتعويض اتفاقي مسبق عن الأضرار المادية والسمعة التي لحقت بالمنصة والمنافسين."
            ],
            "callout": "بند رادع صارم: كشف أي استخدام لأدوات الغش أو الذكاء الاصطناعي يمنح إدارة المنصة الحق القانوني الكامل في حظر حسابك فوراً ومصادرة كافة أموالك وأرصدتك المودعة والمكتسبة دون أي حق في الاسترداد أو الاعتراض."
          },
          {
            "title": "5. حجية السيرفر المطلقة ونهائية الأحكام والتوقيتات",
            "content": [
              "يعتبر خادم منصة Nizalo المركزي هو المرجع التقني والقانوني الحصري والوحيد لتحديد صحة النقلات، وحالة الرقعة الرسمية، وتوقيت ساعات اللعب، واحتساب الثواني المتبقية، ونهاية المباريات بالانسحاب أو سقوط الوقت.",
              "لا يُعتد بأي توقيت محلي على جهاز المستخدم أو ساعته الداخلية. وتعتبر سجلات الخادم وقواعد البيانات الرسمية دليلاً قاطعاً ونهائياً لا يجوز الطعن فيه أمام أي جهة."
            ]
          },
          {
            "title": "6. المحفظة الرقمية، السحوبات، والرسوم",
            "content": [
              "تتم كافة العمليات المالية عبر دفتر أستاذ محاسبي مزدوج القيد (Double-Entry Ledger) غير قابل للتعديل لتسجيل كل سنت وحركة رصيد.",
              "تخضع كافة طلبات السحب للتدقيق الأمني الآلي والتحقق من نزاهة اللعب. يتحمل المستخدم رسوم الغاز (Gas / Miner Fees) الفعلية لشبكة البلوكشين عند السحب، ولا تتحمل المنصة أي مسؤولية عن إرسال أموال إلى عناوين خاطئة أو شبكات غير مدعومة من قِبل المستخدم."
            ]
          },
          {
            "title": "7. انقطاع الاتصال وإخلاء المسؤولية والقوة القاهرة",
            "content": [
              "يتحمل اللاعب وحده المسؤولية الكاملة عن جودة واستقرار اتصاله بشبكة الإنترنت وصلاحية جهازه ومستعرضه للعب.",
              "تتيح المنصة نافذة سماح لمدة 60 ثانية لإعادة الاتصال في حال حدوث انقطاع طارئ. وإذا نفد وقت ساعة اللاعب أثناء انقطاع اتصاله، يُعتبر خاسراً للمباراة لسقوط الوقت دون أي مسؤولية على المنصة."
            ]
          },
          {
            "title": "8. التحكيم التجاري الملزم والتنازل عن الدعاوى الجماعية",
            "content": [
              "يتم تسوية أي نزاع أو مطالبة تنشأ عن أو تتعلق باستخدام المنصة أو هذه الشروط حصرياً عبر التحكيم الفردي الملزم وفقاً للقواعد الدولية المعترف بها للتحكيم التجاري.",
              "يتنازل المستخدم صراحة وبشكل نهائي عن أي حق في إقامة أو الانضمام إلى أي دعاوى قضائية جماعية (Class Actions) أو مطالبات تمثيلية ضد منصة Nizalo أو إدارتها."
            ]
          }
        ]
      },
      "en": {
        "title": "Master Terms & Conditions of Service",
        "category": "Mandatory Legal Policy",
        "summary": "Comprehensive contractual agreement governing platform access, player accounts, strict anti-cheat policies, server sovereignty, and the platform's absolute right to terminate accounts and forfeit funds.",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. Binding Legal Agreement & Acceptance of Terms",
            "content": [
              "By creating an account, accessing the Nizalo platform, depositing digital assets (USDT), or checking the 'I agree to the Terms & Conditions' box during registration, you enter into a legally binding contract with Nizalo. You unconditionally agree to adhere to these Terms, our Fair Play Policy, Privacy Policy, and all supplementary platform regulations.",
              "If you do not agree with each provision of these Terms in their entirety and without reservation, you are strictly prohibited from creating an account or participating in any matches, and you must discontinue using our services immediately."
            ]
          },
          {
            "title": "2. Eligibility, Age Requirements & Pure Skill Gaming",
            "content": [
              "You must be at least 18 years of age (or the legal age of majority in your jurisdiction, whichever is higher) to register, participate in competitions, or execute financial transactions.",
              "Competitions with monetary stakes or digital assets (USDT) are available exclusively in jurisdictions where skill-based gaming competitions are fully lawful. Users bear the sole responsibility for verifying compliance with their local legal frameworks.",
              "Using digital assets (USDT) confers no exemption from applicable gaming or commercial regulations. All competitions are void where prohibited by law."
            ],
            "callout": "Crucial Notice: Nizalo provides no guaranteed returns or profits. Victory and prize allocation depend exclusively on the contestant's personal skill, mental calculation, and tactical speed."
          },
          {
            "title": "3. Single Account Policy & KYC/AML Verification",
            "content": [
              "Each natural person is permitted exactly one (1) active, verified account. Multi-accounting, proxy accounts, smurfing, or registering accounts under aliases or family members is strictly prohibited.",
              "Nizalo reserves the right to require government-issued ID verification (KYC), proof of address, and source-of-funds documentation at any time prior to processing cashout requests."
            ]
          },
          {
            "title": "4. Absolute Anti-Cheat Prohibition & Full Forfeiture of Funds",
            "content": [
              "Nizalo enforces an absolute Zero-Tolerance policy against cheating, botting, and external assistance across all 10 platform games. Prohibited practices include:",
              "a) Chess engines, neural solvers, or algorithmic calculation tools (e.g. Stockfish, Leela Chess Zero, etc.) that evaluate or suggest moves.",
              "b) Automated bots, injection scripts, screen readers (OCR), or network packet modification tools.",
              "c) Collusion, win-trading, match-fixing, syndicate play, intentional rating deflation (sandbagging), or third-party screen sharing for tactical coaching.",
              "d) Exploiting software bugs, glitches, or timing loopholes instead of immediately reporting them to platform administration.",
              "Platform Authority & Absolute Asset Forfeiture: If Nizalo determines—in its sole, definitive discretion based on digital forensic telemetry and neural engine correlation models—that a player has engaged in cheating or fraud, the platform reserves the absolute, irrevocable right to:",
              "1. Permanently ban the player's account, hardware fingerprint (Hardware ID), and associated IP address ranges immediately.",
              "2. Annul all affected match and tournament results, retract unearned ratings, and strip leaderboard standings.",
              "3. Seize, forfeit, and confiscate ALL funds, available balances, deposited capital, and pending prizes in the player's wallet without prior notice or court order, transferring forfeited assets to the platform treasury and compensation pool as pre-agreed liquidated damages."
            ],
            "callout": "Strict Enforcement: Cheating or bot usage results in instant account termination and complete forfeiture of all deposited and earned funds with zero right of refund or recourse."
          },
          {
            "title": "5. Authoritative Server Sovereignty & Clock Finality",
            "content": [
              "The central Nizalo game server is the exclusive, sovereign arbiter of all move validations, clock decrements, board states, and match conclusions.",
              "Local client clocks and timestamps are non-authoritative. Server logs and database records constitute conclusive, unappealable legal evidence."
            ]
          },
          {
            "title": "6. Digital Wallet, Financial Ledger, and Fees",
            "content": [
              "All financial activity operates on an immutable double-entry ledger recording every deposit, hold, win, and withdrawal.",
              "Withdrawals undergo automated security screening. Users bear actual blockchain network gas/miner fees, and Nizalo bears no liability for transfers sent to incorrect addresses or unsupported chains."
            ]
          },
          {
            "title": "7. Disconnections, Technical Failures & Force Majeure",
            "content": [
              "Players bear sole responsibility for the stability of their local internet connection and hardware.",
              "Nizalo provides a 60-second grace window to reconnect to an ongoing match. If the official server clock expires while a player is disconnected, the game is declared an authoritative loss on time."
            ]
          },
          {
            "title": "8. Binding Arbitration & Class Action Waiver",
            "content": [
              "Any dispute arising out of or relating to these Terms shall be resolved exclusively through binding individual commercial arbitration.",
              "Users expressly and irrevocably waive any right to bring or participate in class action lawsuits or representative proceedings against Nizalo."
            ]
          }
        ]
      },
      "zh": {
        "title": "服务条款与综合使用协议 (Master Terms of Service)",
        "category": "核心法定协议",
        "summary": "规范平台使用、单一账户政策、零容忍反作弊条款、服务器权威裁决及违规资金没收法则的最高法定文件。",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. 法律约束力与协议范围",
            "content": [
              "注册账户、访问 Nizalo、充值 USDT 或勾选“我同意服务条款”，即表示您与 Nizalo 订立了具有完全法律约束力的合同，无条件同意本条款、公平竞赛守则及隐私政策。",
              "若您不同意本条款的任何内容，严禁注册或参与任何赛事，且必须立即停止使用本平台的一切服务。"
            ]
          },
          {
            "title": "2. 年龄资格与纯智力竞技合规",
            "content": [
              "用户必须年满 18 周岁（或您所在司法管辖区的法定成年年龄）。涉及真实资金或 USDT 的赛事仅在法律允许技能竞技的区域开放。用户对自身合法性承担唯一法律责任。",
              "使用 USDT 绝不代表豁免任何游戏法规。本平台绝非赌博或博彩，不保证任何投资回报，赛事结果完全取决于个人智力、算力与反应速度。"
            ],
            "callout": "特别声明：Nizalo 不提供任何保底收益，比赛胜负纯粹取决于选手个人的技术水平。"
          },
          {
            "title": "3. 严格单一账户与实名认证 (KYC)",
            "content": [
              "每位真实自然人仅限拥有一个有效账户。严禁创建小号（Smurfs）、多账号对刷或冒用他人身份注册。",
              "平台有权在提现前要求进行政府签发证件的实名认证 (KYC) 与资金来源审查。"
            ]
          },
          {
            "title": "4. 严禁作弊、AI 外挂及违规资产全额没收条款",
            "content": [
              "Nizalo 对作弊采取零容忍（Zero-Tolerance）严打原则。严禁在全平台 10 款游戏中实施以下行为：",
              "a) 使用任何象棋/棋类引擎（如 Stockfish）、神经网络求解器或走法计算辅助软件；",
              "b) 使用自动化脚本机器人（Bots）、注入工具、屏幕识别（OCR）或数据包篡改工具；",
              "c) 串通打假赛、故意输棋刷分（Sandbagging）或通过第三方屏幕共享获取战术外援；",
              "d) 恶意利用系统漏洞（Exploits/Glitches）谋利而非立即上报官方。",
              "官方裁决与资产强制没收权限：一旦风控法证系统判定选手存在作弊行为，Nizalo 拥有最终、不可撤销的完全权利：",
              "1. 立即永久封停违规账户，并永久封禁其设备硬件标识码 (Hardware ID) 及 IP 地址段；",
              "2. 取消并追回其参与的所有比赛成绩、天梯积分及未结算奖金；",
              "3. 无需事先通知或法院判决，依法全额强制没收该违规账户钱包内的所有资产与余额（包括未使用的充值本金、比赛盈利及待提现资金），没收资金全部划入平台金库及受害玩家赔付基金，作为对平台声誉及技术损失的违约赔偿。"
            ],
            "callout": "严厉警告：作弊将导致账户被永久封停，且账户内所有充值本金与盈利资金将被全额强制没收，不得申请退款或提出异议。"
          },
          {
            "title": "5. 服务器最高权威裁决与时钟终局性",
            "content": [
              "Nizalo 中央服务器是所有走棋合法性、棋钟扣减、棋盘状态及比赛胜负的唯一法权威机构。本地设备时间或断网提示不具备任何抗辩效力。"
            ]
          },
          {
            "title": "6. 钱包与区块链出入金规范",
            "content": [
              "所有资金划转均记录于不可篡改的双向复式记账账本中。提现仅扣除真实区块链矿工费 (Gas Fee)，用户须自行核对提币地址与主网类型。"
            ]
          },
          {
            "title": "7. 断线保护与免责声明",
            "content": [
              "平台提供 60 秒断线重连保护。若因用户本地网络故障导致在服务器时钟耗尽前未能重连，将自动判负，平台对此不承担任何责任。"
            ]
          },
          {
            "title": "8. 约束性仲裁与放弃集体诉讼",
            "content": [
              "因使用平台引起的任何争议均须通过个别商业仲裁解决。用户明确放弃发起或参与任何针对 Nizalo 的集体诉讼的权利。"
            ]
          }
        ]
      },
      "es": {
        "title": "Términos y Condiciones Generales de Uso",
        "category": "Política Legal Obligatoria",
        "summary": "Acuerdo contractual exhaustivo sobre cuentas, política estricta anti-trampas, soberanía del servidor y derecho absoluto de confiscación de fondos por fraude.",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. Acuerdo Legal Vinculante",
            "content": [
              "Al crear una cuenta, depositar USDT o marcar 'Acepto los Términos y Condiciones', usted celebra un contrato legal vinculante con Nizalo y acepta cumplir con estos Términos, el Juego Limpio y la Privacidad.",
              "Si no está de acuerdo con la totalidad de estos Términos, tiene estrictamente prohibido usar la plataforma."
            ]
          },
          {
            "title": "2. Edad, Jurisdicción y Juegos de Destreza",
            "content": [
              "Debe tener al menos 18 años. Las partidas por dinero real o USDT están disponibles únicamente donde los juegos de habilidad sean legales.",
              "Nizalo no garantiza ganancias; el resultado depende exclusivamente de la destreza mental del competidor."
            ],
            "callout": "Aviso importante: No hay ganancias garantizadas; el resultado depende exclusivamente de la habilidad del jugador."
          },
          {
            "title": "3. Cuenta Única y Verificación KYC",
            "content": [
              "Cada persona solo puede poseer una (1) cuenta. Las cuentas duplicadas o falsas serán canceladas de inmediato.",
              "Nizalo se reserva el derecho de exigir verificación de identidad oficial (KYC) antes de tramitar retiros."
            ]
          },
          {
            "title": "4. Prohibición de Trampas y Decomiso Total de Fondos",
            "content": [
              "Nizalo aplica Tolerancia Cero frente al uso de motores de IA (como Stockfish), bots automatizados, manipulación de paquetes, colusión o aprovechamiento de errores de software.",
              "Derecho de Decomiso: Si se determina que un jugador ha hecho trampa, Nizalo se reserva el derecho absoluto e inapelable de: 1) Suspender y expulsar permanentemente la cuenta, hardware e IP; 2) Anular todos sus resultados; 3) CONFISCAR Y DECOMISAR LA TOTALIDAD DE LOS FONDOS, depósitos y premios en su billetera sin previo aviso, en concepto de indemnización por daños y perjuicios."
            ],
            "callout": "Cláusula estricta: Las trampas conllevan la rescisión inmediata y la confiscación total e irrevocable de todos los fondos y depósitos de la cuenta."
          },
          {
            "title": "5. Soberanía del Servidor y Cronómetros",
            "content": [
              "El servidor central de Nizalo es la única autoridad oficial para la validación de movimientos, tiempo restante y resultados."
            ]
          },
          {
            "title": "6. Billetera y Retiros",
            "content": [
              "Todas las transacciones se auditan mediante un libro mayor de doble entrada. Las comisiones de gas de la red corren por cuenta del usuario."
            ]
          },
          {
            "title": "7. Desconexiones y Fuerza Mayor",
            "content": [
              "Existe una ventana de gracia de 60 segundos para reconectar. Si su reloj oficial expira, se declara derrota por tiempo."
            ]
          },
          {
            "title": "8. Arbitraje Individual y Renuncia a Demandas Colectivas",
            "content": [
              "Cualquier disputa se resolverá mediante arbitraje individual vinculante, renunciando expresamente a demandas colectivas."
            ]
          }
        ]
      },
      "fr": {
        "title": "Conditions Générales d'Utilisation et Règlement",
        "category": "Document Juridique Obligatoire",
        "summary": "Contrat légal régissant l'accès, la politique anti-triche rigoureuse, la souveraineté des serveurs et le droit exclusif de suspension et de confiscation des avoirs en cas de fraude.",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. Accord Légal et Champ Contractuel",
            "content": [
              "En vous inscrivant, en déposant des USDT ou en cochant 'J'accepte les Conditions Générales', vous concluez un contrat ferme et obligatoire avec Nizalo.",
              "Si vous désapprouvez une quelconque clause, vous devez cesser immédiatement toute utilisation du service."
            ]
          },
          {
            "title": "2. Éligibilité et Jeux d'Adresse Pure",
            "content": [
              "L'âge légal requis est de 18 ans révolus. Les tournois avec prix financiers ne sont ouverts que là où les jeux de compétence sont pleinement légaux.",
              "Nizalo ne propose aucun rendement garanti : la victoire dépend exclusivement de la maîtrise et de la rapidité mentale du joueur."
            ],
            "callout": "Avis important : Aucun gain n'est garanti ; le résultat repose exclusivement sur la compétence intellectuelle."
          },
          {
            "title": "3. Règle du Compte Unique et KYC",
            "content": [
              "Une seule (1) inscription est accordée par personne physique. Les multicomptes ou comptes d'emprunt sont formellement bannis.",
              "Une vérification d'identité (KYC) peut être exigée à tout moment avant la délivrance des retraits."
            ]
          },
          {
            "title": "4. Tolérance Zéro Anti-Triche et Confiscation des Avoirs",
            "content": [
              "Il est strictement prohibé d'avoir recours à des moteurs d'échecs (Stockfish, etc.), des bots automatisés, des injecteurs de code, de la collusion organisée ou l'exploitation de failles techniques.",
              "Pouvoir de Sanction et Confiscation : En cas de triche avérée, Nizalo détient le droit irrévocable de : 1) Bannir immédiatement et définitivement le compte, le matériel (Hardware ID) et l'IP ; 2) Annuler les victoires obtenues ; 3) CONFISQUER INTÉGRALEMENT ET SANS PRÉAVIS L'ENSEMBLE DES FONDS, dépôts et récompenses présents dans le portefeuille à titre de dédommagement contractuel pour préjudice causé."
            ],
            "callout": "Sanction formelle : La triche avérée entraîne la radiation immédiate et la saisie définitive de tous les fonds sans droit de recours."
          },
          {
            "title": "5. Souveraineté Absolue des Serveurs",
            "content": [
              "Les serveurs centraux de Nizalo font foi de manière exclusive et définitive pour le calcul des chronomètres, la validité des coups et l'issue des parties."
            ]
          },
          {
            "title": "6. Portefeuille et Retraits",
            "content": [
              "Les fonds sont gérés via un grand livre comptable à double entrée. Les frais de gaz réels de la blockchain sont déduits lors des retraits."
            ]
          },
          {
            "title": "7. Coupures Réseau et Force Majeure",
            "content": [
              "Un délai de grâce de 60 secondes est accordé en cas de coupure. Si le chronomètre serveur s'épuise, la partie est déclarée perdue au temps."
            ]
          },
          {
            "title": "8. Arbitrage et Renonciation aux Actions Collectives",
            "content": [
              "Tout litige sera tranché exclusivement par arbitrage individuel contraignant, avec renonciation expresse à toute action collective."
            ]
          }
        ]
      },
      "hi": {
        "title": "सेवा की मुख्य नियम एवं शर्तें (Master Terms & Conditions)",
        "category": "अनिवार्य कानूनी नीति",
        "summary": "प्लेटफ़ॉर्म उपयोग, एकल खाता नीति, सख्त एंटी-चीट नियम, सर्वर संप्रभुता और धोखाधड़ी पर फंड जब्ती का कानूनी अधिकार।",
        "lastUpdated": "2026-09-13",
        "sections": [
          {
            "title": "1. कानूनी अनुबंध और स्वीकृति",
            "content": [
              "खाता बनाकर, USDT जमा करके या 'मैं नियम और शर्तों से सहमत हूँ' पर टिक करके, आप Nizalo के साथ एक कानूनी रूप से बाध्यकारी अनुबंध में प्रवेश करते हैं।",
              "यदि आप इन शर्तों से पूरी तरह सहमत नहीं हैं, तो आपको प्लेटफ़ॉर्म का उपयोग तुरंत बंद कर देना चाहिए।"
            ]
          },
          {
            "title": "2. आयु सीमा और कौशल खेल नियम",
            "content": [
              "आपकी आयु कम से कम 18 वर्ष होनी चाहिए। वास्तविक धन (USDT) प्रतियोगिताएं केवल उन्हीं क्षेत्रों में मान्य हैं जहां कौशल खेल कानूनी हैं।",
              "Nizalo कोई गारंटीकृत वित्तीय लाभ नहीं देता; परिणाम केवल प्रतियोगी के व्यक्तिगत कौशल और रणनीतिक गणना पर निर्भर करता है।"
            ],
            "callout": "महत्वपूर्ण कानूनी सूचना: कोई वित्तीय लाभ गारंटीकृत नहीं है; परिणाम पूरी तरह से आपके कौशल पर निर्भर करता है।"
          },
          {
            "title": "3. एकल खाता नीति और पहचान सत्यापन (KYC)",
            "content": [
              "प्रत्येक व्यक्ति को केवल एक (1) खाते की अनुमति है। कई खाते बनाना या नकली खाते बनाना सख्त वर्जित है।",
              "निकासी से पहले सरकारी पहचान सत्यापन (KYC) और फंड स्रोत की जांच की जा सकती है।"
            ]
          },
          {
            "title": "4. धोखाधड़ी पर पूर्ण प्रतिबंध और फंड की पूर्ण जब्ती",
            "content": [
              "Nizalo पर किसी भी खेल में AI इंजन (जैसे Stockfish), ऑटोमेटेड बॉट्स, स्क्रीन स्क्रैपर्स, मैच फिक्सिंग या बग्स के दुरुपयोग पर पूर्ण प्रतिबंध है।",
              "जब्ती का अधिकार: यदि कोई खिलाड़ी धोखाधड़ी करता पाया जाता है, तो Nizalo को निम्नलिखित का पूर्ण और अंतिम अधिकार है: 1) खाते, डिवाइस आईडी और आईपी पर स्थायी प्रतिबंध लगाना; 2) सभी मैच परिणाम रद्द करना; 3) खिलाड़ी के वॉलेट में मौजूद सभी फंड्स, जमा राशि और पुरस्कारों को बिना किसी पूर्व सूचना के स्थायी रूप से जब्त करना।"
            ],
            "callout": "सख्त चेतावनी: धोखाधड़ी करने पर खाता तुरंत बंद कर दिया जाएगा और खाते में जमा सभी फंड स्थायी रूप से जब्त कर लिए जाएंगे।"
          },
          {
            "title": "5. सर्वर का सर्वोच्च अधिकार",
            "content": [
              "Nizalo का केंद्रीय सर्वर चालों की वैधता, घड़ी के समय और खेल परिणामों का एकमात्र और अंतिम प्राधिकारी है।"
            ]
          },
          {
            "title": "6. वित्तीय लेज़र और निकासी",
            "content": [
              "सभी लेनदेन एक सुरक्षित डबल-एंट्री लेज़र में दर्ज होते हैं। उपयोगकर्ता निकासी पर वास्तविक ब्लॉकचेन नेटवर्क गैस शुल्क वहन करेंगे।"
            ]
          },
          {
            "title": "7. इंटरनेट डिस्कनेक्शन और दायित्व मुक्ति",
            "content": [
              "खिलाड़ियों को 60 सेकंड की रीकनेक्शन छूट मिलती है। समय समाप्त होने पर सर्वर द्वारा स्वतः हार घोषित कर दी जाएगी।"
            ]
          },
          {
            "title": "8. व्यक्तिगत मध्यस्थता",
            "content": [
              "किसी भी विवाद का निपटारा बाध्यकारी व्यक्तिगत मध्यस्थता के माध्यम से किया जाएगा, और सामूहिक मुकदमों का अधिकार समाप्त होगा।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "privacy_policy",
    "version": "1.0.0",
    "is_mandatory": true,
    "icon": "🛡️",
    "locales": {
      "ar": {
        "title": "سياسة الخصوصية وحماية البيانات",
        "category": "وثيقة قانونية إلزامية",
        "summary": "معايير جمع البيانات وتشفيرها وحفظها بما يتماشى مع لوائح GDPR وأنظمة أمن المعلومات.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. البيانات التي نقوم بجمعها",
            "content": [
              "بيانات التسجيل الأساسية: اسم المستخدم، عنوان البريد الإلكتروني، وتاريخ الميلاد.",
              "بيانات التحقق من الهوية (KYC): وثائق الهوية الصادرة عن جهات رسمية، وصور التحقق البيومتري عند طلب تسوية السحوبات الكبرى.",
              "البيانات التقنية وتيليمتري الأجهزة: عناوين IP، نوع المتصفح، البصمة الرقمية للجهاز، وبصمات توقيت التحركات داخل المباريات لمنع الغش والتواطؤ."
            ]
          },
          {
            "title": "2. الغرض من معالجة البيانات وأساسها القانوني",
            "content": [
              "تنفيذ وتوثيق مباريات الألعاب وتحديث سجلات الجدارة والتصنيف العالمي (GSS).",
              "إدارة المحفظة المالية ودفتر الأستاذ المالي المزدوج ومنع غسيل الأموال وتمويل الأنشطة المشبوهة.",
              "التحري الفوري عن استخدام محركات الذكاء الاصطناعي والبوتات الخبيثة."
            ]
          },
          {
            "title": "3. أمن البيانات وعدم مشاركتها مع أطراف تجارية",
            "content": [
              "لا تقوم Nizalo ببيع أو تأجير بيانات المستخدمين الشخصية لأي جهة إعلانية خارجية على الإطلاق.",
              "يتم تشفير جميع كلمات المرور عبر خوارزميات التجزئة المشفرة غير القابلة للعكس (Argon2id/Bcrypt)، مع حماية جلسات العمل بشهادات TLS 1.3 الصارمة."
            ]
          }
        ]
      },
      "en": {
        "title": "Privacy Policy & Data Protection",
        "category": "Mandatory Legal Policy",
        "summary": "How Nizalo collects, encrypts, and processes personal telemetry in compliance with GDPR standards.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Information We Collect",
            "content": [
              "Registration and Account Data: Unique nickname, email address, password hashes, and age declaration.",
              "Verification Telemetry (KYC): Government-issued identification, proof of address, and liveness selfies where required.",
              "Gameplay and Technical Data: IP logs, device fingerprints, and match move timestamps for anti-cheat verification."
            ]
          },
          {
            "title": "2. Purpose of Data Processing",
            "content": [
              "To operate authoritative game states, rating calculations, and double-entry financial accounting.",
              "To satisfy anti-money laundering (AML) protocols and enforce fair play regulations."
            ]
          },
          {
            "title": "3. Absolute No-Sale of Personal Data",
            "content": [
              "Nizalo never sells, licenses, or rents your personal data to third-party ad networks or brokers.",
              "All traffic is secured with strict end-to-end TLS 1.3 encryption and salted cryptographic password hashing."
            ]
          }
        ]
      },
      "zh": {
        "title": "隐私政策与数据保护 (Privacy Policy)",
        "category": "核心法定条款",
        "summary": "关于用户个人信息、设备指纹及链上交易数据的合规收集与高强度加密规范。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 我们收集的信息",
            "content": [
              "账户信息：用户名、电子邮箱、加密密码摘要与年龄声明。",
              "反作弊与风控数据：IP 地址、设备特征、棋局走法耗时与操作时间戳。"
            ]
          },
          {
            "title": "2. 绝不出售个人隐私",
            "content": [
              "Nizalo 绝不向任何第三方广告商出售或出租您的个人信息。所有敏感数据均采用行业顶尖的加密技术存储。"
            ]
          }
        ]
      },
      "es": {
        "title": "Política de Privacidad y Protección de Datos",
        "category": "Política Legal Obligatoria",
        "summary": "Cómo se recopilan, procesan y aseguran los datos de los usuarios conforme a estándares internacionales.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Datos recopilados",
            "content": [
              "Información de cuenta, correo electrónico, registros de telemetría de juego para la detección de trampas y datos KYC necesarios para retiros."
            ]
          },
          {
            "title": "2. Compromiso de no comercialización",
            "content": [
              "Nizalo nunca vende ni alquila datos de usuarios a terceros con fines publicitarios."
            ]
          }
        ]
      },
      "fr": {
        "title": "Politique de Confidentialité et Protection des Données",
        "category": "Document Juridique Obligatoire",
        "summary": "Directives relatives à la collecte, au chiffrement et au respect des normes RGPD sur Nizalo.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Données collectées",
            "content": [
              "Identifiants de compte, courriel, données de connexion, empreintes de triche et justificatifs d'identité (KYC)."
            ]
          },
          {
            "title": "2. Sécurité et confidentialité",
            "content": [
              "Vos données ne sont jamais cédées ni commercialisées. Les mots de passe et sessions sont rigoureusement chiffrés."
            ]
          }
        ]
      },
      "hi": {
        "title": "गोपनीयता नीति (Privacy Policy)",
        "category": "अनिवार्य कानूनी नीति",
        "summary": "व्यक्तिगत डेटा, गेमप्ले टेलीमेट्री और सुरक्षित एन्क्रिप्शन मानकों का विवरण।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. एकत्र की जाने वाली जानकारी",
            "content": [
              "उपयोगकर्ता नाम, ईमेल, डिवाइस फिंगरप्रिंट और गेम में चालों का समय रिकॉर्ड (धोखाधड़ी रोकने हेतु)।"
            ]
          },
          {
            "title": "2. डेटा सुरक्षा",
            "content": [
              "Nizalo कभी भी आपका व्यक्तिगत डेटा किसी तीसरे पक्ष को विज्ञापनों के लिए नहीं बेचता है।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "fair_play",
    "version": "1.0.0",
    "is_mandatory": true,
    "icon": "🎯",
    "locales": {
      "ar": {
        "title": "ميثاق اللعب النظيف ومكافحة الغش",
        "category": "وثيقة قانونية إلزامية",
        "summary": "القواعد الصارمة لحظر محركات الذكاء الاصطناعي، وتلاعب التصنيفات، والتواطؤ بين اللاعبين.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. الحظر المطلق للذكاء الاصطناعي والبرمجيات المساعدة",
            "content": [
              "يحظر حظراً تاماً استخدام أي محركات شطرنج (مثل Stockfish)، أو روبوتات آلية (Bots)، أو برمجيات حسابية مساعدة أثناء اللعب في أي من ألعاب المنصة العشر.",
              "يتم تحليل كل نقلة وحركة وتوقيتها إحصائياً عبر منظومة الفحص الجنائي الرقمي الخاصة بنا للكشف عن أي تطابق غير طبيعي مع محركات الذكاء الاصطناعي."
            ],
            "callout": "عقوبة فورية: استخدام برمجيات الغش يؤدي إلى حظر الحساب نهائياً ومصادرة أي أرصدة تم الحصول عليها بالتلاعب."
          },
          {
            "title": "2. حظر التواطؤ والتلاعب بالتصنيفات (Sandbagging)",
            "content": [
              "يحظر الاتفاق المسبق بين اللاعبين على نتيجة المباريات لتمرير الجوائز أو تفريغ الأرصدة.",
              "يُحظر تعمد خسارة المباريات لتخفيض التصنيف عمداً بهدف المنافسة ضد لاعبين أقل خبرة في البطولات."
            ]
          },
          {
            "title": "3. نزاهة السيرفر واسترجاع المباريات",
            "content": [
              "خادم Nizalo هو المرجع الوحيد المعتمد لحالة اللعبة وتوقيت الساعات وحركات القطع، وتُحفظ سجلات الإعادة (PGN/Notation) لجميع المباريات كدليل جنائي غير قابل للتعديل."
            ]
          }
        ]
      },
      "en": {
        "title": "Fair Play & Anti-Cheat Policy",
        "category": "Mandatory Legal Policy",
        "summary": "Zero-tolerance framework prohibiting AI engines, automated bots, multi-accounting, and rating manipulation.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Zero Tolerance for AI & External Solvers",
            "content": [
              "The use of chess engines (e.g. Stockfish), neural networks, automated solvers, or bot scripts is strictly forbidden.",
              "Every move and time-delta is continuously analyzed by our proprietary forensic anti-cheat telemetry."
            ],
            "callout": "Mandatory Penalty: Proven cheating results in permanent platform ban and forfeiture of all illicit funds."
          },
          {
            "title": "2. Collusion & Sandbagging Prohibitions",
            "content": [
              "Match-fixing, win-trading, syndicate collusion, and intentional rating deflation (sandbagging) are treated as severe fraud.",
              "All matches are subject to retroactive audit and rating recalibration."
            ]
          }
        ]
      },
      "zh": {
        "title": "公平竞赛与反作弊守则 (Fair Play)",
        "category": "核心法定条款",
        "summary": "严禁 AI 引擎、自动化辅助脚本、串通打假赛与恶意刷分的零容忍守则。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 严禁任何 AI 辅助与外挂",
            "content": [
              "严禁使用 Stockfish、自动化求解器或辅助软件。系统会对所有走棋进行法证级算法分析。"
            ]
          },
          {
            "title": "2. 严惩假赛与串通",
            "content": [
              "故意输棋、恶意刷分或串通操纵排名的行为将受到永久封号与没收违规奖金处理。"
            ]
          }
        ]
      },
      "es": {
        "title": "Política de Juego Limpio y Anti-Trampas",
        "category": "Política Legal Obligatoria",
        "summary": "Tolerancia cero frente a motores de IA, bots, colusión y manipulación de clasificaciones.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Prohibición estricta de motores de IA",
            "content": [
              "Queda prohibido el uso de motores de ajedrez o software de asistencia durante las partidas."
            ]
          }
        ]
      },
      "fr": {
        "title": "Charte du Jeu Équitable et Anti-Triche",
        "category": "Document Juridique Obligatoire",
        "summary": "Tolérance zéro pour les moteurs d'échecs (Stockfish), les bots et la collusion organisée.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Interdiction absolue de l'assistance IA",
            "content": [
              "Tout recours à un moteur de jeu ou assistant tiers entraîne l'exclusion définitive immédiate."
            ]
          }
        ]
      },
      "hi": {
        "title": "निष्पक्ष खेल एवं धोखाधड़ी-रोधी नीति (Fair Play)",
        "category": "अनिवार्य कानूनी नीति",
        "summary": "AI इंजन, बॉट्स और मैच फिक्सिंग के खिलाफ कड़े नियम।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. AI और बॉट्स पर पूर्ण प्रतिबंध",
            "content": [
              "किसी भी AI इंजन या बाहरी सहायता सॉफ़्टवेयर का उपयोग करने पर खाता स्थायी रूप से बंद कर दिया जाएगा।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "payments_policy",
    "version": "1.0.0",
    "is_mandatory": true,
    "icon": "💳",
    "locales": {
      "ar": {
        "title": "سياسة المدفوعات والسحوبات والخزينة",
        "category": "وثيقة قانونية إلزامية",
        "summary": "قواعد إيداع وسحب USDT، تأكيدات البلوكشين، رسوم الشبكة، وتدابير منع الاحتيال المالي.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. الأصول المدعومة وشبكات البلوكشين",
            "content": [
              "تدعم منصة Nizalo تسوية العمليات باستخدام عملة USDT عبر الشبكات المعتمدة (مثل Polygon / TRON).",
              "المستخدم مسؤول حصرياً عن التأكد من اختيار الشبكة الصحيحة وعنوان المحفظة الدقيق عند إجراء أي تحويل رقمي."
            ]
          },
          {
            "title": "2. تأكيدات الشبكة ونهائية العمليات",
            "content": [
              "تتطلب الإيداعات عدداً محدداً من تأكيدات الكتل على البلوكشين قبل قيدها في رصيد المحفظة المتاح.",
              "التحويلات عبر البلوكشين نهائية وغير قابلة للإلغاء أو الاسترجاع بأي حال من الأحوال بمجرد بثها على الشبكة."
            ]
          },
          {
            "title": "3. ضوابط السحب والحدود الدنيا ورسوم الغاز",
            "content": [
              "يخضع كل طلب سحب لفحص أمني آلي لمنع الاحتيال وللتحقق من اجتياز اللاعب لمتطلبات اللعب النظيف.",
              "يتحمل المستخدم رسوم الغاز (Gas / Miner Fees) الفعلية للشبكة، وتُخصم مباشرة من قيمة مبلغ السحب الصادر."
            ]
          }
        ]
      },
      "en": {
        "title": "Payments & Withdrawals Policy",
        "category": "Mandatory Legal Policy",
        "summary": "Treasury protocols, USDT blockchain confirmation standards, cashout processing, and gas fee rules.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Supported Digital Assets & Chains",
            "content": [
              "Nizalo supports USDT deposits and withdrawals on officially designated blockchain networks.",
              "Users are solely responsible for ensuring correct network selection and destination wallet accuracy."
            ]
          },
          {
            "title": "2. Finality & Confirmation Thresholds",
            "content": [
              "All blockchain deposits require a standardized block confirmation count before balance crediting.",
              "Transactions on the distributed ledger are permanent, instantaneous upon broadcast, and irreversible."
            ]
          },
          {
            "title": "3. Cashout Verification & Network Gas Fees",
            "content": [
              "Withdrawals undergo automated risk screening and compliance verification.",
              "Network miner/gas fees are deducted from outbound withdrawals at the prevailing market network rate."
            ]
          }
        ]
      },
      "zh": {
        "title": "支付与提款政策 (Payments & Withdrawals)",
        "category": "核心法定条款",
        "summary": "USDT 充值与提现规范、区块链区块确认要求、Gas 旷工费与防洗钱出金审查流程。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 链上转账与到账确认",
            "content": [
              "支持指定公链的 USDT 充提。用户必须仔细核对充币地址与主网类型，因网络选择错误导致的资产损失不可追回。"
            ]
          },
          {
            "title": "2. 提款安全风控",
            "content": [
              "所有提款均须通过风控合规审查与反作弊回溯验证，网络矿工费由出金方自行承担。"
            ]
          }
        ]
      },
      "es": {
        "title": "Política de Pagos y Retiros",
        "category": "Política Legal Obligatoria",
        "summary": "Términos sobre depósitos en USDT, confirmaciones en blockchain y procesamiento de retiros seguros.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Transacciones en Blockchain",
            "content": [
              "Los depósitos se acreditan tras las confirmaciones de red requeridas. Las transacciones en blockchain son irreversibles."
            ]
          }
        ]
      },
      "fr": {
        "title": "Politique des Paiements et Retraits",
        "category": "Document Juridique Obligatoire",
        "summary": "Directives relatives aux dépôts en USDT, confirmations de réseau et frais de retrait.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Normes de transaction blockchain",
            "content": [
              "Toutes les transactions en cryptomonnaie (USDT) sont définitives dès leur confirmation sur la blockchain."
            ]
          }
        ]
      },
      "hi": {
        "title": "भुगतान एवं निकासी नीति (Payments Policy)",
        "category": "अनिवार्य कानूनी नीति",
        "summary": "USDT ब्लॉकचेन लेनदेन, नेटवर्क शुल्क और निकासी सत्यापन के नियम।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. ब्लॉकचेन लेनदेन के नियम",
            "content": [
              "ब्लॉकचेन पर लेनदेन अपरिवर्तनीय हैं। सही नेटवर्क और पते का चयन करना उपयोगकर्ता की ज़िम्मेदारी है।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "referral_terms",
    "version": "1.0.0",
    "is_mandatory": false,
    "icon": "🤝",
    "locales": {
      "ar": {
        "title": "شروط وضوابط برنامج الإحالة",
        "category": "دليل تنظيمي للمنصة",
        "summary": "آلية مكافأة الإحالة الأحادية ($1.00 عند إيداع $5.00)، وشروط مكافحة الاحتيال والحسابات الوهمية.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. نموذج المكافأة الأحادية",
            "content": [
              "يحصل اللاعب الداعي (Referrer) على مكافأة ترويجية قدرها $1.00 دولار تودع في رصيد محفظته عندما يقوم اللاعب المدعو بالتسجيل عبر رابطه وإتمام أول إيداع مؤكد لا يقل عن $5.00 دولارات.",
              "لا يحصل اللاعب المدعو على أي مكافأة نقدية مباشرة منعاً للحسابات الوهمية ومزارع الروبوتات."
            ]
          },
          {
            "title": "2. معايير الاستحقاق ومنع الاحتيال",
            "content": [
              "يُحظر تماماً إحالة النفس، أو إنشاء حسابات مكررة لنفس الشخص، أو استخدام نفس الجهاز أو عنوان IP لجمع المكافآت.",
              "يتم إلغاء المكافآت وحظر الحسابات المتورطة في ممارسات الاحتيال الدائري أو الرسائل المزعجة (Spam)."
            ]
          }
        ]
      },
      "en": {
        "title": "Referral Program Terms",
        "category": "Operational Guideline",
        "summary": "One-way incentive model ($1.00 reward on qualifying $5.00 deposit) and anti-sybil enforcement rules.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. One-Way Incentive Architecture",
            "content": [
              "Existing players receive a $1.00 ledger credit when an eligible referee registers and completes a confirmed deposit of at least $5.00 USD.",
              "Referees receive no direct cash incentive, preventing sybil farming and voucher abuse."
            ]
          },
          {
            "title": "2. Strict Anti-Fraud Screening",
            "content": [
              "Self-referrals, duplicate hardware fingerprints, and circular referral rings are strictly void and prohibited."
            ]
          }
        ]
      },
      "zh": {
        "title": "推荐返佣计划条款 (Referral Terms)",
        "category": "运营准则",
        "summary": "单向推荐激励规则（受邀人首次充值满 $5.00，推荐人获 $1.00 奖励）与防刷号机制。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 单向奖励模型",
            "content": [
              "受邀好友注册并完成首笔不低于 $5.00 的真实充值后，推荐人可获得 $1.00 奖励金进入可用余额。"
            ]
          }
        ]
      },
      "es": {
        "title": "Términos del Programa de Referidos",
        "category": "Guía Operativa",
        "summary": "Modelo de recompensa unidireccional y normas estrictas contra cuentas duplicadas.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Estructura de incentivos",
            "content": [
              "Gane $1.00 cuando su referido complete un depósito elegible de al menos $5.00."
            ]
          }
        ]
      },
      "fr": {
        "title": "Conditions du Programme de Parrainage",
        "category": "Directive Opérationnelle",
        "summary": "Structure de récompense unidirectionnelle et prévention stricte de la fraude.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Récompense de parrainage",
            "content": [
              "Le parrain reçoit 1,00 $ dès que le filleul effectue un premier dépôt confirmé d'au moins 5,00 $."
            ]
          }
        ]
      },
      "hi": {
        "title": "रेफरल कार्यक्रम की शर्तें (Referral Terms)",
        "category": "संचालन दिशानिर्देश",
        "summary": "एकतरफा प्रोत्साहन मॉडल और धोखाधड़ी रोकथाम के नियम।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. रेफरल प्रोत्साहन",
            "content": [
              "जब कोई नया उपयोगकर्ता $5.00 या उससे अधिक जमा करता है, तो रेफरर को $1.00 का इनाम मिलता है।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "responsible_play",
    "version": "1.0.0",
    "is_mandatory": false,
    "icon": "🧘",
    "locales": {
      "ar": {
        "title": "سياسة اللعب المسؤول وحماية اللاعبين",
        "category": "دليل تنظيمي للمنصة",
        "summary": "أدوات ضبط النفس، وضع حدود للإيداع والوقت، وخيارات الاستبعاد الذاتي المؤقت والدائم.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. الالتزام بالبيئة التنافسية الصحية",
            "content": [
              "رغم أن ألعاب Nizalo هي ألعاب مهارة وذكاء بحتة، إلا أننا ملتزمون بتمكين اللاعبين من إدارة وقتهم وميزانياتهم بمسؤولية تامة."
            ]
          },
          {
            "title": "2. أدوات التحكم والحدود الذاتية",
            "content": [
              "حدود الإيداع: يمكن للاعب وضع سقف يومي أو أسبوعي أو شهري لمبالغ الإيداع.",
              "تنبيهات مدة اللعب: إشعارات دورية على الشاشة توضح الوقت المنقضي أثناء اللعب المتواصل.",
              "فترات التهدئة والاستبعاد الذاتي (Self-Exclusion): يمكن للاعب أخذ استراحة مؤقتة تبدأ من 24 ساعة، أو طلب استبعاد ذاتي دائم."
            ]
          }
        ]
      },
      "en": {
        "title": "Responsible Play Policy",
        "category": "Operational Guideline",
        "summary": "Player protection tools, deposit caps, session reality checks, and voluntary self-exclusion periods.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Commitment to Healthy Competition",
            "content": [
              "While our games are skill-dominant, Nizalo provides robust governance tools to help players maintain healthy habits."
            ]
          },
          {
            "title": "2. Player Control Tools & Self-Exclusion",
            "content": [
              "Players may set daily/weekly deposit caps and session reality-check timers in settings.",
              "Voluntary cooling-off breaks (24 hours to 30 days) and irrevocable long-term self-exclusion are available anytime."
            ]
          }
        ]
      },
      "zh": {
        "title": "责任博弈与健康竞技守则 (Responsible Play)",
        "category": "运营准则",
        "summary": "提供充值限额、时间提醒与长期自我隔离等全方位玩家健康保障工具。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 自我保护与隔离工具",
            "content": [
              "玩家可随时设置每日充值上限，或申请 24 小时至永久的自我隔离（Self-Exclusion）。"
            ]
          }
        ]
      },
      "es": {
        "title": "Política de Juego Responsable",
        "category": "Guía Operativa",
        "summary": "Herramientas de control, límites de depósito y opciones de autoexclusión.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Herramientas de control",
            "content": [
              "Configure límites de depósito y periodos de autoexclusión para mantener un juego seguro y equilibrado."
            ]
          }
        ]
      },
      "fr": {
        "title": "Politique de Jeu Responsable",
        "category": "Directive Opérationnelle",
        "summary": "Dispositifs d'autolimitation, alertes temporelles et procédures d'auto-exclusion.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Dispositifs de protection",
            "content": [
              "Définissez des plafonds de dépôt et activez des périodes de pause ou d'auto-exclusion à tout moment."
            ]
          }
        ]
      },
      "hi": {
        "title": "उत्तरदायी खेल नीति (Responsible Play)",
        "category": "संचालन दिशानिर्देश",
        "summary": "जमा सीमा, समय सीमा और स्व-बहिष्कार (Self-Exclusion) के विकल्प।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. खिलाड़ी सुरक्षा उपकरण",
            "content": [
              "अपनी सुरक्षा के लिए जमा सीमा निर्धारित करें या स्व-बहिष्कार का विकल्प चुनें।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "community_rules",
    "version": "1.0.0",
    "is_mandatory": false,
    "icon": "💬",
    "locales": {
      "ar": {
        "title": "قواعد المجتمع والدردشة",
        "category": "دليل تنظيمي للمنصة",
        "summary": "معايير السلوك في غرف الدردشة أثناء المباريات، وحظر الإساءة والرسائل الدعائية.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. معايير الاحترام والروح الرياضية",
            "content": [
              "الدردشة مخصصة للتحلي بالروح الرياضية وتشجيع التنافس الشريف. يجب التعامل مع كافة المنافسين باحترام ولباقة."
            ]
          },
          {
            "title": "2. السلوكيات المحظورة تماماً",
            "content": [
              "يحظر تماماً توجيه الإهانات، أو خطابات الكراهية، أو التحرش، أو استخدام ألفاظ غير لائقة.",
              "يحظر نشر الروابط الإعلانية أو الترويج لمشاريع خارجية أو نشر معلومات شخصية حساسة (Doxxing)."
            ]
          },
          {
            "title": "3. العقوبات التدريجية",
            "content": [
              "تبدأ العقوبات بكتم الدردشة مؤقتاً لمدة 24 ساعة، وتتدرج إلى الحظر الأسبوعي ثم الإيقاف النهائي عند تكرار المخالفات."
            ]
          }
        ]
      },
      "en": {
        "title": "Community & In-Game Chat Rules",
        "category": "Operational Guideline",
        "summary": "Behavioral standards, prohibition of harassment and promotional spam, and moderation enforcement tiers.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Standards of Conduct",
            "content": [
              "Match and lobby chat must remain respectful, competitive, and civil at all times."
            ]
          },
          {
            "title": "2. Strictly Prohibited Behavior",
            "content": [
              "Harassment, hate speech, threats, spam, external advertising, and doxxing are strictly banned."
            ]
          },
          {
            "title": "3. Graduated Enforcement",
            "content": [
              "Violations result in 24-hour mutes, progressing to 7-day communication bans or permanent chat revocations."
            ]
          }
        ]
      },
      "zh": {
        "title": "社区与对局聊天规范 (Community Rules)",
        "category": "运营准则",
        "summary": "维护良好竞技氛围，严禁辱骂骚扰、垃圾广告宣传与不良言论。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 文明竞技准则",
            "content": [
              "严禁恶意辱骂、种族歧视言论及发布外部商业广告，违者将禁言或封禁聊天权限。"
            ]
          }
        ]
      },
      "es": {
        "title": "Reglas de la Comunidad y del Chat",
        "category": "Guía Operativa",
        "summary": "Normas de convivencia deportiva, prohibición de spam y sanciones aplicables.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Conducta respetuosa",
            "content": [
              "El acoso, el lenguaje ofensivo y la publicidad externa están terminantemente prohibidos."
            ]
          }
        ]
      },
      "fr": {
        "title": "Règles de la Communauté et du Tchat",
        "category": "Directive Opérationnelle",
        "summary": "Directives de courtoisie et sanctions en cas de comportement toxique ou de spam.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Respect et courtoisie",
            "content": [
              "Les propos injurieux, le harcèlement et le spam publicitaire sont strictement interdits."
            ]
          }
        ]
      },
      "hi": {
        "title": "सामुदायिक एवं चैट नियम (Community Rules)",
        "category": "संचालन दिशानिर्देश",
        "summary": "खेल भावना, सम्मानजनक बातचीत और स्पैम निषेध के नियम।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. सम्मानजनक आचरण",
            "content": [
              "किसी भी प्रकार का दुर्व्यवहार, उत्पीड़न या विज्ञापन लिंक साझा करना सख्त वर्जित है।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "cookie_policy",
    "version": "1.0.0",
    "is_mandatory": false,
    "icon": "🍪",
    "locales": {
      "ar": {
        "title": "سياسة ملفات تعريف الارتباط (Cookies)",
        "category": "دليل تنظيمي للمنصة",
        "summary": "كيفية استخدام ملفات التخزين المؤقت للحفاظ على أمان الجلسات وتفضيلات اللغة والمظهر.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. ما هي ملفات تعريف الارتباط المستخدمة؟",
            "content": [
              "نستخدم ملفات تعريف الارتباط الأساسية (Essential Cookies) وتخزين المتصفح المحلي (LocalStorage) للحفاظ على تسجيل دخولك الآمن، وتخزين تفضيلات اللغة، وحماية حسابك من التلاعب بالجلسات."
            ]
          },
          {
            "title": "2. عدم استخدام كوكيز تتبع إعلاني خارجي",
            "content": [
              "لا نستخدم ملفات تعريف ارتباط خاصة بشبكات إعلانية متطفلة تتبع تصفحك خارج منصة Nizalo."
            ]
          }
        ]
      },
      "en": {
        "title": "Cookie & Tracking Policy",
        "category": "Operational Guideline",
        "summary": "How Nizalo utilizes essential cookies and local storage for authentication, security, and locale settings.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Types of Cookies We Utilize",
            "content": [
              "We utilize strictly essential authentication tokens, theme preferences, and locale cookies to preserve your secure session."
            ]
          },
          {
            "title": "2. No Third-Party Ad Trackers",
            "content": [
              "Nizalo does not embed cross-site behavioral ad trackers or advertising beacons."
            ]
          }
        ]
      },
      "zh": {
        "title": "Cookie 与本地存储政策 (Cookie Policy)",
        "category": "运营准则",
        "summary": "平台利用安全 Cookie 维持用户登录状态、语言选择及防伪造跨站攻击的说明。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 核心 Cookie 用途",
            "content": [
              "仅使用保障账号登录安全、语言与界面偏好所必需的 Cookie，不包含任何第三方广告追踪。"
            ]
          }
        ]
      },
      "es": {
        "title": "Política de Cookies",
        "category": "Guía Operativa",
        "summary": "Uso de cookies estrictamente necesarias para la autenticación y la seguridad de la sesión.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Cookies utilizadas",
            "content": [
              "Utilizamos únicamente cookies esenciales para mantener su sesión activa y guardar sus preferencias."
            ]
          }
        ]
      },
      "fr": {
        "title": "Politique relative aux Cookies",
        "category": "Directive Opérationnelle",
        "summary": "Utilisation exclusive de cookies essentiels nécessaires à la sécurité et à l'authentification.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Rôle des cookies",
            "content": [
              "Nous utilisons uniquement des cookies nécessaires au maintien sécurisé de votre session et à vos préférences."
            ]
          }
        ]
      },
      "hi": {
        "title": "कुकी नीति (Cookie Policy)",
        "category": "संचालन दिशानिर्देश",
        "summary": "सुरक्षित लॉगिन और प्राथमिकताओं के लिए आवश्यक कुकीज़ का उपयोग।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. कुकीज़ का उपयोग",
            "content": [
              "हम केवल आपके सुरक्षित सत्र और भाषा प्राथमिकताओं को बनाए रखने के लिए आवश्यक कुकीज़ का उपयोग करते हैं।"
            ]
          }
        ]
      }
    }
  },
  {
    "id": "tournament_rules",
    "version": "1.0.0",
    "is_mandatory": false,
    "icon": "🏆",
    "locales": {
      "ar": {
        "title": "إطار قواعد البطولات والمنافسات الرسمية",
        "category": "دليل تنظيمي للمنصة",
        "summary": "هيكل الجولات، أنظمة الإقصاء، قواعد التعادل وكسر التعادل، وتوزيع مجموعات الجوائز.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. أنظمة وهيكل البطولات",
            "content": [
              "تعتمد بطولات Nizalo نظام الإقصاء الفردي المباشر (Single Elimination) أو النظام السويسري (Swiss) حسب نوع البطولة المعلن عنه في صالة المنافسة.",
              "يتم الإعلان عن جدول المباريات والوقت المخصص لكل لاعب قبل بدء الجولة الأولى بشكل شفاف ونهائي."
            ]
          },
          {
            "title": "2. قواعد كسر التعادل والوقت الإضافي",
            "content": [
              "في مباريات الإقصاء التي تتطلب فائزاً حتمياً (مثل الشطرنج والداما)، يتم اللجوء لمباراة خاطفة حاسمة (Blitz Tie-Breaker) أو الأفضلية لأقل استخدام للوقت وفق القواعد المحددة للبطولة."
            ]
          },
          {
            "title": "3. التوزيع التلقائي للجوائز",
            "content": [
              "تُوزع الجوائز تلقائياً عبر دفتر الأستاذ المالي فور انتهاء المباراة النهائية واجتياز الفائزين للفحص الآلي للعب النظيف."
            ]
          }
        ]
      },
      "en": {
        "title": "Tournament Rules Framework",
        "category": "Operational Guideline",
        "summary": "Bracket structures, tie-break protocols, elimination rounds, and automated prize pool distribution.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Tournament Formats & Scheduling",
            "content": [
              "Tournaments operate under Single Elimination, Double Elimination, or Swiss bracket structures.",
              "Round schedules and official clocks are server-managed and published in the tournament lobby."
            ]
          },
          {
            "title": "2. Tie-Break & Sudden Death Protocols",
            "content": [
              "Where decisive match outcomes are required, sudden-death blitz games or tie-break metrics govern advancement."
            ]
          },
          {
            "title": "3. Automated Prize Distribution",
            "content": [
              "Prize pools are credited directly to winning players' wallets via the double-entry ledger upon final match completion."
            ]
          }
        ]
      },
      "zh": {
        "title": "锦标赛竞赛规则框架 (Tournament Rules)",
        "category": "运营准则",
        "summary": "晋级赛制、瑞士轮、淘汰赛规则、加赛决胜与奖金池自动分发机制。",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. 赛制与奖金自动发放",
            "content": [
              "支持单败淘汰赛与瑞士制竞赛。比赛结束后，系统通过双录账本自动结算并发放奖金。"
            ]
          }
        ]
      },
      "es": {
        "title": "Marco de Reglas de Torneos",
        "category": "Guía Operativa",
        "summary": "Formatos de eliminación, criterios de desempate y reparto automatizado de premios.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Reglas de torneos",
            "content": [
              "Estructuras de eliminación justa con desempates reglamentados y distribución automática de premios."
            ]
          }
        ]
      },
      "fr": {
        "title": "Cadre des Règles de Tournois",
        "category": "Directive Opérationnelle",
        "summary": "Structures d'élimination, règles de départage et versement automatisé des cagnottes.",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. Organisation des tournois",
            "content": [
              "Formats à élimination directe ou rondes suisses avec attribution automatisée des récompenses."
            ]
          }
        ]
      },
      "hi": {
        "title": "टूर्नामेंट नियम ढांचा (Tournament Rules)",
        "category": "संचालन दिशानिर्देश",
        "summary": "ब्रैकेट प्रारूप, टाई-ब्रेक नियम और पुरस्कार राशि का स्वचालित वितरण।",
        "lastUpdated": "2026-09-01",
        "sections": [
          {
            "title": "1. टूर्नामेंट नियम",
            "content": [
              "टूर्नामेंट निष्पक्ष उन्मूलन नियमों के तहत आयोजित किए जाते हैं और पुरस्कार राशि स्वचालित रूप से वितरित की जाती है।"
            ]
          }
        ]
      }
    }
  }
];

export function getPoliciesForLocale(locale: string) {
  const loc = (["ar", "en", "zh", "es", "fr", "hi"].includes(locale) ? locale : "en") as keyof PolicyItem["locales"];
  return POLICIES_DATA.map((p) => ({
    id: p.id,
    version: p.version,
    is_mandatory: p.is_mandatory,
    icon: p.icon,
    ...p.locales[loc]
  }));
}

export function getPolicyDetail(id: string, locale: string) {
  const policy = POLICIES_DATA.find((p) => p.id === id);
  if (!policy) return null;
  const loc = (["ar", "en", "zh", "es", "fr", "hi"].includes(locale) ? locale : "en") as keyof PolicyItem["locales"];
  return {
    id: policy.id,
    version: policy.version,
    is_mandatory: policy.is_mandatory,
    icon: policy.icon,
    ...policy.locales[loc]
  };
}
