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
import { useI18n } from "@/lib/i18n/context";
import styles from "./StepUpProvider.module.css";

type Pending = {
  action: string;
  resolve: (value: { password: string; totpCode?: string | undefined } | null) => void;
};

/** Human wording for the actions an operator actually sees a prompt for. */
const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  "admin.rbac.manage": { ar: "تعديل الأدوار والرتب الإدارية", en: "Manage Roles & Staff Permissions" },
  "admin.role.grant": { ar: "منح دور إداري", en: "Grant Admin Role" },
  "admin.user.confiscate": { ar: "حظر اللاعب ومصادرة رصيده", en: "Ban Player & Confiscate Balance" },
  "admin.game.manage": { ar: "تغيير حالة لعبة على المنصة", en: "Manage Game Status" },
  "admin.control.toggle": { ar: "تغيير إعداد تشغيلي", en: "Toggle System Control" },
  "admin.control.global": { ar: "تغيير إعداد عام للمنصة", en: "Toggle Global Setting" },
  "admin.tournament.manage": { ar: "إدارة بطولة", en: "Manage Tournament" },
  "admin.tournament.settle": { ar: "تسوية جوائز بطولة", en: "Settle Tournament Prizes" },
  "admin.withdrawal.approve_solo": { ar: "اعتماد طلب سحب", en: "Approve Withdrawal" },
  "admin.withdrawal.reject": { ar: "رفض طلب سحب", en: "Reject Withdrawal" },
  "admin.fairplay.decide": { ar: "إصدار قرار في قضية لعب نزيه", en: "Decide Fair-Play Case" },
  "admin.risk.decide": { ar: "إغلاق تنبيه مخاطر", en: "Close Risk Alert" },
  "admin.rail.manage": { ar: "تعديل بوابة دفع", en: "Manage Payment Rail" },
  "admin.local_rail.manage": { ar: "تعديل سعر الصرف أو أرقام الاستلام", en: "Manage Local Rate / Numbers" },
  "admin.local_deposit.credit_solo": { ar: "تأكيد إيداع فودافون كاش / إنستاباي", en: "Confirm Local Deposit" },
  "admin.local_withdrawal.complete_solo": { ar: "تأكيد إرسال سحب فودافون كاش / إنستاباي", en: "Confirm Local Withdrawal Sent" },
  "admin.reconciliation.decide": { ar: "إغلاق حالة تسوية محاسبية", en: "Settle Reconciliation" },
  "admin.settings.manage": { ar: "حفظ إعدادات المنصة", en: "Save Platform Settings" },
  "admin.policy.manage": { ar: "تعديل سياسة قانونية", en: "Manage Legal Policy" },
  "admin.referral.decide": { ar: "قرار في مكافأة إحالة", en: "Decide Referral Reward" },
  "admin.support.config.update": { ar: "تعديل إعدادات الدعم", en: "Update Support Settings" },
};

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const { locale, dir } = useI18n();
  const isAr = locale.startsWith("ar");
  const isRtl = dir === "rtl";

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
        setError(isAr ? "أدخل كلمة المرور للمتابعة." : "Please enter your password to continue.");
        return;
      }
      setBusy(true);
      close({ password, totpCode: totpCode.trim() || undefined });
    },
    [password, totpCode, close, isAr]
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const actionInfo = pending ? ACTION_LABELS[pending.action] : undefined;
  const actionLabel = actionInfo ? (isAr ? actionInfo.ar : actionInfo.en) : pending?.action;

  return (
    <>
      {children}
      {pending && (
        <div className={styles.scrim} role="presentation" onClick={() => close(null)}>
          <div
            className={styles.dialog}
            dir={isRtl ? "rtl" : "ltr"}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stepup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="stepup-title" className={styles.title}>
              {isAr ? "🔐 تأكيد الهوية مطلوب" : "🔐 Identity Confirmation Required"}
            </h2>
            <p className={styles.lede}>
              {isAr ? (
                <>
                  هذا الإجراء حسّاس: <strong>{actionLabel}</strong>.
                  أكّد كلمة المرور للمتابعة — التأكيد صالح لخمس دقائق.
                </>
              ) : (
                <>
                  This action is privileged: <strong>{actionLabel}</strong>.
                  Confirm your password to proceed — confirmation remains active for 5 minutes.
                </>
              )}
            </p>

            <form onSubmit={onSubmit}>
              <label className={styles.label} htmlFor="stepup-password">
                {isAr ? "كلمة المرور" : "Admin Password"}
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
                {isAr ? (
                  <>
                    رمز المصادقة الثنائية <span className={styles.optional}>(إن كانت مفعّلة)</span>
                  </>
                ) : (
                  <>
                    Two-Factor Code <span className={styles.optional}>(if enabled)</span>
                  </>
                )}
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
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button type="submit" className={styles.confirm} disabled={busy}>
                  {busy
                    ? isAr
                      ? "جارٍ التأكيد…"
                      : "Verifying…"
                    : isAr
                    ? "تأكيد ومتابعة"
                    : "Confirm & Proceed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
