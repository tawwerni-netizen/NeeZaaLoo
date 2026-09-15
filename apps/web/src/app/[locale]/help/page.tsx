"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post, ApiError } from "@/lib/api";
import { getPoliciesForLocale, getPolicyDetail, type PolicyItem } from "@/lib/legal/policies-data";
import { getFaqsForLocale, type FAQItem } from "@/lib/faq/faq-data";
import styles from "./help.module.css";

type SupportConfig = {
  ok: boolean;
  phone: string;
  email: string;
  updated_at?: string;
};

type LegalPolicy = {
  identifier: string;
  version: string;
  title: string;
  is_mandatory: boolean;
  effective_at: string;
};

type LegalSectionStrings = {
  heading: string;
  description: string;
  viewDocument: string;
  close: string;
  print: string;
  version: string;
  lastUpdated: string;
};

const DEFAULT_LEGAL_TEXT: LegalSectionStrings = {
  heading: "Official Platform Policies & Terms",
  description: "Nizalo operates under counsel-ready compliance terms, fair play frameworks, and clear withdrawal policies.",
  viewDocument: "Read Full Document →",
  close: "Close Document",
  print: "Print Document",
  version: "Version",
  lastUpdated: "Effective Date"
};

type HelpI18nStrings = {
  heroBadge: string;
  securitySubtext: string;
  faqHeading: string;
  articleLabel: string;
  noArticles: string;
  resetFilters: string;
};

const HELP_I18N: Record<string, HelpI18nStrings> = {
  ar: {
    heroBadge: "قاعدة المعرفة ومركز الدعم",
    securitySubtext: "فريق الدعم الفني لا يملك صلاحية تعديل أرصدة المحفظة أو تغيير نتائج المباريات أو تجاوز التحقق البلوكتشيني.",
    faqHeading: "الأسئلة الأكثر شيوعاً",
    articleLabel: "مقال / إجابة",
    noArticles: "لم يتم العثور على مقالات تطابق",
    resetFilters: "إعادة ضبط التصفية",
  },
  en: {
    heroBadge: "Knowledge Base & Support",
    securitySubtext: "Support representatives cannot modify wallet balances, alter match outcomes, or bypass blockchain verification.",
    faqHeading: "Frequently Asked Questions",
    articleLabel: "articles",
    noArticles: "No help articles found matching",
    resetFilters: "Reset Filters",
  },
  zh: {
    heroBadge: "知识库与支持中心",
    securitySubtext: "客服代表无权修改钱包余额、更改对局结果或绕过区块链验证。",
    faqHeading: "常见问题解答",
    articleLabel: "篇文章",
    noArticles: "未找到匹配的文章",
    resetFilters: "重置筛选",
  },
  es: {
    heroBadge: "Base de Conocimiento y Soporte",
    securitySubtext: "Los representantes de soporte no pueden modificar saldos de billetera, alterar resultados de partidas ni omitir la verificación en blockchain.",
    faqHeading: "Preguntas Frecuentes",
    articleLabel: "artículos",
    noArticles: "No se encontraron artículos que coincidan con",
    resetFilters: "Restablecer Filtros",
  },
  fr: {
    heroBadge: "Base de Connaissances et Support",
    securitySubtext: "Les agents du support ne peuvent pas modifier les soldes de portefeuille, altérer les résultats de match ou contourner la vérification blockchain.",
    faqHeading: "Foire Aux Questions",
    articleLabel: "articles",
    noArticles: "Aucun article trouvé correspondant à",
    resetFilters: "Réinitialiser les Filtres",
  },
  hi: {
    heroBadge: "ज्ञानकोष एवं सहायता केंद्र",
    securitySubtext: "सहायता प्रतिनिधि वॉलेट बैलेंस संशोधित नहीं कर सकते, मैच परिणाम नहीं बदल सकते या ब्लॉकचेन सत्यापन को बायपास नहीं कर सकते।",
    faqHeading: "अक्सर पूछे जाने वाले प्रश्न",
    articleLabel: "लेख",
    noArticles: "से मेल खाने वाले कोई लेख नहीं मिले",
    resetFilters: "फ़िल्टर रीसेट करें",
  },
};

