"use client";

import { useState, useEffect } from "react";
import { useBrand } from "@/lib/brand-context";
import { BRAND_THEMES } from "@/lib/branding";
import { useI18n } from "@/lib/i18n/context";
import { LocaleLink } from "@/components/LocaleLink";
import styles from "./DemoControlBar.module.css";

const BAR_LABELS: Record<string, {
  sandbox: string;
  brandPlaceholder: string;
  applyBrand: string;
  theme: string;
  pricing: string;
  arch: string;
  deck: string;
  copy: string;
  copied: string;
  reset: string;
  collapse: string;
  expand: string;
}> = {
  en: {
    sandbox: "B2B White-Label Sandbox",
    brandPlaceholder: "Type your brand name...",
    applyBrand: "Apply Brand",
    theme: "Preset Theme:",
    pricing: "Pricing & License",
    arch: "Architecture (PDF)",
    deck: "Pitch Deck (PDF)",
    copy: "Copy Demo Link",
    copied: "Copied!",
    reset: "Reset to default",
    collapse: "Collapse",
    expand: "Expand",
  },
  ar: {
    sandbox: "بيئة اختبار B2B White-Label",
    brandPlaceholder: "اكتب اسم علامتك التجارية...",
    applyBrand: "تطبيق الهوية",
    theme: "الألوان والثيم:",
    pricing: "باقات الترخيص والأسعار",
    arch: "معمارية النظام (PDF)",
    deck: "ملف الاستثمار (PDF)",
    copy: "نسخ رابط الديمو",
    copied: "تم النسخ!",
    reset: "إعادة ضبط لـ Nizalo الأصلية",
    collapse: "طي الشريط",
    expand: "توسيع الشريط",
  },
  es: {
    sandbox: "Sandbox B2B Marca Blanca",
    brandPlaceholder: "Nombre de su marca...",
    applyBrand: "Aplicar Marca",
    theme: "Tema Prediseñado:",
    pricing: "Precios y Licencias",
    arch: "Arquitectura (PDF)",
    deck: "Pitch Deck (PDF)",
    copy: "Copiar Enlace Demo",
    copied: "¡Copiado!",
    reset: "Restablecer",
    collapse: "Contraer",
    expand: "Expandir",
  },
  fr: {
    sandbox: "Bac à sable B2B Marque Blanche",
    brandPlaceholder: "Nom de votre marque...",
    applyBrand: "Appliquer la marque",
    theme: "Thème Prédéfini :",
    pricing: "Tarifs & Licences",
    arch: "Architecture (PDF)",
    deck: "Pitch Deck (PDF)",
    copy: "Copier le Lien Démo",
    copied: "Copié !",
    reset: "Réinitialiser",
    collapse: "Réduire",
    expand: "Développer",
  },
  hi: {
    sandbox: "B2B व्हाइट-लेबल सैंडबॉक्स",
    brandPlaceholder: "अपने ब्रांड का नाम लिखें...",
    applyBrand: "ब्रांड लागू करें",
    theme: "थीम चयन:",
    pricing: "लाइसेंसिंग और मूल्य",
    arch: "आर्किटेक्चर (PDF)",
    deck: "पिच डेक (PDF)",
    copy: "डेमो लिंक कॉपी करें",
    copied: "कॉपी हो गया!",
    reset: "रीसेट करें",
    collapse: "संक्षिप्त करें",
    expand: "विस्तार करें",
  },
  zh: {
    sandbox: "B2B 企业白标沙盒环境",
    brandPlaceholder: "输入您的品牌名称...",
    applyBrand: "应用品牌",
    theme: "预设主题：",
    pricing: "商业授权与报价",
    arch: "架构规格书 (PDF)",
    deck: "商业路演 (PDF)",
    copy: "复制演示链接",
    copied: "已复制！",
    reset: "恢复默认",
    collapse: "折叠",
    expand: "展开",
  },
};

