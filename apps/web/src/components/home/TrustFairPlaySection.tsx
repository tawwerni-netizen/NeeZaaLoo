"use client";

/**
 * Three real, verifiable properties of this platform's own architecture --
 * not marketing language. Each point corresponds to something actually
 * true in packages/duel-engine (server-authoritative state), packages/
 * reconciliation (independent replay verification), and packages/fairplay
 * (no automated sanction on a single weak signal, human review required).
 */
import { useState, useEffect } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import type { SupportedLocale } from "@/lib/i18n/locale";
import styles from "./TrustFairPlaySection.module.css";

const POINTS = ["server", "verify", "human"] as const;

type LocalizedShield = {
  img: string;
  badge: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
};

const SECURITY_SHIELDS: LocalizedShield[] = [
  {
    img: "/images/security/security-cold-vault.jpg",
    badge: {
      ar: "حماية الخزينة الباردة",
      en: "Cold Vault Protection",
      zh: "冷钱包资产保护",
      hi: "कोल्ड वॉल्ट सुरक्षा",
      es: "Protección de Bóveda Fría",
      fr: "Protection en Coffre-Fort Froid",
    },
    title: {
      ar: "ضمان الإيداع البارد 100% وسحب فوري عبر USDT",
      en: "100% Cold Storage Escrow & Instant USDT Cashout",
      zh: "100% 冷存储托管与 USDT 即时提现",
      hi: "100% कोल्ड स्टोरेज एस्क्रो और तत्काल USDT निकासी",
      es: "Custodia 100% en almacenamiento frío y retiro instantáneo de USDT",
      fr: "Séquestre 100% en stockage à froid et retrait instantané en USDT",
    },
  },
  {
    img: "/images/security/security-anti-cheat-sentinel.jpg",
    badge: {
      ar: "حارس النزاهة ومكافحة الغش",
      en: "Anti-Cheat Sentinel",
      zh: "反作弊哨兵系统",
      hi: "एंटी-चीट प्रहरी",
      es: "Centinela Anti-Trampas",
      fr: "Sentinelle Anti-Triche",
    },
    title: {
      ar: "تحقق فوري من صحة النقلات عبر الخادم المركزي",
      en: "Server-Authoritative Real-Time Move Validation",
      zh: "基于服务器权威的实时动作验证",
      hi: "सर्वर-आधारित रीयल-टाइम चाल सत्यापन",
      es: "Validación de movimientos en tiempo real autorizada por el servidor",
      fr: "Validation des coups en temps réel gérée par le serveur",
    },
  },
  {
    img: "/images/security/security-cryptographic-seed.jpg",
    badge: {
      ar: "نزاهة تشفيرية موثقة",
      en: "Cryptographic Integrity",
      zh: "密码学完整性",
      hi: "क्रिप्टोग्राफिक अखंडता",
      es: "Integridad Criptográfica",
      fr: "Intégrité Cryptographique",
    },
    title: {
      ar: "تحقق ثنائي من سجل النقلات بتشفير SHA-256",
      en: "Dual-Verification SHA-256 Replay Verification",
      zh: "SHA-256 双重对局重放验证",
      hi: "SHA-256 दोहरा सत्यापन रीप्ले जांच",
      es: "Verificación dual de repetición con cifrado SHA-256",
      fr: "Double vérification des replays par hachage SHA-256",
    },
  },
  {
    img: "/images/security/security-dual-signature.jpg",
    badge: {
      ar: "أمان التوقيع المزدوج",
      en: "Dual-Signature Safe",
      zh: "双重签名安全金库",
      hi: "डुअल-सिग्नेचर सुरक्षा",
      es: "Caja Fuerte de Firma Dual",
      fr: "Coffre-Fort à Double Signature",
    },
    title: {
      ar: "حماية مالية ذكية بتوقيع متعدد آمن",
      en: "Multi-Signature Smart Financial Protection",
      zh: "多重签名智能财务防护",
      hi: "मल्टी-सिग्नेचर स्मार्ट वित्तीय सुरक्षा",
      es: "Protección financiera inteligente con firma múltiple",
      fr: "Protection financière intelligente multi-signatures",
    },
  },
  {
    img: "/images/security/security-identity-guard.jpg",
    badge: {
      ar: "حماية الهوية والحساب",
      en: "Identity Defense",
      zh: "身份与账户防御",
      hi: "पहचान और खाता सुरक्षा",
      es: "Defensa de Identidad",
      fr: "Défense d'Identité",
    },
    title: {
      ar: "مصادقة متعددة العوامل لحماية الحساب والبيانات",
      en: "Biometric & Multi-Factor Account Protection",
      zh: "生物识别与多因素账户安全防护",
      hi: "बायोमेट्रिक और बहु-कारक खाता सुरक्षा",
      es: "Protección de cuenta biométrica y de múltiples factores",
      fr: "Protection biométrique et multifacteur des comptes",
    },
  },
];

export function TrustFairPlaySection() {
  const { t, locale } = useI18n();
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SECURITY_SHIELDS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const currentShield = SECURITY_SHIELDS[activeIdx] ?? SECURITY_SHIELDS[0]!;
  const loc = (locale as SupportedLocale) || "en";
  const badgeText = currentShield.badge[loc] ?? currentShield.badge.en;
  const titleText = currentShield.title[loc] ?? currentShield.title.en;

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.head}>
          <h2 className={styles.heading}>{t("home.trust.heading")}</h2>
          <p className={styles.body}>{t("home.trust.body")}</p>
        </div>

        <div className={styles.bannerCard}>
          <picture className={styles.bannerPicture}>
            <source srcSet={currentShield.img.replace(/\.jpg$/, ".webp")} type="image/webp" />
            <img
              src={currentShield.img}
              alt={titleText}
              className={styles.bannerImg}
              loading="lazy"
              decoding="async"
            />
          </picture>
          <div className={styles.bannerOverlay}>
            <div className={styles.bannerText}>
              <span className={styles.bannerBadge}>{badgeText}</span>
              <h3 className={styles.bannerHeading}>{titleText}</h3>
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
