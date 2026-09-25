
"use client";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./fair-play.module.css";
import Image from "next/image";

export default function FairPlayPage() {
  const { t, locale } = useI18n();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const whyPoints = [
    {
      icon: "🎯",
      title: locale === "ar" ? "١٠٠٪ مهارة (100% Skill)" : "100% Skill-Based (100% Skill)",
      desc: locale === "ar" 
        ? "جميع الألعاب تعتمد حصرياً على الذكاء والتخطيط والتكتيك الذهني — لا نرد ولا عجلة ولا عناصر صدفة تتحكم بالنتائج."
        : "All games rely exclusively on mental acumen, tactical depth, and strategic foresight — no dice rolls or random elements."
    },
    {
      icon: "⚡",
      title: locale === "ar" ? "الخادم هو المرجع المشفر" : "100% Server-Authoritative",
      desc: locale === "ar"
        ? "لا يمكن لأي طرف التلاعب بالوقت أو النقلات؛ خوادمنا تتحقق لحظياً من شرعية كل خطوة قبل تثبيتها في سجل النزال المشفر."
        : "No client can manipulate clocks or moves; our engine validates every intent in real time before committing to the cryptographic ledger."
    },
    {
      icon: "🔒",
      title: locale === "ar" ? "حماية الأرصدة والسحب الفوري" : "Instant Payout & Asset Security",
      desc: locale === "ar"
        ? "أرباحك وجوائزك مضمونة في محفظتك المعتمدة ويمكنك سحبها في أي وقت دون شروط تعجيزية أو تسويف."
        : "Your winnings and tournament prizes are stored in an auditable ledger and can be withdrawn instantly at any time."
    }
  ];

  const cards = [
    {
      title: t("fairPlayPage.server_heading"),
      desc: t("fairPlayPage.server_body"),
      img: "/images/security/security-anti-cheat-sentinel.jpg",
      icon: "🛡️"
    },
    {
      title: t("fairPlayPage.verify_heading"),
      desc: t("fairPlayPage.verify_body"),
      img: "/images/security/security-cryptographic-seed.jpg",
      icon: "🔐"
    },
    {
      title: t("fairPlayPage.review_heading"),
      desc: t("fairPlayPage.review_body"),
      img: "/images/security/security-human-review.jpg",
      icon: "🕵️"
    },
    {
      title: t("fairPlayPage.eligibility_heading"),
      desc: t("fairPlayPage.eligibility_body"),
      img: "/images/security/security-identity-guard.jpg",
      icon: "✅"
    }
  ];

  return (
    <>
      <Header />
      <main className="nz-container" style={{ paddingBlock: "3.5rem" }}>
        {/* Hero Section */}
        <header className={styles.head}>
          <div className={styles.shieldIcon}>🛡️</div>
          <div className={styles.heroBadge}>
            {locale === "ar" ? "ميثاق النزاهة واللعب العادل" : "Fair Play & Integrity Charter"}
          </div>
          <h1 className={styles.heading}>{t("fairPlayPage.heading")}</h1>
          <p className={styles.subhead}>{t("fairPlayPage.subhead")}</p>
        </header>

        {/* 'Why This Page' Attractive Showcase Section */}
        <section className={styles.whySection}>
          <div className={styles.whyHeader}>
            <span className={styles.whyTag}>
              {locale === "ar" ? "💡 لماذا هذه الصفحة بالغة الأهمية؟" : "💡 Why Does This Matter?"}
            </span>
            <h2 className={styles.whyTitle}>
              {locale === "ar" 
                ? "لأن ثقتك هي رأس مالنا الحقيقي، والمهارة وحدها هي التي تحسم الفوز" 
                : "Because Trust is Our Foundation, and Merit Alone Decides Victory"}
            </h2>
            <p className={styles.whyDesc}>
              {locale === "ar"
                ? "صممنا هذه الصفحة لنضع بين يديك الحقائق التقنية المجردة بدون أي وعود وهمية. في نيزالو، نحن لا ندير منصة رهان أو حظ، بل نوفر بيئة أولمبية إلكترونية تنافسية عادلة ومشفرة."
                : "We built this page to give you transparent technical realities without buzzwords. At Nizalo, we run a pure esports skill arena built on deterministic competition."}
            </p>
          </div>

          <div className={styles.whyGrid}>
            {whyPoints.map((pt, i) => (
              <div key={i} className={styles.whyCard}>
                <div className={styles.whyIcon}>{pt.icon}</div>
                <h3 className={styles.whyCardTitle}>{pt.title}</h3>
                <p className={styles.whyCardDesc}>{pt.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security & Anti-Cheat Technical Pillars */}
        <div className={styles.sectionTitleWrap}>
          <h2 className={styles.sectionTitle}>
            {locale === "ar" ? "ركائز نظام الأمان والتحكيم الخوارزمي" : "Security & Anti-Cheat Architecture"}
          </h2>
          <p className={styles.sectionSub}>
            {locale === "ar" 
              ? "تفاصيل هندسة النظام الصارمة لحماية حقوق المتنافسين على مدار الساعة"
              : "Technical details of our continuous security and verification pipeline"}
          </p>
        </div>

        <div className={styles.grid}>
          {cards.map((card, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.cardImgWrap}>
                <Image src={card.img} alt={card.title} fill className={styles.cardImg} />
                <div className={styles.cardImgOverlay} />
                <div className={styles.cardIcon}>{card.icon}</div>
              </div>
              <div className={styles.cardContent}>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDesc}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.ctaWrap}>
          <LocaleLink href="/support" className={styles.ctaBtn}>
            {t("fairPlayPage.contact_cta")}
          </LocaleLink>
        </div>
      </main>
      <Footer />
    </>
  );
}
