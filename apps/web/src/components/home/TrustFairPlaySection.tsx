"use client";

/**
 * Three real, verifiable properties of this platform's own architecture --
 * not marketing language. Each point corresponds to something actually
 * true in packages/duel-engine (server-authoritative state), packages/
 * reconciliation (independent replay verification), and packages/fairplay
 * (no automated sanction on a single weak signal, human review required).
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./TrustFairPlaySection.module.css";

import { useState, useEffect } from "react";

const POINTS = ["server", "verify", "human"] as const;

const SECURITY_SHIELDS = [
  {
    img: "/images/security/security-cold-vault.jpg",
    badge: "Cold Vault Protection",
    title: "100% Cold Storage Escrow & Instant USDT Cashout",
  },
  {
    img: "/images/security/security-anti-cheat-sentinel.jpg",
    badge: "Anti-Cheat Sentinel",
    title: "Server-Authoritative Real-Time Move Validation",
  },
  {
    img: "/images/security/security-cryptographic-seed.jpg",
    badge: "Cryptographic Integrity",
    title: "Dual-Verification SHA-256 Replay Verification",
  },
  {
    img: "/images/security/security-dual-signature.jpg",
    badge: "Dual-Signature Safe",
    title: "Multi-Signature Smart Financial Protection",
  },
  {
    img: "/images/security/security-identity-guard.jpg",
    badge: "Identity Defense",
    title: "Biometric & Multi-Factor Account Protection",
  },
];

export function TrustFairPlaySection() {
  const { t } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SECURITY_SHIELDS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const currentShield = SECURITY_SHIELDS[activeIdx] ?? SECURITY_SHIELDS[0]!;

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.head}>
          <h2 className={styles.heading}>{t("home.trust.heading")}</h2>
          <p className={styles.body}>{t("home.trust.body")}</p>
        </div>

        <div className={styles.bannerCard}>
          <img
            src={currentShield.img}
            alt={currentShield.title}
            className={styles.bannerImg}
          />
          <div className={styles.bannerOverlay}>
            <div className={styles.bannerText}>
              <span className={styles.bannerBadge}>{currentShield.badge}</span>
              <h3 className={styles.bannerHeading}>{currentShield.title}</h3>
            </div>
            <div className={styles.bannerControls}>
              {SECURITY_SHIELDS.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Show security banner ${i + 1}`}
                  className={`${styles.dotBtn} ${activeIdx === i ? styles.dotBtnActive : ""}`}
                  onClick={() => setActiveIdx(i)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.points}>
          {POINTS.map((key) => (
            <div key={key} className={styles.point}>
              <h3 className={styles.pointTitle}>{t(`home.trust.point_${key}`)}</h3>
              <p className={styles.pointBody}>{t(`home.trust.point_${key}_body`)}</p>
            </div>
          ))}
        </div>

        <LocaleLink href="/fair-play" className={styles.cta}>{t("home.trust.cta")}</LocaleLink>
      </div>
    </section>
  );
}
