const fs = require('fs');

const tsx = `
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
`;

fs.writeFileSync('apps/web/src/app/[locale]/fair-play/page.tsx', tsx);

const css = `
.head {
  text-align: center;
  max-width: 700px;
  margin: 0 auto 3rem;
}
.shieldIcon {
  font-size: 64px;
  margin-bottom: 1rem;
  filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.5));
}
.heading {
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 900;
  color: #fff;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subhead {
  font-size: 18px;
  color: var(--nz-text-2);
  line-height: 1.6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 4rem;
}

.card {
  background: var(--nz-bg-1);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  border-color: rgba(56, 189, 248, 0.3);
}

.cardImgWrap {
  position: relative;
  height: 200px;
  width: 100%;
}
.cardImg {
  object-fit: cover;
  transition: transform 0.5s ease;
}
.card:hover .cardImg {
  transform: scale(1.05);
}
.cardImgOverlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--nz-bg-1), transparent);
}
.cardIcon {
  position: absolute;
  bottom: -20px;
  right: 24px;
  font-size: 32px;
  background: var(--nz-bg);
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 2;
}
[dir="rtl"] .cardIcon {
  right: auto;
  left: 24px;
}

.cardContent {
  padding: 32px 24px 24px;
}
.cardTitle {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 12px;
}
.cardDesc {
  font-size: 14px;
  color: var(--nz-text-2);
  line-height: 1.7;
}

.ctaWrap {
  text-align: center;
}
.ctaBtn {
  display: inline-block;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 800;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: #fff;
  border-radius: 12px;
  text-decoration: none;
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.3);
  transition: transform 0.2s ease, filter 0.2s ease;
}
.ctaBtn:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}
`;
fs.writeFileSync('apps/web/src/app/[locale]/fair-play/fair-play.module.css', css);
