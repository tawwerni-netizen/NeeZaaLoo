"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, ApiError } from "@/lib/api";
import styles from "@/components/auth/AuthForm.module.css";

export default function LoginPage() {
  const { login } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleStarting, setGoogleStarting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(identifier, password);
    setSubmitting(false);
    if (result.ok) {
      router.push(`/${locale}/home`);
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
      const { url } = await get<{ url: string }>(`/v1/auth/google/start?locale=${locale}`);
      window.location.href = url;
    } catch (e) {
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
              {locale === "ar" ? "البريد الإلكتروني" : (t("auth.login.identifier_label") || "Email Address")}
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="email username"
              placeholder="name@example.com"
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

          <Button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>

          <p className={styles.forgotLink}>
            <LocaleLink href="/login/forgot-password">{t("auth.login.forgot_password_cta")}</LocaleLink>
          </p>

          <div className={styles.divider}><span>{t("auth.login.or_divider")}</span></div>

          <Button
            type="button" variant="secondary" className={styles.submit}
            disabled={googleStarting} onClick={() => void onGoogleClick()}
          >
            {t("auth.login.google_cta")}
          </Button>

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