const LEGAL_SECTION_TEXT: Record<string, LegalSectionStrings> = {
  ar: {
    heading: "السياسات والشروط الرسمية للمنصة",
    description: "تعمل منصة Nizalo وفق أطر امتثال قانونية معتمدة، وميثاق لعب نظيف صارم، وسياسات واضحة للسحب والإيداع والخزينة.",
    viewDocument: "عرض الوثيقة الرسمية ←",
    close: "إغلاق النافذة",
    print: "طباعة الوثيقة",
    version: "الإصدار المعتمد",
    lastUpdated: "تاريخ السريان"
  },
  en: {
    heading: "Official Platform Policies & Terms",
    description: "Nizalo operates under counsel-ready compliance terms, fair play frameworks, and clear withdrawal policies.",
    viewDocument: "Read Full Document →",
    close: "Close Document",
    print: "Print Document",
    version: "Version",
    lastUpdated: "Effective Date"
  },
  zh: {
    heading: "官方平台政策与法律条款",
    description: "Nizalo 遵循合规法律条款、公平竞赛守则与透明的资金管理规范。",
    viewDocument: "阅读完整条款 →",
    close: "关闭窗口",
    print: "打印文件",
    version: "版本",
    lastUpdated: "生效日期"
  },
  es: {
    heading: "Políticas Oficiales y Términos de la Plataforma",
    description: "Nizalo opera bajo términos de cumplimiento legal, marcos de juego limpio y políticas claras de retiro.",
    viewDocument: "Leer Política Completa →",
    close: "Cerrar",
    print: "Imprimir Documento",
    version: "Versión",
    lastUpdated: "Fecha de Entrada en Vigor"
  },
  fr: {
    heading: "Politiques Officielles et Conditions de la Plateforme",
    description: "Nizalo fonctionne selon des conditions de conformité légale, des règles de jeu équitable et des politiques de retrait transparentes.",
    viewDocument: "Lire le Document Complet →",
    close: "Fermer",
    print: "Imprimer le Document",
    version: "Version",
    lastUpdated: "Date d'Effet"
  },
  hi: {
    heading: "आधिकारिक प्लेटफ़ॉर्म नीतियां एवं शर्तें",
    description: "Nizalo कानूनी अनुपालन नियमों, निष्पक्ष खेल ढांचे और स्पष्ट निकासी नीतियों के तहत संचालित होता है।",
    viewDocument: "पूर्ण नीति पढ़ें →",
    close: "बंद करें",
    print: "दस्तावेज़ प्रिंट करें",
    version: "संस्करण",
    lastUpdated: "लागू होने की तिथि"
  }
};

const CATEGORY_KEYS = [
  "all",
  "account",
  "login",
  "games",
  "matchmaking",
  "friend_challenges",
  "tournaments",
  "wallet",
  "deposits",
  "withdrawals",
  "usdt",
  "tx_confirmation",
  "security",
  "fair_play",
  "referrals",
  "chat",
  "technical_issues"
] as const;

