export type FAQItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
};

type LocalizedFAQ = Record<string, FAQItem[]>;

export const FAQ_DATA: LocalizedFAQ = {
  ar: [
    // 1. الحساب (Account)
    {
      id: "acc-1",
      category: "account",
      question: "كيف أقوم بإنشاء وتأكيد حسابي على منصة Nizalo؟",
      answer: "يمكنك إنشاء حساب بسهولة عبر اختيار اسم مستخدم فريد وكلمة مرور قوية (10 خانات على الأقل)، أو التسجيل السريع بنقرة واحدة عبر حساب Google. يتم تعيين معرف لاعب دائم لكل حساب. للحفاظ على نزاهة المنصة، يُسمح بحساب واحد فقط لكل شخص طبيعي.",
      tags: ["تسجيل", "إنشاء حساب", "توثيق", "تأكيد", "حساب جديد"]
    },
    {
      id: "acc-2",
      category: "account",
      question: "هل يمكنني تغيير اسم المستخدم (اللقب) بعد التسجيل؟",
      answer: "يمكنك تعديل الصورة الرمزية وإعدادات الملف الشخصي من صفحة الملف الشخصي. أما اسم المستخدم (Nickname) فهو معرفك الرسمي والدائم في سجل المباريات التنافسية والتصنيفات ورمز الإحالة الخاص بك ولا يمكن تغييره عشوائياً.",
      tags: ["اسم المستخدم", "تعديل الملف", "اللقب", "إعدادات"]
    },
    {
      id: "acc-3",
      category: "account",
      question: "كيف أستعيد حسابي في حال نسيت كلمة المرور؟",
      answer: "في شاشة تسجيل الدخول، اضغط على 'نسيت كلمة المرور؟' أو اختر تسجيل الدخول عبر رمز بريدي مؤقت. ستتلقى رمز تحقق آمن مكون من 6 خانات على بريدك الإلكتروني لإعادة تعيين كلمة المرور فوراً.",
      tags: ["نسيت كلمة المرور", "استعادة الحساب", "رمز التحقق", "أمان"]
    },

    // 2. تسجيل الدخول (Login)
    {
      id: "login-1",
      category: "login",
      question: "ماذا أفعل إذا تم قفل حسابي بعد محاولات تسجيل خاطئة؟",
      answer: "لحماية أمان حسابك، يقوم نظام الحماية الآلي بقفل محاولات الدخول مؤقتاً عند تكرار إدخال كلمة مرور خاطئة. يرجى الانتظار 5 إلى 10 دقائق لانتهاء مهلة القفل، أو استخدم رابط استعادة الحساب عبر البريد الإلكتروني.",
      tags: ["قفل الحساب", "محاولات خاطئة", "تسجيل الدخول", "أمان"]
    },
    {
      id: "login-2",
      category: "login",
      question: "كيف أقوم بتفعيل واستخدام المصادقة الثنائية (TOTP 2FA)؟",
      answer: "توجه إلى صفحة 'الإعدادات > الأمان' وقم بتفعيل المصادقة الثنائية باستخدام أي تطبيق قياسي مثل (Google Authenticator أو 1Password). بمجرد التفعيل، سيُطلب منك رمز الـ 6 خانات عند كل تسجيل دخول ومعاملة سحب لضمان الحماية القصوى.",
      tags: ["2fa", "المصادقة الثنائية", "جوجل", "أمان", "حماية"]
    },
    {
      id: "login-3",
      category: "login",
      question: "هل يمكنني تسجيل الدخول عبر حساب Google؟",
      answer: "نعم، تدعم منصة Nizalo تسجيل الدخول المباشر والسريع عبر Google بنقرة واحدة وآمنة تماماً دون الحاجة لتذكر كلمة المرور.",
      tags: ["جوجل", "تسجيل سريع", "gmail", "google login"]
    },

    // 3. الألعاب (Games)
    {
      id: "games-1",
      category: "games",
      question: "ما هي الألعاب الإحدى عشرة المتاحة على منصة Nizalo؟",
      answer: "تضم منصة Nizalo حالياً 11 لعبة مهارة واستراتيجية كلاسيكية: الشطرنج، البلياردو، الداما، الدومينو، طاولة الزهر، سيجة، كونكت 4، إكس أو (تيك تاك تو)، الحساب السريع، ريفيرسي (عطيل)، وجوموكو. تتبع جميع الألعاب القواعد الرسمية المعترف بها دولياً مع تحكيم آلي حازم من الخادم.",
      tags: ["الألعاب", "شطرنج", "بلياردو", "داما", "دومينو", "طاولة الزهر", "سيجة", "كونكت 4", "إكس أو", "حساب سريع", "ريفيرسي", "جوموكو"]
    },
    {
      id: "games-2",
      category: "games",
      question: "هل نتائج الألعاب تعتمد على المهارة البحتة؟",
      answer: "نعم بالتأكيد. جميع ألعاب Nizalo هي مسابقات مهارة وذكاء بحتة (Pure Skill Games). النتيجة تعتمد كلياً على اختيارات اللاعب وتكتيكاته وسرعة بديهته ودقة قراراته، ولا توجد أي آليات قمار أو حظ؛ بل تعتمد نتائج المباريات بالكامل على التنافس والذكاء ومهارة اللاعب.",
      tags: ["مهارة", "عدالة", "نزاهة", "بدون حظ"]
    },

    // 4. توفيق المباريات (Matchmaking)
    {
      id: "match-1",
      category: "matchmaking",
      question: "كيف يختار نظام التوفيق المنافسين في المباريات؟",
      answer: "يعتمد نظام التوفيق على تصنيف المهارة الذكي (نظام تقييم ELO ومعدل المهارة العالمي GSS) بالإضافة إلى قياس استجابة الشبكة (Latency) لضمان سرعة اللعب وتكافؤ الفرص بين المتنافسين.",
      tags: ["توفيق المباريات", "elo", "تصنيف", "منافسين"]
    },
    {
      id: "match-2",
      category: "matchmaking",
      question: "ما هو معدل المهارة العالمي (Global Skill Score)؟",
      answer: "هو مؤشر رقمي مئوي مركب يعكس مستوى مهارة اللاعب الإجمالية عبر جميع الألعاب الإحدى عشرة، ويحسب بدقة بناءً على نسبة الانتصارات، ومعدل دقة التحركات، وعدد المباريات المنجزة.",
      tags: ["gss", "المهارة العالمية", "تصنيف", "المتصدرين"]
    },

    // 5. تحديات الأصدقاء (Friend Challenges)
    {
      id: "friend-1",
      category: "friend_challenges",
      question: "كيف أتحدى صديقاً محدداً في مباراة خاصة؟",
      answer: "من قائمة 'اللعب'، اختر 'تحدي صديق'، ثم أدخل اسم المستخدم لصديقك، وحدد اللعبة، ونظام الوقت، ورسم التحدي (أو اختر اللعب الودي المجاني)، وأرسل الدعوة. سيصل إشعار فوري لصديقك مع عد تنازلي مدته 60 ثانية للقبول.",
      tags: ["تحدي صديق", "دعوة خاصة", "مباراة ودية"]
    },
    {
      id: "friend-2",
      category: "friend_challenges",
      question: "ماذا يحدث إذا لم يقبل الصديق الدعوة في الوقت المحدد؟",
      answer: "إذا انتهت مهلة الـ 60 ثانية دون استجابة أو رفض الصديق الدعوة، تنتهي صلاحية التحدي تلقائياً ويتم فك تجميد رصيد المباراة فوراً في محفظتك.",
      tags: ["انتهاء الدعوة", "إلغاء التحدي", "استرجاع الرصيد"]
    },

    // 6. البطولات (Tournaments)
    {
      id: "tourn-1",
      category: "tournaments",
      question: "كيف تعمل بطولات Nizalo وكيف تُوزع الجوائز؟",
      answer: "تتبع البطولات أنظمة التنافس القياسية (خروج المغلوب المباشر أو النظام السويسري). يتأهل اللاعبون عند الفوز في كل دور. تُوزع الجوائز تلقائياً عبر دفتر الأستاذ المالي فور انتهاء المباراة النهائية وفق جدول الجوائز المعلن قبل انطلاق البطولة.",
      tags: ["بطولات", "جوائز", "خروج المغلوب", "تصفيات"]
    },
    {
      id: "tourn-2",
      category: "tournaments",
      question: "ما هي قواعد الحسم في حال انتهاء مباراة بطولة بالتعادل؟",
      answer: "في مباريات خروج المغلوب التي تتطلب حسماً قاطعاً، تُقام مباراة خاطفة حاسمة (Blitz) بوقت سريع لتحديد المتأهل وفق القواعد المعتمدة للبطولة.",
      tags: ["تعادل", "مباراة حاسمة", "قواعد البطولة"]
    },

    // 7. المحفظة (Wallet)
    {
      id: "wallet-1",
      category: "wallet",
      question: "كيف يعمل دفتر الأستاذ المالي على منصة Nizalo؟",
      answer: "تستخدم Nizalo نظام محاسبي مالي مزدوج القيد (Double-Entry Ledger) فائق الأمان. كل حركة رصيد—سواء كانت إيداعاً، أو حجز قيمة المشاركة لمباراة جارية، أو إضافة جائزة الفوز، أو سحب—تُقيد في سجل تدقيق مشفر غير قابل للتلاعب.",
      tags: ["محفظة", "دفتر أستاذ", "رصيد", "أمان مالي"]
    },
    {
      id: "wallet-2",
      category: "wallet",
      question: "هل يستطيع موظفو الدعم الفني تعديل رصيد محفظتي يدوياً؟",
      answer: "قطعاً لا. وفقاً للسياسة الأمنية الصارمة للمنصة، لا يملك أي موظف دعم صلاحية تقنية لتعديل أرصدة المحافظ يدوياً. جميع التحويلات تجري آلياً وبطريقة مشفرة وفق نتائج المباريات وتأكيدات البلوكشين.",
      tags: ["دعم فني", "حماية الرصيد", "أمان"]
    },

    // 8. الإيداعات (Deposits)
    {
      id: "dep-1",
      category: "deposits",
      question: "كيف أقوم بإيداع الأموال في حسابي وما هو الحد الأدنى؟",
      answer: "توجه إلى صفحة المحفظة واضغط 'إيداع'. انسخ عنوان محفظة الإيداع المخصص لك وشبكة البلوكشين المحددة (مثل USDT على Polygon/TRON). الحد الأدنى للإيداع هو $5.00 USDT. بعد إرسال التحويل من محفظتك، يُقيد الرصيد تلقائياً بمجرد اكتمال تأكيدات الشبكة.",
      tags: ["إيداع", "usdt", "شحن رصيد", "الحد الأدنى"]
    },
    {
      id: "dep-2",
      category: "deposits",
      question: "ماذا أفعل إذا قمت بالإيداع وتأخر وصول الرصيد؟",
      answer: "تعتمد سرعة الإيداع على ازدحام شبكة البلوكشين وعدد التأكيدات المطلوبة (غالباً خلال 2 إلى 5 دقائق). إذا تأخر الإيداع لأكثر من 15 دقيقة، تأكد من تجزئة المعاملة (TX Hash) في مستكشف البلوكشين، ثم افتح تذكرة دعم فني مع إرفاق رقم المعاملة للتحقق الفوري.",
      tags: ["تأخر الإيداع", "tx hash", "بلوكشين", "دعم فني"]
    },
    {
      id: "dep-3",
      category: "deposits",
      question: "ماذا يحدث إذا أرسلت عملات عبر شبكة غير مدعومة؟",
      answer: "تنبيه بالغ الأهمية: إرسال أصول عبر شبكة غير معتمدة أو إلى عنوان غير صحيح قد يؤدي إلى فقدان الأموال في البلوكشين بشكل لا يمكن استرداده. تأكد دائماً من مطابقة نوع الشبكة (مثل Polygon) قبل الإرسال.",
      tags: ["شبكة غير مدعومة", "خطأ في الشبكة", "تحذير"]
    },

    // 9. السحوبات (Withdrawals)
    {
      id: "wth-1",
      category: "withdrawals",
      question: "كيف أقوم بسحب أرباحي وما هي المدة الزمنية للمعالجة؟",
      answer: "من صفحة المحفظة، اختر 'سحب'، أدخل عنوان محفظتك الرقمية ومبلغ السحب المطلوب. تتم معالجة طلبات السحب بصورة آلية وفورية بعد الفحص الأمني السريع لمكافحة الاحتيال، وعادة ما تصلك المعاملة خلال دقائق معدودة.",
      tags: ["سحب الأرباح", "مدة السحب", "تحويل أرباح"]
    },
    {
      id: "wth-2",
      category: "withdrawals",
      question: "هل توجد رسوم على عمليات السحب؟",
      answer: "لا تفرض منصة Nizalo أي رسوم خفية على السحب؛ يتم فقط خصم رسوم الغاز والشبكة الفعلية (Miner/Gas Fees) الخاصة بشبكة البلوكشين المستعملة وقت إجراء السحب.",
      tags: ["رسوم السحب", "رسوم الغاز", "رسوم الشبكة"]
    },
    {
      id: "wth-3",
      category: "withdrawals",
      question: "هل يتطلب سحب الرصيد التحقق من الهوية (KYC)؟",
      answer: "تسمح السحوبات العادية بالمرور الفوري. أما المبالغ الكبرى أو الحسابات التي تُظهر مؤشرات مخاطر أمنية فقد يطلب منها استكمال التحقق من الهوية الأساسي (KYC) للامتثال للمعايير الدولية لمكافحة غسيل الأموال.",
      tags: ["kyc", "توثيق الهوية", "سحب آمن"]
    },

    // 10. عملة USDT
    {
      id: "usdt-1",
      category: "usdt",
      question: "لماذا تعتمد منصة Nizalo على عملة USDT المستقرة؟",
      answer: "تعتمد المنصة على USDT لأنها عملة رقمية مستقرة مرتبطة بالدولار الأمريكي (1 USDT = $1 USD)، مما يضمن استقرار قيمة رصيدك وجوائزك وتجنب تقلبات أسعار العملات المشفرة، بالإضافة لسرعة وانخفاض تكلفة التحويل عالمياً.",
      tags: ["usdt", "عملة مستقرة", "دولار رقمي", "كريبتو"]
    },
    {
      id: "usdt-2",
      category: "usdt",
      question: "هل استخدام USDT يعفي المنصة من القوانين المعمول بها؟",
      answer: "كلا. عملة USDT هي مجرد أداة تسوية محاسبية ورقمية. تخضع منصة Nizalo بالكامل لقوانين مسابقات المهارة، وتُمنع المشاركة المالية في أي دولة أو ولاية تحظر ذلك قانونياً.",
      tags: ["قانونية usdt", "امتثال", "قوانين الألعاب"]
    },

    // 11. تأكيد المعاملات (Tx Confirmation)
    {
      id: "tx-1",
      category: "tx_confirmation",
      question: "ما هو معرف المعاملة (TxID / Hash) وأين أجده؟",
      answer: "هو كود فريد مكون من 64 حرفاً ورقم يُسجل في البلوكشين لإثبات حركة الإيداع أو السحب. يمكنك نسخه مباشرة من سجل محفظتك الشخصية (مثل Binance أو Trust Wallet أو MetaMask) التي أرسلت منها الرصيد.",
      tags: ["txid", "hash", "إثبات التحويل", "بلوكشين"]
    },
    {
      id: "tx-2",
      category: "tx_confirmation",
      question: "كم عدد تأكيدات البلوكشين المطلوبة لاعتماد الإيداع؟",
      answer: "يتطلب الإيداع عادة بين 12 إلى 64 تأكيد كتلة (حسب نوع الشبكة المستخدمة)، وتستغرق هذه العملية ما بين دقيقة إلى دقيقتين في الظروف العادية للشبكة.",
      tags: ["تأكيدات البلوكشين", "تأكيد الإيداع", "سرعة الشبكة"]
    },

    // 12. الأمان والحماية (Security)
    {
      id: "sec-1",
      category: "security",
      question: "كيف تحمي منصة Nizalo بيانات وأموال اللاعبين؟",
      answer: "تتبع المنصة بروتوكول الأمان 'Zero-Trust'، مع عزل كامل للأرصدة عبر محافظ باردة آمنة، واستخدام خوارزميات تشفير متطورة للبيانات وجلسات الاتصال، وتطبيق المصادقة الثنائية الإلزامية للعمليات الحساسة.",
      tags: ["أمان", "حماية الأموال", "zero trust", "تشفير"]
    },
    {
      id: "sec-2",
      category: "security",
      question: "تحذير: هل يطلب موظفو Nizalo كلمات المرور أو الرموز السرية؟",
      answer: "تحذير صارم: لن يطلب منك أي موظف في Nizalo تحت أي ظرف كلمة المرور، أو عبارة استرداد المحفظة، أو رمز التحقق (OTP). أي شخص يدعي ذلك هو محتال ويجب الإبلاغ عنه فوراً.",
      tags: ["احتيال", "تنبيه أمني", "كلمة المرور", "مكافحة التصيد"]
    },

    // 13. اللعب النظيف (Fair Play)
    {
      id: "fair-1",
      category: "fair_play",
      question: "كيف تكتشف المنصة محركات الذكاء الاصطناعي والغش؟",
      answer: "يحتوي نظامنا على محرك تحليل جنائي رقمي متطور يقارن دقة النقلات، وتوزيع التوقيت الزمني، وأنماط التفكير مع خوارزميات محركات الشطرنج (مثل Stockfish). يتم رصد أي مساعدة إلكترونية بدقة متناهية وإيقاف الحساب تلقائياً.",
      tags: ["مكافحة الغش", "ذكاء اصطناعي", "stockfish", "لعب نظيف"]
    },
    {
      id: "fair-2",
      category: "fair_play",
      question: "هل يُسمح بامتلاك أكثر من حساب لنفس الشخص؟",
      answer: "يُحظر تماماً امتلاك حسابات متعددة لنفس الشخص، أو التواطؤ في المباريات، أو تعمد الخسارة لتخفيض التصنيف (Sandbagging). أي تلاعب يؤدي إلى إلغاء نتائج المباريات وتجميد الحسابات المتورطة.",
      tags: ["حسابات متعددة", "تواطؤ", "تلاعب بالتصنيف"]
    },

    // 14. الإحالات (Referrals)
    {
      id: "ref-1",
      category: "referrals",
      question: "كيف يعمل برنامج إحالة الأصدقاء والترويج لمنصة Nizalo؟",
      answer: "يحصل كل لاعب مسجل على رابط إحالة دائم خاص به. عندما يقوم صديق بالتسجيل عبر رابطك وإتمام أول إيداع مؤهل بقيمة $5.00 أو أكثر، تحصل على مكافأة فورية بقيمة $1.00 تُضاف إلى رصيدك المتاح في المحفظة.",
      tags: ["إحالة", "مكافأة الإحالة", "ربح", "رابط الإحالة"]
    },
    {
      id: "ref-2",
      category: "referrals",
      question: "لماذا لم تُحتسب مكافأة الإحالة لحسابي؟",
      answer: "تخضع الإحالات لفحص آلي لمكافحة التحايل. إحالة النفس، أو استخدام نفس الجهاز، أو تكرار نفس عنوان الـ IP، أو عدم إتمام الصديق لإيداع مؤكد، تؤدي جميعها إلى عدم احتساب المكافأة.",
      tags: ["احتيال الإحالات", "شروط المكافأة", "إحالة معلقة"]
    },

    // 15. الدردشة (Chat)
    {
      id: "chat-1",
      category: "chat",
      question: "ما هي قواعد التحدث والدردشة أثناء المباريات؟",
      answer: "نلتزم بتوفير بيئة تنافسية راقية وودية. يُحظر تماماً توجيه أي إهانات، أو ألفاظ نابية، أو رسائل ترويجية أو سبام، أو تشتيت الخصم أثناء دوره. يتم تطبيق عقوبات كتم فورية على المخالفين.",
      tags: ["قواعد الدردشة", "احترام", "كتم الصوت", "أخلاقيات"]
    },
    {
      id: "chat-2",
      category: "chat",
      question: "كيف أقوم بالإبلاغ عن لاعب مسيء في الدردشة؟",
      answer: "اضغط على اسم اللاعب في نافذة الدردشة واختر 'إبلاغ عن لاعب'، أو افتح تذكرة دعم فني تحت قسم 'مخالفات الدردشة' مع ذكر اسم اللاعب ورقم المباراة.",
      tags: ["إبلاغ", "شكوى", "حظر مسيء"]
    },

    // 16. المشاكل التقنية (Technical Issues)
    {
      id: "tech-1",
      category: "technical_issues",
      question: "ماذا يحدث إذا انقطع الاتصال بالإنترنت أثناء المباراة؟",
      answer: "الخادم يحتفظ بالحالة الرسمية الكاملة للمباراة. إذا انقطع اتصالك أو أغلقت الصفحة بالخطأ، لديك نافذة سماح لمدة 60 ثانية للعودة؛ بمجرد إعادة فتح الموقع أو تحديثه ستعود مباشرة إلى رقعة اللعب دون أن تفقد دورك طالما لم ينفد وقت ساعتك.",
      tags: ["انقطاع الاتصال", "إعادة الاتصال", "انترنت", "مشكلة تقنية"]
    },
    {
      id: "tech-2",
      category: "technical_issues",
      question: "كيف تعمل ساعات المباراة وتوقيت الأدوار؟",
      answer: "جميع الساعات وتوقيتات التفكير تُحسب بدقة مطلقة على خادم Nizalo المركزي وليس على ساعة هاتفك أو جهازك، وذلك لضمان العدالة التامة ومنع أي محاولات لتأخير الوقت محلياً.",
      tags: ["ساعة اللعب", "توقيت", "سيرفر", "عدالة"]
    },
    {
      id: "tech-3",
      category: "technical_issues",
      question: "ما هي المتطلبات الفنية والمستعرضات الموصى بها للعب؟",
      answer: "تعمل Nizalo بسلاسة على كافة المتصفحات الحديثة (Google Chrome، Safari، Microsoft Edge، Firefox) على أجهزة الكمبيوتر والأجهزة اللوحية والهواتف الذكية بنظامي Android و iOS مع دعم تقنية WebGL لتجربة بصرية فائقة.",
      tags: ["متصفح", "أندرويد", "آيفون", "أداء"]
    }
  ],

  en: [
    // 1. Account
    {
      id: "acc-1",
      category: "account",
      question: "How do I create and verify my Nizalo account?",
      answer: "You can create an account using a unique nickname and a strong password (at least 10 characters), or sign in with one click via Google. Every player receives a permanent ID. To maintain platform integrity, only one account per natural person is permitted.",
      tags: ["register", "signup", "verification", "identity", "create account"]
    },
    {
      id: "acc-2",
      category: "account",
      question: "Can I change my nickname after registration?",
      answer: "You can update your profile avatar and settings from the Profile page. Nicknames are unique platform identifiers and are permanently tied to your competitive match history, ratings, and referral code.",
      tags: ["nickname", "handle", "profile", "settings"]
    },
    {
      id: "acc-3",
      category: "account",
      question: "How do I recover access if I forgot my password?",
      answer: "On the login screen, click 'Forgot password?' or select 'Email me a code'. You will receive a secure one-time 6-digit verification code to reset your password immediately.",
      tags: ["forgot password", "password reset", "recovery", "email code"]
    },

    // 2. Login
    {
      id: "login-1",
      category: "login",
      question: "What should I do if my account is locked after failed login attempts?",
      answer: "For your protection, our security engine automatically locks login attempts after consecutive invalid submissions. Wait 5 to 10 minutes for the lockout window to expire, or use the email recovery link.",
      tags: ["locked", "lockout", "failed login", "too many attempts"]
    },
    {
      id: "login-2",
      category: "login",
      question: "How do I set up and use Two-Factor Authentication (TOTP 2FA)?",
      answer: "Navigate to Settings > Security and enable Two-Factor Authentication using any standard app (Google Authenticator, Authy, or 1Password). Once enabled, you must provide your 6-digit TOTP code during login and cashouts.",
      tags: ["2fa", "totp", "authenticator", "security", "two factor"]
    },
    {
      id: "login-3",
      category: "login",
      question: "Can I sign in using Google or switch auth providers?",
      answer: "Yes, you can sign in directly with Google. It provides seamless one-click authentication backed by Google's industry-leading account protection.",
      tags: ["google", "oauth", "sso", "social login"]
    },

    // 3. Games
    {
      id: "games-1",
      category: "games",
      question: "Which 11 games are available on Nizalo?",
      answer: "Nizalo currently features 11 skill-based strategy games: Chess, Billiards, Checkers, Dominoes, Backgammon, Seega, Connect Four, XO (Tic-Tac-Toe), Speed Math, Reversi (Othello), and Gomoku. All games use standard official rules with server-enforced validation.",
      tags: ["games", "rules", "chess", "billiards", "checkers", "dominoes", "backgammon", "seega", "connect four", "xo", "speed math", "reversi", "gomoku"]
    },
    {
      id: "games-2",
      category: "games",
      question: "Are Nizalo game outcomes purely based on skill?",
      answer: "Yes. All Nizalo games are strictly skill competitions. The outcome depends entirely on player choices, calculation, tactical strategy, speed, and precision. No randomized house advantages or gambling mechanics exist.",
      tags: ["skill", "fairness", "mechanics", "no gambling"]
    },

    // 4. Matchmaking
    {
      id: "match-1",
      category: "matchmaking",
      question: "How does the matchmaking system pair opponents?",
      answer: "Matchmaking utilizes a skill-based rating system (ELO and Global Skill Score) along with network latency filters to ensure fair and competitive matchups within your rating tier.",
      tags: ["matchmaking", "elo", "rating", "fair pairing", "pairing"]
    },
    {
      id: "match-2",
      category: "matchmaking",
      question: "What is the Global Skill Score (GSS)?",
      answer: "Your Global Skill Score is a real percentile-based aggregate metric calculated from your performance, win rate, accuracy, and duel volume across all 11 games.",
      tags: ["gss", "global skill score", "ranking", "leaderboard"]
    },

    // 5. Friend Challenges
    {
      id: "friend-1",
      category: "friend_challenges",
      question: "How do I challenge a specific friend to a duel?",
      answer: "Go to Play > Friend Challenge, enter your friend's nickname, select the game, time control, and stake amount (or free practice), then send the invite with a 60-second response countdown.",
      tags: ["friend challenge", "invite", "direct challenge", "custom match"]
    },
    {
      id: "friend-2",
      category: "friend_challenges",
      question: "What happens if my friend does not accept the invite in time?",
      answer: "If an invite is not accepted within 60 seconds, or if the player declines, the challenge automatically expires and any reserved match stake is immediately unlocked in your wallet.",
      tags: ["invite expired", "timeout", "declined challenge"]
    },

    // 6. Tournaments
    {
      id: "tourn-1",
      category: "tournaments",
      question: "How do Nizalo tournaments work and how are prizes distributed?",
      answer: "Tournaments follow structured bracket formats (Single Elimination or Swiss). Prize pools are distributed automatically via the ledger according to immutable platform rules published in the tournament lobby.",
      tags: ["tournaments", "brackets", "prize pool", "elimination", "swiss"]
    },
    {
      id: "tourn-2",
      category: "tournaments",
      question: "What happens if a tournament round ends in a draw?",
      answer: "In elimination brackets where a decisive winner is required, tournament tie-breaker sudden-death blitz games or lowest cumulative clock usage rules apply.",
      tags: ["tournament draw", "tie breaker", "draw rules"]
    },

    // 7. Wallet
    {
      id: "wallet-1",
      category: "wallet",
      question: "How does the Nizalo financial ledger work?",
      answer: "Nizalo employs a double-entry immutable financial ledger. Every balance change—deposit, match stake hold, win settlement, withdrawal, fee, or referral reward—is recorded as an auditable journal entry.",
      tags: ["wallet", "ledger", "double entry", "balance", "audit"]
    },
    {
      id: "wallet-2",
      category: "wallet",
      question: "Can support agents adjust or credit my wallet balance?",
      answer: "No. By strict architectural security policy, support representatives have zero technical capability to mutate wallet balances or ledger entries. All funds flow exclusively through validated blockchain transactions.",
      tags: ["support", "wallet security", "balance protection"]
    },

    // 8. Deposits
    {
      id: "dep-1",
      category: "deposits",
      question: "How do I deposit funds and what is the minimum deposit?",
      answer: "Navigate to Wallet > Deposit, copy your designated deposit address, and send USDT via the supported network (e.g., Polygon/TRON). The minimum deposit is $5.00 USDT. Your balance is credited automatically once block confirmations clear.",
      tags: ["deposit", "funds", "minimum deposit", "usdt deposit", "credit balance"]
    },
    {
      id: "dep-2",
      category: "deposits",
      question: "What should I do if my deposit is delayed or not showing?",
      answer: "Deposits depend on blockchain network traffic (usually 2-5 minutes). If your deposit takes longer than 15 minutes, look up your transaction hash (TX Hash) on the blockchain explorer and submit a support ticket.",
      tags: ["deposit delayed", "pending deposit", "blockchain confirmation", "tx hash"]
    },
    {
      id: "dep-3",
      category: "deposits",
      question: "What happens if I send funds via an unsupported network?",
      answer: "Sending funds over an unsupported chain may result in permanent asset loss on the blockchain. Always verify that both the token contract and network match exactly before confirming.",
      tags: ["unsupported network", "wrong chain", "lost deposit"]
    },

    // 9. Withdrawals
    {
      id: "wth-1",
      category: "withdrawals",
      question: "How do I withdraw my winnings and how long does it take?",
      answer: "In your Wallet, select Withdraw, enter your destination USDT address, and specify the amount. Withdrawals are processed automatically and typically reach your wallet within minutes.",
      tags: ["withdraw", "cashout", "withdrawal time", "payout"]
    },
    {
      id: "wth-2",
      category: "withdrawals",
      question: "Are there any fees on withdrawals?",
      answer: "Nizalo charges no hidden platform withdrawal fee. Only the real blockchain network miner/gas fee is deducted at the prevailing network rate.",
      tags: ["withdrawal fees", "gas fee", "network fee"]
    },
    {
      id: "wth-3",
      category: "withdrawals",
      question: "Does withdrawing require identity verification (KYC)?",
      answer: "Standard withdrawals process immediately. High-tier withdrawals or accounts flagged for unusual activity may require basic KYC verification to maintain global anti-money laundering compliance.",
      tags: ["kyc", "identity verification", "withdrawal limit"]
    },

    // 10. USDT
    {
      id: "usdt-1",
      category: "usdt",
      question: "Why does Nizalo use USDT stablecoins?",
      answer: "USDT is pegged 1:1 to the US Dollar, shielding your competitive stakes and tournament winnings from cryptocurrency price volatility while enabling instantaneous global settlements.",
      tags: ["usdt", "stablecoin", "crypto", "pegged"]
    },
    {
      id: "usdt-2",
      category: "usdt",
      question: "Does using USDT exempt competitions from local laws?",
      answer: "No. USDT is an accounting and settlement instrument. Competitions must comply with skill gaming laws in your jurisdiction.",
      tags: ["usdt law", "compliance", "regulations"]
    },

    // 11. Transaction Confirmation
    {
      id: "tx-1",
      category: "tx_confirmation",
      question: "What is a Transaction Hash (TxID) and where do I find it?",
      answer: "A Transaction Hash is a unique 64-character identifier generated by the blockchain. You can copy it from your sending wallet's transaction details history.",
      tags: ["txid", "hash", "proof of transfer", "blockchain"]
    },
    {
      id: "tx-2",
      category: "tx_confirmation",
      question: "How many network confirmations are required for deposits?",
      answer: "Between 12 and 64 block confirmations are required depending on the chosen blockchain network, typically taking 1 to 2 minutes.",
      tags: ["confirmations", "block time", "network speed"]
    },

    // 12. Security
    {
      id: "sec-1",
      category: "security",
      question: "How does Nizalo protect player accounts and treasury assets?",
      answer: "We employ an end-to-end Zero-Trust security architecture, multi-sig cold storage for treasury assets, and continuous forensic audit logging.",
      tags: ["security", "zero trust", "cold storage", "audit"]
    },
    {
      id: "sec-2",
      category: "security",
      question: "Will Nizalo staff ever ask for my password or private keys?",
      answer: "NEVER. Nizalo employees will never ask for your password, seed phrase, private key, or one-time verification code. Anyone asking is attempting a phishing scam.",
      tags: ["phishing", "scam warning", "password security"]
    },

    // 13. Fair Play
    {
      id: "fair-1",
      category: "fair_play",
      question: "How does Nizalo detect chess engines and automated cheat bots?",
      answer: "Our automated telemetry engine analyzes move accuracy against neural engines (like Stockfish), time deltas, and mouse trajectories to detect assistance software with high precision.",
      tags: ["cheat", "anti-cheat", "engine detection", "bots", "fair play"]
    },
    {
      id: "fair-2",
      category: "fair_play",
      question: "Are multiple accounts or collusion permitted?",
      answer: "No. Nizalo strictly prohibits multiple accounts, circular match fixing, intentional rating manipulation (sandbagging), and syndicate collusion.",
      tags: ["multi account", "collusion", "match fixing", "sandbagging"]
    },

    // 14. Referrals
    {
      id: "ref-1",
      category: "referrals",
      question: "How does the Nizalo Referral Program work?",
      answer: "Every player receives a permanent referral link. When a referred friend registers and completes their first qualifying deposit of at least $5.00, you receive a $1.00 reward in your available balance.",
      tags: ["referrals", "referral reward", "1 dollar reward", "referral code"]
    },
    {
      id: "ref-2",
      category: "referrals",
      question: "Why was my referral reward flagged or not credited?",
      answer: "Referral rewards undergo automated anti-fraud screening. Self-referrals, duplicate device fingerprints, and unconfirmed deposits are disqualified.",
      tags: ["referral fraud", "self referral", "pending referral"]
    },

    // 15. Chat
    {
      id: "chat-1",
      category: "chat",
      question: "What are the rules and guidelines for in-game chat?",
      answer: "Nizalo maintains a respectful, competitive environment. Harassment, hate speech, spamming, and sharing personal contact information are strictly forbidden.",
      tags: ["chat rules", "harassment", "moderation", "mute", "ban"]
    },
    {
      id: "chat-2",
      category: "chat",
      question: "How do I report an abusive player in chat?",
      answer: "Click on the player's handle in chat and select 'Report User', or open a support ticket under 'ABUSE_REPORT' with the duel ID.",
      tags: ["report user", "toxic", "abuse report", "block player"]
    },

    // 16. Technical Issues
    {
      id: "tech-1",
      category: "technical_issues",
      question: "What happens if I get disconnected during a live match?",
      answer: "The server maintains the authoritative match state. If you lose internet or refresh, you have a 60-second grace window to reconnect directly into your game without losing your turn.",
      tags: ["disconnect", "reconnection", "lost connection", "reconnect"]
    },
    {
      id: "tech-2",
      category: "technical_issues",
      question: "How do game clocks and timeouts work?",
      answer: "All clocks are decremented authoritatively by the game server, preventing device-level time tampering and ensuring exact fairness.",
      tags: ["timeout", "clock", "time bank", "server clock", "timer"]
    },
    {
      id: "tech-3",
      category: "technical_issues",
      question: "What are the recommended browser and hardware specifications?",
      answer: "Nizalo runs on all modern browsers (Chrome, Edge, Safari, Firefox) on desktop, tablet, and mobile with WebGL hardware acceleration.",
      tags: ["browser", "webgl", "performance", "lag"]
    }
  ],
  zh: [
    {
        "id": "acc-1",
        "category": "account",
        "question": "如何在 Nizalo 平台上创建并验证我的账户？",
        "answer": "您可以通过选择唯一的玩家昵称和安全密码（至少 10 个字符）注册账户，也可以通过 Google 账号一键直接登录。每位玩家都会获得唯一的永久 ID。为了维护平台竞技公平，每位真实自然人仅允许注册并拥有一个账户。",
        "tags": [
            "注册",
            "创建账户",
            "实名验证",
            "新用户",
            "账号管理"
        ]
    },
    {
        "id": "acc-2",
        "category": "account",
        "question": "注册成功后我可以更改我的游戏昵称吗？",
        "answer": "您可以在“个人资料”页面随时更新头像和个性化设置。玩家昵称是平台上的唯一法定标识，且永久关联您的历史战绩、天梯积分、防作弊信誉及专属邀请码，因此不可随意重命名。",
        "tags": [
            "昵称",
            "ID",
            "个人资料",
            "账户设置"
        ]
    },
    {
        "id": "acc-3",
        "category": "account",
        "question": "如果我忘记了登录密码，该如何恢复访问？",
        "answer": "在登录界面点击“忘记密码”或选择“通过邮箱发送登录验证码”，系统将向您的绑定邮箱发送一次性 6 位安全验证码，验证后即可立即重置密码或直接登录。",
        "tags": [
            "忘记密码",
            "密码重置",
            "账号找回",
            "邮箱验证码"
        ]
    },
    {
        "id": "login-1",
        "category": "login",
        "question": "连续多次登录失败导致账户被锁定时怎么办？",
        "answer": "为了防范暴力破解，我们的安全风控引擎会在多次密码错误后自动触发临时锁定保护。请等待 5 至 10 分钟锁定窗口解除，或直接通过注册邮箱重置密码。",
        "tags": [
            "账号锁定",
            "登录失败",
            "多次错误",
            "安全风控"
        ]
    },
    {
        "id": "login-2",
        "category": "login",
        "question": "如何设置并启用双重身份验证 (TOTP 2FA)？",
        "answer": "前往“设置 > 安全中心”，使用常见的验证器 App（如 Google Authenticator、Authy 或 1Password）扫描密钥二维码即可启用。启用后，在敏感操作（如大额提现或异地登录）时需输入 6 位动态验证码。",
        "tags": [
            "2fa",
            "双重认证",
            "谷歌验证器",
            "安全设置"
        ]
    },
    {
        "id": "login-3",
        "category": "login",
        "question": "我可以使用 Google 账号登录或切换登录方式吗？",
        "answer": "可以。Nizalo 深度支持 Google OAuth 安全一键登录，依托全球最高级别的云端防护体系，提供极致顺畅且高度安全的免密登录体验。",
        "tags": [
            "google登录",
            "第三方登录",
            "快捷登录",
            "免密登录"
        ]
    },
    {
        "id": "games-1",
        "category": "games",
        "question": "Nizalo 平台上目前提供哪 11 款经典竞技游戏？",
        "answer": "Nizalo 目前拥有 11 款服务器主控的纯脑力技能棋盘竞技游戏：国际象棋 (Chess)、台球 (Billiards)、跳棋 (Checkers)、多米诺骨牌 (Dominoes)、双陆棋 (Backgammon)、西加棋 (Seega)、四子棋 (Connect Four)、井字棋 (XO)、速算大师 (Speed Math)、黑白棋/奥赛罗 (Reversi) 以及五子棋 (Gomoku)。所有比赛均由官方服务器权威判决规则与计时。",
        "tags": [
            "游戏列表",
            "游戏规则",
            "国际象棋",
            "跳棋",
            "多米诺",
            "双陆棋",
            "五子棋",
            "黑白棋",
            "四子棋",
            "速算"
        ]
    },
    {
        "id": "games-2",
        "category": "games",
        "question": "Nizalo 上的对局胜负是否纯粹取决于玩家技巧？",
        "answer": "是的。Nizalo 上的所有项目均为纯智力技能赛事 (Pure Skill Competitions)。胜负完全取决于玩家个人的计算能力、战略眼光、战术执行、反应速度与精确度。平台绝不设置任何随机庄家优势、抽水博彩或赌博机制。",
        "tags": [
            "技能竞赛",
            "公平竞技",
            "绝非博彩",
            "零随机庄家"
        ]
    },
    {
        "id": "match-1",
        "category": "matchmaking",
        "question": "智能匹配系统是如何为玩家寻找势均力敌的对手的？",
        "answer": "匹配系统基于先进的 ELO 评分模型与全球技能评分 (GSS)，同时结合毫秒级网络延迟过滤算法，确保在相近技术水平与优良网络环境下秒级匹配真人对手。",
        "tags": [
            "对战匹配",
            "elo积分",
            "水平对等",
            "公平对局"
        ]
    },
    {
        "id": "match-2",
        "category": "matchmaking",
        "question": "什么是全球综合技能评分 (Global Skill Score / GSS)？",
        "answer": "GSS 是平台跨越所有 11 款游戏综合计算的百分位加权实力指标，根据玩家在各项目的历史胜率、走棋准确率、对局量及对手实力动态加权生成，是全服大师榜的核心凭证。",
        "tags": [
            "gss",
            "综合技能评分",
            "大师榜",
            "天梯排名"
        ]
    },
    {
        "id": "friend-1",
        "category": "friend_challenges",
        "question": "如何向指定好友发起一对一私人对决挑战？",
        "answer": "进入“对战”菜单选择“挑战好友”，输入好友的玩家昵称，选择游戏种类、对局时钟规则及挑战奖金（或免费友谊赛），随后发送邀请。好友将收到附带 60 秒倒计时的即时对战通知。",
        "tags": [
            "好友挑战",
            "私人房间",
            "双人对决",
            "自定义比赛"
        ]
    },
    {
        "id": "friend-2",
        "category": "friend_challenges",
        "question": "如果好友未在 60 秒内接受挑战邀请会发生什么？",
        "answer": "如果好友超时未响应或主动拒绝，该次挑战将自动失效解散，您账户中为该场对决临时冻结的赛事奖金份额会毫秒级退回您的钱包可用余额。",
        "tags": [
            "邀请超时",
            "挑战取消",
            "资金解冻",
            "即时返还"
        ]
    },
    {
        "id": "tourn-1",
        "category": "tournaments",
        "question": "Nizalo 锦标赛如何运作？奖金池如何自动分配？",
        "answer": "锦标赛支持单败淘汰制 (Single Elimination) 与瑞士轮积分制 (Swiss)。每轮胜者晋级。比赛结束后，智能账本将根据大厅赛前公开透明的奖金分配比例表，自动瞬时将奖金划入获奖玩家的可用钱包。",
        "tags": [
            "锦标赛",
            "淘汰赛",
            "瑞士轮",
            "自动分奖",
            "赛事规则"
        ]
    },
    {
        "id": "tourn-2",
        "category": "tournaments",
        "question": "如果淘汰赛阶段双方对局出现和棋（平局）如何裁决？",
        "answer": "在必须分出胜负的晋级轮次中，双方将按照锦标赛既定规则开启超快棋加时赛 (Blitz Sudden-Death) 或根据总耗时最小原则决出最终晋级名额。",
        "tags": [
            "平局判决",
            "加时超快棋",
            "和棋判定",
            "晋级规则"
        ]
    },
    {
        "id": "wallet-1",
        "category": "wallet",
        "question": "Nizalo 的资金双向复式记账财务系统是如何运作的？",
        "answer": "Nizalo 采用不可篡改的复式记账财务引擎 (Double-Entry Ledger)。无论是充值到账、比赛参赛金冻结、结算胜场派彩、提现还是推荐返利，每笔资金流向均具备唯一的链上可审计日志。",
        "tags": [
            "复式记账",
            "财务安全",
            "资金透明",
            "不可篡改"
        ]
    },
    {
        "id": "wallet-2",
        "category": "wallet",
        "question": "平台客服人员是否有权限人工修改玩家的钱包余额？",
        "answer": "绝无可能。根据平台最高等级安全准则，客服人员在系统层面上完全不具备增减玩家钱包余额或篡改账本的任何技术接口。所有资金划转均完全自动化执行并有据可查。",
        "tags": [
            "客服权限",
            "资金隔离",
            "防内部舞弊",
            "安全底线"
        ]
    },
    {
        "id": "dep-1",
        "category": "deposits",
        "question": "如何向账户充值 USDT？最低充值限额是多少？",
        "answer": "点击导航栏“钱包 > 充值”，选择您信任的网络（如 USDT-TRC20、BEP20 或 ERC20），复制平台官方金库收款地址并从您的去中心化或交易所钱包转账。最低充值额度为 $5.00 USDT，区块确认完成后自动入账。",
        "tags": [
            "USDT充值",
            "最低充值",
            "充币教程",
            "金库地址"
        ]
    },
    {
        "id": "dep-2",
        "category": "deposits",
        "question": "如果转账后充值延迟未到账，我应该怎么做？",
        "answer": "充值速度取决于相应公链的拥堵程度及所需区块确认数（通常 2 至 5 分钟）。若超过 15 分钟仍未到账，请复制交易哈希 (TX Hash)，前往“帮助中心”提交工单，技术团队将即刻核验入账。",
        "tags": [
            "充值延迟",
            "交易哈希",
            "区块确认",
            "客服工单"
        ]
    },
    {
        "id": "dep-3",
        "category": "deposits",
        "question": "如果我不小心通过错误或不支持的公链转账会怎样？",
        "answer": "严重警告：通过不支持的网络或向错误地址跨链转账可能导致区块链层面的永久性资产灭失且不可逆。每次转账前，请务必仔细核对代币协议（USDT）与公链类型完全一致。",
        "tags": [
            "网络错误",
            "资产丢失风险",
            "主网核对",
            "重要警告"
        ]
    },
    {
        "id": "wth-1",
        "category": "withdrawals",
        "question": "如何提现奖金？提现一般需要多长时间到账？",
        "answer": "在钱包页面点击“提现”，输入您的个人收款公链地址与提款金额。平台提款系统全天候自动化运行，经过快速反欺诈模型初审后由冷热金库即刻打款，一般数分钟内即可链上到账。",
        "tags": [
            "快速提款",
            "提币到账",
            "提现流程",
            "极速出金"
        ]
    },
    {
        "id": "wth-2",
        "category": "withdrawals",
        "question": "在 Nizalo 上发起提款是否收取平台手续费？",
        "answer": "Nizalo 官方不对提现收取任何隐形平台服务费。提现时仅扣除相应公链当下实际产生的区块链网络旷工费 (Miner / Gas Fee)。",
        "tags": [
            "提现手续费",
            "旷工费",
            "Gas费",
            "零平台抽成"
        ]
    },
    {
        "id": "wth-3",
        "category": "withdrawals",
        "question": "提现是否需要强制进行身份认证 (KYC)？",
        "answer": "常规额度的正常出金无需繁复审核即可秒级放行。对于单笔大额提现或触发风控异常警报的账户，可能需提交基础身份证明文件以满足国际反洗钱 (AML) 合规要求。",
        "tags": [
            "KYC验证",
            "合规出金",
            "反洗钱",
            "大额提现"
        ]
    },
    {
        "id": "usdt-1",
        "category": "usdt",
        "question": "为什么 Nizalo 选用 USDT 稳定币作为核心清算资产？",
        "answer": "USDT 与美元 1:1 锚定，能够完美隔绝主流加密货币剧烈波动带来的资产缩水风险，同时具备全球范围内低摩擦、秒级清算与跨境秒到的金融优势。",
        "tags": [
            "USDT",
            "稳定币",
            "美元锚定",
            "资产保值"
        ]
    },
    {
        "id": "usdt-2",
        "category": "usdt",
        "question": "使用 USDT 是否意味着平台赛事脱离了当地法律监管？",
        "answer": "绝非如此。USDT 仅作为高效的数字化清算工具。Nizalo 严格遵守国际技能竞技法规，并坚决禁止在明令限制现金或技能竞技赛事地区的玩家参与涉资对局。",
        "tags": [
            "法律合规",
            "合规竞赛",
            "监管政策",
            "地区限制"
        ]
    },
    {
        "id": "tx-1",
        "category": "tx_confirmation",
        "question": "什么是交易哈希值 (TxID / Hash)？在哪里可以找到它？",
        "answer": "交易哈希是由 64 位字符组成的唯一区块链数字指纹，用于证明该笔链上资金转移的真实性。您可以在转出钱包（如 Binance、OKX、Trust Wallet）的历史记录详情中轻松复制。",
        "tags": [
            "TxID",
            "交易哈希",
            "区块链存证",
            "转账凭据"
        ]
    },
    {
        "id": "tx-2",
        "category": "tx_confirmation",
        "question": "充值需要等待多少个区块链区块确认才能可用？",
        "answer": "根据所选公链机制，通常需要 12 至 64 个区块确认（TRC20/BEP20 通常在 1-2 分钟内完成确认并入账）。",
        "tags": [
            "区块确认",
            "到账速度",
            "网络确认"
        ]
    },
    {
        "id": "sec-1",
        "category": "security",
        "question": "Nizalo 如何全面保障玩家账户与金库资产的安全？",
        "answer": "平台贯彻“零信任”安全架构 (Zero-Trust)，大额资产存放于冷钱包多签托管金库，所有敏感传输通过 TLS 1.3 高强度加密，并配合 24 小时全量安全法证审计追踪。",
        "tags": [
            "安全架构",
            "零信任",
            "多签冷钱包",
            "全天候防护"
        ]
    },
    {
        "id": "sec-2",
        "category": "security",
        "question": "特别警告：Nizalo 官方人员会索要密码或助记词吗？",
        "answer": "绝不会！Nizalo 的任何客服或管理员在任何情况下都绝不会向您索取密码、钱包助记词、私钥或动态验证码 (OTP)。凡是以官方名义索要者皆为诈骗分子，请立即拉黑举报。",
        "tags": [
            "防钓鱼",
            "安全预警",
            "绝不索要密码",
            "防骗常识"
        ]
    },
    {
        "id": "fair-1",
        "category": "fair_play",
        "question": "Nizalo 的反作弊引擎如何精准识别 AI 棋力引擎与外挂辅助？",
        "answer": "我们的法证反作弊系统会对每步棋的走子准确率与顶级引擎（如 Stockfish 16+）深度比对，同时结合毫秒级思考时长波动、鼠标轨迹微动能谱进行多维模型研判，作弊者将被瞬间秒封。",
        "tags": [
            "反作弊",
            "Stockfish比对",
            "AI检测",
            "毫秒级分析"
        ]
    },
    {
        "id": "fair-2",
        "category": "fair_play",
        "question": "平台是否允许注册多个小号或与他人打假赛串通？",
        "answer": "严厉禁止！严禁任何人操纵多个账号、故意输分刷段位 (Sandbagging) 或多人串通对局。一经查实，违规账号将被永久永久封停，涉及的非法资金将被全额没收充公。",
        "tags": [
            "禁止小号",
            "严打假赛",
            "恶意掉分",
            "没收资金"
        ]
    },
    {
        "id": "ref-1",
        "category": "referrals",
        "question": "Nizalo 推荐返佣计划如何运作？收益如何结算？",
        "answer": "每位玩家均拥有唯一的永久专属推荐链接。好友通过您的链接注册并完成首笔满 $5.00 USDT 的有效充值后，您将立即获得 $1.00 USDT 现金奖励直接入账钱包可用余额。",
        "tags": [
            "推荐返佣",
            "邀请好友",
            "永久分成",
            "返佣结算"
        ]
    },
    {
        "id": "ref-2",
        "category": "referrals",
        "question": "为什么我邀请了好友却未能获得推荐奖励？",
        "answer": "系统内置自动化防刷模型。若检测到同设备自推、同 IP 批量注册、虚假小号关联或受邀人未完成规定真实充值，该笔推荐奖励将被系统自动判定无效并取消资格。",
        "tags": [
            "返佣失败原因",
            "防刷机制",
            "自推无效",
            "合规审查"
        ]
    },
    {
        "id": "chat-1",
        "category": "chat",
        "question": "在对局聊天室与全服大厅聊天需遵守哪些基本守则？",
        "answer": "Nizalo 致力于打造崇尚体育精神的高雅竞技殿堂。严禁任何形式的辱骂攻击、种族歧视、恶意垃圾广告刷屏或恶意干扰对手下棋思考。违者将被实施阶梯式禁言或封停处罚。",
        "tags": [
            "聊天规范",
            "文明观赛",
            "禁言规则",
            "文明竞技"
        ]
    },
    {
        "id": "chat-2",
        "category": "chat",
        "question": "如果遇到恶意辱骂或骚扰的违规玩家，我该如何举报？",
        "answer": "在聊天框点击该玩家昵称选择“举报玩家”，或前往帮助中心提交分类为“恶意骚扰”的工单并附带对局 ID，风控安全团队将在 15 分钟内核实并施加禁言制裁。",
        "tags": [
            "举报玩家",
            "一键屏蔽",
            "工单投诉",
            "净化环境"
        ]
    },
    {
        "id": "tech-1",
        "category": "technical_issues",
        "question": "如果在激烈的对局中网络意外中断或掉线该怎么办？",
        "answer": "对局状态完全托管于服务器端。若发生网络波动或不小心刷新了网页，系统为您提供长达 60 秒的断线重连保护窗口。重新打开或刷新页面即可无缝恢复棋局继续走子。",
        "tags": [
            "掉线重连",
            "断网保护",
            "60秒窗口",
            "状态恢复"
        ]
    },
    {
        "id": "tech-2",
        "category": "technical_issues",
        "question": "对局中的倒计时钟是如何计算的？是否存在本地作弊可能？",
        "answer": "所有棋钟倒计时均在 Nizalo 核心中央服务器毫秒级单向扣减，完全独立于任何玩家本地手机或电脑的系统时间，从根本上杜绝任何本地暂停时间或变速齿轮作弊。",
        "tags": [
            "服务器计时",
            "绝对精准",
            "防变速齿轮",
            "权威时钟"
        ]
    },
    {
        "id": "tech-3",
        "category": "technical_issues",
        "question": "畅玩 Nizalo 平台建议使用哪些浏览器和硬件配置？",
        "answer": "Nizalo 完美兼容所有现代主流浏览器（如 Google Chrome、Safari、Microsoft Edge 与 Firefox），全面适配 PC 桌面端、平板电脑及 iOS/Android 智能手机，开启 WebGL 硬件加速可获得极致流畅视觉体验。",
        "tags": [
            "浏览器推荐",
            "移动端适配",
            "WebGL加速",
            "流畅体验"
        ]
    }
],
  es: [
    {
        "id": "acc-1",
        "category": "account",
        "question": "¿Cómo creo y verifico mi cuenta en la plataforma Nizalo?",
        "answer": "Puede registrarse fácilmente eligiendo un apodo único y una contraseña segura (mínimo 10 caracteres), o iniciar sesión con un clic a través de Google. Cada jugador recibe un ID permanente e intransferible. Para mantener la integridad competitiva, solo se permite una (1) cuenta por persona física.",
        "tags": [
            "registro",
            "crear cuenta",
            "verificación",
            "nuevo usuario",
            "perfil"
        ]
    },
    {
        "id": "acc-2",
        "category": "account",
        "question": "¿Puedo cambiar mi apodo de jugador tras el registro?",
        "answer": "Puede personalizar su avatar y ajustes en la página de Perfil. Los apodos son identificadores únicos del sistema vinculados permanentemente a su historial de duelos, puntuación ELO, reputación anti-trampas y código de referidos, por lo que no pueden modificarse a voluntad.",
        "tags": [
            "apodo",
            "handle",
            "perfil",
            "ajustes"
        ]
    },
    {
        "id": "acc-3",
        "category": "account",
        "question": "¿Cómo recupero el acceso a mi cuenta si olvidé mi contraseña?",
        "answer": "En la pantalla de acceso, haga clic en '¿Olvidó su contraseña?' o elija 'Enviarme un código'. Recibirá un código de verificación seguro de 6 dígitos en su correo para restablecer su contraseña de inmediato.",
        "tags": [
            "recuperar contraseña",
            "restablecimiento",
            "código de correo"
        ]
    },
    {
        "id": "login-1",
        "category": "login",
        "question": "¿Qué debo hacer si mi cuenta se bloquea por intentos fallidos de inicio de sesión?",
        "answer": "Por seguridad ante ataques de fuerza bruta, nuestro sistema bloquea temporalmente los accesos tras varios intentos fallidos consecutivos. Espere entre 5 y 10 minutos a que expire el bloqueo o use el enlace de recuperación por correo.",
        "tags": [
            "bloqueo",
            "intentos fallidos",
            "seguridad de acceso"
        ]
    },
    {
        "id": "login-2",
        "category": "login",
        "question": "¿Cómo configuro la Autenticación de Dos Factores (TOTP 2FA)?",
        "answer": "Vaya a Ajustes > Seguridad y active el 2FA escaneando el código QR con cualquier app estándar (Google Authenticator, Authy o 1Password). Una vez activado, se solicitará su código de 6 dígitos en accesos y retiros.",
        "tags": [
            "2fa",
            "autenticador",
            "seguridad",
            "dos factores"
        ]
    },
    {
        "id": "login-3",
        "category": "login",
        "question": "¿Puedo acceder mediante mi cuenta de Google o alternar proveedores?",
        "answer": "Sí, puede iniciar sesión directamente con Google. Ofrece autenticación ágil en un clic respaldada por los más altos estándares mundiales de seguridad en la nube.",
        "tags": [
            "google",
            "oauth",
            "inicio de sesión rápido"
        ]
    },
    {
        "id": "games-1",
        "category": "games",
        "question": "¿Cuáles son los 11 juegos de habilidad disponibles en Nizalo?",
        "answer": "Nizalo cuenta con 11 juegos estratégicos arbitrados íntegramente por el servidor: Ajedrez (Chess), Billar (Billiards), Damas (Checkers), Dominó (Dominoes), Backgammon, Seega, Conecta 4 (Connect Four), Tres en Raya (XO), Cálculo Rápido (Speed Math), Reversi y Gomoku. Todas las partidas aplican reglas oficiales rigurosas.",
        "tags": [
            "juegos",
            "reglas",
            "ajedrez",
            "damas",
            "dominó",
            "backgammon",
            "seega",
            "conecta 4",
            "tres en raya",
            "cálculo rápido",
            "reversi",
            "gomoku"
        ]
    },
    {
        "id": "games-2",
        "category": "games",
        "question": "¿Los resultados en Nizalo se basan estrictamente en la habilidad del jugador?",
        "answer": "Totalmente. Todas las competiciones en Nizalo son pruebas exclusivas de destreza mental, agudeza táctica, cálculo y rapidez. No existe ventaja de la casa, azar manipulado ni dinámicas de casino o apuestas.",
        "tags": [
            "habilidad pura",
            "juego limpio",
            "sin azar",
            "no apuestas"
        ]
    },
    {
        "id": "match-1",
        "category": "matchmaking",
        "question": "¿Cómo empareja el sistema a los oponentes de forma justa?",
        "answer": "El emparejamiento emplea algoritmos de puntuación ELO y Puntuación Global de Habilidad (GSS), combinados con filtros de latencia de red, garantizando rivales reales en su mismo rango de maestría y con conexión fluida.",
        "tags": [
            "emparejamiento",
            "elo",
            "gss",
            "partidas equilibradas"
        ]
    },
    {
        "id": "match-2",
        "category": "matchmaking",
        "question": "¿Qué es la Puntuación Global de Habilidad (Global Skill Score / GSS)?",
        "answer": "El GSS es una métrica porcentual integral calculada a partir de su porcentaje de victorias, precisión de movimientos y volumen de juego en los 11 juegos, reflejando su nivel maestro global.",
        "tags": [
            "gss",
            "clasificación global",
            "ranking",
            "maestría"
        ]
    },
    {
        "id": "friend-1",
        "category": "friend_challenges",
        "question": "¿Cómo desafío a un amigo específico a un duelo privado?",
        "answer": "En el menú 'Jugar', seleccione 'Desafiar Amigo', escriba el apodo de su amigo, elija el juego, control de tiempo y la bolsa en juego (o práctica amistosa gratis). Su amigo dispondrá de 60 segundos para aceptar el duelo.",
        "tags": [
            "desafío amigo",
            "sala privada",
            "duelo directo",
            "partida personalizada"
        ]
    },
    {
        "id": "friend-2",
        "category": "friend_challenges",
        "question": "¿Qué ocurre si mi amigo no responde a la invitación a tiempo?",
        "answer": "Si el tiempo de 60 segundos se agota o su amigo rechaza la invitación, el desafío expira de inmediato y cualquier saldo reservado para la partida se desbloquea al instante en su billetera.",
        "tags": [
            "invitación expirada",
            "tiempo agotado",
            "desbloqueo de saldo"
        ]
    },
    {
        "id": "tourn-1",
        "category": "tournaments",
        "question": "¿Cómo funcionan los torneos de Nizalo y cómo se reparten los premios?",
        "answer": "Los torneos siguen estructuras oficiales de Eliminación Directa o Sistema Suizo. Los premios se abonan de forma automática e instantánea al libro contable tras la final según la tabla publicada en la sala del torneo.",
        "tags": [
            "torneos",
            "eliminación directa",
            "sistema suizo",
            "premios automáticos"
        ]
    },
    {
        "id": "tourn-2",
        "category": "tournaments",
        "question": "¿Qué sucede si una ronda eliminatoria termina en empate (tablas)?",
        "answer": "En rondas eliminatorias que requieran un clasificado indiscutible, se disputa un desempate a partida relámpago (Blitz) o se aplica la regla de menor consumo acumulado de reloj según el reglamento del torneo.",
        "tags": [
            "empate",
            "desempate",
            "partida blitz",
            "reglas de torneo"
        ]
    },
    {
        "id": "wallet-1",
        "category": "wallet",
        "question": "¿Cómo opera el libro mayor financiero (Double-Entry Ledger) de Nizalo?",
        "answer": "Nizalo utiliza un libro mayor financiero de doble entrada totalmente inmutable. Cualquier movimiento (depósitos, retenciones de juego, premios, retiros o comisiones de referidos) queda asentado con trazabilidad criptográfica auditable.",
        "tags": [
            "billetera",
            "libro mayor",
            "doble entrada",
            "transparencia financiera"
        ]
    },
    {
        "id": "wallet-2",
        "category": "wallet",
        "question": "¿Pueden los agentes de soporte modificar manualmente el saldo de mi billetera?",
        "answer": "No, en absoluto. Por estrictas directrices de seguridad arquitectónica, ningún miembro del equipo de soporte dispone de permisos técnicos para alterar saldos o alterar transacciones. Todo opera bajo reglas automáticas verificadas.",
        "tags": [
            "soporte",
            "seguridad de saldo",
            "protección contra fraudes"
        ]
    },
    {
        "id": "dep-1",
        "category": "deposits",
        "question": "¿Cómo deposito USDT y cuál es el importe mínimo?",
        "answer": "Acceda a Billetera > Depositar, elija la red deseada (USDT-TRC20, BEP20 o ERC20) y copie la dirección oficial de tesorería para transferir desde su exchange o billetera personal. El depósito mínimo es de $5.00 USDT, acreditándose automáticamente tras las confirmaciones requeridas.",
        "tags": [
            "depósito USDT",
            "mínimo de depósito",
            "recargar saldo"
        ]
    },
    {
        "id": "dep-2",
        "category": "deposits",
        "question": "¿Qué debo hacer si mi depósito tarda más de lo esperado en acreditarse?",
        "answer": "El tiempo depende de la congestión de la red blockchain (normalmente de 2 a 5 minutos). Si transcurren más de 15 minutos, localice el hash de la transacción (TX Hash) en el explorador de bloques y abra un ticket de soporte con el número de transacción.",
        "tags": [
            "depósito demorado",
            "tx hash",
            "confirmación blockchain",
            "soporte"
        ]
    },
    {
        "id": "dep-3",
        "category": "deposits",
        "question": "¿Qué ocurre si envío fondos a través de una red o cadena no compatible?",
        "answer": "Advertencia crítica: El envío de activos mediante redes no admitidas o a direcciones erróneas puede causar la pérdida permanente e irreversible de los fondos en la blockchain. Compruebe minuciosamente la red antes de confirmar.",
        "tags": [
            "red no compatible",
            "error de cadena",
            "pérdida de fondos",
            "advertencia"
        ]
    },
    {
        "id": "wth-1",
        "category": "withdrawals",
        "question": "¿Cómo retiro mis ganancias y cuánto demora el proceso?",
        "answer": "En su Billetera, seleccione 'Retirar', especifique la dirección USDT de destino y el monto deseado. Los retiros se procesan de manera automática y expedita tras la validación de seguridad, llegando a su billetera en cuestión de minutos.",
        "tags": [
            "retiro",
            "cobro de ganancias",
            "tiempo de retiro",
            "pago rápido"
        ]
    },
    {
        "id": "wth-2",
        "category": "withdrawals",
        "question": "¿Existen comisiones de la plataforma sobre las solicitudes de retiro?",
        "answer": "Nizalo no cobra ninguna comisión oculta por retiro. Únicamente se descuenta la tarifa de gas/minería de la red blockchain correspondiente al momento de la emisión.",
        "tags": [
            "comisiones de retiro",
            "gas fee",
            "red blockchain",
            "sin comisiones ocultas"
        ]
    },
    {
        "id": "wth-3",
        "category": "withdrawals",
        "question": "¿Se requiere verificación de identidad (KYC) obligatoria para retirar fondos?",
        "answer": "Los retiros cotidianos habituales se liquidan de inmediato. Los retiros de cuantía extraordinaria o las cuentas con alertas de seguridad pueden requerir verificación básica de identidad (KYC) para cumplir con normativas internacionales anti-blanqueo de capitales.",
        "tags": [
            "KYC",
            "verificación de identidad",
            "retiro seguro",
            "AML"
        ]
    },
    {
        "id": "usdt-1",
        "category": "usdt",
        "question": "¿Por qué Nizalo opera con la stablecoin USDT (Tether)?",
        "answer": "USDT mantiene paridad 1:1 con el dólar estadounidense, protegiendo sus saldos y premios de la volatilidad extrema de las criptomonedas y facilitando transacciones globales instantáneas de bajo coste.",
        "tags": [
            "USDT",
            "stablecoin",
            "dólar digital",
            "sin volatilidad"
        ]
    },
    {
        "id": "usdt-2",
        "category": "usdt",
        "question": "¿El uso de USDT exime a las partidas del cumplimiento de la legislación local?",
        "answer": "No. USDT se utiliza exclusivamente como herramienta técnica contable. Nizalo opera con estricto apego a las leyes sobre certámenes de habilidad y prohíbe la participación con cuotas económicas en territorios donde esté restringido.",
        "tags": [
            "legalidad",
            "cumplimiento",
            "juegos de destreza"
        ]
    },
    {
        "id": "tx-1",
        "category": "tx_confirmation",
        "question": "¿Qué es el identificador de transacción (TxID / Hash) y dónde encontrarlo?",
        "answer": "Es un código alfanumérico único de 64 caracteres generado por la blockchain que certifica la ejecución de la transferencia. Puede copiarlo desde el historial de su billetera emisora.",
        "tags": [
            "txid",
            "hash de transacción",
            "comprobante",
            "blockchain"
        ]
    },
    {
        "id": "tx-2",
        "category": "tx_confirmation",
        "question": "¿Cuántas confirmaciones de bloque son necesarias para confirmar un depósito?",
        "answer": "Dependiendo de la red seleccionada, se requieren entre 12 y 64 confirmaciones de bloque (habitualmente entre 1 y 2 minutos en redes como TRC20 o BEP20).",
        "tags": [
            "confirmaciones de red",
            "bloques",
            "tiempo de confirmación"
        ]
    },
    {
        "id": "sec-1",
        "category": "security",
        "question": "¿Cómo protege Nizalo los fondos y la información de los jugadores?",
        "answer": "Aplicamos una arquitectura de seguridad de 'Confianza Cero' (Zero-Trust), almacenamiento de fondos en frío con multifirma (Multi-Sig), cifrado TLS 1.3 de extremo a extremo y auditoría forense ininterrumpida.",
        "tags": [
            "seguridad",
            "cero confianza",
            "almacenamiento en frío",
            "cifrado"
        ]
    },
    {
        "id": "sec-2",
        "category": "security",
        "question": "Aviso crítico: ¿El personal de Nizalo solicitará contraseñas o claves privadas?",
        "answer": "NUNCA. Ningún empleado de Nizalo le solicitará bajo ninguna circunstancia su contraseña, frase semilla, clave privada ni códigos de verificación (OTP). Quien lo solicite es un estafador y debe ser denunciado inmediatamente.",
        "tags": [
            "antifraude",
            "phishing",
            "seguridad de contraseña",
            "alerta de estafa"
        ]
    },
    {
        "id": "fair-1",
        "category": "fair_play",
        "question": "¿Cómo detecta Nizalo los motores de IA (como Stockfish) y los bots de asistencia?",
        "answer": "Nuestro motor telemático forense evalúa en tiempo real la precisión de los movimientos frente a motores de última generación, los deltas de tiempo de reflexión y la microdinámica de interacción para sancionar el juego desleal de inmediato.",
        "tags": [
            "anti-trampas",
            "detección de motores",
            "Stockfish",
            "juego limpio"
        ]
    },
    {
        "id": "fair-2",
        "category": "fair_play",
        "question": "¿Están permitidas las cuentas múltiples o la colusión entre participantes?",
        "answer": "Queda estrictamente prohibido poseer múltiples cuentas, pactar resultados de partidas o bajar deliberadamente de clasificación (sandbagging). Las infracciones conllevan el cierre permanente de la cuenta y la incautación de fondos ilícitos.",
        "tags": [
            "cuentas múltiples",
            "colusión",
            "sandbagging",
            "sanciones"
        ]
    },
    {
        "id": "ref-1",
        "category": "referrals",
        "question": "¿Cómo funciona el Programa de Afiliados y Referidos de Nizalo?",
        "answer": "Cada jugador registrado cuenta con un enlace de recomendación único y permanente. Cuando un amigo invitado se registra y realiza su primer depósito calificado de $5.00 o más, usted recibe un incentivo de $1.00 directamente en su saldo disponible.",
        "tags": [
            "programa de referidos",
            "recompensas",
            "enlace de invitación"
        ]
    },
    {
        "id": "ref-2",
        "category": "referrals",
        "question": "¿Por qué no se acreditó una recompensa de referido en mi cuenta?",
        "answer": "El sistema audita automáticamente las bonificaciones. La autorecomendación, el uso del mismo dispositivo o IP, o la falta de confirmación del depósito del invitado anulan la bonificación por políticas antifraude.",
        "tags": [
            "recompensa pendiente",
            "fraude de referidos",
            "condiciones de cobro"
        ]
    },
    {
        "id": "chat-1",
        "category": "chat",
        "question": "¿Cuáles son las normas de conducta en el chat durante las partidas?",
        "answer": "Fomentamos una atmósfera competitiva respetuosa y deportiva. Se prohíben estrictamente insultos, expresiones de odio, spam publicitario o cualquier intento de desconcentrar al oponente en su turno.",
        "tags": [
            "normas de chat",
            "respeto",
            "deportividad",
            "sanción de silencio"
        ]
    },
    {
        "id": "chat-2",
        "category": "chat",
        "question": "¿Cómo denuncio a un jugador irrespetuoso o tóxico en el chat?",
        "answer": "Haga clic en el apodo del infractor en el chat y seleccione 'Denunciar Usuario', o bien abra un ticket de soporte indicando el identificador del duelo.",
        "tags": [
            "denuncia",
            "reportar jugador",
            "bloqueo",
            "soporte"
        ]
    },
    {
        "id": "tech-1",
        "category": "technical_issues",
        "question": "¿Qué ocurre si sufro una desconexión de internet durante un duelo en vivo?",
        "answer": "El servidor de Nizalo custodia el estado oficial inmutable de la partida. Si pierde la conexión, dispone de una ventana de gracia de 60 segundos para reconectarse recargando la página sin perder su turno mientras su reloj esté activo.",
        "tags": [
            "desconexión",
            "reconexión",
            "caída de internet",
            "ventana de gracia"
        ]
    },
    {
        "id": "tech-2",
        "category": "technical_issues",
        "question": "¿Cómo se gestionan los relojes de la partida? ¿Se puede alterar el tiempo localmente?",
        "answer": "Todos los cronómetros son decrementados de manera soberana e inapelable por el servidor central de Nizalo, impidiendo cualquier intento de manipulación o alteración del reloj desde el dispositivo del usuario.",
        "tags": [
            "reloj de servidor",
            "tiempo oficial",
            "precisión milimétrica"
        ]
    },
    {
        "id": "tech-3",
        "category": "technical_issues",
        "question": "¿Cuáles son los navegadores y especificaciones recomendadas para jugar?",
        "answer": "Nizalo funciona de manera óptima en las versiones actuales de Google Chrome, Safari, Microsoft Edge y Firefox en ordenadores, tablets y smartphones Android e iOS con aceleración gráfica WebGL habilitada.",
        "tags": [
            "navegadores recomendados",
            "webgl",
            "rendimiento",
            "móvil y pc"
        ]
    }
],
  fr: [
    {
        "id": "acc-1",
        "category": "account",
        "question": "Comment créer et vérifier mon compte joueur sur Nizalo ?",
        "answer": "Vous pouvez vous inscrire en choisissant un pseudonyme unique et un mot de passe sécurisé (10 caractères minimum), ou vous connecter instantanément via votre compte Google. Chaque utilisateur dispose d'un identifiant permanent. Afin de garantir l'équité sportive, un seul compte est autorisé par personne physique.",
        "tags": [
            "inscription",
            "compte",
            "vérification",
            "joueur",
            "profil"
        ]
    },
    {
        "id": "acc-2",
        "category": "account",
        "question": "Puis-je modifier mon pseudonyme de joueur après mon inscription ?",
        "answer": "Vous pouvez personnaliser votre avatar et vos paramètres dans votre Espace Profil. Les pseudonymes constituent des identifiants uniques de la plateforme et sont associés de manière permanente à votre palmarès, classement ELO, réputation et code de parrainage.",
        "tags": [
            "pseudonyme",
            "identifiant",
            "profil",
            "paramètres"
        ]
    },
    {
        "id": "acc-3",
        "category": "account",
        "question": "Comment réinitialiser mon mot de passe en cas d'oubli ?",
        "answer": "Sur la page de connexion, cliquez sur 'Mot de passe oublié' ou sélectionnez 'Recevoir un code par e-mail'. Vous recevrez un code de sécurité à 6 chiffres pour définir un nouveau mot de passe sans délai.",
        "tags": [
            "mot de passe oublié",
            "réinitialisation",
            "sécurité e-mail"
        ]
    },
    {
        "id": "login-1",
        "category": "login",
        "question": "Que faire si mon compte est temporairement verrouillé suite à plusieurs échecs ?",
        "answer": "Par mesure de sécurité contre les attaques par force brute, notre système verrouille temporairement les accès après plusieurs tentatives infructueuses. Patientez 5 à 10 minutes ou utilisez la procédure de réinitialisation par e-mail.",
        "tags": [
            "compte verrouillé",
            "échec connexion",
            "protection"
        ]
    },
    {
        "id": "login-2",
        "category": "login",
        "question": "Comment activer l'authentification à deux facteurs (TOTP 2FA) ?",
        "answer": "Rendez-vous dans Paramètres > Sécurité et activez la double authentification via une application dédiée (Google Authenticator, Authy, 1Password). Ce code à 6 chiffres sera requis pour sécuriser vos connexions et retraits.",
        "tags": [
            "2fa",
            "double authentification",
            "sécurité",
            "google authenticator"
        ]
    },
    {
        "id": "login-3",
        "category": "login",
        "question": "Puis-je me connecter avec mon compte Google ?",
        "answer": "Oui, la connexion Google OAuth en un clic est disponible. Elle combine ergonomie instantanée et sécurité cloud de premier plan.",
        "tags": [
            "google",
            "oauth",
            "connexion rapide"
        ]
    },
    {
        "id": "games-1",
        "category": "games",
        "question": "Quels sont les 11 jeux de compétence proposés sur Nizalo ?",
        "answer": "Nizalo propose 11 jeux de réflexion et de stratégie régis entièrement par le serveur : Échecs (Chess), Billard (Billiards), Dames (Checkers), Dominos (Dominoes), Backgammon, Seega, Puissance 4 (Connect Four), Morpion (XO), Calcul Rapide (Speed Math), Reversi et Gomoku. Chaque partie applique les règles officielles strictes.",
        "tags": [
            "jeux",
            "règles",
            "échecs",
            "dames",
            "dominos",
            "backgammon",
            "seega",
            "puissance 4",
            "morpion",
            "calcul rapide",
            "reversi",
            "gomoku"
        ]
    },
    {
        "id": "games-2",
        "category": "games",
        "question": "Les victoires sur Nizalo reposent-elles exclusivement sur les compétences ?",
        "answer": "Oui, absolument. Tous les duels sur Nizalo sont des compétitions d'adresse intellectuelle pure. L'issue d'une partie dépend uniquement du calcul, de la vision tactique et de la rapidité d'exécution. Aucun hasard manipulé ni jeu de casino n'existe sur la plateforme.",
        "tags": [
            "compétence pure",
            "jeu équitable",
            "sans hasard",
            "non casino"
        ]
    },
    {
        "id": "match-1",
        "category": "matchmaking",
        "question": "Comment le système d'appariement sélectionne-t-il les adversaires ?",
        "answer": "Le matchmaking s'appuie sur le système de classement ELO et l'indice Global Skill Score (GSS), couplés à une analyse de latence réseau pour vous opposer à des joueurs réels de niveau équivalent.",
        "tags": [
            "appariement",
            "elo",
            "matchmaking équilibré"
        ]
    },
    {
        "id": "match-2",
        "category": "matchmaking",
        "question": "Qu'est-ce que le score global de compétence (Global Skill Score / GSS) ?",
        "answer": "Le GSS est un indicateur composite exprimé en centile, synthétisant vos taux de victoire, votre précision et votre volume de jeu à travers l'ensemble des 11 disciplines de la plateforme.",
        "tags": [
            "gss",
            "score global",
            "classement",
            "maîtrise"
        ]
    },
    {
        "id": "friend-1",
        "category": "friend_challenges",
        "question": "Comment lancer un défi privé à un ami spécifique ?",
        "answer": "Depuis le menu 'Jouer', choisissez 'Défier un ami', renseignez son pseudonyme, configurez le jeu, la cadence et l'éventuelle mise (ou entraînement libre). Votre ami dispose de 60 secondes pour accepter l'invitation.",
        "tags": [
            "défi ami",
            "partie privée",
            "duel direct",
            "invitation"
        ]
    },
    {
        "id": "friend-2",
        "category": "friend_challenges",
        "question": "Que se passe-t-il si mon ami n'accepte pas l'invitation à temps ?",
        "answer": "Si le délai de 60 secondes s'écoule sans réponse ou en cas de refus, l'invitation expire automatiquement et la réserve de solde éventuellement engagée est débloquée immédiatement dans votre portefeuille.",
        "tags": [
            "défi expiré",
            "temps écoulé",
            "déblocage solde"
        ]
    },
    {
        "id": "tourn-1",
        "category": "tournaments",
        "question": "Comment se déroulent les tournois Nizalo et la distribution des prix ?",
        "answer": "Les tournois adoptent des formats éprouvés : Élimination Directe ou Système Suisse. Les récompenses sont créditées instantanément et de façon automatisée sur votre solde dès la conclusion de la finale.",
        "tags": [
            "tournois",
            "élimination directe",
            "système suisse",
            "dotations"
        ]
    },
    {
        "id": "tourn-2",
        "category": "tournaments",
        "question": "Comment sont départagées les parties nulles lors des phases éliminatoires ?",
        "answer": "Dans les tours nécessitant une qualification impérative, une partie de départage en blitz ultra-rapide (Sudden-Death) ou la règle de consommation minimale du chronomètre est appliquée.",
        "tags": [
            "match nul",
            "départage blitz",
            "règles tournoi"
        ]
    },
    {
        "id": "wallet-1",
        "category": "wallet",
        "question": "Comment fonctionne le grand livre comptable en partie double de Nizalo ?",
        "answer": "Nizalo utilise un grand livre comptable immutable à double entrée. Chaque mouvement (dépôt, réservation de mise, attribution de gain, retrait, bonus) fait l'objet d'une écriture inviolable et auditable.",
        "tags": [
            "portefeuille",
            "grand livre",
            "partie double",
            "transparence"
        ]
    },
    {
        "id": "wallet-2",
        "category": "wallet",
        "question": "Les agents du support peuvent-ils créditer ou modifier mon solde manuellement ?",
        "answer": "Non, formellement. Selon nos protocoles de sécurité stricts, les agents de support ne disposent d'aucun accès technique leur permettant de manipuler les soldes des joueurs. Tout mouvement est soumis à validation automatique.",
        "tags": [
            "support",
            "sécurité financière",
            "intégrité solde"
        ]
    },
    {
        "id": "dep-1",
        "category": "deposits",
        "question": "Comment déposer des USDT et quel est le montant minimum exigé ?",
        "answer": "Rendez-vous dans Portefeuille > Dépôt, sélectionnez le réseau souhaité (USDT-TRC20, BEP20 ou ERC20) et copiez l'adresse officielle de la trésorerie. Le dépôt minimal est de 5,00 $ USDT, crédité automatiquement dès que les confirmations blockchain sont validées.",
        "tags": [
            "dépôt USDT",
            "montant minimum",
            "crédit compte"
        ]
    },
    {
        "id": "dep-2",
        "category": "deposits",
        "question": "Que faire en cas de délai anormal sur la réception d'un dépôt ?",
        "answer": "Le délai dépend de la congestion du réseau blockchain (généralement 2 à 5 minutes). Si votre dépôt n'apparaît pas après 15 minutes, munissez-vous du hash de transaction (TX Hash) et ouvrez un ticket d'assistance.",
        "tags": [
            "dépôt retardé",
            "tx hash",
            "support client",
            "confirmation"
        ]
    },
    {
        "id": "dep-3",
        "category": "deposits",
        "question": "Que se passe-t-il en cas d'envoi vers un réseau blockchain non pris en charge ?",
        "answer": "Avertissement crucial : L'envoi d'actifs via un réseau non supporté ou vers une mauvaise adresse entraîne la perte irréversible et définitive des fonds sur la blockchain. Vérifiez scrupuleusement la compatibilité avant l'envoi.",
        "tags": [
            "erreur réseau",
            "perte de fonds",
            "mise en garde"
        ]
    },
    {
        "id": "wth-1",
        "category": "withdrawals",
        "question": "Comment retirer mes gains et quels sont les délais de traitement ?",
        "answer": "Dans l'onglet Portefeuille, cliquez sur 'Retirer', saisissez votre adresse personnelle de destination en USDT et le montant voulu. Les demandes sont traitées de manière automatisée et parviennent à votre portefeuille en quelques minutes.",
        "tags": [
            "retrait",
            "gains",
            "délai retrait",
            "paiement rapide"
        ]
    },
    {
        "id": "wth-2",
        "category": "withdrawals",
        "question": "Des frais de plateforme sont-ils prélevés lors des retraits ?",
        "answer": "Nizalo ne prélève aucun frais caché sur les retraits. Seuls les frais réels de gaz et de mineurs de la blockchain concernée sont déduits du montant expédié.",
        "tags": [
            "frais retrait",
            "frais de gaz",
            "sans frais cachés"
        ]
    },
    {
        "id": "wth-3",
        "category": "withdrawals",
        "question": "Une vérification d'identité (KYC) est-elle requise pour effectuer un retrait ?",
        "answer": "Les retraits d'usage courant sont débloqués immédiatement. Des montants exceptionnellement élevés ou des profils présentant des anomalies peuvent nécessiter une vérification KYC conforme aux standards de lutte anti-blanchiment (AML).",
        "tags": [
            "kyc",
            "vérification d'identité",
            "sécurité retraits"
        ]
    },
    {
        "id": "usdt-1",
        "category": "usdt",
        "question": "Pourquoi la plateforme Nizalo utilise-t-elle le stablecoin USDT ?",
        "answer": "L'USDT étant indexé 1:1 sur le dollar américain, il préserve vos gains et vos mises de la volatilité inhérente aux cryptomonnaies tout en autorisant des règlements internationaux instantanés à coût minime.",
        "tags": [
            "usdt",
            "stablecoin",
            "dollar numérique",
            "stabilité"
        ]
    },
    {
        "id": "usdt-2",
        "category": "usdt",
        "question": "L'utilisation d'USDT soustrait-elle la plateforme aux lois locales ?",
        "answer": "Non. L'USDT n'est qu'un instrument d'équilibrage financier. Nizalo respecte scrupuleusement le cadre légal des jeux de compétence et interdit les parties avec mises dans les juridictions où cela n'est pas autorisé.",
        "tags": [
            "conformité légale",
            "réglementation",
            "jeux d'adresse"
        ]
    },
    {
        "id": "tx-1",
        "category": "tx_confirmation",
        "question": "Qu'est-ce qu'un hash de transaction (TxID) et où le trouver ?",
        "answer": "Le TxID est une signature alphanumérique unique de 64 caractères générée par la blockchain attestant de la transaction. Vous pouvez le retrouver dans l'historique de votre portefeuille émetteur.",
        "tags": [
            "txid",
            "hash",
            "preuve de virement",
            "blockchain"
        ]
    },
    {
        "id": "tx-2",
        "category": "tx_confirmation",
        "question": "Combien de confirmations de blocs sont requises pour valider un dépôt ?",
        "answer": "Entre 12 et 64 confirmations de blocs sont généralement requises selon le réseau sélectionné, ce qui nécessite entre 1 et 2 minutes en conditions normales.",
        "tags": [
            "confirmations",
            "validation blocs",
            "délai"
        ]
    },
    {
        "id": "sec-1",
        "category": "security",
        "question": "Comment Nizalo protège-t-il les fonds et les données des utilisateurs ?",
        "answer": "Nous déployons une architecture 'Zero-Trust', un stockage à froid multi-signatures (Multi-Sig) pour les réserves, un chiffrement TLS 1.3 de pointe et un audit médico-légal continu de chaque opération.",
        "tags": [
            "sécurité",
            "zero-trust",
            "cold storage",
            "chiffrement"
        ]
    },
    {
        "id": "sec-2",
        "category": "security",
        "question": "Alerte de sécurité : les agents de Nizalo demanderont-ils mes mots de passe ?",
        "answer": "JAMAIS. Aucun représentant de Nizalo ne vous sollicitera pour obtenir votre mot de passe, votre clé privée ou vos codes de validation (OTP). Toute tentative en ce sens constitue une escroquerie à signaler immédiatement.",
        "tags": [
            "phishing",
            "alerte arnaque",
            "mot de passe sécurisé"
        ]
    },
    {
        "id": "fair-1",
        "category": "fair_play",
        "question": "Comment le moteur de Nizalo détecte-t-il les logiciels de triche (comme Stockfish) ?",
        "answer": "Notre moteur d'analyse forensique évalue en continu la corrélation des coups joués avec les meilleurs moteurs d'échecs, les profils temporels de décision et la trajectoire des interactions pour bannir les tricheurs sur-le-champ.",
        "tags": [
            "anti-triche",
            "détection stockfish",
            "jeu propre",
            "sanctions"
        ]
    },
    {
        "id": "fair-2",
        "category": "fair_play",
        "question": "Les multicomptes ou la collusion entre joueurs sont-ils tolérés ?",
        "answer": "Strictement interdits. Le multicompte, le trucage de duels et la baisse intentionnelle de classement (sandbagging) entraînent la fermeture définitive des comptes et la confiscation totale des fonds illicites.",
        "tags": [
            "multicomptes",
            "collusion",
            "sandbagging",
            "confiscation"
        ]
    },
    {
        "id": "ref-1",
        "category": "referrals",
        "question": "Comment fonctionne le programme de parrainage de Nizalo ?",
        "answer": "Chaque joueur dispose d'un lien d'affiliation unique et pérenne. Lorsqu'un filleul s'inscrit via votre lien et effectue un premier dépôt éligible d'au moins 5,00 $, une récompense de 1,00 $ est immédiatement versée sur votre solde.",
        "tags": [
            "parrainage",
            "affiliation",
            "bonus invité"
        ]
    },
    {
        "id": "ref-2",
        "category": "referrals",
        "question": "Pourquoi mon bonus de parrainage n'apparaît-il pas ?",
        "answer": "Les affiliations font l'objet d'un filtrage automatisé. L'auto-parrainage, l'usage d'un même terminal ou réseau IP et les dépôts non validés entraînent l'annulation automatique du bonus.",
        "tags": [
            "fraude parrainage",
            "conditions bonus",
            "rejet affiliation"
        ]
    },
    {
        "id": "chat-1",
        "category": "chat",
        "question": "Quelles sont les règles de modération du chat en cours de partie ?",
        "answer": "La courtoisie et l'esprit sportif sont obligatoires. Les insultes, propos haineux, messages promotionnels ou tentatives de déconcentration de l'adversaire sont sanctionnés par des exclusions de chat.",
        "tags": [
            "modération chat",
            "fair-play",
            "respect",
            "silence"
        ]
    },
    {
        "id": "chat-2",
        "category": "chat",
        "question": "Comment signaler un comportement abusif ou injurieux dans le chat ?",
        "answer": "Cliquez sur le pseudonyme du joueur indélicat et choisissez 'Signaler l'utilisateur', ou adressez un ticket au support avec la référence de la partie.",
        "tags": [
            "signalement",
            "bloquer joueur",
            "support ticket"
        ]
    },
    {
        "id": "tech-1",
        "category": "technical_issues",
        "question": "Que se passe-t-il en cas de coupure de connexion internet en pleine partie ?",
        "answer": "Le serveur central conserve l'état officiel absolu de la partie. En cas de perte de signal, vous disposez d'un délai de grâce de 60 secondes pour vous reconnecter en actualisant la page sans perdre votre tour tant que votre pendule tourne.",
        "tags": [
            "déconnexion",
            "reconnexion",
            "délai de grâce",
            "reprise de partie"
        ]
    },
    {
        "id": "tech-2",
        "category": "technical_issues",
        "question": "Comment fonctionnent les chronomètres de jeu ? Peuvent-ils être altérés localement ?",
        "answer": "Toutes les pendules sont synchronisées et décrémentées exclusivement par les serveurs centraux de Nizalo, excluant toute manipulation temporelle sur les appareils des joueurs.",
        "tags": [
            "chronomètre serveur",
            "horloge officielle",
            "précision temps"
        ]
    },
    {
        "id": "tech-3",
        "category": "technical_issues",
        "question": "Quels sont les navigateurs et terminaux recommandés pour jouer ?",
        "answer": "Nizalo est pleinement optimisé pour Google Chrome, Safari, Microsoft Edge et Mozilla Firefox, sur ordinateur, tablette et smartphone (Android / iOS) avec accélération WebGL activée.",
        "tags": [
            "navigateurs compatibles",
            "webgl",
            "mobiles et pc"
        ]
    }
],
  hi: [
    {
        "id": "acc-1",
        "category": "account",
        "question": "मैं Nizalo प्लेटफ़ॉर्म पर अपना खाता कैसे बनाऊं और सत्यापित करूं?",
        "answer": "आप एक अद्वितीय उपनाम और मजबूत पासवर्ड (कम से कम 10 वर्ण) चुनकर आसानी से खाता बना सकते हैं, या Google के माध्यम से सीधे एक क्लिक में लॉगिन कर सकते हैं। प्रत्येक खिलाड़ी को एक स्थायी आईडी मिलती है। निष्पक्षता और अखंडता बनाए रखने के लिए प्रति व्यक्ति केवल एक (1) खाते की अनुमति है।",
        "tags": [
            "पंजीकरण",
            "खाता बनाएं",
            "सत्यापन",
            "नया उपयोगकर्ता",
            "आईडी"
        ]
    },
    {
        "id": "acc-2",
        "category": "account",
        "question": "क्या मैं पंजीकरण के बाद अपना उपनाम (Nickname) बदल सकता हूँ?",
        "answer": "आप अपनी प्रोफ़ाइल और सेटिंग्स से अवतार और व्यक्तिगत विवरण अपडेट कर सकते हैं। उपनाम आपकी प्रतिस्पर्धी रेटिंग, ELO स्कोर, गेम इतिहास और रेफरल कोड से स्थायी रूप से जुड़ा होता है, इसलिए इसे बदला नहीं जा सकता।",
        "tags": [
            "उपनाम",
            "हैंडल",
            "प्रोफ़ाइल",
            "सेटिंग्स"
        ]
    },
    {
        "id": "acc-3",
        "category": "account",
        "question": "यदि मैं पासवर्ड भूल जाऊं तो अपने खाते तक पहुंच कैसे पुनर्प्राप्त करूं?",
        "answer": "लॉगिन स्क्रीन पर 'पासवर्ड भूल गए?' पर क्लिक करें या 'मुझे कोड ईमेल करें' चुनें। आपको पासवर्ड रीसेट करने के लिए अपने ईमेल पर एक सुरक्षित 6-अंकीय सत्यापन कोड प्राप्त होगा।",
        "tags": [
            "पासवर्ड भूल गए",
            "पासवर्ड रीसेट",
            "खाता पुनर्प्राप्ति",
            "ईमेल कोड"
        ]
    },
    {
        "id": "login-1",
        "category": "login",
        "question": "यदि बार-बार गलत लॉगिन प्रयासों के बाद खाता लॉक हो जाए तो क्या करें?",
        "answer": "सुरक्षा कारणों से, हमारा सिस्टम बार-बार गलत पासवर्ड डालने पर खाते को अस्थायी रूप से लॉक कर देता है। 5 से 10 मिनट तक प्रतीक्षा करें या पासवर्ड रीसेट लिंक का उपयोग करें।",
        "tags": [
            "खाता लॉक",
            "लॉगिन विफलता",
            "सुरक्षा उपाय"
        ]
    },
    {
        "id": "login-2",
        "category": "login",
        "question": "टू-फैक्टर ऑथेंटिकेशन (TOTP 2FA) कैसे सेट और उपयोग करें?",
        "answer": "सेटिंग्स > सुरक्षा पर जाएं और Google Authenticator, Authy या 1Password जैसे किसी भी ऐप से क्यूआर कोड स्कैन करके 2FA सक्षम करें। सक्षम होने के बाद, लॉगिन और निकासी के दौरान 6-अंकीय कोड आवश्यक होगा।",
        "tags": [
            "2fa",
            "सुरक्षा",
            "दोहरी प्रमाणीकरण",
            "गूगल ऑथेंटिकेटर"
        ]
    },
    {
        "id": "login-3",
        "category": "login",
        "question": "क्या मैं Google से साइन इन कर सकता हूँ या लॉगिन विधि बदल सकता हूँ?",
        "answer": "हाँ, आप Google के माध्यम से सीधे एक-क्लिक लॉगिन का उपयोग कर सकते हैं। यह विश्वस्तरीय सुरक्षा और सुविधाजनक लॉगिन अनुभव प्रदान करता है।",
        "tags": [
            "गूगल लॉगिन",
            "वन क्लिक लॉगिन",
            "त्वरित प्रमाणीकरण"
        ]
    },
    {
        "id": "games-1",
        "category": "games",
        "question": "Nizalo पर कौन से 11 कौशल-आधारित बोर्ड गेम उपलब्ध हैं?",
        "answer": "Nizalo पर 11 आधिकारिक, सर्वर-नियंत्रित कौशल खेल शामिल हैं: शतरंज (Chess), बिलियर्ड्स (Billiards), चेकर्स (Checkers), डोमिनोज़ (Dominoes), बैकगैमौन (Backgammon), सीगा (Seega), कनेक्ट फोर (Connect Four), एक्स-ओ / टिक-टैक-टो (XO), स्पीड मैथ (Speed Math), रिवर्सी (Reversi), और गोमोकू (Gomoku)। सभी खेलों के परिणाम सर्वर द्वारा निष्पक्ष रूप से निर्धारित होते हैं।",
        "tags": [
            "खेल सूची",
            "नियम",
            "शतरंज",
            "चेकर्स",
            "डोमिनोज़",
            "बैकगैमौन",
            "सीगा",
            "कनेक्ट फोर",
            "स्पीड मैथ",
            "रिवर्सी",
            "गोमोकू"
        ]
    },
    {
        "id": "games-2",
        "category": "games",
        "question": "क्या Nizalo पर खेलों के परिणाम विशुद्ध रूप से कौशल पर आधारित हैं?",
        "answer": "हाँ, पूरी तरह से। Nizalo पर सभी मुकाबले केवल मानसिक गणना, रणनीति, गति और सटीकता पर निर्भर करते हैं। यहाँ जुआ, सट्टेबाजी या हाउस एडवांटेज जैसी कोई व्यवस्था नहीं है।",
        "tags": [
            "कौशल खेल",
            "निष्पक्ष खेल",
            "जुआ नहीं",
            "पारदर्शिता"
        ]
    },
    {
        "id": "match-1",
        "category": "matchmaking",
        "question": "मैचमेकिंग सिस्टम समान स्तर के विरोधियों को कैसे जोड़ता है?",
        "answer": "मैचमेकिंग सिस्टम ELO रेटिंग और ग्लोबल स्किल स्कोर (GSS) का उपयोग करता है। साथ ही नेटवर्क लेटेंसी की जांच कर समान कौशल स्तर वाले वास्तविक खिलाड़ियों को जोड़ता है।",
        "tags": [
            "मैचमेकिंग",
            "elo",
            "समान स्तर",
            "निष्पक्ष मुकाबला"
        ]
    },
    {
        "id": "match-2",
        "category": "matchmaking",
        "question": "ग्लोबल स्किल स्कोर (GSS) क्या है और यह कैसे काम करता है?",
        "answer": "GSS सभी 11 खेलों में आपके प्रदर्शन, जीत प्रतिशत और सटीकता के आधार पर तैयार किया गया एक समग्र रेटिंग स्कोर है, जो आपकी संपूर्ण महारत को दर्शाता है।",
        "tags": [
            "gss",
            "कौशल स्कोर",
            "रैंकिंग",
            "लीडरबोर्ड"
        ]
    },
    {
        "id": "friend-1",
        "category": "friend_challenges",
        "question": "मैं किसी विशिष्ट मित्र को सीधे मुकाबले के लिए कैसे चुनौती दूं?",
        "answer": "'प्ले' मेनू से 'फ्रेंड चैलेंज' चुनें, अपने मित्र का उपनाम दर्ज करें, खेल और समय सीमा चुनें और निमंत्रण भेजें। आपके मित्र को स्वीकार करने के लिए 60 सेकंड का समय मिलेगा।",
        "tags": [
            "मित्र चुनौती",
            "निजी मुकाबला",
            "सीधा मुकाबला",
            "आमंत्रण"
        ]
    },
    {
        "id": "friend-2",
        "category": "friend_challenges",
        "question": "यदि मित्र समय पर चुनौती स्वीकार न करे तो क्या होगा?",
        "answer": "यदि 60 सेकंड समाप्त हो जाते हैं या मित्र चुनौती अस्वीकार कर देता है, तो मुकाबला स्वतः रद्द हो जाता है और आरक्षित राशि तुरंत आपके वॉलेट में वापस आ जाती है।",
        "tags": [
            "चुनौती समाप्त",
            "समय समाप्त",
            "राशि वापसी"
        ]
    },
    {
        "id": "tourn-1",
        "category": "tournaments",
        "question": "Nizalo टूर्नामेंट कैसे काम करते हैं और पुरस्कार कैसे वितरित होते हैं?",
        "answer": "टूर्नामेंट सिंगल एलिमिनेशन या स्विस सिस्टम पर आधारित होते हैं। फाइनल मैच समाप्त होते ही पारदर्शी नियमों के अनुसार पुरस्कार स्वतः विजेता वॉलेट में जोड़ दिया जाता है।",
        "tags": [
            "टूर्नामेंट",
            "एलिमिनेशन",
            "स्विस प्रणाली",
            "पुरस्कार वितरण"
        ]
    },
    {
        "id": "tourn-2",
        "category": "tournaments",
        "question": "यदि टूर्नामेंट का राउंड टाई (ड्रॉ) हो जाए तो क्या फैसला होता है?",
        "answer": "निर्णायक परिणाम की आवश्यकता वाले मुकाबलों में टाई-ब्रेकर ब्लिट्ज मैच या न्यूनतम समय उपयोग नियम लागू होता है।",
        "tags": [
            "टाई",
            "टाई-ब्रेकर",
            "ब्लिट्ज मैच",
            "टूर्नामेंट नियम"
        ]
    },
    {
        "id": "wallet-1",
        "category": "wallet",
        "question": "Nizalo का डबल-एंट्री लेज़र वित्तीय सिस्टम कैसे काम करता है?",
        "answer": "Nizalo सुरक्षित डबल-एंट्री फाइनेंशियल लेज़र का उपयोग करता है। प्रत्येक लेनदेन—जमा, मुकाबला दांव, जीत का इनाम या निकासी—का अपरिवर्तनीय और पारदर्शी रिकॉर्ड दर्ज होता है।",
        "tags": [
            "वॉलेट",
            "लेज़र",
            "डबल एंट्री",
            "वित्तीय सुरक्षा"
        ]
    },
    {
        "id": "wallet-2",
        "category": "wallet",
        "question": "क्या ग्राहक सहायता एजेंट मेरे वॉलेट बैलेंस को मैन्युअल रूप से बदल सकते हैं?",
        "answer": "बिल्कुल नहीं। सुरक्षा नीतियों के तहत किसी भी सपोर्ट एजेंट के पास वॉलेट बैलेंस बदलने या लेज़र प्रविष्टियों को संपादित करने की तकनीकी क्षमता नहीं होती।",
        "tags": [
            "सपोर्ट",
            "बैलेंस सुरक्षा",
            "धोखाधड़ी रोकथाम"
        ]
    },
    {
        "id": "dep-1",
        "category": "deposits",
        "question": "मैं USDT कैसे जमा करूँ और न्यूनतम जमा राशि क्या है?",
        "answer": "वॉलेट > डिपॉजिट पर जाएं, अपना नेटवर्क (USDT-TRC20, BEP20 या ERC20) चुनें और दिए गए पते पर फंड ट्रांसफर करें। न्यूनतम जमा राशि $5.00 USDT है। नेटवर्क पुष्टि के बाद राशि स्वतः क्रेडिट हो जाती है।",
        "tags": [
            "USDT जमा",
            "न्यूनतम जमा",
            "वॉलेट रिचार्ज"
        ]
    },
    {
        "id": "dep-2",
        "category": "deposits",
        "question": "यदि जमा राशि खाते में आने में देरी हो तो मुझे क्या करना चाहिए?",
        "answer": "जमा गति ब्लॉकचेन नेटवर्क पर निर्भर करती है (आमतौर पर 2-5 मिनट)। यदि 15 मिनट से अधिक समय लगे, तो अपना ट्रांजेक्शन हैश (TX Hash) कॉपी करें और सपोर्ट टिकट बनाएं।",
        "tags": [
            "जमा में देरी",
            "tx hash",
            "ब्लॉकचेन पुष्टि",
            "सपोर्ट"
        ]
    },
    {
        "id": "dep-3",
        "category": "deposits",
        "question": "यदि मैं किसी असमर्थित नेटवर्क पर पैसे भेज दूं तो क्या होगा?",
        "answer": "गंभीर चेतावनी: असमर्थित नेटवर्क पर फंड भेजने से ब्लॉकचेन पर संपत्ति स्थायी रूप से खो सकती है जिसे वापस नहीं लाया जा सकता। भेजने से पहले हमेशा नेटवर्क सत्यापित करें।",
        "tags": [
            "गलत नेटवर्क",
            "फंड नुकसान",
            "सावधानी"
        ]
    },
    {
        "id": "wth-1",
        "category": "withdrawals",
        "question": "मैं अपनी जीत की राशि कैसे निकालूं और इसमें कितना समय लगता है?",
        "answer": "वॉलेट में 'निकासी' चुनें, अपना USDT पता और राशि दर्ज करें। स्वचालित सुरक्षा जांच के बाद निकासी तुरंत प्रोसेस की जाती है और कुछ ही मिनटों में आपके पते पर पहुंच जाती है।",
        "tags": [
            "निकासी",
            "राशि निकालना",
            "त्वरित निकासी",
            "भुगतान"
        ]
    },
    {
        "id": "wth-2",
        "category": "withdrawals",
        "question": "क्या निकासी पर प्लेटफ़ॉर्म की कोई छिपी हुई फीस है?",
        "answer": "Nizalo कोई छिपी हुई निकासी फीस नहीं लेता है। केवल संबंधित ब्लॉकचेन की वास्तविक नेटवर्क गैस/माइनर फीस काटी जाती है।",
        "tags": [
            "निकासी शुल्क",
            "गैस फीस",
            "नेटवर्क शुल्क"
        ]
    },
    {
        "id": "wth-3",
        "category": "withdrawals",
        "question": "क्या निकासी के लिए पहचान सत्यापन (KYC) आवश्यक है?",
        "answer": "नियमित निकासी तुरंत प्रोसेस होती है। बड़ी राशि की निकासी या असामान्य सुरक्षा संकेतों वाले खातों को अंतरराष्ट्रीय एंटी-मनी लॉन्ड्रिंग (AML) नियमों के लिए बुनियादी KYC सत्यापन पूरा करना पड़ सकता है।",
        "tags": [
            "KYC",
            "पहचान सत्यापन",
            "सुरक्षित निकासी"
        ]
    },
    {
        "id": "usdt-1",
        "category": "usdt",
        "question": "Nizalo लेनदेन के लिए USDT स्टेबलकॉइन का उपयोग क्यों करता है?",
        "answer": "USDT अमेरिकी डॉलर के साथ 1:1 आंकी गई स्थिर मुद्रा है, जो आपके बैलेंस को क्रिप्टो के उतार-चढ़ाव से बचाती है और तेज़ व किफायती वैश्विक लेनदेन संभव बनाती है।",
        "tags": [
            "USDT",
            "स्टेबलकॉइन",
            "डॉलर पेग्ड",
            "सुरक्षित क्रिप्टो"
        ]
    },
    {
        "id": "usdt-2",
        "category": "usdt",
        "question": "क्या USDT का उपयोग खेलों को स्थानीय कानूनों से छूट देता है?",
        "answer": "नहीं। USDT केवल एक डिजिटल निपटान माध्यम है। Nizalo कौशल खेल कानूनों का पूरी तरह से पालन करता है और उन क्षेत्रों में नकद प्रतियोगिताओं की अनुमति नहीं देता जहाँ यह प्रतिबंधित है।",
        "tags": [
            "कानूनी नियम",
            "अनुपालन",
            "कौशल प्रतियोगिताएं"
        ]
    },
    {
        "id": "tx-1",
        "category": "tx_confirmation",
        "question": "ट्रांजेक्शन हैश (TxID) क्या है और यह कहाँ मिलता है?",
        "answer": "ट्रांजेक्शन हैश 64 वर्णों का एक अद्वितीय ब्लॉकचेन कोड है जो लेनदेन का आधिकारिक प्रमाण होता है। इसे आप अपने भेजने वाले वॉलेट के विवरण इतिहास से कॉपी कर सकते हैं।",
        "tags": [
            "txid",
            "हैश",
            "लेनदेन प्रमाण",
            "ब्लॉकचेन"
        ]
    },
    {
        "id": "tx-2",
        "category": "tx_confirmation",
        "question": "जमा राशि स्वीकृत होने के लिए कितने नेटवर्क पुष्टिकरण आवश्यक हैं?",
        "answer": "चयनित ब्लॉकचेन नेटवर्क के आधार पर 12 से 64 ब्लॉक पुष्टिकरण की आवश्यकता होती है, जिसमें सामान्यतः 1 से 2 मिनट का समय लगता है।",
        "tags": [
            "ब्लॉक पुष्टि",
            "नेटवर्क समय",
            "सत्यापन"
        ]
    },
    {
        "id": "sec-1",
        "category": "security",
        "question": "Nizalo खिलाड़ियों के खातों और फंड की सुरक्षा कैसे करता है?",
        "answer": "हम 'जीरो-ट्रस्ट' सुरक्षा आर्किटेक्चर, कोल्ड स्टोरेज मल्टी-सिग वॉलेट्स, TLS 1.3 एन्क्रिप्शन और 24/7 डिजिटल फोरेंसिक ऑडिटिंग का उपयोग करते हैं।",
        "tags": [
            "सुरक्षा",
            "जीरो ट्रस्ट",
            "कोल्ड स्टोरेज",
            "एन्क्रिप्शन"
        ]
    },
    {
        "id": "sec-2",
        "category": "security",
        "question": "सुरक्षा चेतावनी: क्या Nizalo कर्मचारी मेरा पासवर्ड या प्राइवेट की मांगेंगे?",
        "answer": "कभी नहीं! Nizalo का कोई भी कर्मचारी आपसे पासवर्ड, रिकवरी फ्रेज़, प्राइवेट की या ओटीपी कभी नहीं मांगेगा। ऐसा करने वाला व्यक्ति धोखेबाज है; कृपया तुरंत रिपोर्ट करें।",
        "tags": [
            "धोखाधड़ी चेतावनी",
            "पासवर्ड सुरक्षा",
            "फ़िशिंग अलर्ट"
        ]
    },
    {
        "id": "fair-1",
        "category": "fair_play",
        "question": "Nizalo का एंटी-चीट सिस्टम AI इंजन (जैसे Stockfish) का पता कैसे लगाता है?",
        "answer": "हमारा फोरेंसिक सिस्टम चालों की सटीकता की तुलना शीर्ष इंजनों से करता है, सोच के समय के अंतर और माउस मूवमेंट्स का विश्लेषण करता है, और अनुचित सहायता लेने वालों पर तत्काल प्रतिबंध लगाता है।",
        "tags": [
            "एंटी चीट",
            "स्टॉकफिश पहचान",
            "निष्पक्ष खेल",
            "प्रतिबंध"
        ]
    },
    {
        "id": "fair-2",
        "category": "fair_play",
        "question": "क्या एकाधिक खाते बनाने या मैच फिक्सिंग की अनुमति है?",
        "answer": "सख्त मनाही है। एक व्यक्ति द्वारा कई खाते बनाना, मैच फिक्सिंग करना या जानबूझकर रेटिंग गिराना (Sandbagging) गंभीर धोखाधड़ी मानी जाती है। पकड़े जाने पर खाते बंद कर फंड जब्त कर लिया जाता है।",
        "tags": [
            "एकाधिक खाते",
            "मैच फिक्सिंग",
            "सैंडबैगिंग",
            "फंड जब्ती"
        ]
    },
    {
        "id": "ref-1",
        "category": "referrals",
        "question": "Nizalo रेफरल कार्यक्रम कैसे काम करता है?",
        "answer": "प्रत्येक पंजीकृत खिलाड़ी को एक स्थायी रेफरल लिंक मिलता है। जब कोई मित्र आपके लिंक से जुड़ता है और $5.00 का पहला जमा पूरा करता है, तो आपको तुरंत $1.00 का इनाम मिलता है।",
        "tags": [
            "रेफरल",
            "इनाम",
            "आमंत्रण बोनस",
            "कमाई"
        ]
    },
    {
        "id": "ref-2",
        "category": "referrals",
        "question": "मेरा रेफरल इनाम क्रेडिट क्यों नहीं हुआ?",
        "answer": "रेफरल रिवार्ड्स की स्वचालित जांच होती है। स्व-रेफरल, समान डिवाइस, डुप्लिकेट आईपी, या मित्र द्वारा जमा पूरा न करने पर इनाम रद्द कर दिया जाता है।",
        "tags": [
            "रेफरल समस्या",
            "धोखाधड़ी रोकथाम",
            "शर्तें"
        ]
    },
    {
        "id": "chat-1",
        "category": "chat",
        "question": "इन-गेम चैट के नियम और दिशानिर्देश क्या हैं?",
        "answer": "हम एक सम्मानजनक और खेल भावना से युक्त वातावरण बनाए रखते हैं। गाली-गलौज, नफरत भरे भाषण, स्पैमिंग या प्रतिद्वंद्वी को विचलित करने पर चैट म्यूट या प्रतिबंध लगाया जाता है।",
        "tags": [
            "चैट नियम",
            "सम्मान",
            "खेल भावना",
            "म्यूट"
        ]
    },
    {
        "id": "chat-2",
        "category": "chat",
        "question": "चैट में किसी दुर्व्यवहार करने वाले खिलाड़ी की रिपोर्ट कैसे करें?",
        "answer": "चैट में खिलाड़ी के नाम पर क्लिक करके 'रिपोर्ट यूजर' चुनें, या मैच आईडी के साथ सपोर्ट टिकट दर्ज करें।",
        "tags": [
            "रिपोर्ट",
            "खिलाड़ी ब्लॉक",
            "शिकायत",
            "सपोर्ट"
        ]
    },
    {
        "id": "tech-1",
        "category": "technical_issues",
        "question": "लाइव मैच के दौरान इंटरनेट कट जाए तो क्या होगा?",
        "answer": "सर्वर मैच की स्थिति सुरक्षित रखता है। यदि इंटरनेट कट जाए, तो आपको पुनः कनेक्ट होने के लिए 60 सेकंड की छूट अवधि मिलती है। पेज रिफ्रेश करने पर आप सीधे खेल में लौट सकते हैं।",
        "tags": [
            "इंटरनेट डिस्कनेक्ट",
            "पुनः कनेक्ट",
            "60 सेकंड छूट",
            "मैच बहाली"
        ]
    },
    {
        "id": "tech-2",
        "category": "technical_issues",
        "question": "गेम की घड़ियाँ कैसे काम करती हैं? क्या स्थानीय स्तर पर समय में हेरफेर संभव है?",
        "answer": "सभी घड़ियाँ सीधे Nizalo के केंद्रीय सर्वर द्वारा संचालित होती हैं। खिलाड़ी के फोन या कंप्यूटर की स्थानीय घड़ी से समय में कोई छेड़छाड़ संभव नहीं है।",
        "tags": [
            "सर्वर घड़ी",
            "सटीक समय",
            "छेड़छाड़ रोकथाम"
        ]
    },
    {
        "id": "tech-3",
        "category": "technical_issues",
        "question": "Nizalo पर खेलने के लिए अनुशंसित ब्राउज़र और आवश्यकताएं क्या हैं?",
        "answer": "Nizalo डेस्कटॉप, टैबलेट और स्मार्टफोन पर Google Chrome, Safari, Edge और Firefox में सुचारू रूप से चलता है। WebGL हार्डवेयर त्वरण सक्षम होने पर बेहतरीन अनुभव मिलता है।",
        "tags": [
            "ब्राउज़र",
            "वेबजीएल",
            "मोबाइल और पीसी",
            "सुचारू प्रदर्शन"
        ]
    }
]
};

export function getFaqsForLocale(locale: string): FAQItem[] {
  if (FAQ_DATA[locale] && Array.isArray(FAQ_DATA[locale])) return FAQ_DATA[locale];
  return Array.isArray(FAQ_DATA.en) ? FAQ_DATA.en : [];
}
