"use client";

import { Logo } from "./Logo";
import { LocaleLink } from "./LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./Footer.module.css";

export function Footer() {
  const { t, locale } = useI18n();
  const isRtl = locale === "ar";

  return (
    <footer className={styles.footer}>
      <div className={`nz-container ${styles.inner}`}>
        {/* Top 5-Column Grid */}
        <div className={styles.topGrid}>
          {/* Column 1: Brand & Story */}
          <div className={styles.brandCol}>
            <Logo variant="wordmark" />
            <p className={styles.brandDesc}>
              {isRtl
                ? "منصة نيزالو (NIZALO) — الساحة الأولى للرياضات الذهنية التنافسية وألعاب الطاولة الذكية في العالم العربي والشرق الأوسط. منافسات عادلة، جوائز فورية، وبيئة لعب آمنة ومحمية بالكامل."
                : "NIZALO — The premier mind sports and competitive tabletop gaming platform in the MENA region. Fair competition, instant USDT payouts, and encrypted integrity."}
            </p>
            <div className={styles.trustBadgesRow}>
              <span className={styles.trustBadge}>
                <span>🛡️</span>
                <span>{isRtl ? "لعب عادل ومشفر" : "Fair Play Verified"}</span>
              </span>
              <span className={styles.trustBadge}>
                <span>⚡</span>
                <span>{isRtl ? "سحب فوري USDT" : "Instant Payouts"}</span>
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
              <span>{isRtl ? "ساحة الألعاب" : "Game Arena"}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/play/chess">♟️ {isRtl ? "الشطرنج الكلاسيكي" : "Chess Arena"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/backgammon">🎲 {isRtl ? "طاولة الزهر" : "Backgammon"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/dominoes">🀄 {isRtl ? "الدومينو التنافسية" : "Dominoes"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play/xo">⚔️ {isRtl ? "إكس أو والسرعة" : "Tic-Tac-Toe"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/play">🌐 {isRtl ? "جميع ألعاب المنصة" : "Browse All Games"}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Tournaments & Spectating */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{isRtl ? "البطولات والمجتمع" : "Tournaments & Live"}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/tournaments">🏆 {isRtl ? "بطولات الكؤوس الكبرى" : "Championships"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/watch">📡 {isRtl ? "البث المباشر للنزالات" : "Live Watch Feed"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/rank">🥇 {isRtl ? "لوحة المتصدرين والتصنيف" : "Leaderboards"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/learn">📚 {isRtl ? "أكاديمية التعلم والقواعد" : "Rules & Tactics"}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 4: Integrity & Security */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{isRtl ? "النزاهة والأمان" : "Integrity & Trust"}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/fair-play">🛡️ {isRtl ? "ميثاق اللعب العادل" : "Fair Play Charter"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/wallet">💳 {isRtl ? "المحفظة والسحب الفوري" : "Wallet & Balance"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/help#terms">📜 {isRtl ? "شروط الخدمة والنزالات" : "Terms of Service"}</LocaleLink>
              </li>
              <li>
                <LocaleLink href="/help#privacy">🔒 {isRtl ? "سياسة الخصوصية والأمان" : "Privacy Policy"}</LocaleLink>
              </li>
            </ul>
          </div>

          {/* Column 5: Support & Server Status */}
          <div className={styles.col}>
            <div className={styles.colTitle}>
              <span className={styles.colTitleDot} />
              <span>{isRtl ? "الدعم والجاهزية" : "Support & Status"}</span>
            </div>
            <ul className={styles.linkList}>
              <li>
                <LocaleLink href="/help">💬 {isRtl ? "مركز المساعدة الفورية" : "Help Center"}</LocaleLink>
              </li>
              <li>
                <a href="mailto:support@nizalo.com">✉️ support@nizalo.com</a>
              </li>
            </ul>
            <div className={styles.statusIndicator}>
              <span className={styles.statusDot} />
              <span>{isRtl ? "الخوادم تعمل بكفاءة 100%" : "All Systems Operational"}</span>
            </div>
          </div>
        </div>

        {/* Payment & Security Strip */}
        <div className={styles.paymentStrip}>
          <div className={styles.paymentMethods}>
            <span className={styles.paymentLabel}>
              {isRtl ? "وسائل التسوية المالية المعتمدة:" : "Settlement & Currency:"}
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
            <span>{isRtl ? "تشفير بنكي 256-Bit SSL وشهادة نزاهة عشوائية مشفرة" : "256-Bit SSL Encrypted & Cryptographic Fair Seeding"}</span>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Legal Links */}
        <div className={styles.bottomBar}>
          <p className={styles.copy}>
            {t("footer.copyright", { year: String(new Date().getFullYear()) })} — {isRtl ? "صُممت لعقول الأبطال والمنافسة الشريفة." : "Built for competitive minds."}
          </p>
          <div className={styles.legalLinks}>
            <LocaleLink href="/help#terms">{t("legal.terms_link")}</LocaleLink>
            <LocaleLink href="/help#privacy">{isRtl ? "الخصوصية" : "Privacy"}</LocaleLink>
            <LocaleLink href="/fair-play">{isRtl ? "مكافحة الغش" : "Anti-Cheat"}</LocaleLink>
          </div>
        </div>
      </div>
    </footer>
  );
}

