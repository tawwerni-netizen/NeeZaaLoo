"use client";

import { Logo } from "./Logo";
import { LocaleLink } from "./LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./Footer.module.css";

const FOOTER_I18N = {
  brandDesc: {
    ar: "منصة نيزالو (NIZALO) — الساحة الأولى للرياضات الذهنية التنافسية وألعاب الطاولة الذكية في العالم العربي والشرق الأوسط. منافسات عادلة، جوائز فورية، وبيئة لعب آمنة ومحمية بالكامل.",
    en: "NIZALO — The premier mind sports and competitive tabletop gaming platform in the MENA region. Fair competition, instant USDT payouts, and encrypted integrity.",
    es: "NIZALO — La plataforma líder de deportes mentales y juegos de mesa competitivos. Competencia justa, pagos inmediatos en USDT y total integridad.",
    fr: "NIZALO — La plateforme de référence pour les sports cérébraux et les jeux de plateau compétitifs. Compétition équitable, paiements USDT instantanés et intégrité totale.",
    hi: "NIZALO — माइंड स्पोर्ट्स और प्रतिस्पर्धी टेबलटॉप गेमिंग का प्रमुख मंच। निष्पक्ष प्रतियोगिता, तत्काल USDT भुगतान और पूर्ण अखंडता।",
    zh: "NIZALO — 顶尖智力竞技与桌游对战综合平台。公平竞技、秒级 USDT 结算与权威加密防护。",
  },
  fairPlay: {
    ar: "لعب عادل ومشفر",
    en: "Fair Play Verified",
    es: "Juego Limpio Verificado",
    fr: "Jeu Équitable Vérifié",
    hi: "सत्यापित निष्पक्ष खेल",
    zh: "可验证公平竞技",
  },
  instantPayouts: {
    ar: "سحب فوري USDT",
    en: "Instant Payouts",
    es: "Pagos Instantáneos",
    fr: "Paiements Instantanés",
    hi: "त्वरित भुगतान",
    zh: "即时秒级提现",
  },
  colArena: {
    ar: "ساحة الألعاب",
    en: "Game Arena",
    es: "Arena de Juegos",
    fr: "Arène de Jeux",
    hi: "खेल अखाड़ा",
    zh: "游戏竞技场",
  },
  gameChess: {
    ar: "الشطرنج الكلاسيكي",
    en: "Chess Arena",
    es: "Ajedrez Clásico",
    fr: "Échecs Classiques",
    hi: "क्लासिक शतरंज",
    zh: "国际象棋",
  },
  gameDominoes: {
    ar: "الدومينو التنافسية",
    en: "Dominoes",
    es: "Dominó Competitivo",
    fr: "Dominos Compétitifs",
    hi: "प्रतिस्पर्धी डोमिनोज़",
    zh: "多米诺骨牌",
  },
  gameLudo: {
    ar: "لودو الأساطير",
    en: "Ludo Legends",
    es: "Ludo de Leyendas",
    fr: "Ludo des Légendes",
    hi: "लूडो लीजेंड्स",
    zh: "传奇飞行棋",
  },
  gameBackgammon: {
    ar: "طاولة الزهر",
    en: "Backgammon",
    es: "Backgammon",
    fr: "Backgammon",
    hi: "बैकगैमौन",
    zh: "双陆棋",
  },
  gameXo: {
    ar: "إكس أو والسرعة",
    en: "Tic-Tac-Toe Blitz",
    es: "Tres en Raya Rápido",
    fr: "Morpion Éclair",
    hi: "टिक-टैक-टो ब्लिट्ज",
    zh: "XO 极速对决",
  },
  allGames: {
    ar: "جميع ألعاب المنصة",
    en: "Browse All Games",
    es: "Explorar Todos los Juegos",
    fr: "Tous les Jeux",
    hi: "सभी खेल देखें",
    zh: "浏览全部游戏",
  },
  colTournaments: {
    ar: "البطولات والمجتمع",
    en: "Tournaments & Live",
    es: "Torneos y En Vivo",
    fr: "Tournois et Direct",
    hi: "टूर्नामेंट और लाइव",
    zh: "锦标赛与直播",
  },
  tournaments: {
    ar: "بطولات الكؤوس الكبرى",
    en: "Championships",
    es: "Campeonatos",
    fr: "Championnats",
    hi: "चैंपियनशिप",
    zh: "大奖锦标赛",
  },
  liveWatch: {
    ar: "البث المباشر للنزالات",
    en: "Live Watch Feed",
    es: "Transmisiones en Vivo",
    fr: "Flux en Direct",
    hi: "लाइव मैच देखें",
    zh: "实时对战观摩",
  },
  leaderboard: {
    ar: "لوحة المتصدرين والتصنيف",
    en: "Leaderboards",
    es: "Clasificación",
    fr: "Classements",
    hi: "लीडरबोर्ड",
    zh: "天梯名人堂",
  },
  learn: {
    ar: "أكاديمية التعلم والقواعد",
    en: "Rules & Tactics",
    es: "Reglas y Tácticas",
    fr: "Règles et Tactiques",
    hi: "नियम और रणनीति",
    zh: "战术学院与规则",
  },
  colTrust: {
    ar: "النزاهة والأمان",
    en: "Integrity & Trust",
    es: "Integridad y Confianza",
    fr: "Intégrité et Sécurité",
    hi: "अखंडता और विश्वास",
    zh: "诚信与安全保障",
  },
  fairPlayCharter: {
    ar: "ميثاق اللعب العادل",
    en: "Fair Play Charter",
    es: "Carta de Juego Limpio",
    fr: "Charte du Jeu Équitable",
    hi: "निष्पक्ष खेल चार्टर",
    zh: "公平竞技公约",
  },
  wallet: {
    ar: "المحفظة والسحب الفوري",
    en: "Wallet & Balance",
    es: "Billetera y Saldo",
    fr: "Portefeuille et Solde",
    hi: "वॉलेट और बैलेंस",
    zh: "加密钱包与提现",
  },
  terms: {
    ar: "شروط الخدمة والنزالات",
    en: "Terms of Service",
    es: "Términos del Servicio",
    fr: "Conditions Générales",
    hi: "सेवा की शर्तें",
    zh: "服务与竞技条款",
  },
  privacy: {
    ar: "سياسة الخصوصية والأمان",
    en: "Privacy Policy",
    es: "Política de Privacidad",
    fr: "Politique de Confidentialité",
    hi: "गोपनीयता नीति",
    zh: "隐私安全政策",
  },
  colSupport: {
    ar: "الدعم والجاهزية",
    en: "Support & Status",
    es: "Soporte y Estado",
    fr: "Support et Statut",
    hi: "सहायता और स्थिति",
    zh: "技术支持与状态",
  },
  helpCenter: {
    ar: "مركز المساعدة الفورية",
    en: "Help Center",
    es: "Centro de Ayuda",
    fr: "Centre d'Aide",
    hi: "सहायता केंद्र",
    zh: "在线帮助中心",
  },
  systemStatus: {
    ar: "الخوادم تعمل بكفاءة 100%",
    en: "All Systems Operational",
    es: "Todos los Sistemas Operativos",
    fr: "Tous les Systèmes Opérationnels",
    hi: "सभी प्रणालियाँ चालू हैं",
    zh: "全线服务器稳定运行 100%",
  },
  settlementLabel: {
    ar: "وسائل التسوية المالية المعتمدة:",
    en: "Settlement & Currency:",
    es: "Métodos de Liquidación:",
    fr: "Modes de Règlement :",
    hi: "स्वीकृत भुगतान विधियां:",
    zh: "结算与兑付网络：",
  },
  securityLabel: {
    ar: "تشفير بنكي 256-Bit SSL وشهادة نزاهة عشوائية مشفرة",
    en: "256-Bit SSL Encrypted & Cryptographic Fair Seeding",
    es: "Encriptación SSL de 256 bits y Semilla Criptográfica Justa",
    fr: "Cryptage SSL 256 bits et Intégrité Cryptographique Prouvable",
    hi: "256-बिट एसएसएल एन्क्रिप्टेड और क्रिप्टोग्राफिक निष्पक्षता",
    zh: "256位银行级 SSL 加密与高强度密码学公平种子验证",
  },
  tagline: {
    ar: "صُممت لعقول الأبطال والمنافسة الشريفة.",
    en: "Built for competitive minds.",
    es: "Creado para mentes competitivas.",
    fr: "Conçu pour les esprits compétitifs.",
    hi: "प्रतिस्पर्धी दिमागों के लिए निर्मित।",
    zh: "专为竞技领袖与荣耀对决而生。",
  },
  antiCheat: {
    ar: "مكافحة الغش",
    en: "Anti-Cheat",
    es: "Anti-Trampas",
    fr: "Anti-Triche",
    hi: "एंटी-चीट",
    zh: "反作弊机制",
  },
  privacyShort: {
    ar: "الخصوصية",
    en: "Privacy",
    es: "Privacidad",
    fr: "Confidentialité",
    hi: "गोपनीयता",
    zh: "隐私政策",
  },
};