export function DemoControlBar() {
  const { branding, currentTheme, updateBranding, resetToDefault, isDemoActive } = useBrand();
  const { locale } = useI18n();
  const t = (BAR_LABELS[locale] || BAR_LABELS.en)!;

  const [collapsed, setCollapsed] = useState(false);
  const [brandInput, setBrandInput] = useState(branding.brandName);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBrandInput(branding.brandName);
  }, [branding.brandName]);

  // If not in demo mode and not on demo subdomain or path, do not render
  if (!isDemoActive) {
    return null;
  }

  const handleBrandChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (brandInput.trim()) {
      updateBranding({ brandName: brandInput.trim() });
    }
  };

  const copyDemoLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.origin + "/demo");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <aside className={`${styles.barWrapper} ${collapsed ? styles.collapsed : ""}`} aria-label="B2B White-Label Demo Sandbox Controls">
      <div className={styles.barContainer}>
        {/* Left: Branding Tag & Status */}
        <div className={styles.leftSection}>
          <div className={styles.b2bBadge} style={{ background: currentTheme.badgeBg, color: currentTheme.badgeText, borderColor: currentTheme.primaryColor }}>
            <span className={styles.pulsingDot} style={{ background: currentTheme.primaryColor }} />
            <span>{t.sandbox}</span>
          </div>

          {/* Quick Brand Name Customizer */}
          <form onSubmit={handleBrandChange} className={styles.brandForm}>
            <input
              type="text"
              value={brandInput}
              onChange={(e) => setBrandInput(e.target.value)}
              placeholder={t.brandPlaceholder}
              className={styles.brandInput}
            />
            <button type="submit" className={styles.applyBtn} style={{ background: currentTheme.primaryGradient }}>
              {t.applyBrand}
            </button>
          </form>
        </div>

        {/* Center: Live Theme Switcher */}
        <div className={styles.centerSection}>
          <span className={styles.themeLabel}>{t.theme}</span>
          <div className={styles.themePills}>
            {Object.values(BRAND_THEMES).map((th) => (
              <button
                key={th.id}
                type="button"
                className={`${styles.themePill} ${branding.themeId === th.id ? styles.themePillActive : ""}`}
                onClick={() => updateBranding({ themeId: th.id })}
                title={locale === "ar" ? th.nameAr : th.name}
              >
                <span className={styles.colorDot} style={{ background: th.previewColor }} />
                <span className={styles.themeName}>{locale === "ar" ? th.nameAr.split(" ")[0] : th.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: B2B Documentation & Inquiry */}
        <div className={styles.rightSection}>
          <LocaleLink href="/b2b" className={styles.actionBtn}>
            <span>💼</span>
            <span>{t.pricing}</span>
          </LocaleLink>

          {/* English Primary Architecture PDF */}
          <a href="/platform-architecture.pdf" target="_blank" rel="noopener noreferrer" className={styles.docBtn} title="Download Platform Architecture (English)">
            <span>📐</span>
            <span>{t.arch}</span>
          </a>

          {/* English Primary Pitch Deck PDF */}
          <a href="/pitch-deck.pdf" target="_blank" rel="noopener noreferrer" className={styles.docBtn} title="Download Commercial Pitch Deck (English)">
            <span>📊</span>
            <span>{t.deck}</span>
          </a>

          <button type="button" onClick={copyDemoLink} className={styles.iconBtn} title={copied ? t.copied : t.copy}>
            {copied ? "✅" : "🔗"}
          </button>

          <button type="button" onClick={resetToDefault} className={styles.resetBtn} title={t.reset}>
            ↺
          </button>

          <button type="button" onClick={() => setCollapsed(!collapsed)} className={styles.toggleCollapseBtn} title={collapsed ? t.expand : t.collapse}>
            {collapsed ? "▼" : "▲"}
          </button>
        </div>
      </div>
    </aside>
  );
}
