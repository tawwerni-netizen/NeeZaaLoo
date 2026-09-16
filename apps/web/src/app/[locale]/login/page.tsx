"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, ApiError } from "@/lib/api";
import { GoogleButton } from "@/components/auth/GoogleButton";
import styles from "@/components/auth/AuthForm.module.css";

function getSafeRedirect(returnTo: string | null, locale: string): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return `/${locale}/home`;
  }
  if (returnTo.startsWith(`/${locale}/`) || returnTo === `/${locale}`) {
    return returnTo;
  }
  return `/${locale}${returnTo}`;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<><Header /><div className={styles.wrap} /></>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, loading, player } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const urlError = searchParams.get("error");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(
    urlError ? t(authErrorKey(urlError.toUpperCase())) : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [googleStarting, setGoogleStarting] = useState(false);

  // If already authenticated, redirect immediately away from login
  useEffect(() => {
    if (!loading && player) {
      router.replace(getSafeRedirect(returnTo, locale));
    }
  }, [loading, player, returnTo, locale, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.includes("@")) {
      setError(locale === "ar" ? "يرجى إدخال بريد إلكتروني صالح. تسجيل الدخول بالاسم المستعار غير متاح." : "Please enter a valid email address. Login with username is not supported.");
      return;
    }
    setSubmitting(true);
    const result = await login(identifier, password, remember);
    setSubmitting(false);
    if (result.ok) {
      router.push(getSafeRedirect(returnTo, locale));
    } else {
      setError(t(authErrorKey(result.reason)));
    }
  }

  // A plain server-side redirect target: this page only fetches the URL
  // Google itself should be visited at, then hands the browser off to it.
  // See apps/api/src/server.mjs's own comment on why /start returns JSON
  // rather than redirecting itself.
  async function onGoogleClick() {
    setError(null);
    setGoogleStarting(true);
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
      setGoogleStarting(false);
      const reason = e instanceof ApiError ? (e.code ?? "GOOGLE_LOGIN_UNAVAILABLE") : "NETWORK_ERROR";
      setError(t(authErrorKey(reason)));
    }
  }

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={onSubmit}>
          <h1 className={styles.title}>{t("auth.login.title")}</h1>
          <p className={styles.subtitle}>{t("auth.login.subtitle")}</p>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.field}>
            <label htmlFor="identifier">
              {locale === "ar" ? "البريد الإلكتروني" : "Email Address"}
            </label>
            <input
              id="identifier"
              name="identifier"
              type="email"
              autoComplete="email"
              placeholder={locale === "ar" ? "name@example.com" : "name@example.com"}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">{t("auth.login.password_label")}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0 12px" }}>
            <input
              id="remember"
              name="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#059669" }}
            />
            <label htmlFor="remember" style={{ fontSize: "14px", color: "var(--text-secondary, #94a3b8)", cursor: "pointer", userSelect: "none" }}>
              {locale === "ar" ? "البقاء قيد تسجيل الدخول (تذكرني لمدة 30 يوماً)" : "Stay logged in / Remember password (30 days)"}
            </label>
          </div>

          <Button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>

          <p className={styles.forgotLink}>
            <LocaleLink href="/login/forgot-password">{t("auth.login.forgot_password_cta")}</LocaleLink>
          </p>

          <div className={styles.divider}><span>{t("auth.login.or_divider")}</span></div>

          <GoogleButton onError={(err) => setError(err)} returnTo={returnTo} />

          <LocaleLink href="/login/code" className={styles.secondaryLink}>
            {t("auth.login.email_code_cta")}
          </LocaleLink>

          <p className={styles.switch}>
            {t("auth.login.switch_prompt")} <LocaleLink href="/register">{t("auth.login.switch_cta")}</LocaleLink>
          </p>
        </form>
      </div>
    </>
  );
}
