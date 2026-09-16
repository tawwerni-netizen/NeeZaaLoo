"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { QrCode } from "@/components/QrCode";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post, ApiError } from "@/lib/api";
import { fromMinorUnits } from "@/lib/money";
import { triggerBalanceRefresh } from "@/lib/use-wallet-balance";
import type { SupportedLocale } from "@/lib/i18n/locale";
import { WALLET_TRANSLATIONS } from "./translations";
import styles from "./wallet.module.css";

type SupportedAsset = "USDT";
type NetworkCode = "TRC20" | "BEP20" | "ERC20";

type Account = { key: string; balance: string; asset: string };

type TransactionRecord = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  asset: string;
  network: NetworkCode;
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

const ASSET_NETWORKS: Record<SupportedAsset, NetworkCode[]> = {
  USDT: ["TRC20", "BEP20"],
};

function isValidAddress(address: string, network: NetworkCode): boolean {
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
  const tW = WALLET_TRANSLATIONS[(locale as SupportedLocale)] || WALLET_TRANSLATIONS.en;

  // Tab navigation: "deposit" | "withdraw" | "history"
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "history">("deposit");

  // Selected stablecoin
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset>("USDT");

  // Accounts and financial data
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [amlSummary, setAmlSummary] = useState<AmlSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [txNotice, setTxNotice] = useState<string | null>(null);

  // Network selection
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkCode>("TRC20");

  // Deposit State
  const [depositData, setDepositData] = useState<{
    id?: string;
    address?: string;
    qrCodeUrl?: string | null;
    expiresAt?: string;
    isStatic?: boolean;
    asset?: string;
    network?: string;
  } | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositTimeLeft, setDepositTimeLeft] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(25);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isDepositConfirmed, setIsDepositConfirmed] = useState(false);
  const [isSyncingLedger, setIsSyncingLedger] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Withdrawal State
  const [withdrawAsset, setWithdrawAsset] = useState<SupportedAsset>("USDT");
  const [withdrawNetwork, setWithdrawNetwork] = useState<NetworkCode>("TRC20");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // What money can actually move on, from the server -- not a hardcoded list.
  // Rails were once shown (and enabled) for coins and chains nothing could
  // verify on-chain: deposits there were quarantined and never credited,
  // payouts never left BROADCASTED. An option only appears once the backend
  // can see it through end to end. `null` = not loaded yet / not declared,
  // in which case the static list stands until the answer arrives.
  const [liveRails, setLiveRails] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    get<{ rails: Array<{ asset: string; network: string }> | null }>("/v1/payments/rails")
      .then((r) => {
        if (cancelled || !Array.isArray(r.rails)) return;
        setLiveRails(new Set(r.rails.map((x) => `${x.asset}:${x.network === "TRON" ? "TRC20" : x.network}`)));
      })
      .catch(() => { /* keep the static list; the server still refuses anything it cannot verify */ });
    return () => { cancelled = true; };
  }, []);
  const networksFor = useCallback(
    (asset: SupportedAsset): NetworkCode[] =>
      ASSET_NETWORKS[asset].filter((net) => !liveRails || liveRails.has(`${asset}:${net}`)),
    [liveRails]
  );
  const assetLive = (asset: SupportedAsset) => networksFor(asset).length > 0;

  useEffect(() => {
    if (!liveRails) return;
    if (!networksFor(selectedAsset).includes(selectedNetwork)) {
      const valid = networksFor("USDT");
      if (valid.length > 0) { setSelectedAsset("USDT"); setSelectedNetwork(valid[0]!); }
    }
    if (!networksFor(withdrawAsset).includes(withdrawNetwork)) {
      const valid = networksFor("USDT");
      if (valid.length > 0) { setWithdrawAsset("USDT"); setWithdrawNetwork(valid[0]!); }
    }
  }, [liveRails, networksFor, selectedAsset, selectedNetwork, withdrawAsset, withdrawNetwork]);

  // Handle switching asset: automatically select primary supported network
  const handleSelectAsset = useCallback((asset: SupportedAsset) => {
    setSelectedAsset(asset);
    const validNets = networksFor(asset);
    if (!validNets.includes(selectedNetwork)) {
      setSelectedNetwork(validNets[0] ?? "TRC20");
    }
  }, [selectedNetwork, networksFor]);

  // Handle switching withdrawal asset: automatically select primary supported network
  const handleSelectWithdrawAsset = useCallback((asset: SupportedAsset) => {
    setWithdrawAsset(asset);
    const validNets = networksFor(asset);
    if (!validNets.includes(withdrawNetwork)) {
      setWithdrawNetwork(validNets[0] ?? "TRC20");
    }
  }, [withdrawNetwork, networksFor]);

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
            asset: w.asset || "USDT",
            network: (w.network === "TRON" ? "TRC20" : w.network) as NetworkCode,
            amount: (Number(BigInt(w.amount_minor)) / 1_000_000).toFixed(2),
            addressOrHash: `${w.destination.slice(0, 8)}...${w.destination.slice(-6)}`,
            status: w.status === "CONFIRMED" || w.status === "COMPLETED" ? "CONFIRMED" : "PENDING",
            timestamp: w.requested_at ? new Date(w.requested_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently",
          });
        }
      }

      if (r.deposits && r.deposits.length > 0) {
        for (const d of r.deposits) {
          allTxs.push({
            id: d.id,
            type: "DEPOSIT",
            asset: d.asset || "USDT",
            network: (d.network === "TRON" ? "TRC20" : d.network) as NetworkCode,
            amount: (Number(BigInt(d.amount_minor || "0")) / 1_000_000).toFixed(2),
            addressOrHash: d.address ? `${d.address.slice(0, 8)}...${d.address.slice(-6)}` : "—",
            status: d.status === "CREDITED" ? "CONFIRMED" : "PENDING",
            timestamp: d.created_at ? new Date(d.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently",
          });
        }
      }

      // Sort newest first
      setTransactions(allTxs.reverse());
      triggerBalanceRefresh();
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

  // Request fresh or dedicated deposit address
  const loadDeposit = useCallback(async (asset: SupportedAsset, net: NetworkCode) => {
    if (!player) return;
    setDepositLoading(true);
    setDepositError(null);
    try {
      const res = await post<{
        ok: boolean;
        deposit: { id: string; address: string; qrCodeUrl?: string | null; expiresAt?: string; asset: string; network: string; isStatic?: boolean };
      }>(`/v1/players/${player.id}/deposits`, {
        asset,
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

  // Load deposit address whenever deposit tab is active or coin/network changes
  useEffect(() => {
    if (activeTab === "deposit") {
      void loadDeposit(selectedAsset, selectedNetwork);
      // Auto-refresh wallet every 8s to detect credited deposits
      const poller = setInterval(() => { void reload(); }, 8000);
      return () => clearInterval(poller);
    }
  }, [activeTab, selectedAsset, selectedNetwork, loadDeposit, reload]);

  // Check if address is permanent / static (not expiring in the near term)
  const isPermanent = Boolean(
    depositData?.isStatic ||
    !depositData?.expiresAt ||
    (depositData?.expiresAt && new Date(depositData.expiresAt).getTime() > Date.now() + 30 * 86400000)
  );

  // Pure client-side SVG: drawn locally from address -- zero external QR CDNs
  const qrValue = depositData?.address ?? null;

  // Expiry countdown timer for temporary deposit address only
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

  // Balances calculation across USDT, USDC, and DAI
  const byAsset = new Map<string, { available: string; locked: string }>();
  for (const a of accounts ?? []) {
    const entry = byAsset.get(a.asset) ?? { available: "0", locked: "0" };
    if (a.key.endsWith(":available")) entry.available = a.balance;
    else if (a.key.endsWith(":locked")) entry.locked = a.balance;
    byAsset.set(a.asset, entry);
  }

  const usdtBal = byAsset.get("USDT") ?? { available: "0", locked: "0" };
  const usdcBal = byAsset.get("USDC") ?? { available: "0", locked: "0" };
  const daiBal = byAsset.get("DAI") ?? { available: "0", locked: "0" };

  const availableUsdt = fromMinorUnits(usdtBal.available);
  const lockedUsdt = fromMinorUnits(usdtBal.locked);

  const availableUsdc = fromMinorUnits(usdcBal.available);
  const lockedUsdc = fromMinorUnits(usdcBal.locked);

  const availableDai = fromMinorUnits(daiBal.available);
  const lockedDai = fromMinorUnits(daiBal.locked);

  // Unified 1:1 USD Balance
  const totalAvailableUsd = availableUsdt + availableUsdc + availableDai;
  const totalLockedUsd = lockedUsdt + lockedUsdc + lockedDai;
  const totalBalanceUsd = totalAvailableUsd + totalLockedUsd;

  const withdrawableUsd = amlSummary
    ? Number(BigInt(amlSummary.withdrawableMinor)) / 1_000_000
    : totalAvailableUsd;
  const unplayedUsd = amlSummary
    ? Number(BigInt(amlSummary.unplayedDepositMinor)) / 1_000_000
    : 0;
  const totalDepositedUsd = amlSummary
    ? Number(BigInt(amlSummary.totalDepositedMinor)) / 1_000_000
    : 0;
  const totalPlayedUsd = amlSummary
    ? Number(BigInt(amlSummary.totalPlayedMinor)) / 1_000_000
    : 0;

  const amlPercentage = totalDepositedUsd > 0
    ? Math.min(100, Math.max(0, Math.round((totalPlayedUsd / totalDepositedUsd) * 100)))
    : 100;

  // Active deposit amount calculation for Winning Power Neuro-Design
  const rawDepositAmount = customAmount ? parseFloat(customAmount) : (selectedPreset ?? 25);
  const activeDepositAmount = !isNaN(rawDepositAmount) && rawDepositAmount > 0 ? rawDepositAmount : 25;
  const duelsFunded = Math.max(1, Math.floor(activeDepositAmount / 5));
  const potentialWinEstimate = (activeDepositAmount * 1.8).toFixed(2);

  // Withdrawal network fees mapping
  const WITHDRAW_FEES: Record<NetworkCode, number> = {
    TRC20: 1.00,
    BEP20: 0.25,
    ERC20: 3.50,
  };
  const currentWithdrawFee = WITHDRAW_FEES[withdrawNetwork] ?? 1.00;

  const availableForWithdrawCoin = totalAvailableUsd;

  const maxWithdrawableForAsset = Math.min(withdrawableUsd, availableForWithdrawCoin);

  // Withdrawal form validation
  const parsedWithdrawAmount = parseFloat(withdrawAmount);
  const isAmountNumber = !isNaN(parsedWithdrawAmount) && parsedWithdrawAmount > 0;
  const isAmountOverBalance = isAmountNumber && parsedWithdrawAmount > availableForWithdrawCoin;
  const isAmountOverWithdrawable = isAmountNumber && parsedWithdrawAmount > withdrawableUsd;
  const isAmountBelowMin = isAmountNumber && parsedWithdrawAmount < 10;
  const isAddressValid = withdrawAddress ? isValidAddress(withdrawAddress, withdrawNetwork) : false;
  const canSubmitWithdraw =
    !isSubmitting &&
    maxWithdrawableForAsset >= 10 &&
    isAmountNumber &&
    !isAmountOverWithdrawable &&
    !isAmountOverBalance &&
    !isAmountBelowMin &&
    isAddressValid;

  const netReceiveAmount = isAmountNumber && parsedWithdrawAmount > currentWithdrawFee
    ? (parsedWithdrawAmount - currentWithdrawFee).toFixed(2)
    : "0.00";

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const handleConfirmDeposit = useCallback(() => {
    setIsDepositConfirmed(true);
    setTimeout(() => {
      const el = document.getElementById("deposit-terminal-card");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  }, []);

  const handleSyncLedger = useCallback(async () => {
    setIsSyncingLedger(true);
    setSyncFeedback(tW.depositStatusChecked);
    await reload(true);
    setTimeout(() => {
      setIsSyncingLedger(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }, 1200);
  }, [reload, tW.depositStatusChecked]);

  function handleQuickPercent(pct: number) {
    if (maxWithdrawableForAsset <= 0) return;
    const val = (maxWithdrawableForAsset * pct).toFixed(2);
    setWithdrawAmount(val);
    setWithdrawError(null);
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError(null);
    const amt = parseFloat(withdrawAmount);

    if (isNaN(amt) || amt < 10) {
      setWithdrawError(isAr ? "الحد الأدنى للسحب هو 10.00$." : "Minimum withdrawal is $10.00.");
      return;
    }

    if (amt > withdrawableUsd) {
      setWithdrawError(
        isAr
          ? `المبلغ المطلوب ($${amt.toFixed(2)}) يتجاوز رصيدك القابل للسحب ($${withdrawableUsd.toFixed(2)}). تنص سياسات مكافحة غسيل الأموال (AML) على ضرورة اللعب بمبالغ الإيداع في المباريات أولاً قبل سحبها.`
          : `Requested amount ($${amt.toFixed(2)}) exceeds your withdrawable balance ($${withdrawableUsd.toFixed(2)}). Anti-Money Laundering (AML) policies require deposited funds to be played before withdrawal.`
      );
      return;
    }

    if (amt > availableForWithdrawCoin) {
      setWithdrawError(
        isAr
          ? `رصيدك المتاح من عملة ${withdrawAsset} ($${availableForWithdrawCoin.toFixed(2)}) غير كافٍ لسحب $${amt.toFixed(2)}.`
          : `Insufficient funds. Available ${withdrawAsset} balance is $${availableForWithdrawCoin.toFixed(2)}.`
      );
      return;
    }

    if (!isValidAddress(withdrawAddress, withdrawNetwork)) {
      setWithdrawError(
        isAr
          ? `عنوان المحفظة غير صالح لشبكة ${withdrawNetwork}.`
          : `Invalid wallet address for network ${withdrawNetwork}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await post<{ ok: boolean; withdrawal?: { id: string } }>(`/v1/players/${player?.id}/withdrawals`, {
        amount: amt,
        network: withdrawNetwork,
        destination: withdrawAddress.trim(),
        asset: withdrawAsset,
      });

      if (res.ok) {
        setWithdrawAmount("");
        setWithdrawAddress("");
        setTxNotice(
          isAr
            ? `✓ تم إدراج طلب سحب $${amt.toFixed(2)} (${withdrawAsset} - ${withdrawNetwork}) بنجاح وجاري التوقيع الآلي على البلوكتشين.`
            : `✓ Withdrawal request of $${amt.toFixed(2)} (${withdrawAsset} - ${withdrawNetwork}) queued for automated signature.`
        );
        void reload();
        setActiveTab("history");
        setTimeout(() => setTxNotice(null), 8000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : isAr ? "فشل طلب السحب" : "Withdrawal failed";
      setWithdrawError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.pageContainer} dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.pageTitle}>
              <span>💳</span> {tW.heading}
            </h1>
            <p className={styles.pageSubtitle}>
              {tW.subhead}
            </p>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void reload(true)}
            disabled={isRefreshing}
          >
            <span style={{ display: "inline-block", transform: isRefreshing ? "rotate(180deg)" : "none", transition: "transform 400ms" }}>
              🔄
            </span>
            <span>{isRefreshing ? (isAr ? "جاري التحديث..." : "Syncing...") : (isAr ? "تحديث الدفتر" : "Sync Ledger")}</span>
          </button>
        </div>
      </header>

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
            {/* Triple Stablecoin Icons */}
            <div style={{ display: "flex", alignItems: "center", gap: "-6px" }}>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="#26A17B" />
                <path d="M17.9 16.9v-1.3c2.4-.1 4.4-.8 4.4-1.8s-2-1.7-4.4-1.8V9.3h-3.8v2.7c-2.4.1-4.4.8-4.4 1.8s2 1.7 4.4 1.8v1.3c-3 .2-5.3 1-5.3 2.1s2.3 1.9 5.3 2.1v4.6h3.8v-4.6c3-.2 5.3-1 5.3-2.1s-2.3-1.9-5.3-2.1z" fill="#fff" />
              </svg>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" style={{ marginInlineStart: "-8px" }}>
                <circle cx="16" cy="16" r="16" fill="#2775CA" />
                <path d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10 10-4.5 10-10S21.5 6 16 6zm.8 16.5v1.8h-1.6v-1.8c-2-.2-3.4-1.2-3.6-2.7h2c.2.8.9 1.3 2.1 1.3 1.2 0 1.9-.6 1.9-1.4 0-.8-.6-1.2-2.3-1.6-2.3-.6-3.4-1.4-3.4-2.8 0-1.4 1.2-2.5 3.3-2.7V11h1.6v1.6c1.7.2 2.9 1.1 3.2 2.4h-2c-.2-.6-.7-1.1-1.8-1.1-1.1 0-1.7.5-1.7 1.2 0 .7.5 1.1 2.2 1.5 2.5.6 3.5 1.5 3.5 2.9 0 1.5-1.3 2.7-3.4 3z" fill="#fff" />
              </svg>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" style={{ marginInlineStart: "-8px" }}>
                <circle cx="16" cy="16" r="16" fill="#F5AC37" />
                <path d="M12 9h4.8c3.4 0 5.7 2.1 6.1 5.2H8.8v1.6h14.1c-.4 3.1-2.7 5.2-6.1 5.2H12v2h-2V9h2zm0 3.2v2.6h8.8c-.3-1.6-1.7-2.6-3.9-2.6H12zm0 4.2v2.6h4.9c2.2 0 3.6-1 3.9-2.6H12z" fill="#fff" />
              </svg>
            </div>
            <span>Tether (USDT)</span>
            <span className={styles.peggedBadge}>{tW.peggedRate}</span>
          </div>

          <div className={styles.instantPayoutBadge}>
            <span className={styles.pulseDot} />
            <span>{tW.instantPayoutBadge}</span>
          </div>
        </div>

        {/* Balance Section */}
        <div className={styles.heroBalanceSection}>
          <div className={styles.totalBalanceLabel}>
            {tW.totalBalanceLabel}
          </div>
          <div className={styles.totalBalanceAmount}>
            <span className="nz-num">${totalBalanceUsd.toFixed(2)}</span>
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
                {tW.availableLabel}
              </span>
            </div>
            <div className={styles.statPillAmount}>
              <span className="nz-num">${totalAvailableUsd.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>USD</span>
            </div>
            <div className={styles.statPillSub}>
              {tW.availableSub}
            </div>
          </div>

          {/* 2. In Active Matches */}
          <div className={styles.statPill}>
            <div className={styles.statPillHeader}>
              <span>🔒</span>
              <span className={styles.statPillTitle}>
                {tW.lockedLabel}
              </span>
            </div>
            <div className={styles.statPillAmount}>
              <span className="nz-num">${totalLockedUsd.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>USD</span>
            </div>
            <div className={styles.statPillSub}>
              {tW.lockedSub}
            </div>
          </div>

          {/* 3. Withdrawable */}
          <div className={`${styles.statPill} ${styles.statPillWithdrawable}`}>
            <div className={styles.statPillHeader}>
              <span>✨</span>
              <span className={`${styles.statPillTitle} ${styles.statPillTitleWithdrawable}`}>
                {tW.withdrawableLabel}
              </span>
            </div>
            <div className={`${styles.statPillAmount} ${styles.statPillAmountWithdrawable}`}>
              <span className="nz-num">${withdrawableUsd.toFixed(2)}</span> <span style={{ fontSize: "14px", fontWeight: 600, color: "#4ade80" }}>USD</span>
            </div>
            <div className={styles.statPillSub} style={{ color: "#86efac" }}>
              {tW.withdrawableSub}
            </div>
          </div>
        </div>
      </section>

      {/* Gamified AML Playthrough Progress Bar */}
      {unplayedUsd > 0 ? (
        <section className={`${styles.amlCard} ${styles.amlCardActive}`}>
          <div className={styles.amlIcon}>🛡️</div>
          <div className={styles.amlContent}>
            <div className={`${styles.amlTitle} ${styles.amlTitleActive}`}>
              {tW.amlTitlePending} ({amlPercentage}%)
            </div>
            <div className={styles.amlDesc}>
              {tW.amlDescPending} ${unplayedUsd.toFixed(2)} USD
            </div>
            <div className={styles.amlProgressBarWrap}>
              <div
                className={styles.amlProgressBarFill}
                style={{ width: `${amlPercentage}%` }}
              />
            </div>
            <div className={styles.amlFootMetrics}>
              <span>{tW.amlPlayed} ${totalPlayedUsd.toFixed(2)} ({amlPercentage}%)</span>
              <span>{tW.amlRemaining} ${unplayedUsd.toFixed(2)} USD</span>
            </div>
          </div>
          <Link href={`/${locale}/games`} className={styles.duelCtaBtn}>
            <span>⚔️</span> {tW.playNowCta}
          </Link>
        </section>
      ) : (
        <section className={`${styles.amlCard} ${styles.amlCardCompleted}`}>
          <div className={styles.amlIcon}>✓</div>
          <div className={styles.amlContent}>
            <div className={`${styles.amlTitle} ${styles.amlTitleCompleted}`}>
              {tW.amlTitleReady}
            </div>
            <div className={styles.amlDesc}>
              {tW.amlDescReady}
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
          <span>{tW.tabDeposit}</span>
        </button>

        <button
          type="button"
          className={`${styles.hubTab} ${activeTab === "withdraw" ? styles.hubTabActive : ""}`}
          onClick={() => setActiveTab("withdraw")}
        >
          <span className={styles.tabIcon}>📤</span>
          <span>{tW.tabWithdraw}</span>
        </button>

        <button
          type="button"
          className={`${styles.hubTab} ${activeTab === "history" ? styles.hubTabActive : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className={styles.tabIcon}>📜</span>
          <span>{tW.tabHistory} ({transactions.length})</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: DEPOSIT HUB (USDT, USDC, DAI)                                      */}
      {/* ========================================================================= */}
      {activeTab === "deposit" && (
        <div className={styles.actionCard}>
          {/* ========================================================================= */}
          {/* STEP 1: STABLECOIN & NETWORK SELECTION                                    */}
          {/* ========================================================================= */}
          <div className={styles.stepHeader}>
            <span className={styles.stepBadge}>1</span>
            <h2 className={styles.stepTitle}>{tW.step1Title}</h2>
          </div>

          {/* Multi-Stablecoin Selector */}
          <div className={styles.coinSelectorSection}>
            <div className={styles.coinSectionTitle}>
              <span>🪙</span> {tW.coinSelectorTitle}
            </div>
            <div className={styles.coinSectionSubtitle}>
              {tW.coinSelectorSubtitle}
            </div>

            <div className={styles.coinCardsGridSingle}>
              {/* USDT Card - Official Unified Asset */}
              <div className={`${styles.coinCard} ${styles.coinCardActiveUsdt}`}>
                <div className={styles.coinCardHeader}>
                  <div className={styles.coinCardIdentity}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="16" fill="#26A17B" />
                      <path d="M17.9 16.9v-1.3c2.4-.1 4.4-.8 4.4-1.8s-2-1.7-4.4-1.8V9.3h-3.8v2.7c-2.4.1-4.4.8-4.4 1.8s2 1.7 4.4 1.8v1.3c-3 .2-5.3 1-5.3 2.1s2.3 1.9 5.3 2.1v4.6h3.8v-4.6c3-.2 5.3-1 5.3-2.1s-2.3-1.9-5.3-2.1z" fill="#fff" />
                    </svg>
                    <div>
                      <div className={styles.coinNameTitle}>{tW.coinUsdtName}</div>
                      <div className={styles.coinTickerSub}>Tether USD · $1.00 USD Guaranteed Peg</div>
                    </div>
                  </div>
                  <div className={styles.coinCardHeaderBadges}>
                    <span className={styles.coinSelectedPill}>✓ {tW.networkSelected}</span>
                    <span className={`${styles.coinCardBadge} ${styles.coinBadgeUsdt}`}>
                      {tW.coinUsdtBadge}
                    </span>
                  </div>
                </div>
                <p className={styles.coinCardDesc}>{tW.coinUsdtDesc}</p>
              </div>
            </div>
          </div>

          {/* Network Selector Cards - Dynamically Filtered per Coin */}
          <div className={styles.networkSection}>
            <div className={styles.networkSectionTitle}>
              <span>🌐</span> {tW.networkTitle}
            </div>
            <div className={styles.networkCardsGrid}>
              {/* TRON (TRC20) */}
              {networksFor(selectedAsset).includes("TRC20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${selectedNetwork === "TRC20" ? styles.networkCardActiveTrc : ""}`}
                  onClick={() => setSelectedNetwork("TRC20")}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoTrc}>
                        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                          <path d="M2.5 5.5L30 1.5L25 29.5L16 25L2.5 5.5Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                          <path d="M2.5 5.5L25 29.5M30 1.5L16 25" stroke="white" strokeWidth="2" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{selectedAsset} - TRC20</div>
                        <div className={styles.networkChainSubtitle}>{tW.trc20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {selectedNetwork === "TRC20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeTrc}>{tW.trc20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>⚡ {tW.trc20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.trc20Fee}</span>
                  </div>
                </button>
              )}

              {/* BNB Chain (BEP20) */}
              {networksFor(selectedAsset).includes("BEP20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${selectedNetwork === "BEP20" ? styles.networkCardActiveBep : ""}`}
                  onClick={() => setSelectedNetwork("BEP20")}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoBep}>
                        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                          <path d="M16 2.5L21.5 8L16 13.5L10.5 8L16 2.5Z" fill="#111" />
                          <path d="M24 10.5L29.5 16L24 21.5L18.5 16L24 10.5Z" fill="#111" />
                          <path d="M8 10.5L13.5 16L8 21.5L2.5 16L8 10.5Z" fill="#111" />
                          <path d="M16 18.5L21.5 24L16 29.5L10.5 24L16 18.5Z" fill="#111" />
                          <path d="M16 9.5L19.5 13L16 16.5L12.5 13L16 9.5Z" fill="#111" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{selectedAsset} - BEP20</div>
                        <div className={styles.networkChainSubtitle}>{tW.bep20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {selectedNetwork === "BEP20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeBep}>{tW.bep20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>🚀 {tW.bep20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.bep20Fee}</span>
                  </div>
                </button>
              )}

              {/* Ethereum (ERC20) */}
              {networksFor(selectedAsset).includes("ERC20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${selectedNetwork === "ERC20" ? styles.networkCardActiveErc : ""}`}
                  onClick={() => setSelectedNetwork("ERC20")}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoErc}>
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                          <path d="M16 4L15.6 5.4V20.8L16 21.2L23 17.1L16 4Z" fill="#fff" fillOpacity="0.8" />
                          <path d="M16 4L9 17.1L16 21.2V4Z" fill="#fff" />
                          <path d="M16 22.8L15.7 23.1V29.5L16 29.8L23 18.7L16 22.8Z" fill="#fff" fillOpacity="0.8" />
                          <path d="M16 29.8V22.8L9 18.7L16 29.8Z" fill="#fff" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{selectedAsset} - ERC20</div>
                        <div className={styles.networkChainSubtitle}>{tW.erc20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {selectedNetwork === "ERC20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeErc}>{tW.erc20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>💎 {tW.erc20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.erc20Fee}</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 2: DEPOSIT PRESETS & WINNING POWER                                   */}
          {/* ========================================================================= */}
          <div className={styles.stepHeader}>
            <span className={styles.stepBadge}>2</span>
            <h2 className={styles.stepTitle}>{tW.step2Title}</h2>
          </div>

          {/* High Conversion Presets & Custom Amount */}
          <div className={styles.presetsSection}>
            <div className={styles.presetsSectionTitle}>
              <span>⚡</span> {tW.presetsTitle}
            </div>
            <div className={styles.presetsGrid}>
              {[
                { amount: 5, label: tW.presetStarter, tag: tW.badgeStarter, isStarter: true },
                { amount: 10, label: tW.presetQuick, tag: null },
                { amount: 25, label: tW.presetPopular, tag: tW.championsChoiceBadge, isChampions: true },
                { amount: 50, label: tW.presetTournaments, tag: tW.badgePopular },
                { amount: 100, label: tW.presetElite, tag: tW.badgeElite },
                { amount: 200, label: tW.presetMaster, tag: null },
                { amount: 500, label: tW.presetArena, tag: null },
                { amount: 1000, label: tW.presetVip, tag: tW.badgeVip, isVip: true },
                { amount: 2000, label: tW.presetWhaleSilver, tag: null },
                { amount: 5000, label: tW.presetWhaleGold, tag: tW.badgeWhale, isVip: true },
              ].map((p) => {
                const isActive = selectedPreset === p.amount && !customAmount;
                return (
                  <button
                    key={p.amount}
                    type="button"
                    className={`${styles.presetBtn} ${p.isStarter ? styles.presetBtnStarter : ""} ${isActive ? styles.presetBtnActive : ""}`}
                    onClick={() => {
                      setSelectedPreset(p.amount);
                      setCustomAmount("");
                    }}
                  >
                    {p.isChampions ? (
                      <span className={styles.championsTag}>{p.tag}</span>
                    ) : p.tag ? (
                      <span className={`${styles.presetTag} ${p.isStarter ? styles.presetTagStarter : p.isVip ? styles.presetTagVip : ""}`}>
                        {p.tag}
                      </span>
                    ) : null}
                    <span className={styles.presetAmount}>${p.amount}</span>
                    <span className={styles.presetLabel}>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Amount Input Bar */}
            <div className={styles.customAmountCard}>
              <div className={styles.customAmountLabelWrap}>
                <span className={styles.customAmountIcon}>💵</span>
                <div>
                  <div className={styles.customAmountLabelTitle}>{tW.customAmountLabel}</div>
                  <div className={styles.customAmountHint}>{tW.customAmountMinHint}</div>
                </div>
              </div>

              <div className={styles.customAmountInputBox}>
                <span className={styles.customAmountCurrency}>$ {selectedAsset}</span>
                <input
                  type="number"
                  min="5"
                  step="any"
                  placeholder={tW.customAmountPlaceholder}
                  className={styles.customAmountField}
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    if (selectedPreset !== null) setSelectedPreset(null);
                  }}
                />
                {customAmount && (
                  <button
                    type="button"
                    className={styles.customAmountClearBtn}
                    onClick={() => {
                      setCustomAmount("");
                      setSelectedPreset(25);
                    }}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Selected preview feedback */}
            {(customAmount || selectedPreset) && (
              <div className={styles.customSelectedPreview}>
                <span>✓</span>
                <span>
                  {tW.customSelectedPreview.replace(
                    "{amount}",
                    customAmount ? customAmount : (selectedPreset || 25).toString()
                  )} ({selectedAsset})
                </span>
              </div>
            )}

            {/* Neuro-Design Winning Power Engine Preview */}
            <div className={styles.winningPowerCard}>
              <div className={styles.winningPowerGlow} />
              <div className={styles.winningPowerHead}>
                <div>
                  <div className={styles.winningPowerTitle}>
                    <span>🚀</span> {tW.powerTitle}
                  </div>
                  <div className={styles.winningPowerSub}>
                    {tW.powerSubtitle}
                  </div>
                </div>
              </div>

              <div className={styles.winningPowerGrid}>
                {/* 1. Duel Opportunities */}
                <div className={styles.winningPowerItem}>
                  <div className={styles.winningPowerItemTag}>
                    <span>⚔️</span> {tW.powerDuelsTag}
                  </div>
                  <div className={styles.winningPowerItemDesc}>
                    {tW.powerDuelsDesc(duelsFunded)}
                  </div>
                </div>

                {/* 2. Potential Return Multiplier */}
                <div className={styles.winningPowerItem}>
                  <div className={styles.winningPowerItemTag}>
                    <span>🎯</span> {tW.powerMultiplierTag}
                  </div>
                  <div className={styles.winningPowerItemDesc}>
                    {tW.powerMultiplierDesc(potentialWinEstimate)}
                  </div>
                </div>

                {/* 3. Tournament Access */}
                <div className={styles.winningPowerItem}>
                  <div className={styles.winningPowerItemTag}>
                    <span>🏆</span> {tW.powerTournamentTag}
                  </div>
                  <div className={styles.winningPowerItemDesc}>
                    {tW.powerTournamentDesc(activeDepositAmount)}
                  </div>
                </div>
              </div>

              <div className={styles.winningPowerBanner}>
                <span>💎 {tW.powerZeroFeeTag}</span>
                <span>{tW.powerZeroFeeDesc}</span>
              </div>

              <div className={styles.winningPowerSocialProof}>
                <span>{tW.powerSocialProof}</span>
              </div>
            </div>

            {/* High-Converting Interactive Confirm Deposit CTA Button */}
            <div className={styles.depositConfirmSection}>
              <button
                type="button"
                className={styles.depositConfirmBtn}
                onClick={handleConfirmDeposit}
              >
                <span className={styles.depositConfirmIcon}>⚡</span>
                <span className={styles.depositConfirmText}>
                  {tW.confirmDepositBtn(activeDepositAmount.toFixed(2), selectedAsset)}
                </span>
                <span className={styles.depositConfirmArrow}>{isAr ? "←" : "→"}</span>
              </button>
              <p className={styles.depositConfirmSubtitle}>
                {tW.confirmDepositSubtitle}
              </p>
            </div>
          </div>

          {/* Value Pillars */}
          <div className={styles.benefitsStrip}>
            <div className={styles.benefitItem}>
              <span>⚡</span>
              <span>{tW.benefitFee}</span>
            </div>
            <div className={styles.benefitItem}>
              <span>⏱️</span>
              <span>{tW.benefitInstant}</span>
            </div>
            <div className={styles.benefitItem}>
              <span>🛡️</span>
              <span>{tW.benefitOxaPay}</span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 3: TRANSFER VIA DEDICATED ADDRESS & QR (PAYMENT TERMINAL)           */}
          {/* ========================================================================= */}
          <div className={styles.stepHeader}>
            <span className={styles.stepBadge}>3</span>
            <h2 className={styles.stepTitle}>{tW.step3Title}</h2>
          </div>

          {!isDepositConfirmed ? (
            /* Awaiting User Confirmation Teaser Card */
            <div className={styles.depositAwaitingCard}>
              <div className={styles.depositAwaitingIconWrap}>
                <span>🔒</span>
              </div>
              <div className={styles.depositAwaitingBody}>
                <div className={styles.depositAwaitingTitle}>{tW.step3Title}</div>
                <p className={styles.depositAwaitingPrompt}>
                  {tW.depositAwaitingConfirmPrompt}
                </p>
              </div>
              <button
                type="button"
                className={styles.depositAwaitingBtn}
                onClick={handleConfirmDeposit}
              >
                <span>⚡</span>
                <span>{tW.depositAwaitingConfirmBtn}</span>
              </button>
            </div>
          ) : (
            /* Confirmed Payment Voucher Terminal Slip */
            <div id="deposit-terminal-card" className={styles.confirmedTerminalCard}>
              {/* Terminal Header */}
              <div className={styles.confirmedTerminalHeader}>
                <div className={styles.confirmedTerminalBadges}>
                  <span className={styles.confirmedVerifiedBadge}>
                    <span>🛡️</span> {tW.confirmedDepositOrderLabel}
                  </span>
                  <span className={styles.confirmedActiveBadge}>
                    <span className={styles.pulseDot} />
                    <span>{tW.qrReady}</span>
                  </span>
                </div>
                <h3 className={styles.confirmedTerminalTitle}>
                  {tW.confirmedDepositTitle}
                </h3>
                <p className={styles.confirmedTerminalSubtitle}>
                  {tW.confirmedDepositSubtitle}
                </p>
              </div>

              {/* Order Summary Slip */}
              <div className={styles.confirmedSlipGrid}>
                <div className={styles.confirmedSlipItem}>
                  <span className={styles.confirmedSlipLabel}>{tW.confirmedDepositAmountLabel}</span>
                  <span className={styles.confirmedSlipValAmount}>
                    ${activeDepositAmount.toFixed(2)} <span style={{ fontSize: "14px", color: "#38bdf8" }}>{selectedAsset}</span>
                  </span>
                </div>
                <div className={styles.confirmedSlipItem}>
                  <span className={styles.confirmedSlipLabel}>{tW.confirmedDepositNetworkLabel}</span>
                  <span className={styles.confirmedSlipValNet}>
                    <span className={styles.slipNetDot} />
                    {selectedAsset} - {selectedNetwork}
                  </span>
                </div>
                <div className={styles.confirmedSlipItem}>
                  <span className={styles.confirmedSlipLabel}>{tW.confirmedDepositFeeLabel}</span>
                  <span className={styles.confirmedSlipValFree}>0.00$ (0%)</span>
                </div>
                <div className={styles.confirmedSlipItem}>
                  <span className={styles.confirmedSlipLabel}>{tW.confirmedDepositSpeedLabel}</span>
                  <span className={styles.confirmedSlipValSpeed}>⚡ {selectedNetwork === "TRC20" ? tW.trc20Speed : selectedNetwork === "BEP20" ? tW.bep20Speed : tW.erc20Speed}</span>
                </div>
              </div>

              {/* Above the address: Critical Loss Prevention Warning */}
              <div className={styles.sendWarning} role="alert">
                <span className={styles.sendWarningIcon} aria-hidden="true">⚠️</span>
                <div>
                  <strong className={styles.sendWarningTitle}>{tW.sendWarningTitle}</strong>
                  <p className={styles.sendWarningBody}>{tW.sendWarningBodyDynamic(selectedAsset, selectedNetwork)}</p>
                </div>
              </div>

              {/* QR & Dedicated Address Card - 100% INTERNAL VECTOR SVG */}
              <div className={styles.qrDisplayCard}>
                {depositLoading ? (
                  <div style={{ width: "170px", height: "170px", background: "rgba(255,255,255,0.04)", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "#94a3b8" }}>
                    <span style={{ fontSize: "32px" }}>⏳</span>
                    <span style={{ fontSize: "12px" }}>{tW.qrGenerating}</span>
                  </div>
                ) : qrValue ? (
                  <div className={styles.qrFrame}>
                    <QrCode
                      value={qrValue}
                      size={168}
                      title={`${selectedAsset} ${selectedNetwork} deposit address`}
                    />
                  </div>
                ) : (
                  <div style={{ width: "170px", height: "170px", background: "rgba(255,255,255,0.04)", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "#94a3b8" }}>
                    <span style={{ fontSize: "32px" }}>💳</span>
                    <span style={{ fontSize: "12px" }}>{depositData?.address ? tW.qrReady : "—"}</span>
                  </div>
                )}

                {isPermanent && depositData?.address && !depositLoading && (
                  <div className={styles.permanentBadgeWrap}>
                    <span style={{ fontSize: "12px" }}>🟢</span>
                    <span>{tW.permanentWalletBadge}</span>
                  </div>
                )}

                {!isPermanent && depositTimeLeft && (
                  <div className={styles.timerBadge}>
                    <span>⏱️</span>
                    <span>{`Expires: ${depositTimeLeft}`}</span>
                  </div>
                )}

                {depositError && (
                  <div style={{ color: "#ef4444", fontSize: "13px", fontWeight: 600 }}>
                    {depositError}
                  </div>
                )}

                {/* Dedicated Address Row with Copy Animation */}
                <div className={styles.addressRow}>
                  <span className={styles.addressString}>
                    {depositLoading
                      ? tW.connectingOxaPay
                      : depositData?.address || (isAr ? "جاري الاتصال بالبوابة..." : "Connecting...")}
                  </span>
                  {depositData?.address && (
                    <button
                      type="button"
                      className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ""}`}
                      onClick={() => handleCopy(depositData.address!)}
                      disabled={depositLoading}
                    >
                      <span>{copied ? "✓" : "📋"}</span>
                      <span>{copied ? tW.copied : tW.copy}</span>
                    </button>
                  )}
                </div>

                {/* Interactive Actions Row */}
                <div className={styles.confirmedActionsRow}>
                  <button
                    type="button"
                    className={styles.iHaveTransferredBtn}
                    onClick={() => void handleSyncLedger()}
                    disabled={isSyncingLedger}
                  >
                    <span style={{ display: "inline-block", transform: isSyncingLedger ? "rotate(180deg)" : "none", transition: "transform 400ms" }}>
                      🔄
                    </span>
                    <span>{isSyncingLedger ? (isAr ? "جاري فحص البلوكتشين..." : "Scanning...") : tW.iHaveTransferredBtn}</span>
                  </button>

                  <button
                    type="button"
                    className={styles.editDepositBtn}
                    onClick={() => setIsDepositConfirmed(false)}
                  >
                    <span>✏️</span>
                    <span>{tW.editDepositSelection}</span>
                  </button>
                </div>

                {syncFeedback && (
                  <div className={styles.syncFeedbackToast}>
                    <span>⚡</span>
                    <span>{syncFeedback}</span>
                  </div>
                )}

                {/* Instruction Guide */}
                <div className={styles.depositHelpNote}>
                  <strong>{tW.safeDepositTitle}</strong>
                  <p>
                    {tW.safeDepositBodyDynamic(selectedAsset, selectedNetwork)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WITHDRAWAL HUB (USDT, USDC, DAI)                                   */}
      {/* ========================================================================= */}
      {activeTab === "withdraw" && (
        <div className={styles.actionCard}>
          {/* Real Balance Overview + Stablecoin Breakdown */}
          <div className={styles.withdrawOverview}>
            <div>
              <div className={styles.withdrawOverviewTitle}>
                {tW.withdrawEligibleLabel}
              </div>
              <div className={styles.withdrawOverviewSub}>
                {tW.totalBalancePrefix} ${totalBalanceUsd.toFixed(2)} USDT
              </div>
            </div>
            <div className={styles.withdrawOverviewAmount}>
              <span className="nz-num">${withdrawableUsd.toFixed(2)}</span> USDT
            </div>
          </div>

          {/* Multi-Stablecoin Withdrawal Currency Selection */}
          <div className={styles.coinSelectorSection}>
            <div className={styles.coinSectionTitle}>
              <span>🪙</span> {tW.withdrawCoinSelectorTitle}
            </div>
            <div className={styles.coinSectionSubtitle}>
              {tW.withdrawCoinSelectorSubtitle}
            </div>

            <div className={styles.coinCardsGridSingle}>
              {/* USDT Card - Official Unified Asset */}
              <div className={`${styles.coinCard} ${styles.coinCardActiveUsdt}`}>
                <div className={styles.coinCardHeader}>
                  <div className={styles.coinCardIdentity}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="16" fill="#26A17B" />
                      <path d="M17.9 16.9v-1.3c2.4-.1 4.4-.8 4.4-1.8s-2-1.7-4.4-1.8V9.3h-3.8v2.7c-2.4.1-4.4.8-4.4 1.8s2 1.7 4.4 1.8v1.3c-3 .2-5.3 1-5.3 2.1s2.3 1.9 5.3 2.1v4.6h3.8v-4.6c3-.2 5.3-1 5.3-2.1s-2.3-1.9-5.3-2.1z" fill="#fff" />
                    </svg>
                    <div>
                      <div className={styles.coinNameTitle}>{tW.coinUsdtName}</div>
                      <div className={styles.coinTickerSub}>Tether USD · $1.00 USD Guaranteed Peg</div>
                    </div>
                  </div>
                  <div className={styles.coinCardHeaderBadges}>
                    <span className={styles.coinSelectedPill}>✓ {tW.networkSelected}</span>
                    <span className={`${styles.coinCardBadge} ${styles.coinBadgeUsdt}`}>
                      {tW.coinUsdtBadge}
                    </span>
                  </div>
                </div>
                <p className={styles.coinCardDesc}>{tW.coinUsdtDesc}</p>
                <div className={styles.coinCardBalanceMini}>
                  <span>{tW.availableLabel}:</span>
                  <span className={styles.coinCardBalanceVal}>${totalAvailableUsd.toFixed(2)} USDT</span>
                </div>
              </div>
            </div>
          </div>

          {/* Network Selection Cards - Filtered for the selected withdrawal coin */}
          <div className={styles.networkSection}>
            <div className={styles.networkSectionTitle}>
              <span>🌐</span> {tW.selectRecipientNetwork}
            </div>
            <div className={styles.networkCardsGrid}>
              {/* TRON (TRC20) */}
              {networksFor(withdrawAsset).includes("TRC20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${withdrawNetwork === "TRC20" ? styles.networkCardActiveTrc : ""}`}
                  onClick={() => {
                    setWithdrawNetwork("TRC20");
                    setWithdrawError(null);
                  }}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoTrc}>
                        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                          <path d="M2.5 5.5L30 1.5L25 29.5L16 25L2.5 5.5Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                          <path d="M2.5 5.5L25 29.5M30 1.5L16 25" stroke="white" strokeWidth="2" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{withdrawAsset} - TRC20</div>
                        <div className={styles.networkChainSubtitle}>{tW.trc20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {withdrawNetwork === "TRC20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeTrc}>{tW.trc20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>⚡ {tW.trc20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.withdrawFeeTrc}</span>
                  </div>
                </button>
              )}

              {/* BNB Smart Chain (BEP20) */}
              {networksFor(withdrawAsset).includes("BEP20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${withdrawNetwork === "BEP20" ? styles.networkCardActiveBep : ""}`}
                  onClick={() => {
                    setWithdrawNetwork("BEP20");
                    setWithdrawError(null);
                  }}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoBep}>
                        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                          <path d="M16 2.5L21.5 8L16 13.5L10.5 8L16 2.5Z" fill="#111" />
                          <path d="M24 10.5L29.5 16L24 21.5L18.5 16L24 10.5Z" fill="#111" />
                          <path d="M8 10.5L13.5 16L8 21.5L2.5 16L8 10.5Z" fill="#111" />
                          <path d="M16 18.5L21.5 24L16 29.5L10.5 24L16 18.5Z" fill="#111" />
                          <path d="M16 9.5L19.5 13L16 16.5L12.5 13L16 9.5Z" fill="#111" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{withdrawAsset} - BEP20</div>
                        <div className={styles.networkChainSubtitle}>{tW.bep20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {withdrawNetwork === "BEP20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeBep}>{tW.bep20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>🚀 {tW.bep20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.withdrawFeeBep}</span>
                  </div>
                </button>
              )}

              {/* Ethereum Mainnet (ERC20) */}
              {networksFor(withdrawAsset).includes("ERC20") && (
                <button
                  type="button"
                  className={`${styles.networkCard} ${withdrawNetwork === "ERC20" ? styles.networkCardActiveErc : ""}`}
                  onClick={() => {
                    setWithdrawNetwork("ERC20");
                    setWithdrawError(null);
                  }}
                >
                  <div className={styles.networkCardHeader}>
                    <div className={styles.networkCardIdentity}>
                      <div className={styles.networkLogoErc}>
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                          <path d="M16 4L15.6 5.4V20.8L16 21.2L23 17.1L16 4Z" fill="#fff" fillOpacity="0.8" />
                          <path d="M16 4L9 17.1L16 21.2V4Z" fill="#fff" />
                          <path d="M16 22.8L15.7 23.1V29.5L16 29.8L23 18.7L16 22.8Z" fill="#fff" fillOpacity="0.8" />
                          <path d="M16 29.8V22.8L9 18.7L16 29.8Z" fill="#fff" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.networkNameTitle}>{withdrawAsset} - ERC20</div>
                        <div className={styles.networkChainSubtitle}>{tW.erc20Chain}</div>
                      </div>
                    </div>
                    <div className={styles.networkCardHeaderBadges}>
                      {withdrawNetwork === "ERC20" && (
                        <span className={styles.networkSelectedPill}>✓ {tW.networkSelected}</span>
                      )}
                      <span className={styles.networkHighlightBadgeErc}>{tW.erc20Badge}</span>
                    </div>
                  </div>

                  <div className={styles.networkCardFooterSpecs}>
                    <span className={styles.networkSpecSpeed}>💎 {tW.erc20Speed}</span>
                    <span className={styles.networkSpecFee}>{tW.withdrawFeeErc}</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Warnings & Alerts */}
          {withdrawableUsd < 10 && (
            <div style={{ padding: "14px 18px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.35)", borderRadius: "12px", color: "#fca5a5", fontSize: "13px", lineHeight: 1.6, marginBottom: "20px" }}>
              ⚠️ {tW.withdrawMinAlert(withdrawableUsd.toFixed(2))}
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
                <span>{tW.recipientAddressLabelDynamic(withdrawAsset, withdrawNetwork)}</span>
              </label>
              <input
                type="text"
                required
                placeholder={withdrawNetwork === "TRC20" ? "T..." : "0x..."}
                className={styles.formInput}
                value={withdrawAddress}
                onChange={(e) => {
                  setWithdrawAddress(e.target.value);
                  setWithdrawError(null);
                }}
              />
              {withdrawAddress && !isAddressValid && (
                <span style={{ fontSize: "12px", color: "#f87171", marginTop: "4px", display: "block", fontWeight: 600 }}>
                  {tW.invalidAddressAlert(withdrawNetwork)}
                </span>
              )}
            </div>

            {/* Amount */}
            <div className={styles.formGroup}>
              <div className={styles.formLabel}>
                <span>{tW.withdrawAmountLabel}</span>
                <span style={{ fontSize: "12px", color: "#4ade80", fontWeight: 600 }}>
                  {tW.maxAvailable}: ${maxWithdrawableForAsset.toFixed(2)} {withdrawAsset}
                </span>
              </div>
              <input
                type="number"
                min="10"
                max={maxWithdrawableForAsset > 0 ? maxWithdrawableForAsset.toString() : undefined}
                step="0.01"
                required
                placeholder={tW.minWithdrawPlaceholder}
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
                  { pct: 1.00, label: locale === "ar" ? "الكل (MAX)" : "MAX" },
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
                  {tW.amountExceedsError(parsedWithdrawAmount.toFixed(2), withdrawableUsd.toFixed(2))}
                </span>
              )}

              {isAmountOverBalance && !isAmountOverWithdrawable && (
                <span style={{ fontSize: "12px", color: "#f87171", marginTop: "6px", display: "block", fontWeight: 600 }}>
                  {locale === "ar"
                    ? `المبلغ المطلوب ($${parsedWithdrawAmount.toFixed(2)}) يتجاوز رصيدك المتاح من عملة ${withdrawAsset} ($${availableForWithdrawCoin.toFixed(2)}).`
                    : `Requested amount ($${parsedWithdrawAmount.toFixed(2)}) exceeds your available ${withdrawAsset} balance ($${availableForWithdrawCoin.toFixed(2)}).`}
                </span>
              )}
            </div>

            {/* Transparent Fees Breakdown */}
            <div className={styles.feeSummary}>
              <div className={styles.feeRow}>
                <span>{tW.summaryPlatformFee}</span>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>$0.00 ({tW.summaryFree})</span>
              </div>
              <div className={styles.feeRow}>
                <span>{tW.summaryNetworkFee}</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>
                  ${currentWithdrawFee.toFixed(2)} ({withdrawNetwork})
                </span>
              </div>
              <div className={`${styles.feeRow} ${styles.feeRowTotal}`}>
                <span>{tW.summaryNetReceive}</span>
                <span style={{ color: "#22c55e", fontSize: "18px" }} className="nz-num">
                  ${netReceiveAmount} {withdrawAsset}
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
                {isSubmitting ? tW.submittingWithdraw : tW.submitWithdrawBtn}
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
                {tW.historyEmpty}
              </div>
              <p style={{ fontSize: "13px", maxWidth: "400px", margin: "0 auto 18px", lineHeight: 1.5 }}>
                {tW.subhead}
              </p>
              <button
                type="button"
                className={styles.duelCtaBtn}
                onClick={() => setActiveTab("deposit")}
              >
                <span>📥</span> {tW.tabDeposit}
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
                        {tx.type === "DEPOSIT" ? tW.txDeposit : tW.txWithdraw}
                        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginInlineStart: "8px" }}>
                          ({tx.asset} - {tx.network})
                        </span>
                      </div>
                      <div className={styles.txAddress}>
                        <code>{tx.addressOrHash}</code> · <span className="nz-num">{tx.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.txRight}>
                    <div className={`${styles.txAmount} ${tx.type === "DEPOSIT" ? styles.txAmountDeposit : styles.txAmountWithdraw}`}>
                      {tx.type === "DEPOSIT" ? `+${tx.amount}` : `-${tx.amount}`} {tx.asset}
                    </div>
                    <span className={`${styles.statusPill} ${tx.status === "CONFIRMED" ? styles.statusConfirmed : styles.statusPending}`}>
                      {tx.status === "CONFIRMED" ? tW.statusConfirmed : tW.statusPending}
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
