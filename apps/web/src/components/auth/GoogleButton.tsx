"use client";

import { useState } from "react";
import { get, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "./error-messages";
import styles from "./GoogleButton.module.css";

type GoogleButtonProps = {
  onError?: (err: string) => void;
  className?: string;
  label?: string;
  returnTo?: string | null;
};

export function GoogleButton({ onError, className, label, returnTo }: GoogleButtonProps) {
  const { t, locale } = useI18n();
  const [starting, setStarting] = useState(false);

  async function onClick() {
    setStarting(true);
    try {
      const returnParam = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
      const { url } = await get<{ url: string }>(`/v1/auth/google/start?locale=${locale}${returnParam}`);
      if (url) {
        window.location.href = url;
        return;
      }
    } catch (e) {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (clientId) {
        const redirectUri = `${window.location.origin}/api/auth/google/callback`;
        const scope = encodeURIComponent("openid email profile");
        const state = encodeURIComponent(JSON.stringify({ locale, returnTo }));
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;
        return;
      }
      setStarting(false);
      const reason = e instanceof ApiError ? (e.code ?? "GOOGLE_LOGIN_UNAVAILABLE") : "NETWORK_ERROR";
      onError?.(t(authErrorKey(reason)));
    }
  }

  const defaultLabel = locale === "ar" ? "المتابعة عبر حساب Google / Gmail" : "Continue with Google / Gmail";

  return (
    <button
      type="button"
      className={`${styles.googleBtn} ${className ?? ""}`}
      disabled={starting}
      onClick={() => void onClick()}
    >
      <svg className={styles.googleIcon} width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
      </svg>
      <span className={styles.googleText}>
        {starting ? (locale === "ar" ? "جارٍ الاتصال بـ Google..." : "Connecting to Google...") : (label ?? defaultLabel)}
      </span>
    </button>
  );
}
