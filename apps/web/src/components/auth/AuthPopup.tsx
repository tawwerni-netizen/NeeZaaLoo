"use client";

/**
 * The elegant, animated Sign in / Create account popup.
 *
 * Deliberately a CHOOSER, not a fourth reimplementation of the login form:
 * every option below hands off to the exact same tested path the dedicated
 * pages already use -- LocaleLink to /login, /register, /login/code, or the
 * real GET /v1/auth/google/start redirect the login page itself calls. No
 * credential handling exists twice in this app.
 *
 * SEO: this is an overlay, not a route. The page behind it is the same
 * server-rendered, crawlable HTML either way -- opening the popup never
 * navigates away from it, and a crawler that does not execute JS simply
 * never sees an overlay that only ever appears from client-side state.
 *
 * First-visit auto-open: shows once per browser for a signed-out visitor,
 * after the page has had a moment to be seen and read (never instantly on
 * paint -- see AUTO_OPEN_DELAY_MS), and never again once dismissed, tracked
 * in localStorage. It does not reappear for a signed-in visitor, and it
 * never blocks navigation -- Escape, the backdrop, and the close button all
 * dismiss it, and the page underneath stays exactly as usable as it always
 * was.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LocaleLink } from "@/components/LocaleLink";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { get, ApiError } from "@/lib/api";
import { transition } from "@/lib/motion";
import { authErrorKey } from "@/components/auth/error-messages";
import styles from "./AuthPopup.module.css";

const SEEN_KEY = "nz_auth_popup_seen_v1";
const AUTO_OPEN_DELAY_MS = 1400;

/** Mounted once, globally -- decides whether to auto-open the popup for a
 * first-time, signed-out visitor. Separate from AuthPopup itself so the
 * popup component stays a plain, presentational overlay callable from
 * anywhere (the header's own buttons included). */
export function AuthPopupAutoOpen() {
  const { player, loading } = useAuth();
  const { openPopup } = useAuthPopup();

  useEffect(() => {
    if (loading || player) return;
    let seen = true;
    try { seen = window.localStorage.getItem(SEEN_KEY) === "1"; } catch { /* private mode, etc. */ }
    if (seen) return;
    const timer = setTimeout(() => {
      try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
      openPopup();
    }, AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, player, openPopup]);

  return null;
}

export function AuthPopup() {
  const { open, closePopup } = useAuthPopup();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const [googleStarting, setGoogleStarting] = useState(false);
  const [googleErrorKey, setGoogleErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePopup();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePopup]);

  async function onGoogleClick() {
    setGoogleErrorKey(null);
    setGoogleStarting(true);
    try {
      const { url } = await get<{ url: string }>(`/v1/auth/google/start?locale=${locale}`);
      if (url) {
        window.location.href = url;
        return;
      }
    } catch (e) {
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
      setGoogleStarting(false);
      const reason = e instanceof ApiError ? (e.code ?? "GOOGLE_LOGIN_UNAVAILABLE") : "NETWORK_ERROR";
      setGoogleErrorKey(authErrorKey(reason));
    }
  }


  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("authPopup.title")}
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
          transition={transition.reveal}
          onClick={(e) => { if (e.target === e.currentTarget) closePopup(); }}
        >
          <motion.div
            className={styles.card}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={transition.surface}
          >
            <button type="button" className={styles.close} onClick={closePopup} aria-label={t("authPopup.close_aria_label")}>
              <CloseIcon />
            </button>

            <Logo variant="mark" className={styles.mark ?? ""} />
            <h2 className={styles.title}>{t("authPopup.title")}</h2>
            <p className={styles.subtitle}>{t("authPopup.subtitle")}</p>

            <div className={styles.options}>
              <LocaleLink href="/login" className={styles.option} onClick={closePopup}>
                <span className={styles.optionLabel}>{t("authPopup.sign_in")}</span>
                <span className={styles.optionBody}>{t("authPopup.sign_in_body")}</span>
              </LocaleLink>
              <LocaleLink href="/register" className={`${styles.option} ${styles.optionPrimary}`} onClick={closePopup}>
                <span className={styles.optionLabel}>{t("authPopup.create_account")}</span>
                <span className={styles.optionBody}>{t("authPopup.create_account_body")}</span>
              </LocaleLink>
            </div>

            <button
              type="button" className={styles.google}
              disabled={googleStarting} onClick={() => void onGoogleClick()}
            >
              <GoogleIcon />
              {googleStarting ? t("auth.login.submitting") : t("authPopup.google")}
            </button>
            {googleErrorKey && <p className={styles.error} role="alert">{t(googleErrorKey)}</p>}

            <LocaleLink href="/login/code" className={styles.emailCode} onClick={closePopup}>
              {t("authPopup.email_code")}
            </LocaleLink>

            <p className={styles.footnote}>{t("authPopup.footnote")}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}
