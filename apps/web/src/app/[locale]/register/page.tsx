"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { GoogleButton } from "@/components/auth/GoogleButton";
import styles from "@/components/auth/AuthForm.module.css";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!agreeTerms) {
      setError(t("legal.terms_required_error") || "You must agree to the Terms & Conditions to create an account.");
      return;
    }

    setSubmitting(true);
    const result = await register(handle, password, undefined, true, email);
    setSubmitting(false);
    if (result.ok) {
      router.push(`/${locale}/home`);
    } else {
      setError(t(authErrorKey(result.reason)));
    }
  }

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={onSubmit}>
          <h1 className={styles.title}>{t("auth.register.title")}</h1>
          <p className={styles.subtitle}>{t("auth.register.subtitle")}</p>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.field}>
            <label htmlFor="email">{locale === "ar" ? "البريد الإلكتروني" : (t("auth.register.email_label") || "Email Address")}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="handle">{t("auth.register.nickname_label")}</label>
            <input
              id="handle"
              name="handle"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_\-]+"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">{t("auth.register.password_label")}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className={styles.checkboxField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                id="agreeTerms"
                name="agreeTerms"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <span>
                {t("legal.terms_checkbox")} (
                <LocaleLink href="/help#terms">
                  {t("legal.terms_link")}
                </LocaleLink>
                )
              </span>
            </label>
          </div>

          <Button type="submit" className={styles.submit} disabled={submitting || !agreeTerms}>
            {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>

          <div className={styles.divider}><span>{t("auth.login.or_divider")}</span></div>

          <GoogleButton
            label={locale === "ar" ? "التسجيل السريع عبر حساب Google / Gmail" : "Quick Sign up with Google / Gmail"}
            onError={(err) => setError(err)}
          />

          <p className={styles.switch}>
            {t("auth.register.switch_prompt")} <LocaleLink href="/login">{t("auth.register.switch_cta")}</LocaleLink>
          </p>
        </form>
      </div>
    </>
  );
}
