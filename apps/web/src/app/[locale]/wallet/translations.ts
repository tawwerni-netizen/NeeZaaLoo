import type { SupportedLocale } from "@/lib/i18n/locale";

export interface WalletDictionary {
  heading: string;
  subhead: string;
  peggedRate: string;
  instantPayoutBadge: string;
  totalBalanceLabel: string;
  availableLabel: string;
  availableSub: string;
  lockedLabel: string;
  lockedSub: string;
  withdrawableLabel: string;
  withdrawableSub: string;

  // AML Meter
  amlTitleReady: string;
  amlTitlePending: string;
  amlDescReady: string;
  amlDescPending: string;
  playNowCta: string;
  amlPlayed: string;
  amlRemaining: string;

  // Hub Tabs
  tabDeposit: string;
  tabWithdraw: string;
  tabHistory: string;

  // Steps
  step1Title: string;
  step2Title: string;
  step3Title: string;

  // Stablecoin Selection
  coinSelectorTitle: string;
  coinSelectorSubtitle: string;
  coinUsdtName: string;
  coinUsdtBadge: string;
  coinUsdtDesc: string;
  coinUsdcName: string;
  coinUsdcBadge: string;
  coinUsdcDesc: string;
  coinDaiName: string;
  coinDaiBadge: string;
  coinDaiDesc: string;

  // Deposit Presets
  presetsTitle: string;
  presetStarter: string;
  presetQuick: string;
  presetPopular: string;
  presetTournaments: string;
  presetElite: string;
  presetMaster: string;
  presetArena: string;
  presetVip: string;
  presetWhaleSilver: string;
  presetWhaleGold: string;

  badgeStarter: string;
  badgePopular: string;
  badgeElite: string;
  badgeVip: string;
  badgeWhale: string;

  // Custom Amount
  customAmountLabel: string;
  customAmountPlaceholder: string;
  customAmountMinHint: string;
  customSelectedPreview: string;

  // Benefits
  benefitFee: string;
  benefitInstant: string;
  benefitOxaPay: string;

  // Network Selection Cards
  networkTitle: string;
  trc20Name: string;
  trc20Chain: string;
  trc20Badge: string;
  trc20Speed: string;
  trc20Fee: string;

  bep20Name: string;
  bep20Chain: string;
  bep20Badge: string;
  bep20Speed: string;
  bep20Fee: string;

  erc20Name: string;
  erc20Chain: string;
  erc20Badge: string;
  erc20Speed: string;
  erc20Fee: string;

  networkSelected: string;

  // Neuro-Design Psychological Engine & Winning Power
  powerTitle: string;
  powerSubtitle: string;
  powerDuelsTag: string;
  powerDuelsDesc: (duels: number) => string;
  powerMultiplierTag: string;
  powerMultiplierDesc: (winEstimate: string) => string;
  powerTournamentTag: string;
  powerTournamentDesc: (amt: number) => string;
  powerZeroFeeTag: string;
  powerZeroFeeDesc: string;
  powerSocialProof: string;
  championsChoiceBadge: string;
  instantParityNote: string;

  // QR & Address Card
  permanentWalletBadge: string;
  qrReady: string;
  qrGenerating: string;
  connectingOxaPay: string;
  copy: string;
  copied: string;
  sendWarningTitle: string;
  sendWarningBody: (net: string) => string;
  safeDepositTitle: string;
  safeDepositBody: (net: string) => string;
  sendWarningBodyDynamic: (asset: string, net: string) => string;
  safeDepositBodyDynamic: (asset: string, net: string) => string;

  // Deposit Confirmation & Payment Slip Terminal
  confirmDepositBtn: (amount: string, asset: string) => string;
  confirmDepositSubtitle: string;
  confirmedDepositTitle: string;
  confirmedDepositSubtitle: string;
  confirmedDepositOrderLabel: string;
  confirmedDepositAmountLabel: string;
  confirmedDepositNetworkLabel: string;
  confirmedDepositFeeLabel: string;
  confirmedDepositSpeedLabel: string;
  editDepositSelection: string;
  iHaveTransferredBtn: string;
  depositStatusChecked: string;
  depositAwaitingConfirmPrompt: string;
  depositAwaitingConfirmBtn: string;

  // Withdrawal Section
  withdrawEligibleLabel: string;
  totalBalancePrefix: string;
  withdrawCoinSelectorTitle: string;
  withdrawCoinSelectorSubtitle: string;
  selectRecipientNetwork: string;
  withdrawFeeTrc: string;
  withdrawFeeBep: string;
  withdrawFeeErc: string;
  withdrawMinAlert: (amount: string) => string;
  recipientAddressLabel: (net: string) => string;
  recipientAddressLabelDynamic: (asset: string, net: string) => string;
  invalidAddressAlert: (net: string) => string;
  withdrawAmountLabel: string;
  maxAvailable: string;
  minWithdrawPlaceholder: string;
  amountExceedsError: (req: string, max: string) => string;

  summaryRequested: string;
  summaryPlatformFee: string;
  summaryFree: string;
  summaryNetworkFee: string;
  summaryNetReceive: string;
  submitWithdrawBtn: string;
  submittingWithdraw: string;

  // History
  historyTitle: string;
  historyEmpty: string;
  thType: string;
  thNetwork: string;
  thAmount: string;
  thAddress: string;
  thStatus: string;
  thDate: string;
  txDeposit: string;
  txWithdraw: string;
  statusConfirmed: string;
  statusPending: string;
  timeRecently: string;
  txNoticeSuccess: string;
}

