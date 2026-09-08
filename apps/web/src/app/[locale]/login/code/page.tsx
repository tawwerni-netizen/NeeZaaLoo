"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { post, ApiError } from "@/lib/api";
import styles from "@/components/auth/AuthForm.module.css";

type Step = "request" | "verify";

export default function EmailCodeLoginPage() {
  const { applySession } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await post("/v1/auth/email-code/request", { email, locale });
      setInfo(t("auth.email_code.sent_message"));
      setStep("verify");
    } catch {
      // Enumeration-safe by construction on the backend -- this request
      // never actually fails for a real client-side reason, but a network
      // problem still needs to say something.
      setError(t(authErrorKey("NETWORK_ERROR")));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await post<{ accessToken: string; refreshToken: string }>(
        "/v1/auth/email-code/verify",
        { email, code, totpCode: needsTotp ? totpCode : undefined }
      );
      await applySession(r.accessToken, r.refreshToken);
      router.push(`/${locale}/home`);
    } catch (e) {
      const reason = e instanceof ApiError ? (e.code ?? "BAD_CREDENTIALS") : "NETWORK_ERROR";
      if (reason === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        setError(t(authErrorKey("TOTP_REQUIRED")));
      } else {
        setError(t(authErrorKey(reason)));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={step === "request" ? onRequest : onVerify}>
          <h1 className={styles.title}>{t("auth.email_code.title")}</h1>
          <p className={styles.subtitle}>{t("auth.email_code.subtitle")}</p>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {!error && info && step === "verify" && <p className={styles.subtitle}>{info}</p>}

          <div className={styles.field}>
            <label htmlFor="email">{t("auth.email_code.email_label")}</label>
            <input
              id="email" name="email" type="email" autoComplete="email" required
              disabled={step === "verify"}
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {step === "verify" && (
            <>
              <div className={styles.field}>
                <label htmlFor="code">{t("auth.email_code.code_label")}</label>
                <input
                  id="code" name="code" autoComplete="one-time-code" required
                  maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>
              {needsTotp && (
                <div className={styles.field}>
                  <label htmlFor="totpCode">{t("auth.email_code.totp_label")}</label>
                  <input
                    id="totpCode" name="totpCode" autoComplete="one-time-code"
                    value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <Button type="submit" className={styles.submit} disabled={submitting}>
            {step === "request"
              ? (submitting ? t("auth.email_code.requesting") : t("auth.email_code.request_cta"))
              : (submitting ? t("auth.email_code.verifying") : t("auth.email_code.verify_cta"))}
          </Button>

          <LocaleLink href="/login" className={styles.secondaryLink}>
            {t("auth.email_code.back_to_password")}
          </LocaleLink>
        </form>
      </div>
    </>
  );
}
