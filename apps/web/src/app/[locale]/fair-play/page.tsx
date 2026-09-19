
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
      <main className="nz-container" style={{ paddingBlock: "4rem" }}>
        <header className={styles.head}>
          <div className={styles.shieldIcon}>🛡️</div>
          <h1 className={styles.heading}>{t("fairPlayPage.heading")}</h1>
          <p className={styles.subhead}>{t("fairPlayPage.subhead")}</p>
        </header>

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
