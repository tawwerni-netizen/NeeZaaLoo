"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./DownloadAppTeaser.module.css";

export function DownloadAppTeaser() {
  const { locale } = useI18n();
  const isAr = locale === "ar";

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    // Detect mobile platform
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) {
        setPlatform("ios");
      } else if (/android/.test(ua)) {
        setPlatform("android");
      }

      // Check if already in standalone PWA mode
      if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
        setIsInstalled(true);
      }
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowGuide((prev) => !prev);
    }
  };

  return (
    <section className={styles.section} id="download">
      <div className={`nz-container ${styles.inner}`}>
        <span className={styles.badge}>
          {isAr ? "⚡ تطبيق الويب السريع (PWA)" : "⚡ 1-Tap Mobile Web App"}
        </span>

        <h2 className={styles.heading}>
          {isAr ? "ثبّت أيقونة نيزالو على شاشة هاتفك" : "Add Nizalo to Your Home Screen"}
        </h2>

        <p className={styles.body}>
          {isAr
            ? "استمتع بتجربة لعب فورية بلمسة واحدة. أضف أيقونة نيزالو إلى شاشة هاتفك الرئيسية لتفتح المنصة فوراً وبملء الشاشة مع سرعة استجابة قصوى وبدون استهلاك ذاكرة الهاتف."
            : "Enjoy instant 1-tap gaming. Add the Nizalo icon to your home screen for fullscreen access with maximum responsiveness and zero device storage footprint."}
        </p>

        <div className={styles.featuresRow}>
          <div className={styles.featureItem}>
            <span>🚀</span>
            <span>{isAr ? "فتح فوري بلمسة واحدة" : "Instant 1-Tap Launch"}</span>
          </div>
          <div className={styles.featureItem}>
            <span>📺</span>
            <span>{isAr ? "عرض بملء الشاشة" : "Immersive Fullscreen"}</span>
          </div>
          <div className={styles.featureItem}>
            <span>💾</span>
            <span>{isAr ? "صفر استهلاك ذاكرة" : "Zero Storage Used"}</span>
          </div>
        </div>

        <div className={styles.actionGroup}>
          {isInstalled ? (
            <div className={styles.installedBadge}>
              <span className={styles.checkIcon}>✓</span>
              <span>{isAr ? "تم تثبيت أيقونة نيزالو على جهازك بنجاح!" : "Nizalo icon is already installed on your device!"}</span>
            </div>
          ) : (
            <button
              type="button"
              className={styles.installBtn}
              onClick={handleInstallClick}
              aria-label={isAr ? "تثبيت أيقونة نيزالو" : "Install Nizalo Icon"}
            >
              <span className={styles.installIcon}>📲</span>
              <div className={styles.installText}>
                <span className={styles.installLabel}>
                  {isAr ? "تثبيت الأيقونة على هاتفك" : "Install Icon on Mobile"}
                </span>
                <span className={styles.installMeta}>
                  {isAr ? "يعمل على آيفون وأندرويد • بضغطة زر" : "Works on iPhone & Android • 1-Click"}
                </span>
              </div>
            </button>
          )}

          {showGuide && !isInstalled && (
            <div className={styles.guideCard}>
              <div className={styles.guideHeader}>
                <span className={styles.guideTitle}>
                  {platform === "ios"
                    ? (isAr ? "خطوات التثبيت على آيفون (Safari):" : "iPhone Installation (Safari):")
                    : (isAr ? "طريقة إضافة الأيقونة لهاتفك:" : "How to Add to Home Screen:")}
                </span>
                <button
                  type="button"
                  className={styles.closeGuideBtn}
                  onClick={() => setShowGuide(false)}
                >
                  ✕
                </button>
              </div>

              {platform === "ios" ? (
                <ol className={styles.guideSteps}>
                  <li>
                    {isAr
                      ? "اضغط على زر المشاركة ⎋ أسفل شاشة Safari."
                      : "Tap the Share button ⎋ at the bottom of Safari."}
                  </li>
                  <li>
                    {isAr
                      ? "مرر للأسفل واختر «إضافة إلى الشاشة الرئيسية ➕»."
                      : "Scroll down and tap 'Add to Home Screen ➕'."}
                  </li>
                  <li>
                    {isAr
                      ? "اضغط «إضافة» في الزاوية العلوية، وستظهر أيقونة نيزالو فوراً بجانب تطبيقاتك!"
                      : "Tap 'Add' in the top corner. Nizalo will appear directly on your home screen!"}
                  </li>
                </ol>
              ) : (
                <ol className={styles.guideSteps}>
                  <li>
                    {isAr
                      ? "اضغط على قائمة المتصفح (الثلاث نقاط ⋮) في الزاوية العلوية."
                      : "Tap the browser menu (three dots ⋮) in the top corner."}
                  </li>
                  <li>
                    {isAr
                      ? "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
                      : "Select 'Install App' or 'Add to Home screen'."}
                  </li>
                  <li>
                    {isAr
                      ? "اضغط «تثبيت» وستظهر أيقونة نيزالو فوراً لتفتح الموقع بنقرة واحدة!"
                      : "Confirm 'Install'. The Nizalo icon will launch the arena in 1-tap!"}
                  </li>
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
