"use client";

import { useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { post, ApiError } from "@/lib/api";
import styles from "@/components/auth/AuthForm.module.css";

type Step = "request" | "confirm" | "done";

export default function ForgotPasswordPage() {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post("/v1/auth/password-reset/request", { email, locale });
      setStep("confirm");
    } catch {
      setError(t(authErrorKey("NETWORK_ERROR")));
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post("/v1/auth/password-reset/confirm", { email, code, newPassword, locale });
      setStep("done");
    } catch (e) {
      const reason = e instanceof ApiError ? (e.code ?? "BAD_CREDENTIALS") : "NETWORK_ERROR";
      setError(t(authErrorKey(reason)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <form
          className={styles.card}
          onSubmit={step === "request" ? onRequest : step === "confirm" ? onConfirm : undefined}
        >
          <h1 className={styles.title}>{t("auth.forgot_password.title")}</h1>
          <p className={styles.subtitle}>
            {step === "done" ? t("auth.forgot_password.success_message") : t("auth.forgot_password.subtitle")}
          </p>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {step === "confirm" && <p className={styles.subtitle}>{t("auth.forgot_password.sent_message")}</p>}

          {step !== "done" && (
            <div className={styles.field}>
              <label htmlFor="email">{t("auth.forgot_password.email_label")}</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                disabled={step === "confirm"}
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          {step === "confirm" && (
            <>
              <div className={styles.field}>
                <label htmlFor="code">{t("auth.forgot_password.code_label")}</label>
                <input
                  id="code" name="code" autoComplete="one-time-code" required
                  value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="newPassword">{t("auth.forgot_password.new_password_label")}</label>
                <input
                  id="newPassword" name="newPassword" type="password" autoComplete="new-password" required
                  minLength={10}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {step !== "done" && (
            <Button type="submit" className={styles.submit} disabled={submitting}>
              {step === "request"
                ? (submitting ? t("auth.forgot_password.requesting") : t("auth.forgot_password.request_cta"))
                : (submitting ? t("auth.forgot_password.confirming") : t("auth.forgot_password.confirm_cta"))}
            </Button>
          )}

          <LocaleLink href="/login" className={styles.secondaryLink}>
            {t("auth.forgot_password.back_to_login")}
          </LocaleLink>
        </form>
      </div>
    </>
  );
}
