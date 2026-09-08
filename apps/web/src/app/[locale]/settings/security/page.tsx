"use client";

/**
 * Security / Login Methods. Shows exactly what GET /v1/me/auth-methods
 * returns -- four flags, nothing else (see packages/auth/src/
 * auth-methods.mjs's own header for why that boundary is deliberate: no
 * provider subject, no token, no internal id ever reaches this page).
 *
 * Every state-changing action here (connect/disconnect Google, set/change
 * password) goes through the SAME step-up mechanism every other high-risk
 * account action already uses (POST /v1/auth/step-up) -- this page invents
 * no new authorisation model, it only ever asks for a step-up token before
 * calling the route that needs one.
 */
import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, post, del, ApiError } from "@/lib/api";
import styles from "./security.module.css";
import formStyles from "@/components/auth/AuthForm.module.css";

type AuthMethods = {
  email: { exists: boolean; verified: boolean };
  password: { configured: boolean };
  google: { connected: boolean };
  totp: { enabled: boolean };
};

type Panel =
  | null
  | { kind: "set_password" }
  | { kind: "change_password" }
  | { kind: "disconnect_confirm" }
  | { kind: "step_up_then"; action: string; next: (stepUpToken: string) => Promise<void> };

export default function SecurityPage() {
  return (
    <RequireAuth>
      <SecurityContent />
    </RequireAuth>
  );
}

