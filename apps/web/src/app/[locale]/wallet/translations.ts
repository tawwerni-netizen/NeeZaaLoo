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

  networkSelected: string;

  // QR & Address Card
  permanentWalletBadge: string;
  qrReady: string;
  qrGenerating: string;
  connectingOxaPay: string;
  copy: string;
  copied: string;
  safeDepositTitle: string;
  safeDepositBody: (net: string) => string;

  // Withdrawal Section
  withdrawEligibleLabel: string;
  totalBalancePrefix: string;
  selectRecipientNetwork: string;
  withdrawMinAlert: (amount: string) => string;
  recipientAddressLabel: (net: string) => string;
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
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "سحوبات مؤتمتة فورية 24/7",
    totalBalanceLabel: "إجمالي الرصيد الفعلي",
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

    tabDeposit: "إيداع فوري (USDT)",
    tabWithdraw: "سحب الأرباح",
    tabHistory: "سجل العمليات المحاسبية",

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

    customAmountLabel: "أو اكتب مبلغاً مخصصاً ترغب في إيداعه (USDT):",
    customAmountPlaceholder: "أدخل أي مبلغ مخصص (مثال: 75)...",
    customAmountMinHint: "الحد الأدنى للإيداع هو 5.00 USDT.",
    customSelectedPreview: "المبلغ المحدد للإيداع: {amount} USDT",

    benefitFee: "عمولة إيداع 0% (لا نخصم أي فلس)",
    benefitInstant: "قيد فوري بعد تأكيد 1 على البلوكتشين",
    benefitOxaPay: "بوابة OxaPay مشفرة ومؤمنة 100%",

    networkTitle: "اختر شبكة التحويل المفضلة لديك:",
    trc20Name: "USDT - TRC20",
    trc20Chain: "Tron Network",
    trc20Badge: "موصى به · الأسرع",
    trc20Speed: "تأكيد فوري (~1 دقيقة)",
    trc20Fee: "رسوم السحب: 1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "رسوم منخفضة جداً",
    bep20Speed: "تأكيد قياسي (~15 ثانية)",
    bep20Fee: "رسوم السحب: 0.25 USDT فقط",

    networkSelected: "✓ تم الاختيار",

    permanentWalletBadge: "عنوان محفظة ثابت ودائم مخصص لحسابك (لا تنتهي صلاحيته)",
    qrReady: "جاهز للتحويل",
    qrGenerating: "جاري توليد العنوان...",
    connectingOxaPay: "جاري الاتصال ببوابة OxaPay...",
    copy: "نسخ",
    copied: "تم النسخ!",
    safeDepositTitle: "إرشادات الإيداع الآمن:",
    safeDepositBody: (net: string) =>
      `هذا العنوان مخصص لحسابك وثابت لا يتغير. يمكنك التحويل إليه في أي وقت من أي محفظة أو منصة (Binance, TrustWallet, OKX وغيرها) عبر شبكة (${net}). الحد الأدنى للإيداع هو 5.00 USDT. سيتم قيد الرصيد تلقائياً في حسابك فور تأكيد المعاملة في دفتر البلوكتشين.`,

    withdrawEligibleLabel: "الرصيد المؤهل للسحب الفوري حالياً:",
    totalBalancePrefix: "إجمالي رصيدك في المحفظة: ",
    selectRecipientNetwork: "اختر شبكة استلام السحب:",
    withdrawMinAlert: (amount: string) =>
      `الحد الأدنى للسحب هو 10.00 USDT. رصيدك القابل للسحب حالياً ($${amount} USDT) أقل من الحد الأدنى. يرجى استخدام مبالغ الإيداع في خوض النزالات لتأهيلها للسحب.`,
    recipientAddressLabel: (net: string) => `عنوان محفظتك المستلمة (${net}):`,
    invalidAddressAlert: (net: string) => `تنبيه: صيغة العنوان غير صالحة لشبكة ${net}`,
    withdrawAmountLabel: "مبلغ السحب (USDT):",
    maxAvailable: "الحد الأقصى المتاح:",
    minWithdrawPlaceholder: "الحد الأدنى 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `المبلغ المطلوب ($${req}) يتجاوز رصيدك القابل للسحب ($${max} USDT).`,

    summaryRequested: "المبلغ المطلوب سحبه:",
    summaryPlatformFee: "عمولة المنصة:",
    summaryFree: "مجاناً (0%)",
    summaryNetworkFee: "رسوم تحويل الشبكة (OxaPay):",
    summaryNetReceive: "صافي المبلغ الذي ستستلمه في محفظتك:",
    submitWithdrawBtn: "تأكيد طلب السحب الفوري",
    submittingWithdraw: "جاري إرسال الطلب للبوابة...",

    historyTitle: "سجل المعاملات المحاسبية المكتملة والجارية",
    historyEmpty: "لا توجد معاملات مسجلة في محفظتك حتى الآن.",
    thType: "نوع العملية",
    thNetwork: "الشبكة",
    thAmount: "المبلغ",
    thAddress: "المعرّف / العنوان",
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
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "Instant 24/7 Automated Payouts",
    totalBalanceLabel: "Total Real Balance",
    availableLabel: "Available for Duels",
    availableSub: "Ready for matches immediately",
    lockedLabel: "In Active Matches",
    lockedSub: "Reserved in ongoing games",
    withdrawableLabel: "Eligible for Withdrawal",
    withdrawableSub: "Unlocked winnings & funds",

    amlTitleReady: "You are eligible to withdraw your entire balance! 🎉",
    amlTitlePending: "Deposit Playthrough & Withdrawal Unlock (AML)",
    amlDescReady: "You have completed the fair-play wagering requirement. All funds are unlocked and can be withdrawn anytime without restriction.",
    amlDescPending: "To comply with anti-money laundering regulations and prevent platform abuse, deposited funds must be wagered once before withdrawal. Remaining requirement:",
    playNowCta: "Play a Duel Now ⚔️",
    amlPlayed: "Wagered:",
    amlRemaining: "Remaining to Unlock:",

    tabDeposit: "Instant Deposit (USDT)",
    tabWithdraw: "Withdraw Funds",
    tabHistory: "Ledger Transactions",

    presetsTitle: "Choose a quick deposit tier or enter a custom amount:",
    presetStarter: "Starter Pack ⚡",
    presetQuick: "Quick Duel ⚔️",
    presetPopular: "Most Popular 🔥",
    presetTournaments: "Tournament Pro 🏆",
    presetElite: "Elite Champion 💎",
    presetMaster: "Master Duelist 🌟",
    presetArena: "Arena Master 🛡️",
    presetVip: "Legendary VIP 👑",
    presetWhaleSilver: "High Roller 🦈",
    presetWhaleGold: "Grand Whale 🐋",

    badgeStarter: "STARTER",
    badgePopular: "POPULAR",
    badgeElite: "ELITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "Or enter any custom amount you wish to deposit (USDT):",
    customAmountPlaceholder: "Enter custom amount (e.g. 75)...",
    customAmountMinHint: "Minimum deposit is 5.00 USDT.",
    customSelectedPreview: "Selected deposit amount: {amount} USDT",

    benefitFee: "0% Deposit Fee (Zero deductions)",
    benefitInstant: "Instant Credit after 1 Block Confirmation",
    benefitOxaPay: "100% Encrypted & Secured by OxaPay",

    networkTitle: "Select your preferred transfer network:",
    trc20Name: "USDT - TRC20",
    trc20Chain: "Tron Network",
    trc20Badge: "Recommended · Fastest",
    trc20Speed: "Instant confirmation (~1 min)",
    trc20Fee: "Withdrawal Fee: 1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Ultra Low Gas Fee",
    bep20Speed: "Standard confirmation (~15 sec)",
    bep20Fee: "Withdrawal Fee: 0.25 USDT only",

    networkSelected: "✓ Selected",

    permanentWalletBadge: "Permanent Dedicated Wallet for Your Account (Never Expires)",
    qrReady: "Ready to Transfer",
    qrGenerating: "Generating Address...",
    connectingOxaPay: "Connecting to OxaPay gateway...",
    copy: "Copy",
    copied: "Copied!",
    safeDepositTitle: "Safe Deposit Guidelines:",
    safeDepositBody: (net: string) =>
      `This address is dedicated to your account and permanent. You can transfer to it anytime from any wallet or exchange (Binance, TrustWallet, OKX, etc.) via (${net}). Minimum deposit is 5.00 USDT. Funds will be credited automatically once confirmed on the blockchain.`,

    withdrawEligibleLabel: "Eligible Withdrawable Balance:",
    totalBalancePrefix: "Total Wallet Balance: ",
    selectRecipientNetwork: "Select Recipient Network:",
    withdrawMinAlert: (amount: string) =>
      `Minimum withdrawal is 10.00 USDT. Your withdrawable balance ($${amount} USDT) is below the threshold. Play matches to qualify deposited funds for withdrawal.`,
    recipientAddressLabel: (net: string) => `Recipient Wallet Address (${net}):`,
    invalidAddressAlert: (net: string) => `Warning: Invalid address format for ${net}`,
    withdrawAmountLabel: "Withdrawal Amount (USDT):",
    maxAvailable: "Max Available:",
    minWithdrawPlaceholder: "Min 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `Requested amount ($${req}) exceeds withdrawable balance ($${max} USDT).`,

    summaryRequested: "Requested Withdrawal:",
    summaryPlatformFee: "Platform Fee:",
    summaryFree: "Free (0%)",
    summaryNetworkFee: "Network Transfer Fee (OxaPay):",
    summaryNetReceive: "Net Amount You Will Receive:",
    submitWithdrawBtn: "Confirm Instant Withdrawal",
    submittingWithdraw: "Sending request to gateway...",

    historyTitle: "Completed & Pending Ledger Transactions",
    historyEmpty: "No transactions recorded in your wallet yet.",
    thType: "Type",
    thNetwork: "Network",
    thAmount: "Amount",
    thAddress: "Identifier / Address",
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
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "Retiros automatizados instantáneos 24/7",
    totalBalanceLabel: "Saldo Total Real",
    availableLabel: "Disponible para Duelos",
    availableSub: "Listo para partidas de inmediato",
    lockedLabel: "En Duelos Activos",
    lockedSub: "Reservado en partidas en curso",
    withdrawableLabel: "Elegible para Retiro",
    withdrawableSub: "Ganancias y fondos desbloqueados",

    amlTitleReady: "¡Eres elegible para retirar todo tu saldo! 🎉",
    amlTitlePending: "Rotación de Depósitos y Desbloqueo (AML)",
    amlDescReady: "Has completado el requisito de juego limpio. Todos tus fondos están desbloqueados y listos para retirar sin restricciones.",
    amlDescPending: "Según las regulaciones contra el lavado de dinero (AML), los fondos depositados deben apostarse al menos una vez. Monto restante para desbloquear:",
    playNowCta: "Jugar un Duelo Ahora ⚔️",
    amlPlayed: "Jugado:",
    amlRemaining: "Restante para Desbloquear:",

    tabDeposit: "Depósito Instantáneo (USDT)",
    tabWithdraw: "Retirar Fondos",
    tabHistory: "Historial de Transacciones",

    presetsTitle: "Elige un paquete de depósito rápido o ingresa un monto personalizado:",
    presetStarter: "Paquete Inicial ⚡",
    presetQuick: "Duelo Rápido ⚔️",
    presetPopular: "Más Popular 🔥",
    presetTournaments: "Pro de Torneos 🏆",
    presetElite: "Campeón Élite 💎",
    presetMaster: "Maestro del Duelo 🌟",
    presetArena: "Amo de la Arena 🛡️",
    presetVip: "Leyenda VIP 👑",
    presetWhaleSilver: "Tiburón de Plata 🦈",
    presetWhaleGold: "Ballena Dorada 🐋",

    badgeStarter: "INICIO",
    badgePopular: "POPULAR",
    badgeElite: "ÉLITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "O escribe cualquier monto personalizado para depositar (USDT):",
    customAmountPlaceholder: "Ingresa un monto personalizado (ej. 75)...",
    customAmountMinHint: "El depósito mínimo es de 5.00 USDT.",
    customSelectedPreview: "Monto seleccionado: {amount} USDT",

    benefitFee: "Comisión de depósito del 0% (Sin deducciones)",
    benefitInstant: "Acreditación instantánea tras 1 confirmación",
    benefitOxaPay: "100% Cifrado y Seguro con OxaPay",

    networkTitle: "Selecciona tu red de transferencia preferida:",
    trc20Name: "USDT - TRC20",
    trc20Chain: "Red Tron",
    trc20Badge: "Recomendado · Más Rápido",
    trc20Speed: "Confirmación instantánea (~1 min)",
    trc20Fee: "Tarifa de retiro: 1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Tarifa de Red Ultra Baja",
    bep20Speed: "Confirmación estándar (~15 seg)",
    bep20Fee: "Tarifa de retiro: solo 0.25 USDT",

    networkSelected: "✓ Seleccionado",

    permanentWalletBadge: "Billetera permanente dedicada para tu cuenta (Nunca expira)",
    qrReady: "Listo para transferir",
    qrGenerating: "Generando dirección...",
    connectingOxaPay: "Conectando con la pasarela OxaPay...",
    copy: "Copiar",
    copied: "¡Copiado!",
    safeDepositTitle: "Instrucciones de Depósito Seguro:",
    safeDepositBody: (net: string) =>
      `Esta dirección está dedicada a tu cuenta y es permanente. Puedes transferir fondos en cualquier momento desde cualquier billetera o exchange (Binance, TrustWallet, OKX, etc.) mediante (${net}). El depósito mínimo es de 5.00 USDT. Se acreditará automáticamente en tu saldo una vez confirmado en la blockchain.`,

    withdrawEligibleLabel: "Saldo Elegible para Retiro Inmediato:",
    totalBalancePrefix: "Saldo Total en Billetera: ",
    selectRecipientNetwork: "Selecciona la red de recepción:",
    withdrawMinAlert: (amount: string) =>
      `El retiro mínimo es de 10.00 USDT. Tu saldo retirable ($${amount} USDT) está por debajo del límite. Juega partidas para desbloquear tus fondos.`,
    recipientAddressLabel: (net: string) => `Dirección de tu billetera (${net}):`,
    invalidAddressAlert: (net: string) => `Advertencia: Formato de dirección no válido para ${net}`,
    withdrawAmountLabel: "Monto a Retirar (USDT):",
    maxAvailable: "Máximo Disponible:",
    minWithdrawPlaceholder: "Mínimo 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `El monto solicitado ($${req}) excede tu saldo retirable ($${max} USDT).`,

    summaryRequested: "Monto Solicitado:",
    summaryPlatformFee: "Comisión de Plataforma:",
    summaryFree: "Gratis (0%)",
    summaryNetworkFee: "Tarifa de Red (OxaPay):",
    summaryNetReceive: "Monto Neto que Recibirás:",
    submitWithdrawBtn: "Confirmar Solicitud de Retiro",
    submittingWithdraw: "Enviando solicitud a la pasarela...",

    historyTitle: "Transacciones Contables Completadas y Pendientes",
    historyEmpty: "No hay transacciones registradas en tu billetera todavía.",
    thType: "Tipo",
    thNetwork: "Red",
    thAmount: "Monto",
    thAddress: "Identificador / Dirección",
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
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "Retraits automatisés instantanés 24/7",
    totalBalanceLabel: "Solde Réel Total",
    availableLabel: "Disponible pour les Duels",
    availableSub: "Prêt pour les matchs immédiatement",
    lockedLabel: "En Duels Actifs",
    lockedSub: "Réservé dans des matchs en cours",
    withdrawableLabel: "Éligible au Retrait",
    withdrawableSub: "Gains et fonds débloqués",

    amlTitleReady: "Vous êtes éligible pour retirer l'intégralité de votre solde ! 🎉",
    amlTitlePending: "Roulement des Dépôts et Déblocage (AML)",
    amlDescReady: "Vous avez rempli les conditions de jeu équitable. Tous vos fonds sont débloqués et prêts à être retirés sans restriction.",
    amlDescPending: "Conformément aux réglementations anti-blanchiment (AML), les fonds déposés doivent être misés une fois avant d'être retirés. Montant restant :",
    playNowCta: "Lancer un Duel Maintenant ⚔️",
    amlPlayed: "Misé :",
    amlRemaining: "Restant pour débloquer :",

    tabDeposit: "Dépôt Instantané (USDT)",
    tabWithdraw: "Retirer des Fonds",
    tabHistory: "Historique des Transactions",

    presetsTitle: "Choisissez un forfait de dépôt rapide ou saisissez un montant personnalisé :",
    presetStarter: "Pack Découverte ⚡",
    presetQuick: "Duel Rapide ⚔️",
    presetPopular: "Le Plus Populaire 🔥",
    presetTournaments: "Pro des Tournois 🏆",
    presetElite: "Champion d'Élite 💎",
    presetMaster: "Maître du Duel 🌟",
    presetArena: "Maître de l'Arène 🛡️",
    presetVip: "Légende VIP 👑",
    presetWhaleSilver: "Grand Joueur 🦈",
    presetWhaleGold: "Baleine d'Or 🐋",

    badgeStarter: "DÉPART",
    badgePopular: "POPULAIRE",
    badgeElite: "ÉLITE",
    badgeVip: "VIP",
    badgeWhale: "PREMIUM",

    customAmountLabel: "Ou entrez un montant personnalisé à déposer (USDT) :",
    customAmountPlaceholder: "Entrez un montant personnalisé (ex. 75)...",
    customAmountMinHint: "Le dépôt minimum est de 5.00 USDT.",
    customSelectedPreview: "Montant sélectionné : {amount} USDT",

    benefitFee: "Frais de dépôt de 0% (Aucune déduction)",
    benefitInstant: "Crédit instantané après 1 confirmation blockchain",
    benefitOxaPay: "100% Chiffré et Sécurisé par OxaPay",

    networkTitle: "Sélectionnez votre réseau de transfert préféré :",
    trc20Name: "USDT - TRC20",
    trc20Chain: "Réseau Tron",
    trc20Badge: "Recommandé · Le Plus Rapide",
    trc20Speed: "Confirmation instantanée (~1 min)",
    trc20Fee: "Frais de retrait : 1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "Frais de Réseau Ultra Faibles",
    bep20Speed: "Confirmation standard (~15 sec)",
    bep20Fee: "Frais de retrait : 0.25 USDT seulement",

    networkSelected: "✓ Sélectionné",

    permanentWalletBadge: "Portefeuille dédié permanent pour votre compte (N'expire jamais)",
    qrReady: "Prêt pour le transfert",
    qrGenerating: "Génération de l'adresse...",
    connectingOxaPay: "Connexion à la passerelle OxaPay...",
    copy: "Copier",
    copied: "Copié !",
    safeDepositTitle: "Consignes de Dépôt Sécurisé :",
    safeDepositBody: (net: string) =>
      `Cette adresse est dédiée à votre compte et permanente. Vous pouvez y transférer des fonds à tout moment depuis n'importe quel portefeuille ou exchange (Binance, TrustWallet, OKX, etc.) via (${net}). Le dépôt minimum est de 5.00 USDT. Votre solde sera crédité automatiquement dès confirmation sur la blockchain.`,

    withdrawEligibleLabel: "Solde Retirable Immédiatement :",
    totalBalancePrefix: "Solde Total du Portefeuille : ",
    selectRecipientNetwork: "Sélectionnez le réseau de réception :",
    withdrawMinAlert: (amount: string) =>
      `Le retrait minimum est de 10.00 USDT. Votre solde retirable ($${amount} USDT) est inférieur au seuil. Jouez des matchs pour débloquer vos dépôts.`,
    recipientAddressLabel: (net: string) => `Adresse de votre portefeuille (${net}) :`,
    invalidAddressAlert: (net: string) => `Attention : Format d'adresse invalide pour ${net}`,
    withdrawAmountLabel: "Montant à Retirer (USDT) :",
    maxAvailable: "Maximum Disponible :",
    minWithdrawPlaceholder: "Min 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `Le montant demandé ($${req}) dépasse votre solde retirable ($${max} USDT).`,

    summaryRequested: "Montant Demandé :",
    summaryPlatformFee: "Frais de Plateforme :",
    summaryFree: "Gratuit (0%)",
    summaryNetworkFee: "Frais de Réseau (OxaPay) :",
    summaryNetReceive: "Montant Net que Vous Recevrez :",
    submitWithdrawBtn: "Confirmer la Demande de Retrait",
    submittingWithdraw: "Envoi de la demande à la passerelle...",

    historyTitle: "Transactions Comptables Terminées et en Attente",
    historyEmpty: "Aucune transaction enregistrée dans votre portefeuille pour le moment.",
    thType: "Type",
    thNetwork: "Réseau",
    thAmount: "Montant",
    thAddress: "Identifiant / Adresse",
    thStatus: "Statut",
    thDate: "Date",
    txDeposit: "Dépôt",
    txWithdraw: "Retrait",
    statusConfirmed: "Confirmé",
    statusPending: "En Cours",
    timeRecently: "Récemment",
    txNoticeSuccess: "Demande de retrait transmise avec succès et en file d'attente pour signature automatique.",
  },

  hi: {
    heading: "वित्तीय वॉलेट",
    subhead: "वास्तविक शेष राशि और लाइव ब्लॉकचेन लेज़र लेखांकन।",
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "तत्काल 24/7 स्वचालित निकासी",
    totalBalanceLabel: "कुल वास्तविक शेष राशि",
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

    tabDeposit: "तत्काल जमा (USDT)",
    tabWithdraw: "राशि निकालें",
    tabHistory: "लेज़र लेनदेन",

    presetsTitle: "त्वरित जमा पैकेज चुनें या कोई भी राशि दर्ज करें:",
    presetStarter: "शुरुआती पैक ⚡",
    presetQuick: "त्वरित द्वंद्व ⚔️",
    presetPopular: "सर्वाधिक लोकप्रिय 🔥",
    presetTournaments: "टूर्नामेंट प्रो 🏆",
    presetElite: "एलीट चैंपियन 💎",
    presetMaster: "मास्टर खिलाड़ी 🌟",
    presetArena: "अखाड़ा चैंपियन 🛡️",
    presetVip: "लीजेंड वीआईपी 👑",
    presetWhaleSilver: "सिल्वर व्हेल 🦈",
    presetWhaleGold: "गोल्डन व्हेल 🐋",

    badgeStarter: "शुरुआत",
    badgePopular: "लोकप्रिय",
    badgeElite: "एलीट",
    badgeVip: "VIP",
    badgeWhale: "प्रीमियम",

    customAmountLabel: "या अपनी पसंद की कोई भी राशि दर्ज करें (USDT):",
    customAmountPlaceholder: "कस्टम राशि दर्ज करें (उदा. 75)...",
    customAmountMinHint: "न्यूनतम जमा राशि 5.00 USDT है।",
    customSelectedPreview: "चयनित जमा राशि: {amount} USDT",

    benefitFee: "0% जमा शुल्क (कोई कटौती नहीं)",
    benefitInstant: "1 ब्लॉक पुष्टि के बाद तुरंत क्रेडिट",
    benefitOxaPay: "100% एन्क्रिप्टेड और OxaPay द्वारा सुरक्षित",

    networkTitle: "अपना पसंदीदा ट्रांसफर नेटवर्क चुनें:",
    trc20Name: "USDT - TRC20",
    trc20Chain: "Tron Network",
    trc20Badge: "अनुशंसित · सबसे तेज़",
    trc20Speed: "तत्काल पुष्टि (~1 मिनट)",
    trc20Fee: "निकासी शुल्क: 1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "BNB Smart Chain (BSC)",
    bep20Badge: "अत्यधिक कम गैस शुल्क",
    bep20Speed: "मानक पुष्टि (~15 सेकंड)",
    bep20Fee: "निकासी शुल्क: केवल 0.25 USDT",

    networkSelected: "✓ चयनित",

    permanentWalletBadge: "आपके खाते के लिए समर्पित स्थायी वॉलेट पता (कभी समाप्त नहीं होता)",
    qrReady: "स्थानांतरण के लिए तैयार",
    qrGenerating: "पता उत्पन्न हो रहा है...",
    connectingOxaPay: "OxaPay गेटवे से कनेक्ट हो रहा है...",
    copy: "कॉपी करें",
    copied: "कॉपी हो गया!",
    safeDepositTitle: "सुरक्षित जमा निर्देश:",
    safeDepositBody: (net: string) =>
      `यह पता आपके खाते के लिए समर्पित और स्थायी है। आप किसी भी वॉलेट या एक्सचेंज (Binance, TrustWallet, OKX, आदि) से (${net}) के माध्यम से कभी भी ट्रांसफर कर सकते हैं। न्यूनतम जमा 5.00 USDT है। ब्लॉकचेन पर पुष्टि होते ही राशि स्वचालित रूप से आपके खाते में आ जाएगी।`,

    withdrawEligibleLabel: "तत्काल निकासी योग्य शेष राशि:",
    totalBalancePrefix: "वॉलेट में कुल शेष राशि: ",
    selectRecipientNetwork: "प्राप्तकर्ता नेटवर्क चुनें:",
    withdrawMinAlert: (amount: string) =>
      `न्यूनतम निकासी 10.00 USDT है। आपकी निकासी योग्य राशि ($${amount} USDT) सीमा से कम है। राशि अनलॉक करने के लिए मैच खेलें।`,
    recipientAddressLabel: (net: string) => `आपका प्राप्तकर्ता वॉलेट पता (${net}):`,
    invalidAddressAlert: (net: string) => `चेतावनी: ${net} के लिए पते का प्रारूप अमान्य है`,
    withdrawAmountLabel: "निकासी राशि (USDT):",
    maxAvailable: "अधिकतम उपलब्ध:",
    minWithdrawPlaceholder: "न्यूनतम 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `अनुरोधित राशि ($${req}) आपकी निकासी योग्य राशि ($${max} USDT) से अधिक है।`,

    summaryRequested: "अनुरोधित निकासी राशि:",
    summaryPlatformFee: "प्लेटफ़ॉर्म शुल्क:",
    summaryFree: "मुफ़्त (0%)",
    summaryNetworkFee: "नेटवर्क ट्रांसफर शुल्क (OxaPay):",
    summaryNetReceive: "आपके वॉलेट में प्राप्त होने वाली शुद्ध राशि:",
    submitWithdrawBtn: "तत्काल निकासी की पुष्टि करें",
    submittingWithdraw: "गेटवे पर अनुरोध भेजा जा रहा है...",

    historyTitle: "पूर्ण और लंबित लेज़र लेनदेन",
    historyEmpty: "आपके वॉलेट में अभी तक कोई लेनदेन दर्ज नहीं है।",
    thType: "प्रकार",
    thNetwork: "नेटवर्क",
    thAmount: "राशि",
    thAddress: "पहचानकर्ता / पता",
    thStatus: "स्थिति",
    thDate: "तारीख",
    txDeposit: "जमा",
    txWithdraw: "निकासी",
    statusConfirmed: "पुष्टि हुई",
    statusPending: "प्रक्रिया में",
    timeRecently: "हाल ही में",
    txNoticeSuccess: "निकासी अनुरोध सफलतापूर्वक सबमिट हो गया है और स्वचालित हस्ताक्षर की कतार में है।",
  },

  zh: {
    heading: "资金钱包",
    subhead: "真实账户余额与加密账本实时对账。",
    peggedRate: "1.00 USDT = $1.00 USD",
    instantPayoutBadge: "全天候 24/7 极速自动化提现",
    totalBalanceLabel: "实际总余额",
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

    tabDeposit: "极速充值 (USDT)",
    tabWithdraw: "提现资金",
    tabHistory: "账本流水记录",

    presetsTitle: "选择快速充值档位或输入自定义金额：",
    presetStarter: "新手起航 ⚡",
    presetQuick: "快速对决 ⚔️",
    presetPopular: "最受欢迎 🔥",
    presetTournaments: "锦标赛专家 🏆",
    presetElite: "精英冠军 💎",
    presetMaster: "大师玩家 🌟",
    presetArena: "竞技场主 🛡️",
    presetVip: "传奇 VIP 👑",
    presetWhaleSilver: "银牌巨鲸 🦈",
    presetWhaleGold: "金牌巨鲸 🐋",

    badgeStarter: "起步",
    badgePopular: "热门",
    badgeElite: "精英",
    badgeVip: "VIP",
    badgeWhale: "尊享",

    customAmountLabel: "或输入您想要充值的自定义金额 (USDT)：",
    customAmountPlaceholder: "输入任意金额 (如 75)...",
    customAmountMinHint: "最低充值金额为 5.00 USDT。",
    customSelectedPreview: "已选充值金额：{amount} USDT",

    benefitFee: "0% 充值手续费（无任何扣除）",
    benefitInstant: "区块链 1 次确认后即刻到账",
    benefitOxaPay: "由 OxaPay 网关提供 100% 加密与安全保障",

    networkTitle: "选择您的首选转账网络：",
    trc20Name: "USDT - TRC20",
    trc20Chain: "波场 Tron Network",
    trc20Badge: "官方推荐 · 极速秒到",
    trc20Speed: "即时确认 (~1分钟)",
    trc20Fee: "提现手续费：1.00 USDT",

    bep20Name: "USDT - BEP20",
    bep20Chain: "币安智能链 BNB Chain (BSC)",
    bep20Badge: "超低网络燃料费",
    bep20Speed: "标准确认 (~15秒)",
    bep20Fee: "提现手续费：仅 0.25 USDT",

    networkSelected: "✓ 已选择",

    permanentWalletBadge: "账户专属永久固定充值地址（永不过期）",
    qrReady: "准备转账",
    qrGenerating: "正在生成专属地址...",
    connectingOxaPay: "正在连接 OxaPay 网关...",
    copy: "复制",
    copied: "已复制！",
    safeDepositTitle: "安全充值须知：",
    safeDepositBody: (net: string) =>
      `此地址为您账户专属的永久地址，永不变更。您可随时从任何钱包或交易所（Binance、TrustWallet、OKX 等）通过 (${net}) 网络转入。最低充值 5.00 USDT。链上确认后资金将自动计入您的账户。`,

    withdrawEligibleLabel: "当前可立即提现金额：",
    totalBalancePrefix: "钱包总资产：",
    selectRecipientNetwork: "选择收款网络：",
    withdrawMinAlert: (amount: string) =>
      `最低提现金额为 10.00 USDT。您当前的可提现金额 ($${amount} USDT) 低于最低门槛。请使用充值金额参与比赛对决以解锁提现。`,
    recipientAddressLabel: (net: string) => `您的收款钱包地址 (${net})：`,
    invalidAddressAlert: (net: string) => `警告：地址格式与 ${net} 网络不匹配`,
    withdrawAmountLabel: "提现金额 (USDT)：",
    maxAvailable: "最大可提现：",
    minWithdrawPlaceholder: "最低 10.00 USDT",
    amountExceedsError: (req: string, max: string) =>
      `申请金额 ($${req}) 超出可提现额度 ($${max} USDT)。`,

    summaryRequested: "申请提现金额：",
    summaryPlatformFee: "平台手续费：",
    summaryFree: "免费 (0%)",
    summaryNetworkFee: "网络转账费 (OxaPay)：",
    summaryNetReceive: "预计实际到账金额：",
    submitWithdrawBtn: "确认申请即时提现",
    submittingWithdraw: "正在提交至网关...",

    historyTitle: "已完成与进行中的账本交易流水",
    historyEmpty: "您的钱包暂无任何交易流水记录。",
    thType: "交易类型",
    thNetwork: "网络",
    thAmount: "金额",
    thAddress: "标识 / 地址",
    thStatus: "状态",
    thDate: "日期",
    txDeposit: "充值",
    txWithdraw: "提现",
    statusConfirmed: "已确认",
    statusPending: "处理中",
    timeRecently: "刚刚",
    txNoticeSuccess: "提现申请已成功提交，正在排队等待自动化签名出款。",
  },
};
