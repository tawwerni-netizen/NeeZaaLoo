"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import styles from "@/components/auth/AuthForm.module.css";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await register(handle, password);
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
            <label htmlFor="handle">{t("auth.register.nickname_label")}</label>
            <input
              id="handle"
              name="handle"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_-]+"
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

          <Button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>

          <p className={styles.switch}>
            {t("auth.register.switch_prompt")} <LocaleLink href="/login">{t("auth.register.switch_cta")}</LocaleLink>
          </p>
        </form>
      </div>
    </>
  );
}