function SecurityContent() {
  const { t, locale } = useI18n();
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const m = await get<AuthMethods>("/v1/me/auth-methods");
    setMethods(m);
  }

  useEffect(() => { void reload(); }, []);

  function fail(e: unknown, fallback = "GENERIC") {
    const code = e instanceof ApiError ? (e.code ?? fallback) : "NETWORK_ERROR";
    setError(t(authErrorKey(code)));
  }

  // A single, reusable step-up prompt: asks for the account password (and
  // TOTP, if enrolled), exchanges it for a stepUpToken bound to `action`,
  // then runs whatever the caller actually wanted to do with it. Nothing
  // here decides WHO may perform `action` -- the backend's own policy
  // (packages/authz/src/policy.mjs) is the only thing that ever grants or
  // refuses a step-up token.
  function requireStepUp(action: string, next: (stepUpToken: string) => Promise<void>) {
    setError(null);
    setPanel({ kind: "step_up_then", action, next });
  }

  async function onConnectGoogle() {
    requireStepUp("player.identity.link", async (stepUpToken) => {
      const r = await post<{ url: string }>(
        "/v1/me/identities/google/link/start", { locale },
        { stepUpToken }
      );
      window.location.href = r.url;
    });
  }

  function onDisconnectGoogleClick() {
    // The panel itself branches on methods.password.configured (see the
    // two "disconnect_confirm" render blocks below) -- one path offers
    // the real disconnect confirmation, the other redirects to setting a
    // password first, per directive #5's required flow.
    setError(null);
    setPanel({ kind: "disconnect_confirm" });
  }

  async function onDisconnectConfirmed() {
    requireStepUp("player.identity.unlink", async (stepUpToken) => {
      await del("/v1/me/identities/google", { stepUpToken });
      setMessage(t("auth.security.disconnected_message"));
      await reload();
    });
  }

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t("auth.security.title")}</h1>
        <p className={styles.subtitle}>{t("auth.security.subtitle")}</p>

        {message && <p className={formStyles.subtitle} role="status">{message}</p>}
        {error && <p className={formStyles.error} role="alert">{error}</p>}

        {methods && (
          <ul className={styles.list}>
            <li className={styles.row}>
              <div>
                <div className={styles.label}>{t("auth.security.password_label")}</div>
                <div className={styles.state}>
                  {methods.password.configured ? t("auth.security.password_set") : t("auth.security.password_not_set")}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => { setError(null); setPanel({ kind: methods.password.configured ? "change_password" : "set_password" }); }}
              >
                {methods.password.configured ? t("auth.security.change_password_cta") : t("auth.security.set_password_cta")}
              </Button>
            </li>

            <li className={styles.row}>
              <div>
                <div className={styles.label}>{t("auth.security.email_label")}</div>
                <div className={styles.state}>
                  {!methods.email.exists ? t("auth.security.email_not_set")
                    : methods.email.verified ? t("auth.security.email_verified")
                    : t("auth.security.email_unverified")}
                </div>
              </div>
            </li>

            <li className={styles.row}>
              <div>
                <div className={styles.label}>{t("auth.security.google_label")}</div>
                <div className={styles.state}>
                  {methods.google.connected ? t("auth.security.google_connected") : t("auth.security.google_not_connected")}
                </div>
              </div>
              {methods.google.connected ? (
                <Button variant="secondary" onClick={onDisconnectGoogleClick}>{t("auth.security.disconnect_google_cta")}</Button>
              ) : (
                <Button variant="secondary" onClick={() => void onConnectGoogle()}>{t("auth.security.connect_google_cta")}</Button>
              )}
            </li>

            <li className={styles.row}>
              <div>
                <div className={styles.label}>{t("auth.security.totp_label")}</div>
                <div className={styles.state}>
                  {methods.totp.enabled ? t("auth.security.totp_enabled") : t("auth.security.totp_disabled")}
                </div>
              </div>
            </li>
          </ul>
        )}

        {panel?.kind === "disconnect_confirm" && methods && !methods.password.configured && (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t("auth.security.need_password_before_disconnect_title")}</h2>
            <p className={formStyles.subtitle}>{t("auth.security.need_password_before_disconnect_body")}</p>
            <div className={styles.panelActions}>
              <Button onClick={() => { setPanel({ kind: "set_password" }); }}>{t("auth.security.set_password_cta")}</Button>
              <Button variant="ghost" onClick={() => setPanel(null)}>{t("auth.security.cancel_cta")}</Button>
            </div>
          </div>
        )}

        {panel?.kind === "disconnect_confirm" && methods && methods.password.configured && (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t("auth.security.confirm_disconnect_title")}</h2>
            <p className={formStyles.subtitle}>{t("auth.security.confirm_disconnect_body")}</p>
            <div className={styles.panelActions}>
              <Button onClick={() => void onDisconnectConfirmed()}>{t("auth.security.confirm_disconnect_cta")}</Button>
              <Button variant="ghost" onClick={() => setPanel(null)}>{t("auth.security.cancel_cta")}</Button>
            </div>
          </div>
        )}

        {panel?.kind === "set_password" && (
          <SetPasswordPanel
            onDone={async () => { setPanel(null); setMessage(t("auth.security.password_saved")); await reload(); }}
            onCancel={() => setPanel(null)}
            onError={fail}
          />
        )}

        {panel?.kind === "change_password" && (
          <ChangePasswordPanel
            onDone={() => { setPanel(null); setMessage(t("auth.security.password_saved")); }}
            onCancel={() => setPanel(null)}
            onError={fail}
          />
        )}

        {panel?.kind === "step_up_then" && (
          <StepUpPanel
            action={panel.action}
            totpEnabled={methods?.totp.enabled ?? false}
            busy={busy}
            onCancel={() => setPanel(null)}
            onConfirmed={async (stepUpToken) => {
              setBusy(true);
              setError(null);
              try {
                await panel.next(stepUpToken);
                setPanel(null);
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </>
  );
}

function StepUpPanel({
  action, totpEnabled, busy, onCancel, onConfirmed,
}: {
  action: string; totpEnabled: boolean; busy: boolean;
  onCancel: () => void; onConfirmed: (stepUpToken: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await post<{ stepUpToken: string }>("/v1/auth/step-up", {
        action, password, totpCode: totpEnabled ? totpCode : undefined,
      });
      await onConfirmed(r.stepUpToken);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError(t(authErrorKey(code ?? "BAD_CREDENTIALS")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={onSubmit}>
      <h2 className={styles.panelTitle}>{t("auth.security.step_up_password_label")}</h2>
      {error && <p className={formStyles.error} role="alert">{error}</p>}
      <div className={formStyles.field}>
        <label htmlFor="stepUpPassword">{t("auth.security.step_up_password_label")}</label>
        <input id="stepUpPassword" type="password" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {totpEnabled && (
        <div className={formStyles.field}>
          <label htmlFor="stepUpTotp">{t("auth.security.step_up_totp_label")}</label>
          <input id="stepUpTotp" autoComplete="one-time-code"
            value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
        </div>
      )}
      <div className={styles.panelActions}>
        <Button type="submit" disabled={submitting || busy}>{t("auth.security.step_up_cta")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("auth.security.cancel_cta")}</Button>
      </div>
    </form>
  );
}

function SetPasswordPanel({
  onDone, onCancel, onError,
}: { onDone: () => Promise<void>; onCancel: () => void; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await post("/v1/me/password", { newPassword });
      await onDone();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setLocalError(t(authErrorKey(code ?? "GENERIC")));
      onError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={onSubmit}>
      <h2 className={styles.panelTitle}>{t("auth.security.set_password_title")}</h2>
      {localError && <p className={formStyles.error} role="alert">{localError}</p>}
      <div className={formStyles.field}>
        <label htmlFor="newPassword">{t("auth.security.password_field_label")}</label>
        <input id="newPassword" type="password" autoComplete="new-password" required minLength={10} autoFocus
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className={styles.panelActions}>
        <Button type="submit" disabled={submitting}>
          {submitting ? t("auth.security.saving_password") : t("auth.security.save_password_cta")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("auth.security.cancel_cta")}</Button>
      </div>
    </form>
  );
}

function ChangePasswordPanel({
  onDone, onCancel, onError,
}: { onDone: () => void; onCancel: () => void; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      // player.password.change is stepUp-gated, exactly like linking or
      // unlinking Google -- the current password IS the step-up proof
      // here (auth.stepUp() would ask for the same thing a second time),
      // so this route is called directly with it rather than via the
      // generic StepUpPanel.
      const stepUp = await post<{ stepUpToken: string }>("/v1/auth/step-up", {
        action: "player.password.change", password: currentPassword,
      });
      await post("/v1/me/password/change", { currentPassword, newPassword }, { stepUpToken: stepUp.stepUpToken });
      onDone();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setLocalError(t(authErrorKey(code ?? "BAD_CREDENTIALS")));
      onError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={onSubmit}>
      <h2 className={styles.panelTitle}>{t("auth.security.change_password_title")}</h2>
      {localError && <p className={formStyles.error} role="alert">{localError}</p>}
      <div className={formStyles.field}>
        <label htmlFor="currentPassword">{t("auth.security.step_up_password_label")}</label>
        <input id="currentPassword" type="password" autoComplete="current-password" required autoFocus
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </div>
      <div className={formStyles.field}>
        <label htmlFor="newPassword">{t("auth.security.password_field_label")}</label>
        <input id="newPassword" type="password" autoComplete="new-password" required minLength={10}
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </div>
      <div className={styles.panelActions}>
        <Button type="submit" disabled={submitting}>
          {submitting ? t("auth.security.saving_password") : t("auth.security.save_password_cta")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("auth.security.cancel_cta")}</Button>
      </div>
    </form>
  );
}
