"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n/context";
import { LocaleLink } from "@/components/LocaleLink";
import styles from "./B2bFloatingInquiry.module.css";

const FLOATING_I18N: Record<string, { title: string; subtitle: string; btn: string }> = {
  en: {
    title: "White-Label Sandbox",
    subtitle: "Launch this platform under your brand",
    btn: "Pricing & Buyout →",
  },
  ar: {
    title: "بيئة تجربة White-Label",
    subtitle: "أطلق هذه المنصة بعلامتك وسيرفرك",
    btn: "طلب الشراء والترخيص ↗",
  },
  es: {
    title: "Sandbox Marca Blanca",
    subtitle: "Lanza esta plataforma con tu propia marca",
    btn: "Precios y Compra →",
  },
  fr: {
    title: "Bac à sable Marque Blanche",
    subtitle: "Lancez cette plateforme sous votre marque",
    btn: "Tarifs & Achat →",
  },
  hi: {
    title: "व्हाइट-लेबल सैंडबॉक्स",
    subtitle: "अपने ब्रांड के तहत यह प्लेटफ़ॉर्म लॉन्च करें",
    btn: "मूल्य और खरीद →",
  },
  zh: {
    title: "企业白标沙盒环境",
    subtitle: "以您的独立品牌快速上线运营",
    btn: "查看授权与收购 →",
  },
};

export function B2bFloatingInquiry() {
  const { isDemoActive, currentTheme } = useBrand();
  const { locale } = useI18n();
  const pathname = usePathname();
  const [minimized, setMinimized] = useState(false);

  // Only show when in demo mode, and hide on the /b2b page itself
  if (!isDemoActive || pathname.includes("/b2b")) {
    return null;
  }

  const copy = FLOATING_I18N[locale] || FLOATING_I18N.en!;

  if (minimized) {
    return (
      <button
        type="button"
        className={styles.minimizedBubble}
        style={{ background: currentTheme.primaryGradient }}
        onClick={() => setMinimized(false)}
        title={copy.title}
        aria-label="Expand White-Label Controls"
      >
        🏢
      </button>
    );
  }

  return (
    <aside className={styles.floatingContainer} style={{ borderColor: currentTheme.primaryColor }}>
      <div className={styles.floatingInfo}>
        <div className={styles.floatingTitle}>
          <span>🏢</span>
          <span>{copy.title}</span>
        </div>
        <div className={styles.floatingSubtitle}>{copy.subtitle}</div>
      </div>

      <LocaleLink
        href="/b2b#inquiry"
        className={styles.inquiryCtaBtn}
        style={{ background: currentTheme.primaryGradient, boxShadow: `0 0 14px ${currentTheme.accentGlow}` }}
      >
        {copy.btn}
      </LocaleLink>

      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => setMinimized(true)}
        title="Minimize"
        aria-label="Minimize"
      >
        ✕
      </button>
    </aside>
  );
}