export const WALLET_TRANSLATIONS: Record<SupportedLocale, WalletDictionary> = {
  ar: {
    heading: "المحفظة المالية",
    subhead: "أرصدتك الحقيقية ومطابقة العمليات مباشرة مع دفتر الأستاذ البنكي المشفر.",
    peggedRate: "1:1 تعادل مع الدولار الأمريكي",
    instantPayoutBadge: "سحوبات مؤتمتة فورية 24/7",
    totalBalanceLabel: "إجمالي الرصيد الفعلي (USD)",
    availableLabel: "المتاح للمنافسات والنزال",
    availableSub: "جاهز لخوض المباريات فوراً",
    lockedLabel: "في النزالات الجارية",
    lockedSub: "محجوز في مباريات جارية",
    withdrawableLabel: "القابل للسحب الفوري",
    withdrawableSub: "أرباح ورؤوس أموال مؤهلة",

    amlTitleReady: "أنت مؤهل لسحب كامل رصيدك فوراً! 🎉",
    amlTitlePending: "تدوير الإيداعات وإلغاء قفل السحب (مكافحة غسيل الأموال)",
    amlDescReady: "أكملت متطلبات اللعب بنجاح. كافة أرباحك وإيداعاتك متاحة للسحب إلى محفظتك الخارجية دون أي قيود.",
    amlDescPending: "حسب لوائح النزاهة والامتثال المالي، يتطلب سحب الإيداعات استخدامها في خوض المباريات لمرة واحدة لمنع استغلال المنصة. المبلغ المتبقي لفتح السحب:",
    playNowCta: "خوض نزال الآن ⚔️",
    amlPlayed: "تم لعبه:",
    amlRemaining: "المتبقي لفتح القفل:",

    tabDeposit: "إيداع فوري (USDT · USDC · DAI)",
    tabWithdraw: "سحب الأرباح",
    tabHistory: "سجل العمليات المحاسبية",

    step1Title: "1. العملة المستقرة وشبكة التحويل",
    step2Title: "2. باقة الإيداع وقوة الفوز التنافسية",
    step3Title: "3. إتمام التحويل عبر العنوان المخصص",

    coinSelectorTitle: "اختر العملة المستقرة المفضلة للإيداع:",
    coinSelectorSubtitle: "جميع العملات متطابقة بنسبة 1:1 مع الدولار الأمريكي ($1.00 USD) بدون أي فروقات سعرية",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "الأعلى سيولة · الأكثر استخداماً 🔥",
    coinUsdtDesc: "العملة المستقرة الأولى عالمياً، فائقة السرعة ومقبولة في جميع المحافظ.",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "أمان مصرفي · مدعوم 100% (Circle) 🛡️",
    coinUsdcDesc: "العملة المؤسسية الأكثر تنظيماً وشفافية في العالم مع تدقيق مالي شهري.",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "لامركزي 100% · بروتوكول MakerDAO ⚡",
    coinDaiDesc: "دولار رقمي لا مركزي مدعوم بعقود ذكية وضمانات مشفرة على البلوكتشين.",

    presetsTitle: "اختر باقة إيداع سريعة للبدء أو حدد مبلغاً مخصصاً:",
    presetStarter: "تجربة سريعة ⚡",
    presetQuick: "نزال سريع ⚔️",
    presetPopular: "الأكثر اختياراً 🔥",
    presetTournaments: "منافس البطولات 🏆",
    presetElite: "بطل النخبة 💎",
    presetMaster: "محترف النزال 🌟",
    presetArena: "فارس الحلبة 🛡️",
    presetVip: "الأسطورة 👑",
    presetWhaleSilver: "الحوت الفضي 🦈",
    presetWhaleGold: "الحوت الذهبي 🐋",

    badgeStarter: "بداية",
    badgePopular: "شائع",
    badgeElite: "نخبة",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "أو اكتب مبلغاً مخصصاً ترغب في إيداعه ($):",
    customAmountPlaceholder: "أدخل أي مبلغ مخصص (مثال: 75)...",
    customAmountMinHint: "الحد الأدنى للإيداع هو 5.00$.",
    customSelectedPreview: "المبلغ المحدد للإيداع: {amount}$",

    benefitFee: "عمولة إيداع 0% (لا نخصم أي فلس)",
    benefitInstant: "قيد فوري بعد تأكيد 1 على البلوكتشين",
    benefitOxaPay: "بوابة OxaPay مشفرة ومؤمنة 100%",

    networkTitle: "اختر شبكة التحويل المفضلة لديك:",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "موصى به · الأسرع",
    trc20Speed: "تأكيد فوري (~1 دقيقة)",
    trc20Fee: "عمولة إيداع: 0.00$",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "رسوم شبكة منخفضة جداً",
    bep20Speed: "تأكيد قياسي (~15 ثانية)",
    bep20Fee: "عمولة إيداع: 0.00$",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "الشبكة الأم الأصلية 💎",
    erc20Speed: "أمان فائق (~2-3 دقائق)",
    erc20Fee: "عمولة إيداع: 0.00$",

    networkSelected: "✓ تم الاختيار",

    powerTitle: "قوة الفوز ومضاعفة الأرباح لهذا الرصيد 🚀",
    powerSubtitle: "شحن رصيدك يمنحك أفضلية تنافسية فورية في الحلبة",
    powerDuelsTag: "فرص النزال والتحدي",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "يموّل نزالاً حماسياً مباشراً (1v1) لمضاعفة رصيدك فور الفوز!"
        : `يموّل حتى ${duels} نزالات حماسية (1v1 Duels) متتالية للتألق وصنع الأرباح!`,
    powerMultiplierTag: "العائد التنافسي المتوقع",
    powerMultiplierDesc: (winEstimate: string) =>
      `فوزك في النزالات يرفع هذا الرصيد إلى ما يقارب $${winEstimate} أرباحاً نقدية قابلة للسحب!`,
    powerTournamentTag: "جوائز البطولات الكبرى",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "تأهل فوري للمنافسة في بطولات الجوائز الكبرى (مجموع جوائز يتجاوز $500+)!"
        : "يؤهلك للمشاركة في بطولات التحدي اليومية مع نخبة اللاعبين!",
    powerZeroFeeTag: "ضمان 100% من رصيدك في اللعب",
    powerZeroFeeDesc: "عمولة المنصة 0% — كامل المبلغ يذهب لحسابك للعب فوراً.",
    powerSocialProof: "⚡ 94.8% من اللاعبين الفائزين يفضلون شحن 25$ أو أكثر لتعظيم فرصهم في التتويج.",
    championsChoiceBadge: "خيار الأبطال الأكثر فوزاً 🌟",
    instantParityNote: "تعادل 1:1 دائم: 1 USDT = 1 USDC = 1 DAI = $1.00 USD في جميع الألعاب",

    permanentWalletBadge: "عنوان محفظة ثابت ودائم مخصص لحسابك (لا تنتهي صلاحيته)",
    qrReady: "جاهز للتحويل",
    qrGenerating: "جاري توليد العنوان...",
    connectingOxaPay: "جاري الاتصال ببوابة OxaPay...",
    copy: "نسخ",
    copied: "تم النسخ!",
    sendWarningTitle: "تنبيه مهم قبل التحويل",
    sendWarningBody: (net: string) =>
      `أرسل العملة المحددة فقط، وعبر شبكة ${net} وحدها. إرسال أي عملة أخرى، أو استخدام شبكة مختلفة، يعني فقدان المبلغ نهائياً — ولا يمكن استرجاعه.`,
    safeDepositTitle: "إرشادات الإيداع الآمن:",
    safeDepositBody: (net: string) =>
      `هذا العنوان مخصص لحسابك وثابت لا يتغير. يمكنك التحويل إليه في أي وقت من أي محفظة أو منصة عبر شبكة (${net}). الحد الأدنى للإيداع هو 5.00$. سيتم قيد الرصيد تلقائياً في حسابك فور تأكيد المعاملة في دفتر البلوكتشين.`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `أرسل عملة ${asset} فقط، وعبر شبكة ${net} وحدها. إرسال أي عملة أخرى أو عبر شبكة مختلفة سيؤدي إلى فقدان أموالك نهائياً دون إمكانية استردادها.`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `هذا العنوان مخصص ومحمي بنظام التشفير لحسابك. يمكنك التحويل إليه بأمان من أي محفظة أو منصة عالمية (Binance, Bybit, TrustWallet, OKX, MetaMask) بعملة ${asset} وشبكة (${net}). الحد الأدنى للإيداع هو 5.00$. يتم قيد الرصيد فور تأكيد المعاملة في البلوكتشين.`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ تأكيد ومتابعة إيداع $${amount} (${asset})`,
    confirmDepositSubtitle:
      "انقر لإصدار فاتورة التحويل الآمن المعتمدة وعنوان المحفظة المخصص",
    confirmedDepositTitle: "فاتورة الإيداع المؤكدة (جاهزة للتحويل)",
    confirmedDepositSubtitle:
      "تم تجهيز عنوان المحفظة المخصص لمطابقة إيداعك فورياً وبأمان في دفتر الأستاذ المشفر",
    confirmedDepositOrderLabel: "أمر إيداع رقمي معتمد",
    confirmedDepositAmountLabel: "المبلغ المحدد للإيداع:",
    confirmedDepositNetworkLabel: "الشبكة المعتمدة للتحويل:",
    confirmedDepositFeeLabel: "رسوم الإيداع للمنصة:",
    confirmedDepositSpeedLabel: "زمن المعالجة المتوقع:",
    editDepositSelection: "تعديل المبلغ أو الشبكة",
    iHaveTransferredBtn: "لقد قمت بالتحويل — فحص وتحديث الرصيد الآن",
    depositStatusChecked: "جاري فحص وتأكيد المعاملة عبر البلوكتشين...",
    depositAwaitingConfirmPrompt:
      "اختر العملة والشبكة والمبلغ أعلاه، ثم اضغط على زر تأكيد الإيداع لإصدار فاتورة الدفع والباركود المخصص.",
    depositAwaitingConfirmBtn: "تأكيد ومتابعة الإيداع الآن",

    withdrawEligibleLabel: "الرصيد المؤهل للسحب الفوري حالياً:",
    totalBalancePrefix: "من إجمالي رصيد",
    withdrawCoinSelectorTitle: "اختر عملة استلام الأرباح:",
    withdrawCoinSelectorSubtitle: "يمكنك سحب أرباحك بأي من العملات المستقرة الثلاث (USDT · USDC · DAI) بتعادل 1:1 مع الدولار الأمريكي",
    selectRecipientNetwork: "اختر شبكة استلام السحب:",
    withdrawFeeTrc: "رسوم شبكة السحب: 1.00$",
    withdrawFeeBep: "رسوم شبكة السحب: 0.25$",
    withdrawFeeErc: "رسوم شبكة السحب: 3.50$",
    withdrawMinAlert: (amount: string) =>
      `رصيدك القابل للسحب حالياً هو $${amount} USD. الحد الأدنى لإتمام السحب هو 10.00$. يمكنك مضاعفة رصيدك وخوض المباريات لرفع أرباحك وتجاوز الحد الأدنى فوراً!`,
    recipientAddressLabel: (net: string) =>
      `عنوان محفظة استلام الأرباح (${net}):`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `عنوان محفظة استلام الأرباح (${asset} - ${net}):`,
    invalidAddressAlert: (net: string) =>
      `يرجى إدخال عنوان صالح لشبكة ${net} يبدأ بالشكل الصحيح.`,
    withdrawAmountLabel: "المبلغ المراد سحبه ($):",
    maxAvailable: "الحد الأقصى المتاح",
    minWithdrawPlaceholder: "الحد الأدنى 10.00$...",
    amountExceedsError: (req: string, max: string) =>
      `المبلغ المطلوب ($${req}) يتجاوز رصيدك المؤهل للسحب حالياً ($${max}). تنص سياسات الامتثال على تدوير الإيداعات في المباريات قبل سحبها.`,

    summaryRequested: "المبلغ المطلوب سحبه:",
    summaryPlatformFee: "رسوم المنصة:",
    summaryFree: "0.00$ (مجاناً)",
    summaryNetworkFee: "رسوم معالجة الشبكة:",
    summaryNetReceive: "الصافي الذي سيصل لمحفظتك:",
    submitWithdrawBtn: "تأكيد وتنفيذ السحب الفوري",
    submittingWithdraw: "جاري تأكيد المعاملة والتوقيع المشفر...",

    historyTitle: "سجل العمليات والتحويلات المالية",
    historyEmpty: "لا توجد معاملات مسجلة بعد في هذا الحساب.",
    thType: "نوع العملية",
    thNetwork: "الشبكة / الأصل",
    thAmount: "المبلغ",
    thAddress: "العنوان / المرجع",
    thStatus: "الحالة",
    thDate: "التاريخ",
    txDeposit: "إيداع رصيد",
    txWithdraw: "سحب أرباح",
    statusConfirmed: "مكتملة ومؤكدة",
    statusPending: "قيد المعالجة",
    timeRecently: "مؤخراً",
    txNoticeSuccess: "تم تقديم طلب السحب بنجاح وهو قيد التوقيع الآلي.",
  },

  en: {
    heading: "Financial Wallet",
    subhead: "Real balances and live cryptographic ledger accounting.",
    peggedRate: "1:1 USD Parity Guarantee",
    instantPayoutBadge: "Instant 24/7 Automated Payouts",
    totalBalanceLabel: "Total Real Balance (USD)",
    availableLabel: "Available for Duels",
    availableSub: "Ready for matches immediately",
    lockedLabel: "In Active Matches",
    lockedSub: "Reserved in ongoing games",
    withdrawableLabel: "Eligible for Withdrawal",
    withdrawableSub: "Unlocked winnings & funds",

    amlTitleReady: "You are eligible to withdraw your entire balance! 🎉",
    amlTitlePending: "Deposit Playthrough & Withdrawal Unlock (AML Compliance)",
    amlDescReady: "You have satisfied all fair-play playthrough requirements. All deposited funds and winnings are fully unlocked with zero restrictions.",
    amlDescPending: "Per Anti-Money Laundering regulations, deposited funds must be contested once in competitive duels before withdrawal to prevent financial abuse. Remaining playthrough:",
    playNowCta: "Play a Duel Now ⚔️",
    amlPlayed: "Played:",
    amlRemaining: "Remaining to unlock:",

    tabDeposit: "Instant Deposit (USDT · USDC · DAI)",
    tabWithdraw: "Withdraw Funds",
    tabHistory: "Ledger Audit History",

    step1Title: "1. Select Stablecoin & Network",
    step2Title: "2. Deposit Tier & Winning Power",
    step3Title: "3. Complete Transfer via Dedicated Address",

    coinSelectorTitle: "Select Your Preferred Stablecoin:",
    coinSelectorSubtitle: "All stablecoins pegged 1:1 with USD ($1.00 USD) with zero price fluctuation",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "Highest Liquidity · Most Popular 🔥",
    coinUsdtDesc: "World's #1 stablecoin, lightning fast and accepted across all exchanges and wallets.",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "Bank-Grade Security · Regulated (Circle) 🛡️",
    coinUsdcDesc: "Most regulated and transparent stablecoin worldwide with full monthly public reserve audits.",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "100% Decentralized · MakerDAO ⚡",
    coinDaiDesc: "Decentralized, crypto-collateralized algorithmic USD backed by transparent smart contracts.",

    presetsTitle: "Choose a quick starter pack or type a custom amount:",
    presetStarter: "Fast Test ⚡",
    presetQuick: "Quick Duel ⚔️",
    presetPopular: "Most Popular 🔥",
    presetTournaments: "Tournament Contender 🏆",
    presetElite: "Elite Champion 💎",
    presetMaster: "Pro Competitor 🌟",
    presetArena: "Arena Knight 🛡️",
    presetVip: "Legend 👑",
    presetWhaleSilver: "Silver Whale 🦈",
    presetWhaleGold: "Golden Whale 🐋",

    badgeStarter: "STARTER",
    badgePopular: "POPULAR",
    badgeElite: "ELITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "Or enter a custom amount you wish to deposit ($):",
    customAmountPlaceholder: "Enter any amount (e.g. 75)...",
    customAmountMinHint: "Minimum deposit is $5.00.",
    customSelectedPreview: "Selected deposit amount: ${amount}",

    benefitFee: "0% Deposit Fee (We never take a cut)",
    benefitInstant: "Instant credit upon 1 blockchain confirmation",
    benefitOxaPay: "100% Encrypted & Secure OxaPay Gateway",

    networkTitle: "Choose your preferred transfer network:",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "Recommended · Fastest",
    trc20Speed: "Instant Finality (~1 min)",
    trc20Fee: "Deposit Fee: $0.00",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Ultra-Low Gas",
    bep20Speed: "Standard (~15 seconds)",
    bep20Fee: "Deposit Fee: $0.00",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "Native L1 Security 💎",
    erc20Speed: "Maximum Finality (~2-3 mins)",
    erc20Fee: "Deposit Fee: $0.00",

    networkSelected: "✓ Selected",

    powerTitle: "Winning Power & Match Multiplier 🚀",
    powerSubtitle: "Fuel your wallet to unlock maximum competitive advantage in duels",
    powerDuelsTag: "Duel Opportunities",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "Funds 1 high-stakes 1v1 duel to double your money upon victory!"
        : `Powers up to ${duels} competitive 1v1 duels in a row to rack up cash victories!`,
    powerMultiplierTag: "Potential Cashout Multiplier",
    powerMultiplierDesc: (winEstimate: string) =>
      `Winning your matches elevates this balance up to ~$${winEstimate} in instantly withdrawable cash!`,
    powerTournamentTag: "Tournament Prize Pool Entry",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "Direct access to high-roller tournament brackets with prize pools exceeding $500+!"
        : "Eligible for daily cash brackets and fast ladder tournaments!",
    powerZeroFeeTag: "100% Game Value Guarantee",
    powerZeroFeeDesc: "0% platform deposit fee — every single cent is credited directly to your playable balance.",
    powerSocialProof: "⚡ 94.8% of top leaderboard winners deposit $25 or more to maximize duel flexibility.",
    championsChoiceBadge: "Champions' Choice 🌟",
    instantParityNote: "Strict 1:1 USD Parity: 1 USDT = 1 USDC = 1 DAI = $1.00 USD across all competitions",

    permanentWalletBadge: "Dedicated Permanent Address for your account (Never expires)",
    qrReady: "Ready for Transfer",
    qrGenerating: "Generating address...",
    connectingOxaPay: "Connecting to OxaPay gateway...",
    copy: "Copy",
    copied: "Copied!",
    sendWarningTitle: "Important Safety Warning",
    sendWarningBody: (net: string) =>
      `Send only the selected coin over the ${net} network. Transferring any other token or using a different chain will result in permanent, unrecoverable loss of funds.`,
    safeDepositTitle: "Safe Deposit Instructions:",
    safeDepositBody: (net: string) =>
      `This address is dedicated to your account. Send funds from any exchange or wallet via (${net}). Minimum deposit is $5.00. Balance is credited automatically upon confirmation.`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `Send only ${asset} over the ${net} network. Transferring any other token or using a different chain will result in permanent, unrecoverable loss of funds.`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `This address is dedicated and cryptographically bound to your account. Send ${asset} from any exchange or wallet (Binance, Bybit, TrustWallet, OKX, MetaMask) via (${net}). Minimum deposit is $5.00. Your balance credits automatically upon blockchain confirmation.`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ Confirm & Proceed to Deposit $${amount} (${asset})`,
    confirmDepositSubtitle:
      "Click to generate your verified payment slip and dedicated blockchain address",
    confirmedDepositTitle: "Confirmed Deposit Voucher (Ready to Transfer)",
    confirmedDepositSubtitle:
      "Your dedicated address is locked and monitored for instant ledger crediting",
    confirmedDepositOrderLabel: "Digital Deposit Order",
    confirmedDepositAmountLabel: "Selected Amount:",
    confirmedDepositNetworkLabel: "Selected Network:",
    confirmedDepositFeeLabel: "Platform Deposit Fee:",
    confirmedDepositSpeedLabel: "Estimated Speed:",
    editDepositSelection: "Edit Amount or Network",
    iHaveTransferredBtn: "I Have Transferred — Verify & Sync Balance Now",
    depositStatusChecked:
      "Scanning blockchain ledger for matching incoming transfer...",
    depositAwaitingConfirmPrompt:
      "Select your asset, network, and amount above, then click Confirm Deposit to generate your payment voucher and QR code.",
    depositAwaitingConfirmBtn: "Confirm & Proceed Now",

    withdrawEligibleLabel: "Balance Eligible for Instant Withdrawal:",
    totalBalancePrefix: "out of total balance of",
    withdrawCoinSelectorTitle: "Select Payout Currency:",
    withdrawCoinSelectorSubtitle: "Withdraw your cash earnings in your preferred USD stablecoin (USDT · USDC · DAI) at 1:1 USD parity",
    selectRecipientNetwork: "Select payout destination network:",
    withdrawFeeTrc: "Withdrawal Gas: $1.00",
    withdrawFeeBep: "Withdrawal Gas: $0.25",
    withdrawFeeErc: "Withdrawal Gas: $3.50",
    withdrawMinAlert: (amount: string) =>
      `Your withdrawable balance is currently $${amount} USD. Minimum withdrawal amount is $10.00. Play matches and duel to grow your earnings and withdraw anytime!`,
    recipientAddressLabel: (net: string) =>
      `Your payout wallet address (${net}):`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `Payout destination wallet (${asset} - ${net}):`,
    invalidAddressAlert: (net: string) =>
      `Please provide a valid ${net} address format.`,
    withdrawAmountLabel: "Amount to Withdraw ($):",
    maxAvailable: "Max Available",
    minWithdrawPlaceholder: "Minimum $10.00...",
    amountExceedsError: (req: string, max: string) =>
      `Requested amount ($${req}) exceeds your withdrawable balance ($${max}). AML compliance requires funds to be played once before payout.`,

    summaryRequested: "Requested Amount:",
    summaryPlatformFee: "Platform Processing Fee:",
    summaryFree: "$0.00 (FREE)",
    summaryNetworkFee: "Blockchain Network Gas:",
    summaryNetReceive: "Net Amount You Will Receive:",
    submitWithdrawBtn: "Confirm & Request Instant Withdrawal",
    submittingWithdraw: "Signing & broadcasting transaction...",

    historyTitle: "Transaction & Accounting History",
    historyEmpty: "No financial transactions recorded yet.",
    thType: "Type",
    thNetwork: "Asset / Network",
    thAmount: "Amount",
    thAddress: "Address / Hash",
    thStatus: "Status",
    thDate: "Date",
    txDeposit: "Deposit",
    txWithdraw: "Withdrawal",
    statusConfirmed: "Confirmed",
    statusPending: "Processing",
    timeRecently: "Recently",
    txNoticeSuccess: "Withdrawal submitted successfully and is queued for automated signature.",
  },

  es: {
    heading: "Billetera Financiera",
    subhead: "Saldos reales y contabilidad en cadena criptográfica en vivo.",
    peggedRate: "Garantía de Paridad 1:1 con USD",
    instantPayoutBadge: "Retiros automatizados instantáneos 24/7",
    totalBalanceLabel: "Saldo Total Real (USD)",
    availableLabel: "Disponible para Duelos",
    availableSub: "Listo para partidas de inmediato",
    lockedLabel: "En Duelos Activos",
    lockedSub: "Reservado en partidas en curso",
    withdrawableLabel: "Elegible para Retiro",
    withdrawableSub: "Ganancias y fondos desbloqueados",

    amlTitleReady: "¡Eres elegible para retirar todo tu saldo! 🎉",
    amlTitlePending: "Rotación de Depósitos y Desbloqueo (AML)",
    amlDescReady: "Has completado el requisito de juego limpio. Todos tus fondos están desbloqueados y listos para retirar sin restricciones.",
    amlDescPending: "Según las regulaciones contra el lavado de dinero (AML), los fondos depositados deben jugarse en duelos competitivos al menos una vez. Monto restante para desbloquear:",
    playNowCta: "Jugar un Duelo Ahora ⚔️",
    amlPlayed: "Jugado:",
    amlRemaining: "Restante para desbloquear:",

    tabDeposit: "Depósito Instantáneo (USDT · USDC · DAI)",
    tabWithdraw: "Retirar Fondos",
    tabHistory: "Historial Contable",

    step1Title: "1. Selección de Moneda y Red",
    step2Title: "2. Monto y Poder de Victoria",
    step3Title: "3. Transferencia a Dirección Dedicada",

    coinSelectorTitle: "Selecciona tu Stablecoin Preferida:",
    coinSelectorSubtitle: "Todas las monedas están vinculadas 1:1 con USD ($1.00 USD) sin variaciones de precio",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "Mayor Liquidez · Más Popular 🔥",
    coinUsdtDesc: "La stablecoin #1 mundial, ultrarrápida y aceptada en todas las billeteras y exchanges.",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "Seguridad Bancaria · Regulado (Circle) 🛡️",
    coinUsdcDesc: "La stablecoin institucional más transparente y regulada del mundo con auditorías mensuales.",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "100% Descentralizado · MakerDAO ⚡",
    coinDaiDesc: "Dólar cripto descentralizado respaldado por contratos inteligentes verificables.",

    presetsTitle: "Elige un paquete rápido o escribe una cantidad personalizada:",
    presetStarter: "Prueba Rápida ⚡",
    presetQuick: "Duelo Veloz ⚔️",
    presetPopular: "Más Popular 🔥",
    presetTournaments: "Competidor de Torneo 🏆",
    presetElite: "Campeón Élite 💎",
    presetMaster: "Pro Master 🌟",
    presetArena: "Caballero de Arena 🛡️",
    presetVip: "Leyenda 👑",
    presetWhaleSilver: "Ballena Plateada 🦈",
    presetWhaleGold: "Ballena Dorada 🐋",

    badgeStarter: "INICIO",
    badgePopular: "POPULAR",
    badgeElite: "ÉLITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "O escribe un monto personalizado a depositar ($):",
    customAmountPlaceholder: "Ingresa cualquier monto (ej. 75)...",
    customAmountMinHint: "El depósito mínimo es $5.00.",
    customSelectedPreview: "Monto seleccionado para depositar: ${amount}",

    benefitFee: "0% comisión de depósito (nunca descontamos nada)",
    benefitInstant: "Acreditación instantánea tras 1 confirmación",
    benefitOxaPay: "Pasarela OxaPay 100% segura y encriptada",

    networkTitle: "Elige tu red de transferencia preferida:",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "Recomendado · Más Rápido",
    trc20Speed: "Finalidad Instantánea (~1 min)",
    trc20Fee: "Tarifa de Depósito: $0.00",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Tarifa ultra baja",
    bep20Speed: "Estándar (~15 segundos)",
    bep20Fee: "Tarifa de Depósito: $0.00",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "Red Nativa L1 💎",
    erc20Speed: "Máxima Seguridad (~2-3 min)",
    erc20Fee: "Tarifa de Depósito: $0.00",

    networkSelected: "✓ Seleccionado",

    powerTitle: "Poder de Victoria y Multiplicador de Partidas 🚀",
    powerSubtitle: "Recarga tu billetera para desbloquear ventaja competitiva instantánea",
    powerDuelsTag: "Oportunidades de Duelo",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "¡Financia 1 duelo 1v1 para duplicar tu dinero con la victoria!"
        : `¡Financia hasta ${duels} duelos 1v1 consecutivos para acumular victorias en efectivo!`,
    powerMultiplierTag: "Multiplicador de Ganancias",
    powerMultiplierDesc: (winEstimate: string) =>
      `¡Ganar tus partidas puede elevar este saldo hasta ~$${winEstimate} en ganancias retirables!`,
    powerTournamentTag: "Premios de Torneo",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "¡Acceso directo a torneos de élite con premios acumulados superiores a $500+!"
        : "¡Elegible para copas y torneos diarios con los mejores jugadores!",
    powerZeroFeeTag: "Garantía de Valor al 100%",
    powerZeroFeeDesc: "0% comisión de depósito — cada centavo va directo a tu saldo para jugar.",
    powerSocialProof: "⚡ El 94.8% de los campeones recargan $25 o más para maximizar sus oportunidades.",
    championsChoiceBadge: "Elección de Campeones 🌟",
    instantParityNote: "Paridad estricta 1:1: 1 USDT = 1 USDC = 1 DAI = $1.00 USD en todos los juegos",

    permanentWalletBadge: "Billetera dedicada y permanente (no expira nunca)",
    qrReady: "Listo para transferir",
    qrGenerating: "Generando dirección...",
    connectingOxaPay: "Conectando con OxaPay...",
    copy: "Copiar",
    copied: "¡Copiado!",
    sendWarningTitle: "Aviso de Seguridad Importante",
    sendWarningBody: (net: string) =>
      `Envía únicamente la moneda seleccionada a través de la red ${net}. Enviar otra moneda o usar otra red provocará la pérdida permanente de fondos.`,
    safeDepositTitle: "Instrucciones de Depósito Seguro:",
    safeDepositBody: (net: string) =>
      `Esta dirección está dedicada a tu cuenta. Transfiere fondos desde cualquier exchange o billetera vía (${net}). Depósito mínimo de $5.00.`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `Envía únicamente ${asset} a través de la red ${net}. Enviar otra moneda o usar otra red provocará la pérdida permanente e irreversible de los fondos.`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `Esta dirección está dedicada a tu cuenta. Transfiere ${asset} desde cualquier exchange o billetera (Binance, Bybit, TrustWallet, OKX, MetaMask) vía (${net}). El depósito mínimo es $5.00. El saldo se acredita automáticamente al confirmarse en blockchain.`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ Confirmar y Proceder al Depósito de $${amount} (${asset})`,
    confirmDepositSubtitle:
      "Haz clic para generar tu comprobante de pago seguro y dirección de billetera dedicada",
    confirmedDepositTitle:
      "Comprobante de Depósito Confirmado (Listo para Transferir)",
    confirmedDepositSubtitle:
      "Tu dirección dedicada está asignada y monitoreada para acreditar tu saldo al instante",
    confirmedDepositOrderLabel: "Orden de Depósito Digital",
    confirmedDepositAmountLabel: "Monto Seleccionado:",
    confirmedDepositNetworkLabel: "Red Seleccionada:",
    confirmedDepositFeeLabel: "Comisión de Depósito:",
    confirmedDepositSpeedLabel: "Velocidad Estimada:",
    editDepositSelection: "Modificar Monto o Red",
    iHaveTransferredBtn: "Ya he Transferido — Verificar y Sincronizar Saldo",
    depositStatusChecked:
      "Escaneando el libro mayor de la blockchain para verificar la transferencia...",
    depositAwaitingConfirmPrompt:
      "Selecciona la moneda, la red y el monto arriba, luego confirma para generar el código QR y la dirección.",
    depositAwaitingConfirmBtn: "Confirmar y Proceder Ahora",

    withdrawEligibleLabel: "Saldo elegible para retiro inmediato:",
    totalBalancePrefix: "de un saldo total de",
    withdrawCoinSelectorTitle: "Selecciona la Moneda de Retiro:",
    withdrawCoinSelectorSubtitle: "Retira tus ganancias en tu stablecoin favorita (USDT · USDC · DAI) con paridad 1:1 USD",
    selectRecipientNetwork: "Selecciona la red de retiro:",
    withdrawFeeTrc: "Comisión de Red: $1.00",
    withdrawFeeBep: "Comisión de Red: $0.25",
    withdrawFeeErc: "Comisión de Red: $3.50",
    withdrawMinAlert: (amount: string) =>
      `Tu saldo retirable actual es de $${amount} USD. El retiro mínimo es de $10.00. ¡Juega partidas para aumentar tus ganancias!`,
    recipientAddressLabel: (net: string) =>
      `Dirección de billetera de destino (${net}):`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `Billetera de destino (${asset} - ${net}):`,
    invalidAddressAlert: (net: string) =>
      `Introduce una dirección válida para la red ${net}.`,
    withdrawAmountLabel: "Monto a Retirar ($):",
    maxAvailable: "Máximo disponible",
    minWithdrawPlaceholder: "Mínimo $10.00...",
    amountExceedsError: (req: string, max: string) =>
      `El monto solicitado ($${req}) supera tu saldo retirable ($${max}). Las políticas AML exigen rotar los depósitos en partidas antes de retirarlos.`,

    summaryRequested: "Monto solicitado:",
    summaryPlatformFee: "Comisión de plataforma:",
    summaryFree: "$0.00 (GRATIS)",
    summaryNetworkFee: "Comisión de red blockchain:",
    summaryNetReceive: "Monto neto a recibir:",
    submitWithdrawBtn: "Confirmar y Solicitar Retiro Inmediato",
    submittingWithdraw: "Firmando y procesando transacción...",

    historyTitle: "Historial de Transacciones Contables",
    historyEmpty: "No hay transacciones registradas aún.",
    thType: "Tipo",
    thNetwork: "Activo / Red",
    thAmount: "Monto",
    thAddress: "Dirección / Hash",
    thStatus: "Estado",
    thDate: "Fecha",
    txDeposit: "Depósito",
    txWithdraw: "Retiro",
    statusConfirmed: "Confirmado",
    statusPending: "En Proceso",
    timeRecently: "Recientemente",
    txNoticeSuccess: "Solicitud de retiro enviada con éxito y en cola para firma automatizada.",
  },

  fr: {
    heading: "Portefeuille Financier",
    subhead: "Soldes réels et tenue de grand livre cryptographique en direct.",
    peggedRate: "Garantie de Parité 1:1 USD",
    instantPayoutBadge: "Retraits automatisés instantanés 24/7",
    totalBalanceLabel: "Solde Réel Total (USD)",
    availableLabel: "Disponible pour les Duels",
    availableSub: "Prêt pour les matchs immédiatement",
    lockedLabel: "En Duels Actifs",
    lockedSub: "Réservé dans des matchs en cours",
    withdrawableLabel: "Éligible au Retrait",
    withdrawableSub: "Gains et fonds débloqués",

    amlTitleReady: "Vous êtes éligible pour retirer l'intégralité de votre solde ! 🎉",
    amlTitlePending: "Roulement des Dépôts et Déblocage (AML)",
    amlDescReady: "Vous avez rempli les conditions de jeu équitable. Tous vos fonds sont débloqués et prêts à être retirés sans restriction.",
    amlDescPending: "Conformément aux réglementations anti-blanchiment (AML), les fonds déposés doivent être joués dans des duels au moins une fois avant d'être retirés. Montant restant :",
    playNowCta: "Lancer un Duel Maintenant ⚔️",
    amlPlayed: "Joué :",
    amlRemaining: "Restant pour débloquer :",

    tabDeposit: "Dépôt Instantané (USDT · USDC · DAI)",
    tabWithdraw: "Retirer des Fonds",
    tabHistory: "Historique Comptable",

    step1Title: "1. Stablecoin et Réseau de Transfert",
    step2Title: "2. Montant et Puissance de Victoire",
    step3Title: "3. Transfert via Adresse Dédiée",

    coinSelectorTitle: "Sélectionnez votre Stablecoin Préféré :",
    coinSelectorSubtitle: "Tous les stablecoins sont indexés 1:1 sur l'USD ($1.00 USD) sans variation de prix",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "Plus Grande Liquidité · Le Plus Populaire 🔥",
    coinUsdtDesc: "Stablecoin n°1 mondial, ultra-rapide et accepté sur tous les exchanges et portefeuilles.",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "Sécurité Bancaire · Régulé (Circle) 🛡️",
    coinUsdcDesc: "Stablecoin institutionnel le plus régulé et transparent avec audits publics mensuels.",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "100% Décentralisé · MakerDAO ⚡",
    coinDaiDesc: "Dollar décentralisé garanti par des contrats intelligents audités sur la blockchain.",

    presetsTitle: "Choisissez un forfait rapide ou saisissez un montant libre :",
    presetStarter: "Test Rapide ⚡",
    presetQuick: "Duel Rapide ⚔️",
    presetPopular: "Le Plus Populaire 🔥",
    presetTournaments: "Challenger Tournoi 🏆",
    presetElite: "Champion Élite 💎",
    presetMaster: "Pro Master 🌟",
    presetArena: "Chevalier d'Arène 🛡️",
    presetVip: "Légende 👑",
    presetWhaleSilver: "Baleine Argentée 🦈",
    presetWhaleGold: "Baleine Dorée 🐋",

    badgeStarter: "DÉPART",
    badgePopular: "POPULAIRE",
    badgeElite: "ÉLITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "Ou saisissez un montant personnalisé à déposer ($) :",
    customAmountPlaceholder: "Montant libre (ex. 75)...",
    customAmountMinHint: "Le dépôt minimum est de 5,00 $.",
    customSelectedPreview: "Montant sélectionné pour le dépôt : {amount} $",

    benefitFee: "0% de frais de dépôt (aucun prélèvement)",
    benefitInstant: "Crédit immédiat dès 1 confirmation blockchain",
    benefitOxaPay: "Passerelle OxaPay 100% sécurisée et chiffrée",

    networkTitle: "Choisissez votre réseau de transfert préféré :",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "Recommandé · Le Plus Rapide",
    trc20Speed: "Validation Instantanée (~1 min)",
    trc20Fee: "Frais de Dépôt : 0,00 $",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Frais de réseau minimes",
    bep20Speed: "Standard (~15 secondes)",
    bep20Fee: "Frais de Dépôt : 0,00 $",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "Sécurité L1 Native 💎",
    erc20Speed: "Sécurité Maximale (~2-3 min)",
    erc20Fee: "Frais de Dépôt : 0,00 $",

    networkSelected: "✓ Sélectionné",

    powerTitle: "Puissance de Victoire & Multiplicateur de Gains 🚀",
    powerSubtitle: "Alimentez votre portefeuille pour débloquer un avantage compétitif immédiat",
    powerDuelsTag: "Opportunités de Duel",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "Finance 1 duel 1v1 intense pour doubler votre mise dès la victoire !"
        : `Finance jusqu'à ${duels} duels 1v1 consécutifs pour accumuler des victoires en cash !`,
    powerMultiplierTag: "Multiplicateur de Gains",
    powerMultiplierDesc: (winEstimate: string) =>
      `Gagner vos duels propulse ce solde jusqu'à ~$${winEstimate} de gains immédiatement retirables !`,
    powerTournamentTag: "Cagnottes de Tournois",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "Accès direct aux tournois majeurs avec des cagnottes dépassant les 500 $ !"
        : "Éligible aux tournois et défis quotidiens avec l'élite des joueurs !",
    powerZeroFeeTag: "Garantie 100% Valeur de Jeu",
    powerZeroFeeDesc: "0% frais de dépôt de la plateforme — chaque centime est crédité pour jouer.",
    powerSocialProof: "⚡ 94,8% des champions victorieux déposent 25 $ ou plus pour maximiser leurs chances.",
    championsChoiceBadge: "Choix des Champions 🌟",
    instantParityNote: "Parité stricte 1:1 : 1 USDT = 1 USDC = 1 DAI = 1.00 $ USD dans toutes les arènes",

    permanentWalletBadge: "Adresse dédiée permanente (n'expire jamais)",
    qrReady: "Prêt pour le transfert",
    qrGenerating: "Génération de l'adresse...",
    connectingOxaPay: "Connexion à OxaPay...",
    copy: "Copier",
    copied: "Copié !",
    sendWarningTitle: "Avertissement de Sécurité Important",
    sendWarningBody: (net: string) =>
      `Envoyez uniquement le token sélectionné via le réseau ${net}. Tout envoi d'un autre jeton ou sur un autre réseau entraînera la perte définitive de vos fonds.`,
    safeDepositTitle: "Instructions de Dépôt Sécurisé :",
    safeDepositBody: (net: string) =>
      `Cette adresse est dédiée à votre compte. Envoyez des fonds depuis n'importe quel exchange ou portefeuille via (${net}). Dépôt minimum de 5,00 $.`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `Envoyez uniquement du ${asset} via le réseau ${net}. Tout envoi d'un autre jeton ou sur un autre réseau entraînera la perte définitive et irréversible de vos fonds.`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `Cette adresse est dédiée à votre compte. Envoyez du ${asset} depuis n'importe quel exchange ou portefeuille (Binance, Bybit, TrustWallet, OKX, MetaMask) via (${net}). Dépôt minimum de 5,00 $. Crédit automatique après confirmation blockchain.`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ Confirmer et Procéder au Dépôt de $${amount} (${asset})`,
    confirmDepositSubtitle:
      "Cliquez pour générer votre bordereau de paiement sécurisé et votre adresse de portefeuille dédiée",
    confirmedDepositTitle:
      "Bordereau de Dépôt Confirmé (Prêt pour le Virement)",
    confirmedDepositSubtitle:
      "Votre adresse dédiée est assignée et surveillée pour une synchronisation instantanée du solde",
    confirmedDepositOrderLabel: "Ordre de Dépôt Numérique",
    confirmedDepositAmountLabel: "Montant Sélectionné :",
    confirmedDepositNetworkLabel: "Réseau Sélectionné :",
    confirmedDepositFeeLabel: "Frais de Dépôt de la Plateforme :",
    confirmedDepositSpeedLabel: "Vitesse Estimée :",
    editDepositSelection: "Modifier le Montant ou le Réseau",
    iHaveTransferredBtn: "J'ai Transféré — Vérifier et Actualiser le Solde",
    depositStatusChecked:
      "Recherche du virement entrant sur le registre de la blockchain...",
    depositAwaitingConfirmPrompt:
      "Sélectionnez l'actif, le réseau et le montant ci-dessus, puis confirmez pour afficher l'adresse et le code QR.",
    depositAwaitingConfirmBtn: "Confirmer et Procéder Maintenant",

    withdrawEligibleLabel: "Solde éligible pour retrait immédiat :",
    totalBalancePrefix: "sur un solde total de",
    withdrawCoinSelectorTitle: "Sélectionnez la Devise de Retrait :",
    withdrawCoinSelectorSubtitle: "Retirez vos gains dans le stablecoin de votre choix (USDT · USDC · DAI) avec une parité 1:1 USD",
    selectRecipientNetwork: "Sélectionnez le réseau de retrait :",
    withdrawFeeTrc: "Frais de Réseau : 1,00 $",
    withdrawFeeBep: "Frais de Réseau : 0,25 $",
    withdrawFeeErc: "Frais de Réseau : 3,50 $",
    withdrawMinAlert: (amount: string) =>
      `Votre solde retirable est actuellement de ${amount} $ USD. Le retrait minimum est de 10,00 $ USD. Jouez des duels pour augmenter vos gains !`,
    recipientAddressLabel: (net: string) =>
      `Adresse de portefeuille de réception (${net}) :`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `Adresse de portefeuille de réception (${asset} - ${net}) :`,
    invalidAddressAlert: (net: string) =>
      `Veuillez entrer une adresse valide pour le réseau ${net}.`,
    withdrawAmountLabel: "Montant à Retirer ($) :",
    maxAvailable: "Maximum disponible",
    minWithdrawPlaceholder: "Minimum 10,00 $...",
    amountExceedsError: (req: string, max: string) =>
      `Le montant demandé (${req} $) dépasse votre solde retirable (${max} $). Les exigences AML imposent de jouer les dépôts avant de les retirer.`,

    summaryRequested: "Montant demandé :",
    summaryPlatformFee: "Frais de plateforme :",
    summaryFree: "0,00 $ (GRATUIT)",
    summaryNetworkFee: "Frais de réseau blockchain :",
    summaryNetReceive: "Montant net que vous recevrez :",
    submitWithdrawBtn: "Confirmer et Demander le Retrait Immédiat",
    submittingWithdraw: "Signature et diffusion de la transaction...",

    historyTitle: "Historique des Transactions & Comptabilité",
    historyEmpty: "Aucune transaction financière enregistrée pour l'instant.",
    thType: "Type",
    thNetwork: "Actif / Réseau",
    thAmount: "Montant",
    thAddress: "Adresse / Hash",
    thStatus: "Statut",
    thDate: "Date",
    txDeposit: "Dépôt",
    txWithdraw: "Retrait",
    statusConfirmed: "Confirmé",
    statusPending: "En Traitement",
    timeRecently: "Récemment",
    txNoticeSuccess: "Demande de retrait transmise avec succès et en file d'attente pour signature automatique.",
  },

  hi: {
    heading: "वित्तीय वॉलेट",
    subhead: "वास्तविक शेष राशि और लाइव ब्लॉकचेन लेज़र लेखांकन।",
    peggedRate: "1:1 USD समानता गारंटी",
    instantPayoutBadge: "तत्काल 24/7 स्वचालित निकासी",
    totalBalanceLabel: "कुल वास्तविक शेष राशि (USD)",
    availableLabel: "द्वंद्वयुद्ध के लिए उपलब्ध",
    availableSub: "तुरंत मैचों के लिए तैयार",
    lockedLabel: "सक्रिय द्वंद्वयुद्ध में",
    lockedSub: "चल रहे मैचों में आरक्षित",
    withdrawableLabel: "तत्काल निकासी योग्य",
    withdrawableSub: "अनलॉक की गई जीत और धन",

    amlTitleReady: "आप अपनी पूरी शेष राशि निकालने के पात्र हैं! 🎉",
    amlTitlePending: "जमा राशि का उपयोग और निकासी अनलॉक (AML)",
    amlDescReady: "आपने निष्पक्ष खेल की आवश्यकताएं पूरी कर ली हैं। आपकी सारी राशि अनलॉक है और इसे कभी भी निकाला जा सकता है।",
    amlDescPending: "मनी लॉन्ड्रिंग विरोधी (AML) नियमों के अनुसार, जमा राशि को निकालने से पहले कम से कम एक बार मैचों में उपयोग करना आवश्यक है। शेष राशि:",
    playNowCta: "अभी द्वंद्वयुद्ध खेलें ⚔️",
    amlPlayed: "खेला गया:",
    amlRemaining: "अनलॉक करने के लिए शेष:",

    tabDeposit: "तत्काल जमा (USDT · USDC · DAI)",
    tabWithdraw: "राशि निकालें",
    tabHistory: "लेज़र ऑडिट इतिहास",

    step1Title: "1. स्टेबलकॉइन और नेटवर्क चयन",
    step2Title: "2. जमा राशि और जीत की शक्ति",
    step3Title: "3. समर्पित पते के माध्यम से ट्रांसफर",

    coinSelectorTitle: "अपनी पसंदीदा स्टेबलकॉइन चुनें:",
    coinSelectorSubtitle: "सभी स्टेबलकॉइन शून्य मूल्य उतार-चढ़ाव के साथ 1:1 USD ($1.00 USD) पर आंकी गई हैं",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "सर्वाधिक तरलता · सबसे लोकप्रिय 🔥",
    coinUsdtDesc: "दुनिया की नंबर 1 स्टेबलकॉइन, बेहद तेज़ और सभी वॉलेट्स एवं एक्सचेंजों पर स्वीकृत।",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "बैंक-स्तरीय सुरक्षा · विनियमित (Circle) 🛡️",
    coinUsdcDesc: "मासिक सार्वजनिक ऑडिट के साथ दुनिया की सबसे पारदर्शी और विनियमित स्टेबलकॉइन।",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "100% विकेंद्रीकृत · MakerDAO ⚡",
    coinDaiDesc: "स्मार्ट अनुबंधों और पारदर्शी क्रिप्टो संपार्श्विक द्वारा समर्थित विकेंद्रीकृत डॉलर।",

    presetsTitle: "त्वरित स्टार्टर पैक चुनें या कस्टम राशि दर्ज करें:",
    presetStarter: "त्वरित परीक्षण ⚡",
    presetQuick: "त्वरित द्वंद्व ⚔️",
    presetPopular: "सबसे लोकप्रिय 🔥",
    presetTournaments: "टूर्नामेंट दावेदार 🏆",
    presetElite: "एलीट चैंपियन 💎",
    presetMaster: "प्रो मास्टर 🌟",
    presetArena: "एरीना योद्धा 🛡️",
    presetVip: "लेजेंड 👑",
    presetWhaleSilver: "सिल्वर व्हेल 🦈",
    presetWhaleGold: "गोल्डन व्हेल 🐋",

    badgeStarter: "शुरुआती",
    badgePopular: "लोकप्रिय",
    badgeElite: "एलीट",
    badgeVip: "VIP",
    badgeWhale: "प्रीमियम",

    customAmountLabel: "या जमा करने के लिए कोई कस्टम राशि लिखें ($):",
    customAmountPlaceholder: "कोई भी राशि दर्ज करें (उदा. 75)...",
    customAmountMinHint: "न्यूनतम जमा राशि $5.00 है।",
    customSelectedPreview: "जमा के लिए चयनित राशि: ${amount}",

    benefitFee: "0% जमा शुल्क (हम कभी कोई कटौती नहीं करते)",
    benefitInstant: "1 ब्लॉकचेन पुष्टि पर तत्काल क्रेडिट",
    benefitOxaPay: "100% सुरक्षित और एन्क्रिप्टेड OxaPay गेटवे",

    networkTitle: "अपना पसंदीदा ट्रांसफर नेटवर्क चुनें:",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "अनुशंसित · सबसे तेज़",
    trc20Speed: "तत्काल पुष्टि (~1 मिनट)",
    trc20Fee: "जमा शुल्क: $0.00",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "अत्यधिक कम शुल्क",
    bep20Speed: "मानक (~15 सेकंड)",
    bep20Fee: "जमा शुल्क: $0.00",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "मूल L1 सुरक्षा 💎",
    erc20Speed: "उच्चतम सुरक्षा (~2-3 मिनट)",
    erc20Fee: "जमा शुल्क: $0.00",

    networkSelected: "✓ चयनित",

    powerTitle: "जीतने की शक्ति और मैच मल्टीप्लायर 🚀",
    powerSubtitle: "मैचों में तत्काल प्रतिस्पर्धात्मक बढ़त पाने के लिए अपने वॉलेट को रिचार्ज करें",
    powerDuelsTag: "द्वंद्वयुद्ध के अवसर",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "जीत पर अपने पैसे को दोगुना करने के लिए 1 रोमांचक 1v1 द्वंद्वयुद्ध को फंड करता है!"
        : `नकद जीत हासिल करने के लिए लगातार ${duels} प्रतिस्पर्धी 1v1 द्वंद्वयुद्ध तक फंड करता है!`,
    powerMultiplierTag: "संभावित जीत मल्टीप्लायर",
    powerMultiplierDesc: (winEstimate: string) =>
      `मैच जीतने से यह शेष राशि तत्काल निकासी योग्य नकद में ~$${winEstimate} तक पहुँच सकती है!`,
    powerTournamentTag: "टूर्नामेंट पुरस्कार पूल",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "$500+ से अधिक के पुरस्कार पूल वाले बड़े टूर्नामेंटों में सीधी एंट्री!"
        : "शीर्ष खिलाड़ियों के साथ दैनिक टूर्नामेंटों और चुनौतियों के लिए पात्र!",
    powerZeroFeeTag: "100% गेम मूल्य गारंटी",
    powerZeroFeeDesc: "0% प्लेटफ़ॉर्म जमा शुल्क — हर एक पैसा सीधे आपके खेलने योग्य शेष राशि में जाता है।",
    powerSocialProof: "⚡ 94.8% शीर्ष विजेता अपने अवसरों को अधिकतम करने के लिए $25 या अधिक जमा करते हैं।",
    championsChoiceBadge: "चैंपियंस की पसंद 🌟",
    instantParityNote: "सख्त 1:1 USD समानता: सभी खेलों में 1 USDT = 1 USDC = 1 DAI = $1.00 USD",

    permanentWalletBadge: "स्थायी समर्पित पता (कभी समाप्त नहीं होता)",
    qrReady: "ट्रांसफर के लिए तैयार",
    qrGenerating: "पता जनरेट किया जा रहा है...",
    connectingOxaPay: "OxaPay से कनेक्ट हो रहा है...",
    copy: "कॉपी करें",
    copied: "कॉपी हो गया!",
    sendWarningTitle: "महत्वपूर्ण सुरक्षा चेतावनी",
    sendWarningBody: (net: string) =>
      `केवल चयनित मुद्रा को ${net} नेटवर्क के माध्यम से भेजें। कोई अन्य टोकन भेजने या किसी भिन्न नेटवर्क का उपयोग करने पर फंड हमेशा के लिए खो जाएंगे।`,
    safeDepositTitle: "सुरक्षित जमा निर्देश:",
    safeDepositBody: (net: string) =>
      `यह पता आपके खाते के लिए समर्पित है। किसी भी एक्सचेंज या वॉलेट से (${net}) के माध्यम से फंड भेजें। न्यूनतम जमा $5.00 है।`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `केवल ${asset} को ${net} नेटवर्क के माध्यम से भेजें। कोई अन्य टोकन भेजने या किसी भिन्न नेटवर्क का उपयोग करने पर फंड हमेशा के लिए खो जाएंगे।`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `यह पता आपके खाते के लिए समर्पित है। किसी भी एक्सचेंज या वॉलेट (Binance, Bybit, TrustWallet, OKX, MetaMask) से (${net}) के माध्यम से ${asset} भेजें। न्यूनतम जमा $5.00 है। ब्लॉकचेन पुष्टि पर राशि तुरंत जमा हो जाती है।`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ $${amount} (${asset}) जमा की पुष्टि करें और आगे बढ़ें`,
    confirmDepositSubtitle:
      "अपनी सुरक्षित भुगतान पर्ची और समर्पित ब्लॉकचेन पता जनरेट करने के लिए क्लिक करें",
    confirmedDepositTitle:
      "पुष्टि की गई जमा पर्ची (स्थानांतरण के लिए तैयार)",
    confirmedDepositSubtitle:
      "तत्काल लेज़र क्रेडिटिंग के लिए आपका समर्पित पता सुरक्षित और सक्रिय है",
    confirmedDepositOrderLabel: "डिजिटल जमा आदेश",
    confirmedDepositAmountLabel: "चयनित राशि:",
    confirmedDepositNetworkLabel: "चयनित नेटवर्क:",
    confirmedDepositFeeLabel: "प्लेटफ़ॉर्म जमा शुल्क:",
    confirmedDepositSpeedLabel: "अनुमानित गति:",
    editDepositSelection: "राशि या नेटवर्क बदलें",
    iHaveTransferredBtn: "मैंने ट्रांसफर कर दिया है — अब बैलेंस जांचें और सिंक करें",
    depositStatusChecked:
      "ब्लॉकचेन लेज़र पर इनकमिंग ट्रांसफर की पुष्टि की जा रही है...",
    depositAwaitingConfirmPrompt:
      "ऊपर अपनी संपत्ति, नेटवर्क और राशि चुनें, फिर भुगतान वाउचर और क्यूआर कोड जनरेट करने के लिए कन्फर्म पर क्लिक करें।",
    depositAwaitingConfirmBtn: "पुष्टि करें और आगे बढ़ें",

    withdrawEligibleLabel: "तत्काल निकासी के लिए पात्र शेष राशि:",
    totalBalancePrefix: "कुल शेष राशि में से",
    withdrawCoinSelectorTitle: "निकासी मुद्रा चुनें:",
    withdrawCoinSelectorSubtitle: "अपनी पसंदीदा स्टेबलकॉइन (USDT · USDC · DAI) में 1:1 USD समानता के साथ कमाई निकालें",
    selectRecipientNetwork: "निकासी गंतव्य नेटवर्क चुनें:",
    withdrawFeeTrc: "निकासी नेटवर्क शुल्क: $1.00",
    withdrawFeeBep: "निकासी नेटवर्क शुल्क: $0.25",
    withdrawFeeErc: "निकासी नेटवर्क शुल्क: $3.50",
    withdrawMinAlert: (amount: string) =>
      `आपकी निकासी योग्य शेष राशि वर्तमान में $${amount} USD है। न्यूनतम निकासी राशि $10.00 है। मैच खेलें और कमाई बढ़ाएं!`,
    recipientAddressLabel: (net: string) =>
      `आपका प्राप्तकर्ता वॉलेट पता (${net}):`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `निकासी प्राप्तकर्ता वॉलेट पता (${asset} - ${net}):`,
    invalidAddressAlert: (net: string) =>
      `कृपया ${net} नेटवर्क के लिए मान्य पता प्रारूप दर्ज करें।`,
    withdrawAmountLabel: "निकासी राशि ($):",
    maxAvailable: "अधिकतम उपलब्ध",
    minWithdrawPlaceholder: "न्यूनतम $10.00...",
    amountExceedsError: (req: string, max: string) =>
      `अनुरोधित राशि ($${req}) आपकी निकासी योग्य शेष राशि ($${max}) से अधिक है। AML अनुपालन के लिए निकासी से पहले फंड को एक बार मैचों में उपयोग करना आवश्यक है।`,

    summaryRequested: "अनुरोधित राशि:",
    summaryPlatformFee: "प्लेटफ़ॉर्म शुल्क:",
    summaryFree: "$0.00 (मुफ़्त)",
    summaryNetworkFee: "ब्लॉकचेन नेटवर्क शुल्क:",
    summaryNetReceive: "आपको प्राप्त होने वाली शुद्ध राशि:",
    submitWithdrawBtn: "पुष्टि करें और तत्काल निकासी का अनुरोध करें",
    submittingWithdraw: "लेनदेन पर हस्ताक्षर और प्रसारण किया जा रहा है...",

    historyTitle: "लेनदेन एवं लेखांकन इतिहास",
    historyEmpty: "अभी तक कोई वित्तीय लेनदेन दर्ज नहीं किया गया है।",
    thType: "प्रकार",
    thNetwork: "संपत्ति / नेटवर्क",
    thAmount: "राशि",
    thAddress: "पता / हैश",
    thStatus: "स्थिति",
    thDate: "दिनांक",
    txDeposit: "जमा",
    txWithdraw: "निकासी",
    statusConfirmed: "पुष्टि हो चुकी",
    statusPending: "प्रक्रिया में",
    timeRecently: "हाल ही में",
    txNoticeSuccess: "निकासी अनुरोध सफलतापूर्वक सबमिट हो गया है और स्वचालित हस्ताक्षर की कतार में है।",
  },

  zh: {
    heading: "资金钱包",
    subhead: "真实账户余额与加密账本实时对账。",
    peggedRate: "1:1 美元刚性兑付保障",
    instantPayoutBadge: "全天候 24/7 极速自动化提现",
    totalBalanceLabel: "实际总资产 (USD)",
    availableLabel: "对决可用余额",
    availableSub: "随时加入比赛对决",
    lockedLabel: "对决进行中锁定",
    lockedSub: "正在进行的比赛占用",
    withdrawableLabel: "可即时提现金额",
    withdrawableSub: "已解锁的奖金与本金",

    amlTitleReady: "您已符合全额即时提现资格！🎉",
    amlTitlePending: "充值流水与提现解锁（反洗钱合规 AML）",
    amlDescReady: "您已满足公平竞技流水要求，所有资金均已解锁，可无限制提取至您的外部钱包。",
    amlDescPending: "根据反洗钱合规政策，充值资金需在竞技对决中完成一次对决流水方可提现。剩余所需流水金额：",
    playNowCta: "立即开战 ⚔️",
    amlPlayed: "已完成流水：",
    amlRemaining: "剩余待解锁：",

    tabDeposit: "极速充值 (USDT · USDC · DAI)",
    tabWithdraw: "提现资金",
    tabHistory: "账本流水记录",

    step1Title: "1. 选择充值币种与网络",
    step2Title: "2. 选择充值档位与胜率能量",
    step3Title: "3. 通过专属充值地址转账",

    coinSelectorTitle: "选择您偏好的美元稳定币：",
    coinSelectorSubtitle: "所有支持的稳定币与美元严格 1:1 锚定（$1.00 USD），无任何汇率滑点",
    coinUsdtName: "Tether (USDT)",
    coinUsdtBadge: "最高流动性 · 最受欢迎 🔥",
    coinUsdtDesc: "全球交易量第一的稳定币，极速转账到账，全平台与主流钱包通用支持。",
    coinUsdcName: "USD Coin (USDC)",
    coinUsdcBadge: "银行级安全 · 合规受监管 (Circle) 🛡️",
    coinUsdcDesc: "全球最具合规性与透明度的机构级稳定币，每月提供公开储备金审计报告。",
    coinDaiName: "Dai (DAI)",
    coinDaiBadge: "100% 去中心化 · MakerDAO 协议 ⚡",
    coinDaiDesc: "由智能合约足额加密资产超额抵押发行的去中心化去信任数字美元。",

    presetsTitle: "选择快速充值档位或输入自定义金额：",
    presetStarter: "快速体验 ⚡",
    presetQuick: "极速对决 ⚔️",
    presetPopular: "最受欢迎 🔥",
    presetTournaments: "锦标争霸 🏆",
    presetElite: "精英霸主 💎",
    presetMaster: "大师之战 🌟",
    presetArena: "竞技骑士 🛡️",
    presetVip: "传奇至尊 👑",
    presetWhaleSilver: "巨鲸白银 🦈",
    presetWhaleGold: "巨鲸黄金 🐋",

    badgeStarter: "新手",
    badgePopular: "热门",
    badgeElite: "精英",
    badgeVip: "VIP",
    badgeWhale: "至尊",

    customAmountLabel: "或输入您希望充值的自定义金额 ($)：",
    customAmountPlaceholder: "输入任意金额（例如：75）...",
    customAmountMinHint: "最低充值金额为 $5.00。",
    customSelectedPreview: "当前选定充值金额：${amount}",

    benefitFee: "0% 充值手续费（平台绝不扣除分毫）",
    benefitInstant: "区块链 1 次确认后资金秒级自动到账",
    benefitOxaPay: "100% 高度加密安全的 OxaPay 官方支付网关",

    networkTitle: "选择您的充值网络：",
    trc20Name: "Tron (TRC20)",
    trc20Chain: "Tron Network",
    trc20Badge: "官方推荐 · 极速到账",
    trc20Speed: "极速到账 (~1分钟)",
    trc20Fee: "充值手续费：$0.00",

    bep20Name: "BNB Chain (BEP20)",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "超低网络 Gas 费用",
    bep20Speed: "标准确认 (~15秒)",
    bep20Fee: "充值手续费：$0.00",

    erc20Name: "Ethereum (ERC20)",
    erc20Chain: "Ethereum Mainnet",
    erc20Badge: "以太坊原生主网 💎",
    erc20Speed: "最高安全确定性 (~2-3分钟)",
    erc20Fee: "充值手续费：$0.00",

    networkSelected: "✓ 已选择",

    powerTitle: "胜率能量与比赛奖金倍增预测 🚀",
    powerSubtitle: "为您的竞技钱包充能，立刻解锁竞技场顶尖胜势优势",
    powerDuelsTag: "单挑对决机会",
    powerDuelsDesc: (duels: number) =>
      duels <= 1
        ? "可资助 1 场高额 1v1 实时单挑对决，获胜立刻翻倍赢取真金奖励！"
        : `可连续发起并资助多达 ${duels} 场 1v1 巅峰对决，助您连续冲榜席卷现金奖金！`,
    powerMultiplierTag: "对决获胜提现预期",
    powerMultiplierDesc: (winEstimate: string) =>
      `在技能对决中取胜可将该笔资金迅速放大至约 $${winEstimate} 可即时提现奖金！`,
    powerTournamentTag: "大型锦标赛奖池入场",
    powerTournamentDesc: (amt: number) =>
      amt >= 25
        ? "直接解锁高规格冠军锦标赛参赛资格，角逐总额超过 $500+ 的巨额奖金池！"
        : "获准参加每日现金赏金赛及阶梯竞技赛，与顶尖高手同台较量！",
    powerZeroFeeTag: "100% 游戏资金真实入账保证",
    powerZeroFeeDesc: "平台充值手续费 0% —— 每一分钱全部原封不动进入您的竞技账户直接开玩。",
    powerSocialProof: "⚡ 排行榜前列的获胜选手中，有 94.8% 选择单次充值 $25 或更多以最大化胜率。",
    championsChoiceBadge: "冠军玩家必选 🌟",
    instantParityNote: "严格 1:1 美元等值：所有对决与比赛中 1 USDT = 1 USDC = 1 DAI = $1.00 USD",

    permanentWalletBadge: "专属永久固定充值地址（永不过期，长期有效）",
    qrReady: "已就绪可转账",
    qrGenerating: "正在生成专属充值地址...",
    connectingOxaPay: "正在连接 OxaPay 加密安全网关...",
    copy: "复制",
    copied: "已复制！",
    sendWarningTitle: "转账前重要安全提示",
    sendWarningBody: (net: string) =>
      `请务必仅通过 ${net} 网络发送所选币种。转账任何其他币种或选错区块链网络将导致资金永久丢失且无法找回。`,
    safeDepositTitle: "安全充值说明：",
    safeDepositBody: (net: string) =>
      `此地址已为您专属生成。您可从任何交易所或钱包通过 (${net}) 充值。最低充值金额为 $5.00。区块链确认后系统将立即自动为您入账。`,
    sendWarningBodyDynamic: (asset: string, net: string) =>
      `请务必仅通过 ${net} 网络发送 ${asset}。转账任何其他币种或选错区块链网络将导致资金永久丢失且无法找回。`,
    safeDepositBodyDynamic: (asset: string, net: string) =>
      `此地址已为您专属生成并受到密码学安全保护。您可从任何交易所或钱包（Binance、Bybit、TrustWallet、OKX、MetaMask）通过 (${net}) 充值 ${asset}。最低充值金额为 $5.00。区块链确认后系统将立即自动为您入账。`,

    confirmDepositBtn: (amount: string, asset: string) =>
      `⚡ 确认并继续充值 $${amount} (${asset})`,
    confirmDepositSubtitle:
      "点击生成安全充值凭证及专属区块链收款地址",
    confirmedDepositTitle: "已确认充值凭单（可立即转账）",
    confirmedDepositSubtitle:
      "已为您分配专属监控地址，链上确认后即刻自动计入游戏账户余额",
    confirmedDepositOrderLabel: "数字充值订单",
    confirmedDepositAmountLabel: "选定金额：",
    confirmedDepositNetworkLabel: "选定网络：",
    confirmedDepositFeeLabel: "平台充值手续费：",
    confirmedDepositSpeedLabel: "预计到账速度：",
    editDepositSelection: "修改金额或网络",
    iHaveTransferredBtn: "我已完成转账 — 立即核对并同步余额",
    depositStatusChecked: "正在区块链网络核实对应充值交易...",
    depositAwaitingConfirmPrompt:
      "请在上方选择币种、网络和充值金额，然后点击“确认充值”生成专属收款地址和二维码。",
    depositAwaitingConfirmBtn: "立即确认并继续",

    withdrawEligibleLabel: "当前可即时提现金额：",
    totalBalancePrefix: "总资产为",
    withdrawCoinSelectorTitle: "选择提现到账币种：",
    withdrawCoinSelectorSubtitle: "您可以选择任意主流稳定币（USDT · USDC · DAI）提取您的现金收益，1:1 刚性兑付美元",
    selectRecipientNetwork: "选择提现到账网络：",
    withdrawFeeTrc: "提现网络手续费：$1.00",
    withdrawFeeBep: "提现网络手续费：$0.25",
    withdrawFeeErc: "提现网络手续费：$3.50",
    withdrawMinAlert: (amount: string) =>
      `您当前可提现金额为 $${amount} USD。单笔最低提现金额为 $10.00。参与更多技能对决赢取更多奖金即可随时提现！`,
    recipientAddressLabel: (net: string) =>
      `您的提现接收钱包地址 (${net})：`,
    recipientAddressLabelDynamic: (asset: string, net: string) =>
      `提现到账钱包地址 (${asset} - ${net})：`,
    invalidAddressAlert: (net: string) =>
      `请输入有效的 ${net} 格式钱包地址。`,
    withdrawAmountLabel: "提现金额 ($)：",
    maxAvailable: "全部提现",
    minWithdrawPlaceholder: "最低 $10.00...",
    amountExceedsError: (req: string, max: string) =>
      `申请金额 ($${req}) 超出您当前可提现额度 ($${max})。根据反洗钱风控政策，充值资金须在比赛中完成对决后方可提取。`,

    summaryRequested: "申请提现金额：",
    summaryPlatformFee: "平台服务费：",
    summaryFree: "$0.00 (免手续费)",
    summaryNetworkFee: "区块链网络矿工费：",
    summaryNetReceive: "实际到账净额：",
    submitWithdrawBtn: "确认并提交即时提现申请",
    submittingWithdraw: "正在签名并广播交易至区块链...",

    historyTitle: "财务与会计流水审计日志",
    historyEmpty: "暂无任何资金流水记录。",
    thType: "类型",
    thNetwork: "资产 / 网络",
    thAmount: "金额",
    thAddress: "地址 / 哈希",
    thStatus: "状态",
    thDate: "时间",
    txDeposit: "充值",
    txWithdraw: "提现",
    statusConfirmed: "已确认",
    statusPending: "处理中",
    timeRecently: "刚刚",
    txNoticeSuccess: "提现申请已成功提交，系统已将其列入自动化数字签名队列。",
  },
};
