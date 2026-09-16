"use client";

/**
 * The one place the admin surface answers a step-up challenge.
 *
 * Privileged admin actions are gated on a short-lived, single-action token
 * minted from the admin's own password (and TOTP when enrolled). Before
 * this existed, each page had to build that flow by hand, so most buttons
 * simply returned 401 -- and the protection was removed from the actions
 * rather than the flow being built. Mounting this once inside
 * AdminPageLayout means every admin request in the app can be re-tried
 * transparently: api.ts asks, this prompts, the request goes through.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { setStepUpPrompt } from "@/lib/api";
import styles from "./StepUpProvider.module.css";

type Pending = {
  action: string;
  resolve: (value: { password: string; totpCode?: string | undefined } | null) => void;
};

/** Human wording for the actions an operator actually sees a prompt for. */
const ACTION_LABELS: Record<string, string> = {
  "admin.rbac.manage": "تعديل الأدوار والصلاحيات",
  "admin.role.grant": "منح دور إداري",
  "admin.user.confiscate": "حظر اللاعب ومصادرة رصيده",
  "admin.game.manage": "تغيير حالة لعبة على المنصة",
  "admin.control.toggle": "تغيير إعداد تشغيلي",
  "admin.control.global": "تغيير إعداد عام للمنصة",
  "admin.tournament.manage": "إدارة بطولة",
  "admin.tournament.settle": "تسوية جوائز بطولة",
  "admin.withdrawal.approve_solo": "اعتماد طلب سحب",
  "admin.withdrawal.reject": "رفض طلب سحب",
  "admin.fairplay.decide": "إصدار قرار في قضية لعب نزيه",
  "admin.risk.decide": "إغلاق تنبيه مخاطر",
  "admin.rail.manage": "تعديل بوابة دفع",
  "admin.reconciliation.decide": "إغلاق حالة تسوية محاسبية",
  "admin.settings.manage": "حفظ إعدادات المنصة",
  "admin.policy.manage": "تعديل سياسة قانونية",
  "admin.referral.decide": "قرار في مكافأة إحالة",
  "admin.support.config.update": "تعديل إعدادات الدعم",
};

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStepUpPrompt((action) =>
      new Promise((resolve) => {
        setPassword("");
        setTotpCode("");
        setError(null);
        setBusy(false);
        setPending({ action, resolve });
      })
    );
    return () => setStepUpPrompt(null);
  }, []);

  useEffect(() => {
    if (pending) passwordRef.current?.focus();
  }, [pending]);

  const close = useCallback((value: { password: string; totpCode?: string | undefined } | null) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!password) {
        setError("أدخل كلمة المرور للمتابعة.");
        return;
      }
      setBusy(true);
      close({ password, totpCode: totpCode.trim() || undefined });
    },
    [password, totpCode, close]
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <>
      {children}
      {pending && (
        <div className={styles.scrim} role="presentation" onClick={() => close(null)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stepup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="stepup-title" className={styles.title}>
              تأكيد الهوية مطلوب
            </h2>
            <p className={styles.lede}>
              هذا الإجراء حسّاس: <strong>{ACTION_LABELS[pending.action] ?? pending.action}</strong>.
              أكّد كلمة المرور للمتابعة — التأكيد صالح لخمس دقائق.
            </p>

            <form onSubmit={onSubmit}>
              <label className={styles.label} htmlFor="stepup-password">
                كلمة المرور
              </label>
              <input
                id="stepup-password"
                ref={passwordRef}
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />

              <label className={styles.label} htmlFor="stepup-totp">
                رمز المصادقة الثنائية <span className={styles.optional}>(إن كانت مفعّلة)</span>
              </label>
              <input
                id="stepup-totp"
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.buttons}>
                <button type="button" className={styles.cancel} onClick={() => close(null)}>
                  إلغاء
                </button>
                <button type="submit" className={styles.confirm} disabled={busy}>
                  {busy ? "جارٍ التأكيد…" : "تأكيد ومتابعة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
