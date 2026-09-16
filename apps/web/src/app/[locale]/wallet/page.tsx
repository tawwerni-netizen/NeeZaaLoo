"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post, ApiError } from "@/lib/api";
import { fromMinorUnits } from "@/lib/money";
import styles from "./wallet.module.css";

type Account = { key: string; balance: string; asset: string };

type TransactionRecord = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  network: "TRC20" | "BEP20" | "ERC20";
  amount: string;
  addressOrHash: string;
  status: "CONFIRMED" | "PENDING";
  timestamp: string;
};

interface AmlSummary {
  asset: string;
  totalDepositedMinor: string;
  totalPlayedMinor: string;
  totalWonMinor: string;
  availableMinor: string;
  lockedMinor: string;
  unplayedDepositMinor: string;
  withdrawableMinor: string;
  playthroughRequired: boolean;
  playthroughCompleted: boolean;
}

function isValidAddress(address: string, network: "TRC20" | "BEP20"): boolean {
  const trimmed = address.trim();
  if (network === "TRC20") {
    return /^T[1-9A-HJ-NP-za-km-z]{33}$/.test(trimmed);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}

export default function WalletPage() {
  return (
    <RequireAuth>
      <Header />
      <WalletContent />
    </RequireAuth>
  );
}

function WalletContent() {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  // Tab navigation: "deposit" | "withdraw" | "history"
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "history">("deposit");

  // Accounts and financial data
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [amlSummary, setAmlSummary] = useState<AmlSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [txNotice, setTxNotice] = useState<string | null>(null);

  // Network selection across deposit and withdraw
  const [selectedNetwork, setSelectedNetwork] = useState<"TRC20" | "BEP20">("TRC20");

  // OxaPay Deposit State
  const [depositData, setDepositData] = useState<{
    id?: string;
    address?: string;
    qrCodeUrl?: string | null;
    expiresAt?: string;
    isStatic?: boolean;
  } | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositTimeLeft, setDepositTimeLeft] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(25);
  const [copied, setCopied] = useState(false);

  // Withdrawal State
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load wallet accounts, ledger balances, and transactions
  const reload = useCallback(async (isManual = false) => {
    if (!player) return;
    if (isManual) setIsRefreshing(true);
    try {
      const r = await get<{
        accounts: Account[];
        withdrawals?: Array<{ id: string; asset: string; network: string; destination: string; amount_minor: string; status: string; requested_at: string }>;
        deposits?: Array<{ id: string; asset: string; network: string; address: string; amount_minor?: string; status: string; created_at: string }>;
        amlSummary?: AmlSummary;
      }>(`/v1/players/${player.id}/wallet`);

      setAccounts(r.accounts);
      if (r.amlSummary) setAmlSummary(r.amlSummary);
      setForbidden(false);
      setErrorCode(null);

      const allTxs: TransactionRecord[] = [];
      if (r.withdrawals && r.withdrawals.length > 0) {
        for (const w of r.withdrawals) {
          allTxs.push({
            id: w.id,
            type: "WITHDRAWAL",
            network: (w.network === "TRON" ? "TRC20" : w.network) as "TRC20" | "BEP20" | "ERC20",
            amount: (Number(BigInt(w.amount_minor || "0")) / 1_000_000).toFixed(2),
            addressOrHash: w.destination ? `${w.destination.slice(0, 8)}...${w.destination.slice(-6)}` : "—",
            status: (w.status === "CONFIRMED" || w.status === "COMPLETED") ? "CONFIRMED" : "PENDING",
            timestamp: w.requested_at ? new Date(w.requested_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently",
          });
        }
      }

      if (r.deposits && r.deposits.length > 0) {
        for (const d of r.deposits) {
          allTxs.push({
            id: d.id,
            type: "DEPOSIT",
            network: (d.network === "TRON" ? "TRC20" : d.network) as "TRC20" | "BEP20" | "ERC20",
            amount: (Number(BigInt(d.amount_minor || "0")) / 1_000_000).toFixed(2),
            addressOrHash: d.address ? `${d.address.slice(0, 8)}...${d.address.slice(-6)}` : "—",
            status: d.status === "CREDITED" ? "CONFIRMED" : "PENDING",
            timestamp: d.created_at ? new Date(d.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently",
          });
        }
      }

      // Sort newest first
      setTransactions(allTxs.reverse());
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      setAccounts([
        { key: `user:${player.id}:available`, balance: "0", asset: "USDT" },
        { key: `user:${player.id}:locked`, balance: "0", asset: "USDT" },
      ]);
    } finally {
      if (isManual) setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [player, isAr]);

  // Request fresh deposit address from OxaPay
  const loadDeposit = useCallback(async (net: "TRC20" | "BEP20") => {
    if (!player) return;
    setDepositLoading(true);
    setDepositError(null);
    try {
      const res = await post<{
        ok: boolean;
        deposit: { id: string; address: string; qrCodeUrl?: string | null; expiresAt?: string; asset: string; network: string; isStatic?: boolean };
      }>(`/v1/players/${player.id}/deposits`, {
        asset: "USDT",
        network: net,
      });
      if (res.ok && res.deposit) {
        setDepositData(res.deposit);
      }
    } catch {
      setDepositError(isAr ? "تعذر توليد عنوان الإيداع حالياً. يرجى المحاولة لاحقاً." : "Failed to generate deposit address. Please try again.");
    } finally {
      setDepositLoading(false);
    }
  }, [player, isAr]);

  // Load deposit address whenever deposit tab is active or network changes
  useEffect(() => {
    if (activeTab === "deposit") {
      void loadDeposit(selectedNetwork);
      // Auto-refresh wallet every 8s to detect credited deposits
      const poller = setInterval(() => { void reload(); }, 8000);
      return () => clearInterval(poller);
    }
  }, [activeTab, selectedNetwork, loadDeposit, reload]);

  // Check if address is permanent / static (not expiring in the near term)
  const isPermanent = Boolean(
    depositData?.isStatic ||
    !depositData?.expiresAt ||
    (depositData?.expiresAt && new Date(depositData.expiresAt).getTime() > Date.now() + 30 * 86400000)
  );

  const effectiveQrUrl = depositData?.qrCodeUrl || (depositData?.address ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(depositData.address)}&size=160x160` : null);

  // Expiry countdown timer for OxaPay temporary deposit address only
  useEffect(() => {
    if (isPermanent || !depositData?.expiresAt) {
      setDepositTimeLeft("");
      return;
    }
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(depositData.expiresAt!).getTime() - Date.now()) / 1000));
      if (diff <= 0) {
        setDepositTimeLeft("");
        return;
      }
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setDepositTimeLeft(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [depositData?.expiresAt, isPermanent]);

  // Initial load
  useEffect(() => {
    void reload();
  }, [reload]);

  // Balances calculation
  const byAsset = new Map<string, { available: string; locked: string }>();
  for (const a of accounts ?? []) {
    const entry = byAsset.get(a.asset) ?? { available: "0", locked: "0" };
    if (a.key.endsWith(":available")) entry.available = a.balance;
    else if (a.key.endsWith(":locked")) entry.locked = a.balance;
    byAsset.set(a.asset, entry);
  }

  const usdtBalance = byAsset.get("USDT") ?? { available: "0", locked: "0" };
  const availableUsdt = fromMinorUnits(usdtBalance.available);
  const lockedUsdt = fromMinorUnits(usdtBalance.locked);
  const totalBalanceUsdt = availableUsdt + lockedUsdt;

  const withdrawableUsdt = amlSummary
    ? Number(BigInt(amlSummary.withdrawableMinor)) / 1_000_000
    : availableUsdt;
  const unplayedUsdt = amlSummary
    ? Number(BigInt(amlSummary.unplayedDepositMinor)) / 1_000_000
    : 0;
  const totalDepositedUsdt = amlSummary
    ? Number(BigInt(amlSummary.totalDepositedMinor)) / 1_000_000
    : 0;
  const totalPlayedUsdt = amlSummary
    ? Number(BigInt(amlSummary.totalPlayedMinor)) / 1_000_000
    : 0;

  const amlPercentage = totalDepositedUsdt > 0
    ? Math.min(100, Math.max(0, Math.round((totalPlayedUsdt / totalDepositedUsdt) * 100)))
    : 100;

  // Withdrawal form validation
  const parsedWithdrawAmount = parseFloat(withdrawAmount);
  const isAmountNumber = !isNaN(parsedWithdrawAmount) && parsedWithdrawAmount > 0;
  const isAmountOverBalance = isAmountNumber && parsedWithdrawAmount > availableUsdt;
  const isAmountOverWithdrawable = isAmountNumber && parsedWithdrawAmount > withdrawableUsdt;
  const isAmountBelowMin = isAmountNumber && parsedWithdrawAmount < 10;
  const isAddressValid = withdrawAddress ? isValidAddress(withdrawAddress, selectedNetwork) : false;
  const canSubmitWithdraw =
    !isSubmitting &&
    withdrawableUsdt >= 10 &&
    isAmountNumber &&
    !isAmountOverWithdrawable &&
    !isAmountBelowMin &&
    isAddressValid;

  const netReceiveAmount = isAmountNumber && parsedWithdrawAmount > 1.00
    ? (parsedWithdrawAmount - 1.00).toFixed(2)
    : "0.00";

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleQuickPercent(pct: number) {
    if (withdrawableUsdt <= 0) return;
    const val = (withdrawableUsdt * pct).toFixed(2);
    setWithdrawAmount(val);
    setWithdrawError(null);
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError(null);
    const amt = parseFloat(withdrawAmount);

    if (isNaN(amt) || amt < 10) {
      setWithdrawError(isAr ? "الحد الأدنى للسحب هو 10.00 USDT." : "Minimum withdrawal is 10.00 USDT.");
      return;
    }

    if (amt > withdrawableUsdt) {
      setWithdrawError(
        isAr
          ? `المبلغ المطلوب ($${amt.toFixed(2)} USDT) يتجاوز رصيدك القابل للسحب ($${withdrawableUsdt.toFixed(2)} USDT). تنص سياسات مكافحة غسيل الأموال (AML) على ضرورة اللعب بمبالغ الإيداع في المباريات أولاً قبل سحبها.`
          : `Requested amount ($${amt.toFixed(2)} USDT) exceeds your withdrawable balance ($${withdrawableUsdt.toFixed(2)} USDT). Anti-Money Laundering (AML) policies require deposited funds to be played before withdrawal.`
      );
      return;
    }

    if (amt > availableUsdt) {
      setWithdrawError(
        isAr
          ? `رصيدك المتاح ($${availableUsdt.toFixed(2)} USDT) غير كافٍ لسحب $${amt.toFixed(2)} USDT.`
          : `Insufficient funds. Available balance is $${availableUsdt.toFixed(2)} USDT.`
      );
      return;
    }

    if (!isValidAddress(withdrawAddress, selectedNetwork)) {
      setWithdrawError(
        isAr
          ? `عنوان المحفظة غير صالح لشبكة ${selectedNetwork}.`
          : `Invalid wallet address for network ${selectedNetwork}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await post<{ ok: boolean; withdrawal?: { id: string } }>(`/v1/players/${player?.id}/withdrawals`, {
        amount: amt,
        network: selectedNetwork,
        destination: withdrawAddress.trim(),
        asset: "USDT",
      });

      if (res.ok) {
        setWithdrawAmount("");
        setWithdrawAddress("");
        setTxNotice(
          isAr
            ? `✓ تم إدراج طلب سحب $${amt.toFixed(2)} USDT بنجاح وجاري التوقيع الآلي على البلوكتشين.`
            : `✓ Withdrawal request of $${amt.toFixed(2)} USDT queued for automated signature.`
        );
        void reload();
        setActiveTab("history");
        setTimeout(() => setTxNotice(null), 8000);
      }
    } catch (err: unknown) {
      const apiErr = err as { body?: { error?: { code?: string } }; message?: string; status?: number };
      const code = apiErr?.body?.error?.code || apiErr?.message || "ERROR";
      if (code === "AML_PLAYTHROUGH_REQUIRED") {
        setWithdrawError(
          isAr
            ? `تنبيه أمني (مكافحة غسيل الأموال AML): لا يمكن سحب مبالغ تم إيداعها دون استخدامها في اللعب أولاً. رصيدك القابل للسحب حالياً هو $${withdrawableUsdt.toFixed(2)} USDT فقط.`
            : `Under Anti-Money Laundering (AML) regulations, deposited funds must be played in duels before withdrawal. Your currently withdrawable balance is $${withdrawableUsdt.toFixed(2)} USDT.`
        );
      } else if (code === "INSUFFICIENT_FUNDS") {
        setWithdrawError(isAr ? "رصيدك المتاح غير كافٍ لإتمام عملية السحب." : "Insufficient available balance in your wallet.");
      } else if (code === "CONTROL_DISABLED") {
        setWithdrawError(isAr ? "عمليات السحب متوقفة مؤقتاً لأعمال الصيانة الدورية." : "Withdrawals are temporarily paused for maintenance.");
      } else if (code === "STEP_UP_REQUIRED" || apiErr?.status === 401) {
        setWithdrawError(isAr ? "مطلوب تأكيد كلمة المرور كإجراء أمني لإتمام السحب." : "Security step-up authentication required.");
      } else {
        setWithdrawError(isAr ? `تعذر إتمام طلب السحب (${code}). يرجى التحقق من الرصيد.` : `Withdrawal request could not be completed (${code}).`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.pageContainer}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.pageTitle}>
              <span>💼</span> {isAr ? "محفظة التيذر (USDT Vault)" : "USDT Player Vault"}
            </h1>
            <p className={styles.pageSubtitle}>
              {isAr
                ? "إيداع وسحب مؤتمت وفوري، شفافية محاسبية مطلقة على البلوكتشين، وحماية مصرفية متقدمة لجميع أموالك."
                : "Automated instant deposits and withdrawals, immutable blockchain transparency, and institutional-grade player security."}
            </p>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => reload(true)}
            title={isAr ? "تحديث الأرصدة والبيانات" : "Refresh Balances"}
          >
            <span style={{ display: "inline-block", transform: isRefreshing ? "rotate(360deg)" : "none", transition: "transform 500ms ease" }}>🔄</span>
            {isRefreshing ? (isAr ? "جاري التحديث..." : "Updating...") : (isAr ? "تحديث المحفظة" : "Refresh")}
          </button>
        </div>
      </header>

      {/* Global Alerts */}
      {forbidden && (
        <div style={{ padding: "14px 18px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "12px", color: "#fca5a5", marginBottom: "20px", fontWeight: 600 }}>
          ⚠️ {t("walletPage.forbidden")}
        </div>
      )}
      {errorCode && !forbidden && (
        <div style={{ padding: "14px 18px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "12px", color: "#fca5a5", marginBottom: "20px", fontWeight: 600 }}>
          ⚠️ {t("walletPage.error", { code: errorCode })}
        </div>
      )}
      {txNotice && (
        <div style={{ padding: "14px 18px", background: "rgba(34, 197, 94, 0.15)", border: "1px solid #22c55e", borderRadius: "12px", color: "#4ade80", marginBottom: "20px", fontWeight: 700 }}>
          {txNotice}
        </div>
      )}

      {/* Hero Wealth Card */}
      <section className={styles.heroCard}>
        <div className={styles.heroGlow} />

        {/* Head Bar */}
        <div className={styles.heroHead}>
          <div className={styles.assetTag}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="12" fill="#26A17B" />
              <path d="M12.6 13.2v-1.1c1.9-.1 3.5-.7 3.5-1.5s-1.6-1.4-3.5-1.5V7.4h-1.2v1.7C9.5 9.2 8 9.8 8 10.6s1.6 1.4 3.4 1.5v1.1c-2.4.2-4.2.8-4.2 1.7 0 .9 1.8 1.6 4.2 1.7v2.2h1.2v-2.2c2.4-.2 4.2-.8 4.2-1.7 0-.9-1.8-1.5-4.2-1.7z" fill="#fff" />
            </svg>
            <span>Tether USD (USDT)</span>
            <span className={styles.peggedBadge}>1 USDT = 1.00 USD</span>
          </div>

          <div className={styles.instantPayoutBadge}>
            <span className={styles.pulseDot} />
            <span>{isAr ? "سحوبات مؤتمتة فورية 24/7" : "Automated Instant Payouts Active"}</span>
          </div>
        </div>

        {/* Balance Section */}
        <div className={styles.heroBalanceSection}>
          <div className={styles.totalBalanceLabel}>
            {isAr ? "إجمالي المركز المالي في حسابك" : "Total Net Financial Balance"}
          </div>
          <div className={styles.totalBalanceAmount}>
            <span className="nz-num">${totalBalanceUsdt.toFixed(2)}</span>
            <span className={styles.usdtUnit}>USDT</span>
          </div>
        </div>

        {/* Stats Triad */}
        <div className={styles.statsGrid}>
          {/* 1. Available to Play */}
          <div className={styles.statPill}>
            <div className={styles.statPillHeader}>
              <span>🟢</span>
              <span className={styles.statPillTitle}>
                {isAr ? "المتاح للمنافسات والنزال" : "Available to Play"}
              </span>
            </div>
            <div className={styles.statPillAmount}>
              <span className="nz-num">${availableUsdt.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>USDT</span>
            </div>
            <div className={styles.statPillSub}>
              {isAr ? "جاهز فوراً لدخول أي مباراة أو بطولة" : "Ready for match stakes & tournaments"}
            </div>
          </div>

          {/* 2. In Active Matches */}
          <div className={styles.statPill}>
            <div className={styles.statPillHeader}>
              <span>🔒</span>
              <span className={styles.statPillTitle}>
                {isAr ? "في النزالات الجارية" : "In Active Matches"}
              </span>
            </div>
            <div className={styles.statPillAmount}>
              <span className="nz-num">${lockedUsdt.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>USDT</span>
            </div>
            <div className={styles.statPillSub}>
              {isAr ? "محتجز في مباريات أو بطولات لم تنتهِ بعد" : "Reserved in active matches or brackets"}
            </div>
          </div>

          {/* 3. Withdrawable */}
          <div className={`${styles.statPill} ${styles.statPillWithdrawable}`}>
            <div className={styles.statPillHeader}>
              <span>✨</span>
              <span className={`${styles.statPillTitle} ${styles.statPillTitleWithdrawable}`}>
                {isAr ? "القابل للسحب الفوري" : "Ready to Withdraw"}
              </span>
            </div>
            <div className={`${styles.statPillAmount} ${styles.statPillAmountWithdrawable}`}>
              <span className="nz-num">${withdrawableUsdt.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#4ade80" }}>USDT</span>
            </div>
            <div className={styles.statPillSub} style={{ color: "#86efac" }}>
              {isAr ? "أموال مستوفية لشروط اللعب وجاهزة للتحويل الخارجي" : "Cleared funds eligible for instant cashout"}
            </div>
          </div>
        </div>
      </section>

      {/* Gamified AML Playthrough Progress Bar */}
      {unplayedUsdt > 0 ? (
        <section className={`${styles.amlCard} ${styles.amlCardActive}`}>
          <div className={styles.amlIcon}>🛡️</div>
          <div className={styles.amlContent}>
            <div className={`${styles.amlTitle} ${styles.amlTitleActive}`}>
              {isAr
                ? `شرط تدوير مبالغ الإيداع للنزاهة نشط (${amlPercentage}% مكتمل)`
                : `AML Playthrough Requirement Active (${amlPercentage}% Completed)`}
            </div>
            <div className={styles.amlDesc}>
              {isAr
                ? `وفقاً لقوانين مكافحة غسيل الأموال، يتطلب سحب مبالغ الإيداع استخدامها في خوض المبارزات أولاً. لعبت حتى الآن بمبلغ $${totalPlayedUsdt.toFixed(2)} USDT من إجمالي إيداعاتك $${totalDepositedUsdt.toFixed(2)} USDT. متبقي $${unplayedUsdt.toFixed(2)} USDT لتأهيل كامل الرصيد للسحب.`
                : `To prevent money laundering, deposited capital must be used in games before withdrawal. You have played $${totalPlayedUsdt.toFixed(2)} USDT of your $${totalDepositedUsdt.toFixed(2)} USDT deposit. $${unplayedUsdt.toFixed(2)} USDT remaining to unlock full withdrawals.`}
            </div>
            <div className={styles.amlProgressBarWrap}>
              <div
                className={styles.amlProgressBarFill}
                style={{ width: `${amlPercentage}%` }}
              />
            </div>
            <div className={styles.amlFootMetrics}>
              <span>{isAr ? "التقدّم:" : "Progress:"} {amlPercentage}%</span>
              <span>{isAr ? "المتبقي للفتح:" : "Remaining:"} ${unplayedUsdt.toFixed(2)} USDT</span>
            </div>
          </div>
          <Link href={`/${locale}/games`} className={styles.duelCtaBtn}>
            <span>⚔️</span> {isAr ? "خوض نزال الآن" : "Play a Match"}
          </Link>
        </section>
      ) : (
        <section className={`${styles.amlCard} ${styles.amlCardCompleted}`}>
          <div className={styles.amlIcon}>✓</div>
          <div className={styles.amlContent}>
            <div className={`${styles.amlTitle} ${styles.amlTitleCompleted}`}>
              {isAr ? "حسابك مستوفي لشروط مكافحة غسيل الأموال (AML Completed)" : "AML Playthrough Completed — 100% Cleared"}
            </div>
            <div className={styles.amlDesc}>
              {isAr
                ? "لقد خضت مبارزات بمبالغ تفوق كامل إيداعاتك على المنصة! كامل رصيدك المتاح مؤهل للسحب الفوري إلى محفظتك الخارجية دون أي قيود."
                : "You have wagered all deposited funds in duels. 100% of your available balance is fully cleared and ready for immediate withdrawal."}
            </div>
          </div>
        </section>
      )}

      {/* Main Operations Navigation Tabs */}
      <nav className={styles.hubNav}>
        <button
          type="button"
          className={`${styles.hubTab} ${activeTab === "deposit" ? styles.hubTabActive : ""}`}
          onClick={() => setActiveTab("deposit")}
        >
          <span className={styles.tabIcon}>📥</span>
          <span>{isAr ? "إيداع USDT (OxaPay)" : "Deposit USDT"}</span>
        </button>

        <button
          type="button"
          className={`${styles.hubTab} ${activeTab === "withdraw" ? styles.hubTabActive : ""}`}
          onClick={() => setActiveTab("withdraw")}
        >
          <span className={styles.tabIcon}>📤</span>
          <span>{isAr ? "سحب الأرباح (Withdraw)" : "Withdraw USDT"}</span>
        </button>

        <button
          type="button"
          className={`${styles.hubTab} ${activeTab === "history" ? styles.hubTabActive : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className={styles.tabIcon}>📜</span>
          <span>{isAr ? `سجل المعاملات (${transactions.length})` : `Activity History (${transactions.length})`}</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: DEPOSIT HUB                                                        */}
      {/* ========================================================================= */}
      {activeTab === "deposit" && (
        <div className={styles.actionCard}>
          {/* High Conversion Presets */}
          <div className={styles.presetsSection}>
            <div className={styles.presetsSectionTitle}>
              <span>⚡</span> {isAr ? "اختر باقة إيداع سريعة للبدء:" : "Select a Quick Deposit Preset:"}
            </div>
            <div className={styles.presetsGrid}>
              {[
                { amount: 10, label: isAr ? "نزال سريع" : "Quick Duel", tag: null },
                { amount: 25, label: isAr ? "الأكثر اختياراً 🔥" : "Most Popular 🔥", tag: isAr ? "شائع" : "HOT" },
                { amount: 50, label: isAr ? "منافس البطولات 🏆" : "Tournament Pro 🏆", tag: null },
                { amount: 100, label: isAr ? "بطل النخبة 💎" : "VIP Elite 💎", tag: isAr ? "نخبة" : "VIP" },
              ].map((p) => (
                <div
                  key={p.amount}
                  className={`${styles.presetBtn} ${selectedPreset === p.amount ? styles.presetBtnActive : ""}`}
                  onClick={() => setSelectedPreset(p.amount)}
                >
                  {p.tag && <span className={styles.presetTag}>{p.tag}</span>}
                  <span className={styles.presetAmount}>${p.amount}</span>
                  <span className={styles.presetLabel}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Value Pillars */}
          <div className={styles.benefitsStrip}>
            <div className={styles.benefitItem}>
              <span>⚡</span>
              <span>{isAr ? "عمولة إيداع 0% (لا نخصم أي فلس)" : "0% Platform Deposit Fee"}</span>
            </div>
            <div className={styles.benefitItem}>
              <span>⏱️</span>
              <span>{isAr ? "قيد فوري بعد تأكيد 1 على البلوكتشين" : "Instant Credit after 1 Block Confirmation"}</span>
            </div>
            <div className={styles.benefitItem}>
              <span>🛡️</span>
              <span>{isAr ? "بوابة OxaPay مشفرة ومؤمنة 100%" : "Secured by OxaPay Gateway"}</span>
            </div>
          </div>

          {/* Network Selector */}
          <div className={styles.networkSection}>
            <div className={styles.networkSectionTitle}>
              {isAr ? "اختر شبكة التحويل المفضلة لديك:" : "Select Transfer Network:"}
            </div>
            <div className={styles.networkTabs}>
              {[
                { net: "TRC20" as const, label: "USDT-TRC20 (Tron)", rec: isAr ? "موصى به · الأسرع" : "Fast & Cheap" },
                { net: "BEP20" as const, label: "USDT-BEP20 (BNB Chain)", rec: isAr ? "رسوم منخفضة" : "Low Gas" },
              ].map((item) => (
                <button
                  key={item.net}
                  type="button"
                  className={`${styles.networkPill} ${selectedNetwork === item.net ? styles.networkPillActive : ""}`}
                  onClick={() => setSelectedNetwork(item.net)}
                >
                  <span>{item.label}</span>
                  {item.rec && <span className={styles.networkRecommendedBadge}>{item.rec}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* QR & Address Display Box */}
          <div className={styles.qrDisplayCard}>
            {depositLoading ? (
              <div style={{ width: "160px", height: "160px", background: "rgba(255,255,255,0.04)", borderRadius: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "#94a3b8" }}>
                <span style={{ fontSize: "28px" }}>⏳</span>
                <span style={{ fontSize: "12px" }}>{isAr ? "جاري توليد العنوان..." : "Generating..."}</span>
              </div>
            ) : effectiveQrUrl ? (
              <div className={styles.qrFrame}>
                <img
                  src={effectiveQrUrl}
                  alt="USDT Deposit QR"
                  width={140}
                  height={140}
                  style={{ display: "block", borderRadius: "8px" }}
                />
              </div>
            ) : (
              <div style={{ width: "160px", height: "160px", background: "rgba(255,255,255,0.04)", borderRadius: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "#94a3b8" }}>
                <span style={{ fontSize: "28px" }}>💳</span>
                <span style={{ fontSize: "12px" }}>{depositData?.address ? (isAr ? "جاهز للتحويل" : "Ready") : "—"}</span>
              </div>
            )}

            {isPermanent && depositData?.address && !depositLoading && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.35)",
                padding: "8px 16px",
                borderRadius: "20px",
                color: "#4ade80",
                fontSize: "13px",
                fontWeight: 600,
                marginTop: "6px",
                marginBottom: "2px",
              }}>
                <span style={{ fontSize: "12px" }}>🟢</span>
                <span>{isAr ? "عنوان محفظة ثابت ودائم مخصص لحسابك (لا تنتهي صلاحيته)" : "Permanent Dedicated Wallet (Never Expires)"}</span>
              </div>
            )}

            {!isPermanent && depositTimeLeft && (
              <div className={styles.timerBadge}>
                <span>⏱️</span>
                <span>{isAr ? `ينتهي هذا العنوان خلال: ${depositTimeLeft}` : `Address expires in: ${depositTimeLeft}`}</span>
              </div>
            )}

            {depositError && (
              <div style={{ color: "#ef4444", fontSize: "13px", fontWeight: 600 }}>
                {depositError}
              </div>
            )}

            {/* Address Row with Copy */}
            <div className={styles.addressRow}>
              <span className={styles.addressString}>
                {depositLoading
                  ? (isAr ? "جاري الاتصال ببوابة OxaPay..." : "Connecting to OxaPay gateway...")
                  : (depositData?.address || "—")}
              </span>
              {depositData?.address && !depositLoading && (
                <button
                  type="button"
                  className={`${styles.copyButton} ${copied ? styles.copyButtonSuccess : ""}`}
                  onClick={() => handleCopy(depositData.address!)}
                >
                  <span>{copied ? "✓" : "📋"}</span>
                  <span>{copied ? (isAr ? "تم النسخ!" : "Copied!") : (isAr ? "نسخ" : "Copy")}</span>
                </button>
              )}
            </div>
          </div>

          {/* Clear Guidance Notice */}
          <div className={styles.instructionsBox}>
            <strong style={{ color: "#4ade80", display: "block", marginBottom: "4px" }}>
              💡 {isAr ? "إرشادات الإيداع الآمن:" : "Safe Deposit Guidelines:"}
            </strong>
            {isAr
              ? `هذا العنوان مخصص لحسابك وثابت لا يتغير. يمكنك التحويل إليه في أي وقت من أي محفظة أو منصة (Binance, TrustWallet, OKX وغيرها) عبر شبكة (${selectedNetwork}). الحد الأدنى للإيداع هو 5.00 USDT. سيتم قيد الرصيد تلقائياً في حسابك فور تأكيد المعاملة في دفتر البلوكتشين.`
              : `This deposit address is dedicated to your account and permanent. You can transfer to it anytime from any exchange or wallet (Binance, TrustWallet, OKX, etc.) via (${selectedNetwork}). Minimum deposit is 5.00 USDT. Funds will be credited automatically once confirmed on the blockchain.`}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WITHDRAWAL HUB                                                     */}
      {/* ========================================================================= */}
      {activeTab === "withdraw" && (
        <div className={styles.actionCard}>
          {/* Balance Overview */}
          <div className={styles.withdrawOverview}>
            <div>
              <div className={styles.withdrawOverviewLabel}>
                {isAr ? "الرصيد المؤهل للسحب الفوري حالياً:" : "Eligible Withdrawable Balance:"}
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {isAr ? "إجمالي رصيدك في المحفظة: " : "Total Balance: "}
                ${availableUsdt.toFixed(2)} USDT
              </div>
            </div>
            <div className={styles.withdrawOverviewAmount}>
              <span className="nz-num">${withdrawableUsdt.toFixed(2)}</span> USDT
            </div>
          </div>

          {/* Network Selection */}
          <div className={styles.networkSection}>
            <div className={styles.networkSectionTitle}>
              {isAr ? "اختر شبكة استلام السحب:" : "Select Recipient Network:"}
            </div>
            <div className={styles.networkTabs}>
              {[
                { net: "TRC20" as const, label: "USDT-TRC20 (Tron)", rec: isAr ? "رسوم 1$" : "$1 Fee" },
                { net: "BEP20" as const, label: "USDT-BEP20 (BNB Chain)", rec: isAr ? "رسوم 1$" : "$1 Fee" },
              ].map((item) => (
                <button
                  key={item.net}
                  type="button"
                  className={`${styles.networkPill} ${selectedNetwork === item.net ? styles.networkPillActive : ""}`}
                  onClick={() => {
                    setSelectedNetwork(item.net);
                    setWithdrawError(null);
                  }}
                >
                  <span>{item.label}</span>
                  {item.rec && <span className={styles.networkRecommendedBadge}>{item.rec}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Warnings & Alerts */}
          {withdrawableUsdt < 10 && (
            <div style={{ padding: "14px 18px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.35)", borderRadius: "12px", color: "#fca5a5", fontSize: "13px", lineHeight: 1.6, marginBottom: "20px" }}>
              ⚠️ {isAr
                ? `الحد الأدنى للسحب هو 10.00 USDT. رصيدك القابل للسحب حالياً ($${withdrawableUsdt.toFixed(2)} USDT) أقل من الحد الأدنى. يرجى استخدام مبالغ الإيداع في خوض النزالات لتأهيلها للسحب.`
                : `Minimum withdrawal is 10.00 USDT. Your withdrawable balance ($${withdrawableUsdt.toFixed(2)} USDT) is below the minimum threshold. Play matches to unlock deposited funds.`}
            </div>
          )}

          {withdrawError && (
            <div style={{ padding: "14px 18px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "12px", color: "#fca5a5", fontSize: "13px", marginBottom: "20px", fontWeight: 600 }}>
              ⛔ {withdrawError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={submitWithdraw}>
            {/* Recipient Address */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>{isAr ? `عنوان محفظتك المستلمة (${selectedNetwork}):` : `Recipient Wallet Address (${selectedNetwork}):`}</span>
              </label>
              <input
                type="text"
                required
                placeholder={selectedNetwork === "TRC20" ? "T..." : "0x..."}
                className={styles.formInput}
                value={withdrawAddress}
                onChange={(e) => {
                  setWithdrawAddress(e.target.value);
                  setWithdrawError(null);
                }}
              />
              {withdrawAddress && !isAddressValid && (
                <span style={{ fontSize: "12px", color: "#f87171", marginTop: "4px", display: "block", fontWeight: 600 }}>
                  {isAr ? `تنبيه: صيغة العنوان غير صالحة لشبكة ${selectedNetwork}` : `Invalid address format for ${selectedNetwork}`}
                </span>
              )}
            </div>

            {/* Amount */}
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>
                <span>{isAr ? "مبلغ السحب (USDT):" : "Withdrawal Amount (USDT):"}</span>
                <span style={{ fontSize: "12px", color: "#4ade80", fontWeight: 600 }}>
                  {isAr ? "الحد الأقصى المتاح:" : "Max Available:"} ${withdrawableUsdt.toFixed(2)}
                </span>
              </div>
              <input
                type="number"
                min="10"
                max={withdrawableUsdt > 0 ? withdrawableUsdt.toString() : undefined}
                step="0.01"
                required
                placeholder={isAr ? "الحد الأدنى 10.00 USDT" : "Min 10.00 USDT"}
                className={styles.formInput}
                value={withdrawAmount}
                onChange={(e) => {
                  setWithdrawAmount(e.target.value);
                  setWithdrawError(null);
                }}
              />

              {/* Quick Percentage Buttons */}
              <div className={styles.percentRow}>
                {[
                  { pct: 0.25, label: "25%" },
                  { pct: 0.50, label: "50%" },
                  { pct: 0.75, label: "75%" },
                  { pct: 1.00, label: isAr ? "الكل (MAX)" : "MAX" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={styles.percentChip}
                    onClick={() => handleQuickPercent(item.pct)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {isAmountOverWithdrawable && (
                <span style={{ fontSize: "12px", color: "#f87171", marginTop: "6px", display: "block", fontWeight: 600 }}>
                  {isAr
                    ? `المبلغ المطلوب ($${parsedWithdrawAmount.toFixed(2)}) يتجاوز رصيدك القابل للسحب ($${withdrawableUsdt.toFixed(2)} USDT).`
                    : `Requested amount exceeds withdrawable balance ($${withdrawableUsdt.toFixed(2)} USDT).`}
                </span>
              )}
            </div>

            {/* Transparent Fees Breakdown */}
            <div className={styles.feeSummary}>
              <div className={styles.feeRow}>
                <span>{isAr ? "عمولة المنصة:" : "Platform Commission:"}</span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>0.00 USDT (0%)</span>
              </div>
              <div className={styles.feeRow}>
                <span>{isAr ? "رسوم البلوكتشين للشبكة:" : "Network Gas Fee:"}</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>1.00 USDT</span>
              </div>
              <div className={`${styles.feeRow} ${styles.feeRowTotal}`}>
                <span>{isAr ? "صافي المبلغ الذي ستستلمه في محفظتك:" : "Net Amount You Will Receive:"}</span>
                <span style={{ color: "#22c55e", fontSize: "18px" }} className="nz-num">
                  ${netReceiveAmount} USDT
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className={styles.submitActionBtn}
              disabled={!canSubmitWithdraw}
            >
              <span>{isSubmitting ? "⏳" : "⚡"}</span>
              <span>
                {isSubmitting
                  ? (isAr ? "جاري توقيع الطلب آلياً..." : "Processing automated withdrawal...")
                  : (isAr ? "تأكيد طلب السحب الفوري" : "Confirm Instant Withdrawal")}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TRANSACTION HISTORY                                                */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div className={styles.actionCard}>
          {transactions.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>📜</div>
              <div className={styles.emptyStateTitle}>
                {isAr ? "لا توجد معاملات مسجلة في المحفظة بعد" : "No wallet transactions recorded yet"}
              </div>
              <p style={{ fontSize: "13px", maxWidth: "400px", margin: "0 auto 18px", lineHeight: 1.5 }}>
                {isAr
                  ? "ابدأ أول إيداع لك لخوض النزالات وتحقيق أرباح فورية من مهاراتك في الألعاب!"
                  : "Make your first deposit to start dueling and earning rewards with your gaming skills!"}
              </p>
              <button
                type="button"
                className={styles.duelCtaBtn}
                onClick={() => setActiveTab("deposit")}
              >
                <span>📥</span> {isAr ? "إيداع USDT الآن" : "Deposit USDT Now"}
              </button>
            </div>
          ) : (
            <div className={styles.txList}>
              {transactions.map((tx) => (
                <div key={tx.id} className={styles.txCard}>
                  <div className={styles.txLeft}>
                    <div className={`${styles.txIconWrap} ${tx.type === "DEPOSIT" ? styles.txIconDeposit : styles.txIconWithdraw}`}>
                      {tx.type === "DEPOSIT" ? "📥" : "📤"}
                    </div>
                    <div className={styles.txMeta}>
                      <div className={styles.txTitle}>
                        {tx.type === "DEPOSIT"
                          ? (isAr ? "إيداع معتمد" : "Deposit")
                          : (isAr ? "طلب سحب أرباح" : "Withdrawal")}
                        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500, marginInlineStart: "8px" }}>
                          ({tx.network})
                        </span>
                      </div>
                      <div className={styles.txAddress}>
                        <code>{tx.addressOrHash}</code> · <span className="nz-num">{tx.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.txRight}>
                    <div className={`${styles.txAmount} ${tx.type === "DEPOSIT" ? styles.txAmountDeposit : styles.txAmountWithdraw}`}>
                      {tx.type === "DEPOSIT" ? `+${tx.amount}` : `-${tx.amount}`} USDT
                    </div>
                    <span className={`${styles.statusPill} ${tx.status === "CONFIRMED" ? styles.statusConfirmed : styles.statusPending}`}>
                      {tx.status === "CONFIRMED"
                        ? (isAr ? "مكتملة ✓" : "CONFIRMED")
                        : (isAr ? "قيد المعالجة ⏱️" : "PENDING")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
