"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useBrand } from "@/lib/brand-context";
import { BRAND_THEMES } from "@/lib/branding";
import { useI18n } from "@/lib/i18n/context";
import { LocaleLink } from "@/components/LocaleLink";
import { B2B_TRANSLATIONS } from "@/lib/b2b-i18n";
import styles from "./B2bPage.module.css";

const GAMES_LIST = [
  { id: "chess", icon: "♟️" },
  { id: "ludo", icon: "🎲" },
  { id: "dominoes", icon: "🀄" },
  { id: "backgammon", icon: "🎲" },
  { id: "checkers", icon: "⚪" },
  { id: "connect-four", icon: "🔴" },
  { id: "reversi", icon: "⚫" },
  { id: "gomoku", icon: "⭕" },
  { id: "xo", icon: "❌" },
  { id: "seega", icon: "🏺" },
  { id: "speed-math", icon: "⚡" },
];

export default function B2bPortalPage() {
  const { branding, currentTheme, updateBranding } = useBrand();
  const { locale } = useI18n();
  const t = (B2B_TRANSLATIONS[locale] || B2B_TRANSLATIONS.en)!;

  const [inquiryName, setInquiryName] = useState("");
  const [inquiryEmail, setInquiryEmail] = useState("");
  const [inquiryTelegram, setInquiryTelegram] = useState("");
  const [inquiryTier, setInquiryTier] = useState("Cloud Turnkey SaaS ($8,500)");
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySubmitted, setInquirySubmitted] = useState(false);
  const [inquiryError, setInquiryError] = useState("");
  const [customBrandInput, setCustomBrandInput] = useState(branding.brandName);

  const handleBrandChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (customBrandInput.trim()) {
      updateBranding({ brandName: customBrandInput.trim() });
    }
  };

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryEmail) return;

    setInquirySubmitting(true);
    setInquiryError("");

    try {
      const res = await fetch("/api/b2b/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inquiryName,
          email: inquiryEmail,
          telegram: inquiryTelegram,
          tier: inquiryTier,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setInquirySubmitted(true);
      } else {
        setInquiryError(data.error || "Failed to submit inquiry. Please try again.");
      }
    } catch {
      setInquiryError("Network error. Please try again or email HHifzy@gmail.com directly.");
    } finally {
      setInquirySubmitting(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <Header />

      <main className={styles.mainContent}>
        {/* 1. Hero Section */}
        <section className={styles.heroSection}>
          <div className={styles.heroBadge} style={{ background: currentTheme.badgeBg, color: currentTheme.badgeText, borderColor: currentTheme.primaryColor }}>
            <span>🏢</span>
            <span>{t.heroBadge}</span>
          </div>

          <h1 className={styles.heroTitle}>{t.heroTitle}</h1>

          <p className={styles.heroSubtitle}>{t.heroSubtitle}</p>

          <div className={styles.heroCtas}>
            <LocaleLink href="/play?demo=1" className={styles.primaryCta} style={{ background: currentTheme.primaryGradient, boxShadow: `0 0 20px ${currentTheme.accentGlow}` }}>
              <span>🚀</span>
              <span>{t.launchDemoBtn}</span>
            </LocaleLink>

            {/* Primary English Architecture PDF */}
            <a href="/platform-architecture.pdf" target="_blank" rel="noopener noreferrer" className={styles.secondaryCta}>
              <span>📐</span>
              <span>{t.archPdfBtn}</span>
            </a>

            {/* Primary English Pitch Deck */}
            <a href="/pitch-deck.pdf" target="_blank" rel="noopener noreferrer" className={styles.secondaryCta}>
              <span>💼</span>
              <span>{t.pitchDeckBtn}</span>
            </a>

            {/* Secondary Arabic Versions */}
            <a href="/platform-architecture-ar.pdf" target="_blank" rel="noopener noreferrer" className={styles.secondaryCta} style={{ fontSize: "0.85rem", opacity: 0.85 }}>
              <span>📄</span>
              <span>{t.archPdfArBtn}</span>
            </a>

            <a href="/pitch-deck-ar.pdf" target="_blank" rel="noopener noreferrer" className={styles.secondaryCta} style={{ fontSize: "0.85rem", opacity: 0.85 }}>
              <span>📊</span>
              <span>{t.pitchDeckArBtn}</span>
            </a>
          </div>
        </section>

        {/* 2. Interactive Theme Showcase Card */}
        <section className={styles.customizerCard} style={{ borderColor: currentTheme.primaryColor }}>
          <div className={styles.customizerHeader}>
            <div>
              <h2 className={styles.cardTitle}>🎨 {t.customizerTitle}</h2>
              <p className={styles.cardDesc}>{t.customizerDesc}</p>
              
              <form onSubmit={handleBrandChange} style={{ display: "flex", gap: "8px", marginTop: "12px", maxWidth: "420px" }}>
                <input
                  type="text"
                  value={customBrandInput}
                  onChange={(e) => setCustomBrandInput(e.target.value)}
                  placeholder={t.brandInputPlaceholder}
                  className={styles.formInput}
                  style={{ flex: 1, padding: "8px 12px", fontSize: "14px" }}
                />
                <button
                  type="submit"
                  className={styles.submitBtn}
                  style={{ background: currentTheme.primaryGradient, padding: "8px 18px", fontSize: "14px", width: "auto" }}
                >
                  {t.applyBrandBtn}
                </button>
              </form>
            </div>
            <div className={styles.brandBadgePreview} style={{ background: currentTheme.primaryGradient }}>
              {branding.brandName}
            </div>
          </div>

          <div className={styles.themesGrid}>
            {Object.values(BRAND_THEMES).map((th) => (
              <button
                key={th.id}
                type="button"
                className={`${styles.themeCard} ${branding.themeId === th.id ? styles.themeCardActive : ""}`}
                style={{ borderColor: branding.themeId === th.id ? th.primaryColor : "rgba(255,255,255,0.1)" }}
                onClick={() => updateBranding({ themeId: th.id })}
              >
                <div className={styles.themeCircle} style={{ background: th.primaryGradient }} />
                <span className={styles.themeCardName}>{locale === "ar" ? th.nameAr : th.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 3. The 11 Production Game Engines */}
        <section className={styles.gamesSection}>
          <div className={styles.sectionHeading}>
            <h2>🎮 {t.gamesHeading}</h2>
            <p>{t.gamesSubheading}</p>
          </div>

          <div className={styles.gamesGrid}>
            {GAMES_LIST.map((g) => {
              const gameData = t.games[g.id] || { name: g.id, desc: "" };
              return (
                <div key={g.id} className={styles.gameCard}>
                  <div className={styles.gameIcon}>{g.icon}</div>
                  <h3 className={styles.gameName}>{gameData.name}</h3>
                  <p className={styles.gameDesc}>{gameData.desc}</p>
                  <div className={styles.gameTags}>
                    <span className={styles.tag}>P2P Real-Time</span>
                    <span className={styles.tag}>AI Bots</span>
                    <span className={styles.tag}>Spectate</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. Core Pillars of the Infrastructure */}
        <section className={styles.pillarsSection}>
          <div className={styles.sectionHeading}>
            <h2>🛡️ {t.pillarsHeading}</h2>
            <p>{t.pillarsSubheading}</p>
          </div>

          <div className={styles.pillarsGrid}>
            <div className={styles.pillarCard}>
              <span className={styles.pillarIcon}>⚖️</span>
              <h3>{t.pillars.ledgerTitle}</h3>
              <p>{t.pillars.ledgerDesc}</p>
            </div>

            <div className={styles.pillarCard}>
              <span className={styles.pillarIcon}>⚡</span>
              <h3>{t.pillars.cashierTitle}</h3>
              <p>{t.pillars.cashierDesc}</p>
            </div>

            <div className={styles.pillarCard}>
              <span className={styles.pillarIcon}>🤖</span>
              <h3>{t.pillars.botsTitle}</h3>
              <p>{t.pillars.botsDesc}</p>
            </div>

            <div className={styles.pillarCard}>
              <span className={styles.pillarIcon}>📱</span>
              <h3>{t.pillars.tgTitle}</h3>
              <p>{t.pillars.tgDesc}</p>
            </div>
          </div>
        </section>

        {/* 5. Commercial Licensing Packages */}
        <section className={styles.pricingSection} id="pricing">
          <div className={styles.sectionHeading}>
            <h2>💎 {t.pricingHeading}</h2>
            <p>{t.pricingSubheading}</p>
          </div>

          <div className={styles.pricingGrid}>
            {/* Tier 1 */}
            <div className={styles.priceCard}>
              <span className={styles.tierBadge}>{t.tiers.tier1Badge}</span>
              <h3 className={styles.tierTitle}>{t.tiers.tier1Title}</h3>
              <div className={styles.tierPrice}>{t.tiers.tier1Price} <span className={styles.pricePeriod}>{t.tiers.tier1Period}</span></div>
              <p className={styles.tierDesc}>{t.tiers.tier1Desc}</p>
              <ul className={styles.tierFeatures}>
                {t.tiers.tier1Features.map((f, i) => (
                  <li key={i}>✅ {f}</li>
                ))}
              </ul>
              <a href="#inquiry" className={styles.tierBtn}>{t.tiers.tier1Btn}</a>
            </div>

            {/* Tier 2 (Featured) */}
            <div className={`${styles.priceCard} ${styles.priceCardFeatured}`} style={{ borderColor: currentTheme.primaryColor }}>
              <div className={styles.popularBadge} style={{ background: currentTheme.primaryGradient }}>
                {locale === "ar" ? "الأكثر طلباً للمشغلين" : "Most Popular"}
              </div>
              <span className={styles.tierBadge}>{t.tiers.tier2Badge}</span>
              <h3 className={styles.tierTitle}>{t.tiers.tier2Title}</h3>
              <div className={styles.tierPrice}>{t.tiers.tier2Price} <span className={styles.pricePeriod}>{t.tiers.tier2Period}</span></div>
              <p className={styles.tierDesc}>{t.tiers.tier2Desc}</p>
              <ul className={styles.tierFeatures}>
                {t.tiers.tier2Features.map((f, i) => (
                  <li key={i}>✅ {f}</li>
                ))}
              </ul>
              <a href="#inquiry" className={styles.tierBtn} style={{ background: currentTheme.primaryGradient }}>{t.tiers.tier2Btn}</a>
            </div>

            {/* Tier 3 */}
            <div className={styles.priceCard}>
              <span className={styles.tierBadge}>{t.tiers.tier3Badge}</span>
              <h3 className={styles.tierTitle}>{t.tiers.tier3Title}</h3>
              <div className={styles.tierPrice}>{t.tiers.tier3Price} <span className={styles.pricePeriod}>{t.tiers.tier3Period}</span></div>
              <p className={styles.tierDesc}>{t.tiers.tier3Desc}</p>
              <ul className={styles.tierFeatures}>
                {t.tiers.tier3Features.map((f, i) => (
                  <li key={i}>✅ {f}</li>
                ))}
              </ul>
              <a href="#inquiry" className={styles.tierBtn}>{t.tiers.tier3Btn}</a>
            </div>
          </div>
        </section>

        {/* 6. Inquiry & Contact Form */}
        <section className={styles.inquirySection} id="inquiry">
          <div className={styles.inquiryCard}>
            <div className={styles.inquiryInfo}>
              <h2>{t.inquiryHeading}</h2>
              <p>{t.inquirySubheading}</p>
              
              <div className={styles.contactDirect}>
                <div className={styles.contactItem}>
                  <span>✉️</span>
                  <span><strong>{locale === "ar" ? "البريد الإلكتروني المباشر:" : "Direct Inquiry Email:"}</strong> HHifzy@gmail.com</span>
                </div>
                <div className={styles.contactItem}>
                  <span>🛡️</span>
                  <span><strong>{locale === "ar" ? "الضمان المالي:" : "Escrow Protection:"}</strong> All enterprise transfers secured via Escrow.com</span>
                </div>
              </div>
            </div>

            <div className={styles.inquiryFormWrap}>
              {inquirySubmitted ? (
                <div className={styles.successState}>
                  <span className={styles.successIcon}>✅</span>
                  <h3>{t.inquirySuccessTitle}</h3>
                  <p>{t.inquirySuccessDesc}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitInquiry} className={styles.inquiryForm}>
                  {inquiryError && (
                    <div style={{ padding: "10px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", fontSize: "14px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                      {inquiryError}
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label>{t.inquiryNameLabel}</label>
                    <input
                      type="text"
                      required
                      value={inquiryName}
                      onChange={(e) => setInquiryName(e.target.value)}
                      placeholder={t.inquiryNamePlaceholder}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t.inquiryEmailLabel}</label>
                    <input
                      type="email"
                      required
                      value={inquiryEmail}
                      onChange={(e) => setInquiryEmail(e.target.value)}
                      placeholder={t.inquiryEmailPlaceholder}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t.inquiryContactLabel}</label>
                    <input
                      type="text"
                      value={inquiryTelegram}
                      onChange={(e) => setInquiryTelegram(e.target.value)}
                      placeholder={t.inquiryContactPlaceholder}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>{t.inquiryTierLabel}</label>
                    <select
                      value={inquiryTier}
                      onChange={(e) => setInquiryTier(e.target.value)}
                      className={styles.formSelect}
                    >
                      <option value="Cloud Turnkey SaaS ($8,500)">{t.tiers.tier1Title} ({t.tiers.tier1Price})</option>
                      <option value="Self-Hosted White-Label ($16,500)">{t.tiers.tier2Title} ({t.tiers.tier2Price})</option>
                      <option value="Full Source Code License ($35,000 - $45,000)">{t.tiers.tier3Title} ({t.tiers.tier3Price})</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={inquirySubmitting}
                    className={styles.submitBtn}
                    style={{ background: currentTheme.primaryGradient, opacity: inquirySubmitting ? 0.7 : 1 }}
                  >
                    {inquirySubmitting ? t.inquirySubmitting : t.inquirySubmitBtn}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
