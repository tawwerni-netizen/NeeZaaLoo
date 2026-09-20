"use client";

/**
 * Vodafone Cash / InstaPay: the local EGP rails (db/migrations/0062).
 * Designed for effortless Egyptian local deposits and withdrawals.
 * Features:
 * - 1-click copy for receiving numbers and amounts
 * - Direct USSD Quick Dial (*9*7*PHONE*AMOUNT#) for Vodafone Cash
 * - Live EGP / USDT currency conversion and clear instructions
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/app/[locale]/wallet/wallet.module.css";

type LocalNetwork = "VODAFONE_CASH" | "INSTAPAY";

type LocalNumber = { id: string; network: LocalNetwork; phoneNumber: string; label: string | null };
type LocalRate = { egpPerUsd: number; effectiveAt: string } | null;

type LocalDepositIntent = {
  id: string;
  network: LocalNetwork;
  receivingNumberId: string;
  amountEgpMinor: string;
  status: "PENDING" | "MATCHED" | "CREDITED" | "EXPIRED" | "REJECTED";
  creditedAmountUsdtMinor: string | null;
  createdAt: string;
  expiresAt: string;
};

function egpLabel(minor: string): string {
  return (Number(minor) / 100).toFixed(2);
}

function usdtLabel(minor: string | null): string {
  if (!minor) return "0.00";
  return (Number(minor) / 1_000_000).toFixed(2);
}

const STATUS_LABEL: Record<LocalDepositIntent["status"], { en: string; ar: string; tone: string }> = {
  PENDING: { en: "Waiting for your transfer", ar: "في انتظار التحويل من هاتفك", tone: "#f59e0b" },
  MATCHED: { en: "Transfer seen, confirming", ar: "تم رصد التحويل، جارٍ التأكيد", tone: "#f59e0b" },
  CREDITED: { en: "Credited to your wallet", ar: "تم الإيداع في رصيدك بنجاح", tone: "#22c55e" },
  EXPIRED: { en: "Expired", ar: "منتهي الصلاحية", tone: "#ef4444" },
  REJECTED: { en: "Rejected", ar: "مرفوض", tone: "#ef4444" },
};

export function LocalDepositSection({ isAr, playerId, onCredited }: { isAr: boolean; playerId: string; onCredited?: () => void }) {
  const [numbers, setNumbers] = useState<LocalNumber[] | null>(null);
  const [rate, setRate] = useState<LocalRate>(null);
  const [network, setNetwork] = useState<LocalNetwork>("VODAFONE_CASH");
  const [receivingNumberId, setReceivingNumberId] = useState<string>("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [amountEgp, setAmountEgp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<LocalDepositIntent | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const creditedNotified = useRef(false);

  const copyText = (key: string, text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const loadRails = useCallback(() => {
    get<{ numbers: LocalNumber[]; rate: LocalRate }>("/v1/payments/local-rails")
      .then((r) => {
        setNumbers(r.numbers ?? []);
        setRate(r.rate ?? null);
        setReceivingNumberId((prev) => {
          if (prev && r.numbers?.some((n) => n.id === prev)) return prev;
          return r.numbers?.find((n) => n.network === network)?.id ?? "";
        });
      })
      .catch(() => setNumbers([]));
  }, [network]);

  useEffect(() => { loadRails(); }, [loadRails]);

  // Recover an in-flight intent on load, so a refresh does not lose it.
  useEffect(() => {
    get<{ intents: LocalDepositIntent[] }>(`/v1/players/${playerId}/local-deposits`)
      .then((r) => {
        const open = (r.intents ?? []).find((i) => i.status === "PENDING" || i.status === "MATCHED");
        if (open) setIntent(open);
      })
      .catch(() => {});
  }, [playerId]);

  // Light polling while an intent is open, so "credited automatically" is visible without a manual refresh.
  useEffect(() => {
    if (!intent || intent.status === "CREDITED" || intent.status === "REJECTED" || intent.status === "EXPIRED") return;
    const timer = setInterval(async () => {
      try {
        const r = await get<{ intents: LocalDepositIntent[] }>(`/v1/players/${playerId}/local-deposits`);
        const updated = r.intents.find((i) => i.id === intent.id);
        if (updated) {
          setIntent(updated);
          if (updated.status === "CREDITED" && !creditedNotified.current) {
            creditedNotified.current = true;
            onCredited?.();
          }
        }
      } catch { /* transient -- next tick retries */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [intent, playerId, onCredited]);

  const numbersForNetwork = (numbers ?? []).filter((n) => n.network === network);
  const parsedAmount = parseFloat(amountEgp);
  const estimatedUsdt = rate && !isNaN(parsedAmount) && parsedAmount > 0 ? (parsedAmount / rate.egpPerUsd).toFixed(2) : null;

  async function submit() {
    setError(null);
    if (!receivingNumberId) { setError(isAr ? "اختر رقم المحفظة المستلمة" : "Choose a receiving number"); return; }
    if (!senderName.trim() || !senderPhone.trim()) {
      setError(isAr ? "من فضلك أدخل اسمك ورقم الهاتف الذي ستحول منه" : "Please enter your name and phone number");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(isAr ? "أدخل مبلغاً صحيحاً بالجنيه" : "Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const r = await post<{ intent: LocalDepositIntent }>(`/v1/players/${playerId}/local-deposits`, {
        network, receivingNumberId, senderName, senderPhone,
        amountEgpMinor: Math.round(parsedAmount * 100),
      });
      creditedNotified.current = false;
      setIntent(r.intent);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      const messages: Record<string, { en: string; ar: string }> = {
        NO_RATE_SET: { en: "Vodafone Cash / InstaPay deposits are not available right now.", ar: "الإيداع عبر فودافون كاش / إنستاباي غير متاح الآن." },
        BELOW_MINIMUM: { en: "That amount is below the minimum for this method.", ar: "هذا المبلغ أقل من الحد الأدنى المسموح." },
        ABOVE_MAXIMUM: { en: "That amount is above the maximum for this method.", ar: "هذا المبلغ أكبر من الحد الأقصى المسموح." },
        INVALID_RECEIVING_NUMBER: { en: "That number is no longer active -- pick another.", ar: "هذا الرقم لم يعد متاحاً، اختر رقماً آخر." },
      };
      const msg = code ? messages[code] : null;
      setError(msg ? (isAr ? msg.ar : msg.en) : (isAr ? "تعذر إنشاء طلب الإيداع" : "Could not create the deposit request"));
    } finally {
      setSubmitting(false);
    }
  }

  if (intent && (intent.status === "PENDING" || intent.status === "MATCHED")) {
    const num = numbers?.find((n) => n.id === intent.receivingNumberId);
    const minutesLeft = Math.max(0, Math.round((new Date(intent.expiresAt).getTime() - Date.now()) / 60000));
    const isVodafone = intent.network === "VODAFONE_CASH";
    const cleanNum = num?.phoneNumber?.replace(/[^0-9]/g, "") || "";
    const egpNumRound = Math.round(Number(intent.amountEgpMinor) / 100);
    const ussdDial = isVodafone && cleanNum ? `*9*7*${cleanNum}*${egpNumRound}#` : null;

    return (
      <div className={styles.actionCard}>
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>✓</span>
          <h2 className={styles.stepTitle}>{isAr ? "أكمل التحويل الآن" : "Complete your transfer"}</h2>
        </div>

        <div className={styles.formGroup}>
          <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>
            {isAr
              ? `حوّل المبلغ المطلوب إلى الرقم الموضح أدناه. بعد إتمام التحويل من محفظتك، سيتم تأكيد طلبك وإضافة الرصيد تلقائياً.`
              : `Send the requested amount to the number below. Once transferred, your balance will be credited automatically.`}
          </p>

          {/* Quick Dial Button for Vodafone Cash */}
          {ussdDial && (
            <a
              href={`tel:${ussdDial.replace(/#/g, "%23")}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 16px",
                background: "linear-gradient(135deg, #e60000 0%, #b30000 100%)",
                borderRadius: 10,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                textDecoration: "none",
                marginBottom: 12,
                boxShadow: "0 4px 14px rgba(230,0,0,0.35)",
              }}
            >
              <span>📞 {isAr ? `اضغط للتحويل الفوري من خطك (*9*7*...)` : `Instant USSD Transfer (*9*7*...)`}</span>
            </a>
          )}

          {/* Number to send to box with 1-click copy */}
          <div style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>
                {isAr ? `رقم التحويل (${isVodafone ? "فودافون كاش" : "إنستاباي"})` : "Send to Number"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#38bdf8", fontFamily: "var(--nz-font-num)", letterSpacing: "0.04em" }}>
                {num?.phoneNumber || "--"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyText("rec-num", num?.phoneNumber || "")}
              style={{
                padding: "7px 14px",
                background: copiedKey === "rec-num" ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.1)",
                border: copiedKey === "rec-num" ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                color: copiedKey === "rec-num" ? "#22c55e" : "#fff",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copiedKey === "rec-num" ? (isAr ? "✓ تم النسخ!" : "Copied!") : (isAr ? "📋 نسخ الرقم" : "Copy")}
            </button>
          </div>

          {/* Exact amount box with 1-click copy */}
          <div style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>
                {isAr ? "المبلغ المطلوب تحويله بالجنيه" : "Exact Amount to Send"}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#4ade80", fontFamily: "var(--nz-font-num)" }}>
                {egpLabel(intent.amountEgpMinor)} ج.م
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyText("rec-amount", String(egpNumRound))}
              style={{
                padding: "7px 14px",
                background: copiedKey === "rec-amount" ? "rgba(34, 197, 94, 0.2)" : "rgba(255,255,255,0.1)",
                border: copiedKey === "rec-amount" ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                color: copiedKey === "rec-amount" ? "#22c55e" : "#fff",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copiedKey === "rec-amount" ? (isAr ? "✓ تم النسخ!" : "Copied!") : (isAr ? "📋 نسخ المبلغ" : "Copy")}
            </button>
          </div>

          <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>
            {isAr ? `تنتهي صلاحية الطلب خلال ${minutesLeft} دقيقة` : `Expires in ${minutesLeft} min`}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, fontWeight: 700, color: STATUS_LABEL[intent.status].tone }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_LABEL[intent.status].tone }} />
            {isAr ? STATUS_LABEL[intent.status].ar : STATUS_LABEL[intent.status].en}
          </div>
        </div>

        <button type="button" className={styles.submitActionBtn} onClick={() => setIntent(null)} style={{ marginTop: 14 }}>
          {isAr ? "إلغاء وبدء طلب جديد" : "Cancel and start a new request"}
        </button>
      </div>
    );
  }

  if (intent && intent.status === "CREDITED") {
    return (
      <div className={styles.actionCard}>
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>✓</span>
          <h2 className={styles.stepTitle}>{isAr ? "تم الإيداع بنجاح" : "Deposit complete"}</h2>
        </div>
        <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
          {isAr
            ? `تم إضافة ${usdtLabel(intent.creditedAmountUsdtMinor)} USDT إلى رصيدك.`
            : `${usdtLabel(intent.creditedAmountUsdtMinor)} USDT was added to your wallet.`}
        </p>
        <button type="button" className={styles.submitActionBtn} onClick={() => setIntent(null)}>
          {isAr ? "إجراء إيداع آخر" : "Make another deposit"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <div className={styles.stepHeader}>
        <span className={styles.stepBadge}>1</span>
        <h2 className={styles.stepTitle}>{isAr ? "اختر طريقة التحويل" : "Choose a transfer method"}</h2>
      </div>
      <div className={styles.networkCardsGrid}>
        <button
          type="button"
          className={`${styles.networkCard} ${network === "VODAFONE_CASH" ? styles.networkCardActiveTrc : ""}`}
          onClick={() => { setNetwork("VODAFONE_CASH"); setReceivingNumberId(""); }}
        >
          {isAr ? "🔴 فودافون كاش" : "Vodafone Cash"}
        </button>
        <button
          type="button"
          className={`${styles.networkCard} ${network === "INSTAPAY" ? styles.networkCardActiveTrc : ""}`}
          onClick={() => { setNetwork("INSTAPAY"); setReceivingNumberId(""); }}
        >
          {isAr ? "⚡ إنستاباي" : "InstaPay"}
        </button>
      </div>

      {rate && (
        <div style={{ fontSize: 13, color: "#94a3b8", margin: "12px 0", background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8 }}>
          {isAr ? `سعر الصرف المعتمد: 1 دولار = ${rate.egpPerUsd} جنيه مصري` : `Current rate: 1 USD = ${rate.egpPerUsd} EGP`}
        </div>
      )}
      {numbers && numbers.length > 0 && numbersForNetwork.length === 0 && (
        <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {isAr ? "لا توجد محافظ متاحة لهذه الطريقة حالياً. يرجى المحاولة بعد قليل." : "No numbers are available for this method right now"}
        </div>
      )}

      <div className={styles.stepHeader}>
        <span className={styles.stepBadge}>2</span>
        <h2 className={styles.stepTitle}>{isAr ? "اختر المحفظة المستلمة" : "Send to"}</h2>
      </div>
      <div className={styles.formGroup}>
        {numbersForNetwork.map((n) => (
          <label
            key={n.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              marginBottom: 8,
              background: receivingNumberId === n.id ? "rgba(56, 189, 248, 0.1)" : "rgba(255,255,255,0.03)",
              border: receivingNumberId === n.id ? "1.5px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="radio" name="local-number" checked={receivingNumberId === n.id} onChange={() => setReceivingNumberId(n.id)} />
              <span style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--nz-font-num)", color: "#fff" }}>{n.phoneNumber}</span>
              {n.label && <span style={{ color: "#94a3b8", fontSize: 12 }}>({n.label})</span>}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyText(`num-${n.id}`, n.phoneNumber);
              }}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: copiedKey === `num-${n.id}` ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
                border: copiedKey === `num-${n.id}` ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.15)",
                color: copiedKey === `num-${n.id}` ? "#22c55e" : "#cbd5e1",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {copiedKey === `num-${n.id}` ? "تم النسخ" : "نسخ"}
            </button>
          </label>
        ))}
      </div>

      <div className={styles.stepHeader}>
        <span className={styles.stepBadge}>3</span>
        <h2 className={styles.stepTitle}>{isAr ? "بياناتك للتحقق" : "Your details"}</h2>
      </div>
      <div className={styles.formGroup}>
        <div className={styles.formLabel}>{isAr ? "الاسم صاحب المحفظة" : "Wallet owner's name"}</div>
        <input className={styles.formInput} value={senderName} onChange={(e) => setSenderName(e.target.value)}
          placeholder={isAr ? "الاسم كما يظهر في المحفظة أو الحساب" : "Name as it appears on the wallet"} />
      </div>
      <div className={styles.formGroup}>
        <div className={styles.formLabel}>{isAr ? "رقم الهاتف الذي ستحول منه" : "The phone number you'll send from"}</div>
        <input className={styles.formInput} value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)}
          placeholder="01xxxxxxxxx" />
      </div>
      <div className={styles.formGroup}>
        <div className={styles.formLabel}>{isAr ? "المبلغ بالجنيه المصري" : "Amount (EGP)"}</div>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={amountEgp} onChange={(e) => setAmountEgp(e.target.value)}
          placeholder="0.00" />
        {estimatedUsdt && (
          <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700, marginTop: 6 }}>
            {isAr ? `سيتم إضافة: ${estimatedUsdt} USDT إلى رصيدك` : `≈ ${estimatedUsdt} USDT will be added`}
          </div>
        )}
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

      <button type="button" className={styles.submitActionBtn} disabled={submitting} onClick={() => void submit()}>
        {submitting ? (isAr ? "جارٍ الإنشاء..." : "Creating...") : (isAr ? "إنشاء طلب الإيداع" : "Create deposit request")}
      </button>
    </div>
  );
}

export function LocalWithdrawSection({ isAr, playerId, onSubmitted }: { isAr: boolean; playerId: string; onSubmitted?: () => void }) {
  const [network, setNetwork] = useState<LocalNetwork>("VODAFONE_CASH");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [rate, setRate] = useState<LocalRate>(null);

  // Password step-up confirmation
  const [awaitingPassword, setAwaitingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const stepUpToken = useRef<string | null>(null);

  useEffect(() => {
    get<{ rate: LocalRate }>("/v1/payments/local-rails")
      .then((r) => setRate(r.rate ?? null))
      .catch(() => {});
  }, []);

  const parsedAmount = parseFloat(amount);
  const estimatedEgp = rate && !isNaN(parsedAmount) && parsedAmount > 0
    ? (parsedAmount * rate.egpPerUsd).toFixed(2)
    : null;

  async function doSubmit() {
    const parsed = parseFloat(amount);
    const phone = destination.trim();
    setSubmitting(true);
    try {
      const r = await post<{ withdrawal: { status: string } }>(
        `/v1/players/${playerId}/withdrawals`,
        { amount: parsed, asset: "USDT", network, destination: phone },
        stepUpToken.current ? { stepUpToken: stepUpToken.current } : undefined
      );
      setResult(r.withdrawal);
      onSubmitted?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.code === "STEP_UP_REQUIRED") {
        setAwaitingPassword(true);
        return;
      }
      const code = e instanceof ApiError ? e.code : null;
      const messages: Record<string, { en: string; ar: string }> = {
        INSUFFICIENT_FUNDS: { en: "Insufficient available funds for this withdrawal.", ar: "الرصيد المتاح لا يكفي لهذا السحب." },
        BELOW_MINIMUM: { en: "Minimum withdrawal is $10.00.", ar: "الحد الأدنى للسحب 10 دولار." },
      };
      const msg = code ? messages[code] : null;
      setError(msg ? (isAr ? msg.ar : msg.en) : (isAr ? "تعذر إنشاء طلب السحب" : "Could not create the withdrawal request"));
    } finally {
      setSubmitting(false);
    }
  }

  function submit() {
    setError(null);
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { setError(isAr ? "أدخل مبلغاً صحيحاً" : "Enter a valid amount"); return; }
    if (parsed < 10) { setError(isAr ? "الحد الأدنى للسحب 10 دولار" : "Minimum withdrawal is $10.00"); return; }
    if (!destination.trim()) { setError(isAr ? "أدخل رقم المحفظة أو الحساب المستلم" : "Enter the receiving phone number or IPA"); return; }
    void doSubmit();
  }

  async function confirmPassword() {
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await post<{ stepUpToken: string }>("/v1/auth/step-up", { action: "wallet.withdraw", password });
      stepUpToken.current = r.stepUpToken;
      setAwaitingPassword(false);
      setPassword("");
      await doSubmit();
    } catch {
      setSubmitting(false);
      setError(isAr ? "كلمة المرور غير صحيحة" : "Incorrect password");
    }
  }

  if (awaitingPassword) {
    return (
      <div className={styles.actionCard}>
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>🔒</span>
          <h2 className={styles.stepTitle}>{isAr ? "تأكيد كلمة المرور" : "Confirm your password"}</h2>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
          {isAr ? "لأمان حسابك، أكّد كلمة مرورك لإتمام طلب السحب." : "For your account's security, confirm your password to complete the withdrawal."}
        </p>
        <div className={styles.formGroup}>
          <input
            className={styles.formInput} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmPassword(); }}
            placeholder={isAr ? "كلمة المرور" : "Password"}
            autoFocus
          />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        <button type="button" className={styles.submitActionBtn} disabled={submitting || !password} onClick={() => void confirmPassword()}>
          {submitting ? (isAr ? "جارٍ التأكيد..." : "Confirming...") : (isAr ? "تأكيد" : "Confirm")}
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className={styles.actionCard}>
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>✓</span>
          <h2 className={styles.stepTitle}>{isAr ? "تم استلام طلب السحب بنجاح" : "Withdrawal request received"}</h2>
        </div>
        <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
          {isAr
            ? "سيقوم المشغّل بتحويل المبلغ بالجنيه المصري فوراً إلى محفظتك. يمكنك متابعة العملية من سجل المعاملات."
            : "The operator will manually transfer the amount to your number shortly. You can track the status from your transaction history."}
        </p>
        <button type="button" className={styles.submitActionBtn} onClick={() => setResult(null)}>
          {isAr ? "طلب سحب آخر" : "Request another withdrawal"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <div className={styles.stepHeader}>
        <span className={styles.stepBadge}>1</span>
        <h2 className={styles.stepTitle}>{isAr ? "اختر طريقة السحب" : "Withdraw to"}</h2>
      </div>
      <div className={styles.networkCardsGrid}>
        <button type="button" className={`${styles.networkCard} ${network === "VODAFONE_CASH" ? styles.networkCardActiveTrc : ""}`} onClick={() => setNetwork("VODAFONE_CASH")}>
          {isAr ? "🔴 فودافون كاش" : "Vodafone Cash"}
        </button>
        <button type="button" className={`${styles.networkCard} ${network === "INSTAPAY" ? styles.networkCardActiveTrc : ""}`} onClick={() => setNetwork("INSTAPAY")}>
          {isAr ? "⚡ إنستاباي" : "InstaPay"}
        </button>
      </div>

      <div style={{ fontSize: 12.5, color: "#94a3b8", margin: "8px 0 16px" }}>
        {isAr ? "⚡ يتم التحويل المحلي بالجنيه المصري إلى محفظتك مباشرة بدون أي رسوم شبكة." : "Direct local payout in EGP with zero network fees."}
      </div>

      <div className={styles.formGroup}>
        <div className={styles.formLabel}>{isAr ? "المبلغ المطلوب سحبه (USDT)" : "Amount (USDT)"}</div>
        <input className={styles.formInput} type="number" min="10" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
        {estimatedEgp && (
          <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700, marginTop: 6 }}>
            {isAr
              ? `ستستلم تقريباً: ${estimatedEgp} جنيه مصري (بسعر 1$ = ${rate?.egpPerUsd} ج.م)`
              : `You will receive approx: ${estimatedEgp} EGP (at 1$ = ${rate?.egpPerUsd} EGP)`}
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <div className={styles.formLabel}>
          {network === "VODAFONE_CASH"
            ? (isAr ? "رقم محفظة فودافون كاش المستلمة" : "Receiving Vodafone Cash Phone Number")
            : (isAr ? "رقم هاتف أو عنوان إنستاباي (IPA)" : "Receiving InstaPay Phone or IPA")}
        </div>
        <input
          className={styles.formInput}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={network === "VODAFONE_CASH" ? "01xxxxxxxxx" : (isAr ? "01xxxxxxxxx أو username@instapay" : "01xxxxxxxxx or user@instapay")}
        />
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

      <button type="button" className={styles.submitActionBtn} disabled={submitting} onClick={() => void submit()}>
        {submitting ? (isAr ? "جارٍ الإرسال..." : "Submitting...") : (isAr ? "تأكيد طلب السحب" : "Request withdrawal")}
      </button>
    </div>
  );
}
