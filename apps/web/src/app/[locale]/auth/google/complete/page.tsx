"use client";

/**
 * Where Google's own redirect lands, and the ONE page that ever completes
 * a Google sign-in. The backend has already validated everything by the
 * time we get here (see packages/auth/src/google-oauth.mjs) -- this page
 * only ever reads the outcome its own backend decided and a short-lived,
 * single-use handoff code, never a raw token, from the URL:
 *
 *   ?outcome=session&handoff=...&returnTo=...   -- exchange for a real session
 *   ?outcome=linked&returnTo=...                -- an authenticated link succeeded
 *   ?outcome=link_required&email=...            -- an account already exists
 *   ?outcome=link_failed&reason=...             -- linking failed for a specific reason
 *   ?outcome=denied|invalid|error|unavailable   -- no session, no account change
 *
 * Never trust anything else in this URL: no email/name/id from Google
 * itself ever reaches this page directly, only what the backend already
 * verified server-side.
 */
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { post, ApiError } from "@/lib/api";
import styles from "@/components/auth/AuthForm.module.css";

// Only ever an internal, allowlisted-shaped path -- this mirrors the
// backend's own allowedReturnPaths check, which already refused anything
// else before minting the state that produced this redirect. Re-checking
// here is a second, cheap guard against ever handing `router.push` a
// value that did not originate from that check (e.g. a hand-crafted URL).
function safeReturnTo(returnTo: string | null): string | null {
  if (!returnTo) return null;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

function GoogleCompleteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { applySession } = useAuth();
  const { t, locale } = useI18n();

  const outcome = params.get("outcome");
  const handoff = params.get("handoff");
  const returnTo = safeReturnTo(params.get("returnTo"));
  const email = params.get("email");
  const reason = params.get("reason");

  const access = params.get("access");
  const refresh = params.get("refresh");

  const [status, setStatus] = useState<"working" | "needs_totp" | "done" | "error">(
    outcome === "session" || outcome === "session_direct" ? "working" : "done"
  );
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  async function finalize(withTotp?: string) {
    if (!handoff) { setStatus("error"); setError(t(authErrorKey("BAD_STATE"))); return; }
    try {
      const r = await post<{ accessToken: string; refreshToken: string }>(
        "/v1/auth/google/finalize", { handoffCode: handoff, totpCode: withTotp }
      );
      await applySession(r.accessToken, r.refreshToken);
      router.replace(`/${locale}${returnTo ?? "/home"}`);
    } catch (e) {
      const code = e instanceof ApiError ? (e.code ?? "BAD_STATE") : "NETWORK_ERROR";
      if (code === "TOTP_REQUIRED") {
        setStatus("needs_totp");
      } else {
        setStatus("error");
        setError(t(authErrorKey(code)));
      }
    }
  }

  useEffect(() => {
    if (outcome === "session_direct") {
      if (access && refresh) {
        applySession(access, refresh).then(() => {
          router.replace(`/${locale}${returnTo ?? "/home"}`);
        });
      } else {
        router.replace(`/${locale}${returnTo ?? "/home"}`);
      }
      return;
    }
    if (outcome !== "session" || attempted.current) return;
    attempted.current = true;
    void finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, access, refresh]);

  async function onTotpSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("working");
    await finalize(totpCode);
  }

  if (outcome === "session" && status === "working") {
    return <p className={styles.subtitle}>{t("auth.google.completing")}</p>;
  }

  if (outcome === "session" && status === "needs_totp") {
    return (
      <form className={styles.card} onSubmit={onTotpSubmit}>
        <h1 className={styles.title}>{t("auth.google.totp_label")}</h1>
        <div className={styles.field}>
          <label htmlFor="totpCode">{t("auth.google.totp_label")}</label>
          <input id="totpCode" name="totpCode" autoComplete="one-time-code" autoFocus
            value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
        </div>
        <Button type="submit" className={styles.submit}>{t("auth.google.totp_cta")}</Button>
      </form>
    );
  }

  if (outcome === "session" && status === "error") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.google.error_title")}</h1>
        <p className={styles.subtitle}>{error}</p>
        <LocaleLink href="/login"><Button>{t("auth.forgot_password.back_to_login")}</Button></LocaleLink>
      </div>
    );
  }

  if (outcome === "linked") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.google.linked_title")}</h1>
        <p className={styles.subtitle}>{t("auth.google.linked_body")}</p>
        <LocaleLink href={returnTo ?? "/settings/security"}><Button>{t("auth.google.continue_cta")}</Button></LocaleLink>
      </div>
    );
  }

  if (outcome === "link_required") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.google.link_required_title")}</h1>
        <p className={styles.subtitle}>{t(authErrorKey("LINK_REQUIRED"))}</p>
        {email && <p className={styles.subtitle}>{email}</p>}
        <LocaleLink href="/login"><Button>{t("auth.google.link_required_cta")}</Button></LocaleLink>
      </div>
    );
  }

  if (outcome === "link_failed") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.google.link_failed_title")}</h1>
        <p className={styles.subtitle}>{t(authErrorKey(reason ?? "GENERIC"))}</p>
        <LocaleLink href="/settings/security"><Button>{t("auth.google.continue_cta")}</Button></LocaleLink>
      </div>
    );
  }

  const titleKey = outcome === "denied" ? "auth.google.denied_title"
    : outcome === "unavailable" ? "auth.google.unavailable_title"
    : "auth.google.invalid_title";
  const bodyErrorCode = outcome === "denied" ? "GOOGLE_DENIED"
    : outcome === "unavailable" ? "GOOGLE_LOGIN_UNAVAILABLE"
    : "BAD_STATE";

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{t(titleKey)}</h1>
      <p className={styles.subtitle}>{t(authErrorKey(bodyErrorCode))}</p>
      <LocaleLink href="/login"><Button>{t("auth.forgot_password.back_to_login")}</Button></LocaleLink>
    </div>
  );
}

export default function GoogleCompletePage() {
  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <Suspense fallback={null}>
          <GoogleCompleteInner />
        </Suspense>
      </div>
    </>
  );
}