export default function HelpCenterPage() {
  const { t, locale } = useI18n();
  const isRtl = locale === "ar";
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();

  // State
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>("dep-1");
  const [supportConfig, setSupportConfig] = useState<SupportConfig>({
    ok: true,
    phone: "+2 01069999557",
    email: "support@Nizalo.com"
  });
  const [policies, setPolicies] = useState<LegalPolicy[]>([]);

  // Localized FAQs and Policies
  const currentFaqs = useMemo(() => getFaqsForLocale(locale), [locale]);
  const currentPolicies = useMemo(() => getPoliciesForLocale(locale), [locale]);
  const legalText = useMemo<LegalSectionStrings>(() => LEGAL_SECTION_TEXT[locale] ?? DEFAULT_LEGAL_TEXT, [locale]);
  const helpText = useMemo<HelpI18nStrings>(() => HELP_I18N[locale] ?? HELP_I18N["en"]!, [locale]);

  // Selected Legal Policy for Reader Modal
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const selectedPolicy = useMemo(() => {
    return selectedPolicyId ? getPolicyDetail(selectedPolicyId, locale) : null;
  }, [selectedPolicyId, locale]);

  // Ticket Modal State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("TECHNICAL");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketRefId, setTicketRefId] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccessId, setTicketSuccessId] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Fetch support config & policies
  useEffect(() => {
    let cancelled = false;
    void get<SupportConfig>("/v1/support/config")
      .then((cfg) => { if (!cancelled && cfg?.ok) setSupportConfig(cfg); })
      .catch(() => {});

    void get<{ ok: boolean; policies: LegalPolicy[] }>("/v1/legal/policies")
      .then((res) => { if (!cancelled && res?.ok && Array.isArray(res.policies)) setPolicies(res.policies); })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#terms" || hash === "#terms_of_service") {
        setSelectedPolicyId("terms_of_service");
      }
    }

    return () => { cancelled = true; };
  }, []);

  // Filtered FAQ Items
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return currentFaqs.filter((item) => {
      const matchCategory = activeCategory === "all" || item.category === activeCategory;
      if (!matchCategory) return false;
      if (!q) return true;
      const matchQuestion = item.question.toLowerCase().includes(q);
      const matchAnswer = item.answer.toLowerCase().includes(q);
      const matchTags = item.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchQuestion || matchAnswer || matchTags;
    });
  }, [currentFaqs, activeCategory, searchQuery]);

  // Handle Ticket Submission
  async function handleTicketSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) {
      openPopup();
      return;
    }
    setTicketSubmitting(true);
    setTicketError(null);
    try {
      const res = await post<{ ticketId: string }>("/v1/me/tickets", {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        description: ticketDescription.trim(),
        reference_type: ticketRefId.trim() ? "MANUAL" : null,
        reference_id: ticketRefId.trim() || null
      });
      setTicketSuccessId(res.ticketId);
      setTicketSubject("");
      setTicketDescription("");
      setTicketRefId("");
    } catch (err) {
      if (err instanceof ApiError) {
        setTicketError(err.message);
      } else {
        setTicketError("Failed to submit ticket. Please try again.");
      }
    } finally {
      setTicketSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <Header />

      <main className={`nz-container ${styles.main}`}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeIcon} aria-hidden="true">💡</span>
            <span>{helpText.heroBadge}</span>
          </div>
          <h1 className={styles.title}>{t("help.title")}</h1>
          <p className={styles.subtitle}>{t("help.subtitle")}</p>

          {/* Search Box */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">🔍</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder={t("help.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search help topics"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* Strict Anti-Phishing Security Notice */}
        <section className={styles.securityBanner} role="alert">
          <div className={styles.securitySentinelMedia}>
            <img
              src="/images/security/security-anti-cheat-sentinel.jpg"
              alt="Sentinel Anti-Cheat Security"
              className={styles.securitySentinelImg}
            />
          </div>
          <div className={styles.securityContent}>
            <div className={styles.securityHeaderRow}>
              <span className={styles.securityShieldBadge}>🛡️ NIZALO SENTINEL</span>
              <h2 className={styles.securityTitle}>{t("help.security_notice_title")}</h2>
            </div>
            <p className={styles.securityBody}>{t("help.security_notice_body")}</p>
            <p className={styles.securitySubtext}>
              {helpText.securitySubtext}
            </p>
          </div>
        </section>

        {/* Trust & Authority Strip */}
        <section className={styles.trustStrip}>
          <div className={styles.trustBadge}>
            <span className={styles.trustIcon}>🛡️</span>
            <div>
              <span className={styles.trustTitle}>{isRtl ? "أمان مصرفي مشفر 256-Bit" : "256-Bit Bank Security"}</span>
              <span className={styles.trustDesc}>{isRtl ? "حماية كاملة للبيانات والأرصدة" : "Certified secure infrastructure"}</span>
            </div>
          </div>
          <div className={styles.trustDivider} />
          <div className={styles.trustBadge}>
            <span className={styles.trustIcon}>⚖️</span>
            <div>
              <span className={styles.trustTitle}>{isRtl ? "تحكيم آلي محايد 100%" : "100% Deterministic Engine"}</span>
              <span className={styles.trustDesc}>{isRtl ? "لا مجال للتدخل البشري في النتائج" : "Audited server-clock verification"}</span>
            </div>
          </div>
          <div className={styles.trustDivider} />
          <div className={styles.trustBadge}>
            <span className={styles.trustIcon}>⚡</span>
            <div>
              <span className={styles.trustTitle}>{isRtl ? "سرعة الرد: أقل من 5 دقائق" : "Response Time: < 5 Mins"}</span>
              <span className={styles.trustDesc}>{isRtl ? "دعم مباشر على مدار الساعة" : "24/7 dedicated assistance"}</span>
            </div>
          </div>
        </section>

        {/* Quick Contacts & Actions Bar */}
        <section className={styles.contactBar}>
          <div className={`${styles.contactCard} ${styles.contactCardWhatsApp}`}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.contactIcon} aria-hidden="true">💬</div>
              <span className={styles.onlineBadge}>
                <span className={styles.liveGreenDot} />
                {locale === "ar" ? "متصل الآن للرد الفوري" : "Online - Instant Reply"}
              </span>
            </div>
            <div className={styles.contactInfo}>
              <span className={styles.contactLabel}>
                {locale === "ar" ? "الدعم المباشر عبر واتساب" : "Live WhatsApp Support"}
              </span>
              <span className={styles.contactPhone}>{supportConfig.phone}</span>
            </div>
            <a
              href={`https://wa.me/${supportConfig.phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsAppActionBtn}
            >
              <span>🟢</span> {locale === "ar" ? "تحدث مع الدعم الفني الآن" : "Chat on WhatsApp Now"}
            </a>
          </div>

          <div className={`${styles.contactCard} ${styles.contactCardEmail}`}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.contactIcon} aria-hidden="true">✉️</div>
              <span className={styles.officialBadge}>
                {locale === "ar" ? "⚡ القناة الرسمية" : "⚡ Official Channel"}
              </span>
            </div>
            <div className={styles.contactInfo}>
              <span className={styles.contactLabel}>{t("help.contact_email_label")}</span>
              <span className={styles.contactEmail}>{supportConfig.email}</span>
            </div>
            <a
              href={`mailto:${supportConfig.email}`}
              className={styles.emailActionBtn}
            >
              <span>📨</span> {locale === "ar" ? "إرسال بريد إلكتروني" : "Send an Email"}
            </a>
          </div>

          <div className={styles.contactActionsCard}>
            <div className={styles.ticketCardHeader}>
              <span className={styles.ticketIcon}>🎫</span>
              <h3 className={styles.ticketCardTitle}>{locale === "ar" ? "نظام التذاكر المباشرة" : "Direct Ticket System"}</h3>
            </div>
            <p className={styles.ticketCardDesc}>
              {locale === "ar"
                ? "تتبع طلبك رسمياً عبر لوحة التحكم مع توثيق كامل لكافة الردود."
                : "Official traceable ticketing system linked to your account audit log."}
            </p>
            <div className={styles.ticketBtnRow}>
              <Button
                variant="primary"
                className={styles.ticketCtaBtn}
                onClick={() => {
                  if (!player) {
                    openPopup();
                  } else {
                    setShowTicketModal(true);
                    setTicketSuccessId(null);
                    setTicketError(null);
                  }
                }}
              >
                ➕ {t("help.open_ticket")}
              </Button>

              <LocaleLink href="/support">
                <Button variant="ghost" className={styles.myTicketsBtn}>
                  {t("help.my_tickets")} →
                </Button>
              </LocaleLink>
            </div>
          </div>
        </section>

        {/* Categories Bar */}
        <section className={styles.categoryNav} aria-label="Help categories">
          <div className={styles.categoryScroll}>
            {CATEGORY_KEYS.map((catKey) => {
              const label = catKey === "all"
                ? t("help.all_categories")
                : t(`help.categories.${catKey}`);
              const isSelected = activeCategory === catKey;
              const icon = catKey === "all" ? "🌐" : catKey === "account" ? "👤" : catKey === "wallet" ? "💳" : catKey === "games" ? "🎮" : catKey === "tournaments" ? "🏆" : "📜";

              return (
                <button
                  key={catKey}
                  type="button"
                  className={`${styles.categoryPill} ${isSelected ? styles.categoryPillActive : ""}`}
                  onClick={() => setActiveCategory(catKey)}
                >
                  <span className={styles.catIcon}>{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* FAQ List */}
        <section className={styles.faqSection}>
          <div className={styles.faqHeader}>
            <h2 className={styles.faqHeading}>
              {activeCategory === "all"
                ? helpText.faqHeading
                : t(`help.categories.${activeCategory}`)}
            </h2>
            <span className={styles.faqCount}>
              {filteredFaqs.length} {helpText.articleLabel}
            </span>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>
                {helpText.noArticles} &ldquo;{searchQuery}&rdquo;.
              </p>
              <Button variant="ghost" onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}>
                {helpText.resetFilters}
              </Button>
            </div>
          ) : (
            <div className={styles.faqList}>
              {filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <article
                    key={faq.id}
                    className={`${styles.faqCard} ${isExpanded ? styles.faqCardExpanded : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.faqQuestionBtn}
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className={styles.faqCategoryBadge}>
                        {t(`help.categories.${faq.category}`) || faq.category}
                      </span>
                      <span className={styles.faqQuestionText} dir={locale === "ar" ? "rtl" : "ltr"}>
                        <bdi>{faq.question}</bdi>
                      </span>
                      <span className={styles.faqChevron} aria-hidden="true">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className={styles.faqAnswerBody}>
                        <p className={styles.faqAnswerText} dir={locale === "ar" ? "rtl" : "ltr"}>
                          <bdi>{faq.answer}</bdi>
                        </p>
                        <div className={styles.faqTags}>
                          {faq.tags.map((tag) => (
                            <span key={tag} className={styles.faqTag} dir="ltr">
                              <bdi>#{tag}</bdi>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Legal Policies & Documents Section */}
        <section id="terms" className={styles.legalSection}>
          <div className={styles.legalHeader}>
            <span className={styles.legalIcon} aria-hidden="true">📜</span>
            <h2 className={styles.legalHeading}>{legalText.heading}</h2>
          </div>
          <p className={styles.legalDescription}>
            {legalText.description}
          </p>

          <div className={styles.policiesGrid}>
            {currentPolicies.map((pol) => (
              <div
                key={pol.id}
                className={styles.policyCard}
                onClick={() => setSelectedPolicyId(pol.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPolicyId(pol.id);
                  }
                }}
                aria-label={pol.title}
              >
                <div>
                  <div className={styles.policyCardHeader}>
                    <h3 className={styles.policyCardTitle}>
                      <span aria-hidden="true">{pol.icon}</span>
                      <span>{pol.title}</span>
                    </h3>
                    <span className={styles.policyVersionBadge}>v{pol.version}</span>
                  </div>
                  <p className={styles.policyCardType}>{pol.category}</p>
                  <p className={styles.policyCardSummary}>{pol.summary}</p>
                </div>
                <div className={styles.policyCardAction}>
                  <span>{legalText.viewDocument}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Legal Policy Reader Modal */}
      {selectedPolicy && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-modal-title"
          onClick={() => setSelectedPolicyId(null)}
        >
          <div
            className={styles.policyModalContainer}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.policyModalHeader}>
              <div className={styles.policyModalHeaderLeft}>
                <span className={styles.policyModalIcon} aria-hidden="true">{selectedPolicy.icon}</span>
                <div>
                  <h2 id="policy-modal-title" className={styles.policyModalTitle}>
                    {selectedPolicy.title}
                  </h2>
                  <div className={styles.policyModalMeta}>
                    <span className={styles.policyModalBadge}>{selectedPolicy.category}</span>
                    <span className={styles.policyVersionBadge}>v{selectedPolicy.version}</span>
                    <span className={styles.policyModalDate}>{legalText.lastUpdated}: {selectedPolicy.lastUpdated}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedPolicyId(null)}
                aria-label={legalText.close}
              >
                ✕
              </button>
            </div>

            <div className={styles.policyModalBody}>
              <div className={styles.policyModalSummary}>
                {selectedPolicy.summary}
              </div>

              {selectedPolicy.sections.map((sec, idx) => (
                <article key={idx} className={styles.policySectionBlock}>
                  <h3 className={styles.policySectionTitle}>{sec.title}</h3>
                  {sec.content.map((p, pIdx) => (
                    <p key={pIdx} className={styles.policySectionParagraph}>{p}</p>
                  ))}
                  {sec.callout && (
                    <div className={styles.policyCallout}>
                      {sec.callout}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className={styles.policyModalFooter}>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => window.print()}
                title={legalText.print}
                style={{ fontSize: "0.9rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <span aria-hidden="true">🖨️</span>
                <span>{legalText.print}</span>
              </button>
              <Button
                variant="primary"
                onClick={() => setSelectedPolicyId(null)}
              >
                {legalText.close}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Modal */}
      {showTicketModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
          <div className={styles.modalContainer}>
            <div className={styles.modalHeader}>
              <h2 id="ticket-modal-title" className={styles.modalTitle}>
                {t("help.ticket_modal_title")}
              </h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowTicketModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {ticketSuccessId ? (
              <div className={styles.modalSuccess}>
                <div className={styles.successIcon} aria-hidden="true">✓</div>
                <p className={styles.successText}>{t("help.ticket_success")}</p>
                <div className={styles.successActions}>
                  <LocaleLink href={`/support/${ticketSuccessId}`}>
                    <Button variant="primary">{t("help.ticket_view_cta", { id: ticketSuccessId.slice(0, 8) })}</Button>
                  </LocaleLink>
                  <Button variant="ghost" onClick={() => setShowTicketModal(false)}>
                    {t("help.ticket_close_cta")}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTicketSubmit} className={styles.ticketForm}>
                <div className={styles.formAlert}>
                  <span>{t("help.ticket_strict_warning")}</span>
                </div>

                {ticketError && (
                  <div className={styles.formError} role="alert">
                    {ticketError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-category">
                    {t("help.ticket_category_label")}
                  </label>
                  <select
                    id="ticket-category"
                    className={styles.formSelect}
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    required
                  >
                    <option value="TECHNICAL">{t("help.ticket_category_technical")}</option>
                    <option value="DEPOSIT_PENDING">{t("help.ticket_category_deposit_pending")}</option>
                    <option value="WITHDRAWAL_PENDING">{t("help.ticket_category_withdrawal_pending")}</option>
                    <option value="WITHDRAWAL_FAILED">{t("help.ticket_category_withdrawal_failed")}</option>
                    <option value="ACCOUNT">{t("help.ticket_category_account")}</option>
                    <option value="MATCH_PROBLEM">{t("help.ticket_category_match_problem")}</option>
                    <option value="TOURNAMENT_PROBLEM">{t("help.ticket_category_tournament_problem")}</option>
                    <option value="ANTI_CHEAT">{t("help.ticket_category_anti_cheat")}</option>
                    <option value="ABUSE_REPORT">{t("help.ticket_category_abuse_report")}</option>
                    <option value="OTHER">{t("help.ticket_category_other")}</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-subject">
                    {t("help.ticket_subject_label")}
                  </label>
                  <input
                    id="ticket-subject"
                    type="text"
                    className={styles.formInput}
                    placeholder={t("help.ticket_subject_placeholder")}
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    required
                    maxLength={120}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-ref">
                    {t("help.ticket_ref_label")}
                  </label>
                  <input
                    id="ticket-ref"
                    type="text"
                    className={styles.formInput}
                    placeholder={locale === "ar" ? "مثل رقم المعاملة، أو معرف المواجهة، أو كود الإحالة" : "e.g. Transaction Hash, Duel ID, or Referral Code"}
                    value={ticketRefId}
                    onChange={(e) => setTicketRefId(e.target.value)}
                    maxLength={100}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-description">
                    {t("help.ticket_description_label")}
                  </label>
                  <textarea
                    id="ticket-description"
                    className={styles.formTextarea}
                    placeholder={locale === "ar" ? "يرجى شرح تفاصيل المشكلة..." : "Please explain the details of the issue..."}
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    required
                    rows={4}
                    maxLength={2000}
                  />
                </div>

                <div className={styles.modalActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowTicketModal(false)}
                    disabled={ticketSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={ticketSubmitting || !ticketSubject.trim() || !ticketDescription.trim()}
                  >
                    {ticketSubmitting ? t("help.ticket_submitting") : t("help.ticket_submit")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