const getFooterText = (entry: Record<string, string>, loc: string): string => {
  return entry[loc] || entry.en || "";
};

export function Footer() {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";

  return (
    <footer className={styles.footer} dir={isRtl ? "rtl" : "ltr"}>
      <div className={`nz-container ${styles.inner}`}>
        {/* Top 5-Column Grid */}
        <div className={styles.topGrid}>
          {/* Column 1: Brand & Story */}
          <div className={styles.brandCol}>
            <Logo variant="wordmark" />
            <p className={styles.brandDesc}>
              {getFooterText(FOOTER_I18N.brandDesc, locale)}
            </p>
            <div className={styles.trustBadgesRow}>
              <span className={styles.trustBadge}>
                <span>🛡️</span>
                <span>{getFooterText(FOOTER_I18N.fairPlay, locale)}</span>
              </span>
              <span className={styles.trustBadge}>
                <span>⚡</span>
                <span>{getFooterText(FOOTER_I18N.instantPayouts, locale)}</span>
              </span>
              <span className={`${styles.trustBadge} ${styles.trustBadge18}`}>
                <span>18+</span>
              </span>
            </div>
          </div>

          {/* Column 2: Competitive Arena */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{getFooterText(FOOTER_I18N.colArena, locale)}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/play/chess">♟️ {getFooterText(FOOTER_I18N.gameChess, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/dominoes">🀄 {getFooterText(FOOTER_I18N.gameDominoes, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/ludo">🎲 {getFooterText(FOOTER_I18N.gameLudo, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/backgammon">🎲 {getFooterText(FOOTER_I18N.gameBackgammon, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/xo">⚔️ {getFooterText(FOOTER_I18N.gameXo, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play">🌐 {getFooterText(FOOTER_I18N.allGames, locale)}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Tournaments & Spectating */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{getFooterText(FOOTER_I18N.colTournaments, locale)}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/tournaments">🏆 {getFooterText(FOOTER_I18N.tournaments, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/watch">📡 {getFooterText(FOOTER_I18N.liveWatch, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/rank">🥇 {getFooterText(FOOTER_I18N.leaderboard, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/learn">📚 {getFooterText(FOOTER_I18N.learn, locale)}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 4: Integrity & Security */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{getFooterText(FOOTER_I18N.colTrust, locale)}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/fair-play">🛡️ {getFooterText(FOOTER_I18N.fairPlayCharter, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/wallet">💳 {getFooterText(FOOTER_I18N.wallet, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/help#terms">📜 {getFooterText(FOOTER_I18N.terms, locale)}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/help#privacy">🔒 {getFooterText(FOOTER_I18N.privacy, locale)}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 5: Support & Server Status */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{getFooterText(FOOTER_I18N.colSupport, locale)}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/help">💬 {getFooterText(FOOTER_I18N.helpCenter, locale)}</LocaleLink>
              </li>
              <li>
                <a href="mailto:support@Nizalo.com">✉️ support@Nizalo.com</a>
              </li>
            </ul>
            <div className={styles.statusIndicator}>
              <span className={styles.statusDot} />
              <span>{getFooterText(FOOTER_I18N.systemStatus, locale)}</span>
            </div>
          </div>
        </div>

        {/* Payment & Security Strip */}
        <div className={styles.paymentStrip}>
          <div className={styles.paymentMethods}>
            <span className={styles.paymentLabel}>
              {getFooterText(FOOTER_I18N.settlementLabel, locale)}
            </span>
            <span className={styles.cryptoBadge}>
              <span>₮</span>
              <span>Tether USDT</span>
            </span>
            <span className={styles.networkPill}>TRC-20</span>
            <span className={styles.networkPill}>ERC-20</span>
            <span className={styles.networkPill}>BEP-20</span>
          </div>

          <div className={styles.securityBadge}>
            <span>🔒</span>
            <span>{getFooterText(FOOTER_I18N.securityLabel, locale)}</span>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Legal Links */}
        <div className={styles.bottomBar}>
          <p className={styles.copy}>
            {t("footer.copyright", { year: String(new Date().getFullYear()) })} — {getFooterText(FOOTER_I18N.tagline, locale)}
          </p>
          <div className={styles.legalLinks}>
            <LocaleLink href="/help#terms">{t("legal.terms_link")}</LocaleLink>
            <LocaleLink href="/help#privacy">{getFooterText(FOOTER_I18N.privacyShort, locale)}</LocaleLink>
            <LocaleLink href="/fair-play">{getFooterText(FOOTER_I18N.antiCheat, locale)}</LocaleLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
