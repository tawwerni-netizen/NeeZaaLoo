"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import styles from "./GoogleOneTap.module.css";

const DISMISSED_KEY = "nz_onetap_dismissed_session";

export function GoogleOneTap() {
  const { player, loading, applySession } = useAuth();
  const { locale } = useI18n();
  const [showCustomCard, setShowCustomCard] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);
  // Neither the real Google prompt nor the styled fallback card should ever
  // appear when Google sign-in cannot actually complete -- that is a broken
  // flow (GOOGLE_LOGIN_UNAVAILABLE on every click), not a degraded one.
  // 'null' while unknown, so nothing renders before the check resolves.
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const gisInitialized = useRef(false);

  useEffect(() => {
    let live = true;
    get<{ googleLogin?: string }>("/v1/health")
      .then((res) => { if (live) setGoogleAvailable(res?.googleLogin === "configured"); })
      .catch(() => { if (live) setGoogleAvailable(false); });
    return () => { live = false; };
  }, []);

  const isDismissed = useCallback(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setShowCustomCard(false);
    if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      (window as any).google.accounts.id.cancel();
    }
  }, []);

  // Handle Google OAuth trigger for custom card
  const handleCustomGoogleClick = async () => {
    if (startingOAuth) return;
    setStartingOAuth(true);
    try {
      const { url } = await get<{ url: string }>(`/v1/auth/google/start?locale=${locale}`);
      if (url) {
        window.location.href = url;
        return;
      }
    } catch {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (clientId) {
        const redirectUri = `${window.location.origin}/api/auth/google/callback`;
        const scope = encodeURIComponent("openid email profile");
        const state = encodeURIComponent(JSON.stringify({ locale }));
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;
        return;
      }
    }
    setStartingOAuth(false);
  };

  // Google Identity Services (GIS) One Tap handler
  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential) return;
      try {
        const res = await fetch("/api/auth/google/one-tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (data?.ok && data.accessToken && data.refreshToken) {
          await applySession(data.accessToken, data.refreshToken, true);
          setShowCustomCard(false);
          window.location.reload();
        }
      } catch (err) {
        console.error("[OneTap] Credential exchange error:", err);
      }
    },
    [applySession]
  );

  useEffect(() => {
    if (loading || player || googleAvailable !== true) {
      setShowCustomCard(false);
      return;
    }

    if (isDismissed()) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // Load Google Identity Services script
    const scriptId = "google-gsi-client";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initGis = () => {
      if (!window || !(window as any).google?.accounts?.id || gisInitialized.current) return;
      if (!clientId) {
        // No client ID in env yet: show custom styled One-Tap popup after 1 second delay
        const timer = setTimeout(() => {
          if (!isDismissed()) setShowCustomCard(true);
        }, 1200);
        return () => clearTimeout(timer);
      }

      try {
        gisInitialized.current = true;
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: false,
          itp_support: true,
          use_fedcm_for_prompt: true,
        });

        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed()) {
            console.log("[OneTap] Not displayed:", notification.getNotDisplayedReason());
            // Fallback to custom card so user still gets the prompt
            if (!isDismissed()) setShowCustomCard(true);
          } else if (notification.isSkippedMoment()) {
            console.log("[OneTap] Skipped:", notification.getSkippedReason());
          } else if (notification.isDismissedMoment()) {
            console.log("[OneTap] Dismissed by user");
            dismiss();
          }
        });
      } catch (err) {
        console.warn("[OneTap] GIS init error:", err);
        if (!isDismissed()) setShowCustomCard(true);
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGis;
      document.head.appendChild(script);
    } else {
      initGis();
    }

    // Safety fallback timer if GIS doesn't prompt within 2 seconds
    const fallbackTimer = setTimeout(() => {
      if (!gisInitialized.current && !isDismissed()) {
        setShowCustomCard(true);
      }
    }, 2000);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [loading, player, googleAvailable, isDismissed, dismiss, handleCredentialResponse]);

  if (loading || player || !showCustomCard) {
    return null;
  }

  const isAr = locale === "ar";
  const domain = typeof window !== "undefined" ? window.location.hostname : "nizalo.com";

  return (
    <aside className={styles.oneTapWrapper} role="dialog" aria-label="Google Sign-In">
      <div className={styles.oneTapCard}>
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <svg className={styles.googleGIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span className={styles.titleText}>
              {isAr ? `تسجيل الدخول إلى ${domain} عبر Google` : `Sign in to ${domain} with google.com`}
            </span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={dismiss}
            aria-label={isAr ? "إغلاق" : "Close"}
          >
            &times;
          </button>
        </div>

        <div className={styles.contentBody}>
          <div
            className={styles.accountPromptRow}
            onClick={handleCustomGoogleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleCustomGoogleClick()}
          >
            <div className={styles.accountAvatar}>G</div>
            <div className={styles.accountDetails}>
              <span className={styles.accountName}>
                {isAr ? "متابعة سريعة عبر حساب Google" : "Continue with Google Account"}
              </span>
              <span className={styles.accountSubtitle}>
                {isAr ? "بنقرة واحدة بدون كلمة مرور" : "One-tap sign in, no password needed"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCustomGoogleClick}
            disabled={startingOAuth}
          >
            {startingOAuth
              ? isAr
                ? "جارٍ الاتصال..."
                : "Connecting..."
              : isAr
              ? "متابعة بحساب Google"
              : "Continue with Google"}
          </button>

          <div className={styles.footerNote}>
            {isAr ? (
              <>
                بالتسجيل أنت توافق على <a href={`/${locale}/help#terms`}>شروط الخدمة</a> و{" "}
                <a href={`/${locale}/help#privacy`}>سياسة الخصوصية</a>.
              </>
            ) : (
              <>
                By continuing, you agree to our <a href={`/${locale}/help#terms`}>Terms</a> and{" "}
                <a href={`/${locale}/help#privacy`}>Privacy Policy</a>.
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
