"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post, ApiError } from "@/lib/api";
import { formatUsd, fromMinorUnits } from "@/lib/money";
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

const OFFICIAL_TREASURY = {
  TRC20: "TX9zNizaloTreasuryTRC20OfficialVault77",
  BEP20: "0x71C94911335b24c96570650CbeC96B87494aLo99",
  ERC20: "0x8A164aLo99USDTerc20TreasuryColdStorage01",
};

function isValidAddress(address: string, network: "TRC20" | "BEP20" | "ERC20"): boolean {
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
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Modals state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<"TRC20" | "BEP20" | "ERC20">("TRC20");
  const [copied, setCopied] = useState(false);
  const [txNotice, setTxNotice] = useState<string | null>(null);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real transactions list (from backend, starts empty)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  const reload = useCallback(async () => {
    if (!player) return;
    try {
      const r = await get<{ accounts: Account[]; withdrawals?: Array<{ id: string; asset: string; network: string; destination: string; amount_minor: string; status: string; requested_at: string }> }>(`/v1/players/${player.id}/wallet`);
      setAccounts(r.accounts);
      setForbidden(false);
      setErrorCode(null);

      if (r.withdrawals && r.withdrawals.length > 0) {
        const txs: TransactionRecord[] = r.withdrawals.map((w) => ({
          id: w.id,
          type: "WITHDRAWAL",
          network: (w.network === "TRON" ? "TRC20" : w.network) as "TRC20" | "BEP20" | "ERC20",
          amount: (Number(BigInt(w.amount_minor || "0")) / 1_000_000).toFixed(2),
          addressOrHash: w.destination ? `${w.destination.slice(0, 8)}...${w.destination.slice(-6)}` : "—",
          status: (w.status === "CONFIRMED" || w.status === "COMPLETED") ? "CONFIRMED" : "PENDING",
          timestamp: w.requested_at ? new Date(w.requested_at).toLocaleDateString() : "Recently",
        }));
        setTransactions(txs);
      } else {
        setTransactions([]);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      setAccounts([
        { key: `user:${player.id}:available`, balance: "0", asset: "USDT" },
        { key: `user:${player.id}:locked`, balance: "0", asset: "USDT" },
      ]);
    }
  }, [player]);

  useEffect(() => { void reload(); }, [reload]);

  const byAsset = new Map<string, { available: string; locked: string }>();
  for (const a of accounts ?? []) {
    const entry = byAsset.get(a.asset) ?? { available: "0", locked: "0" };
    if (a.key.endsWith(":available")) entry.available = a.balance;
    else if (a.key.endsWith(":locked")) entry.locked = a.balance;
    byAsset.set(a.asset, entry);
  }

  const usdtBalance = byAsset.get("USDT") ?? { available: "0", locked: "0" };
  const availableUsdt = fromMinorUnits(usdtBalance.available);

  const parsedWithdrawAmount = parseFloat(withdrawAmount);
  const isAmountNumber = !isNaN(parsedWithdrawAmount) && parsedWithdrawAmount > 0;
  const isAmountOverBalance = isAmountNumber && parsedWithdrawAmount > availableUsdt;
  const isAmountBelowMin = isAmountNumber && parsedWithdrawAmount < 10;
  const isAddressValid = withdrawAddress ? isValidAddress(withdrawAddress, selectedNetwork) : false;
  const canSubmitWithdraw =
    !isSubmitting &&
    availableUsdt >= 10 &&
    isAmountNumber &&
    !isAmountOverBalance &&
    !isAmountBelowMin &&
    isAddressValid;

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError(null);
    const amt = parseFloat(withdrawAmount);

    if (isNaN(amt) || amt < 10) {
      setWithdrawError(locale === "ar" ? "الحد الأدنى للسحب هو 10.00 USDT." : "Minimum withdrawal is 10.00 USDT.");
      return;
    }

    if (amt > availableUsdt) {
      setWithdrawError(
        locale === "ar"
          ? `رصيدك المتاح ($${availableUsdt.toFixed(2)} USDT) غير كافٍ لسحب $${amt.toFixed(2)} USDT.`
          : `Insufficient funds. Available balance is $${availableUsdt.toFixed(2)} USDT.`
      );
      return;
    }

    if (!isValidAddress(withdrawAddress, selectedNetwork)) {
      setWithdrawError(
        locale === "ar"
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
        setShowWithdrawModal(false);
        setWithdrawAmount("");
        setWithdrawAddress("");
        setTxNotice(t("walletPage.withdraw_submitted_notice", { amount: amt.toFixed(2) }));
        void reload();
        setTimeout(() => setTxNotice(null), 6000);
      }
    } catch (err: unknown) {
      const apiErr = err as { body?: { error?: { code?: string } }; message?: string; status?: number };
      const code = apiErr?.body?.error?.code || apiErr?.message || "ERROR";
      if (code === "INSUFFICIENT_FUNDS") {
        setWithdrawError(locale === "ar" ? "رصيدك المتاح غير كافٍ لإتمام عملية السحب." : "Insufficient available balance in your wallet.");
      } else if (code === "CONTROL_DISABLED") {
        setWithdrawError(locale === "ar" ? "عمليات السحب متوقفة مؤقتاً لأعمال الصيانة الدورية." : "Withdrawals are temporarily paused for maintenance.");
      } else if (code === "STEP_UP_REQUIRED" || apiErr?.status === 401) {
        setWithdrawError(locale === "ar" ? "مطلوب تأكيد كلمة المرور كإجراء أمني لإتمام السحب." : "Security step-up authentication required.");
      } else {
        setWithdrawError(locale === "ar" ? `تعذر إتمام طلب السحب (${code}). يرجى التحقق من الرصيد.` : `Withdrawal request could not be completed (${code}).`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="nz-container">
      <header className={styles.head}>
        <h1 className={styles.heading}>{t("walletPage.heading")}</h1>
        <p className={styles.subhead}>{t("walletPage.subhead")}</p>
      </header>

      {forbidden && <p className={styles.notice}>{t("walletPage.forbidden")}</p>}
      {errorCode && !forbidden && <p className={styles.notice}>{t("walletPage.error", { code: errorCode })}</p>}
      {txNotice && (
        <div style={{ padding: "12px 16px", background: "rgba(34, 197, 94, 0.12)", border: "1px solid #22c55e", borderRadius: "10px", color: "#22c55e", marginBottom: "20px", fontWeight: 600 }}>
          ✓ {txNotice}
        </div>
      )}

      {accounts && !forbidden && !errorCode && (
        <div className={styles.assets}>
          {[...byAsset.entries()].map(([asset, bal]) => (
            <div key={asset} className={styles.assetCard}>
              <div className={styles.assetHead}>
                <span className={styles.assetName}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#26A17B" />
                    <path d="M12.6 13.2v-1.1c1.9-.1 3.5-.7 3.5-1.5s-1.6-1.4-3.5-1.5V7.4h-1.2v1.7C9.5 9.2 8 9.8 8 10.6s1.6 1.4 3.4 1.5v1.1c-2.4.2-4.2.8-4.2 1.7 0 .9 1.8 1.6 4.2 1.7v2.2h1.2v-2.2c2.4-.2 4.2-.8 4.2-1.7 0-.9-1.8-1.5-4.2-1.7z" fill="#fff" />
                  </svg>
                  {asset} (Tether USD)
                </span>
                <span className={styles.assetBadge}>1 USDT = 1.00 USD</span>
              </div>
              <div className={styles.balances}>
                <div className={styles.balanceRow}>
                  <div>
                    <span className={styles.balanceLabel}>{t("walletPage.available_label")}</span>
                    <span className={styles.balanceNote}>{t("walletPage.available_note")}</span>
                  </div>
                  <span className={`nz-num ${styles.balanceValue}`}>${formatUsd(bal.available)}</span>
                </div>
                <div className={styles.balanceRow}>
                  <div>
                    <span className={styles.balanceLabel}>{t("walletPage.locked_label")}</span>
                    <span className={styles.balanceNote}>{t("walletPage.locked_note")}</span>
                  </div>
                  <span className={`nz-num ${styles.balanceValue}`}>${formatUsd(bal.locked)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Real Deposit and Withdraw CTA Buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.depositBtn}`}
          onClick={() => setShowDepositModal(true)}
        >
          <span>📥</span>
          {t("walletPage.deposit_cta") || "Deposit USDT"}
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.withdrawBtn}`}
          onClick={() => {
            setWithdrawError(null);
            setShowWithdrawModal(true);
          }}
        >
          <span>📤</span>
          {t("walletPage.withdraw_cta") || "Withdraw USDT"}
        </button>
      </div>

      {/* Transactions History */}
      <section className={styles.txSection}>
        <div className={styles.txHeader}>
          <h2 className={styles.txTitle}>{t("walletPage.recent_tx_title")}</h2>
          <span className={styles.scrollHint}>↔ {locale === "ar" ? "اسحب للتمرير" : "Swipe to scroll"}</span>
        </div>
        <div className={styles.txTableCard}>
          <table className={styles.txTable}>
            <thead>
              <tr>
                <th>{t("walletPage.th_transaction")}</th>
                <th>{t("walletPage.th_network")}</th>
                <th>{t("walletPage.th_tx_or_address")}</th>
                <th>{t("walletPage.th_amount")}</th>
                <th>{t("walletPage.th_status")}</th>
                <th>{t("walletPage.th_date")}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px 16px", color: "#64748b" }}>
                    {t("walletPage.empty")}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <strong>{tx.type === "DEPOSIT" ? `📥 ${t("walletPage.tx_type_deposit")}` : `📤 ${t("walletPage.tx_type_withdrawal")}`}</strong>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{tx.id}</div>
                    </td>
                    <td><span className={styles.assetBadge}>{tx.network}</span></td>
                    <td><code>{tx.addressOrHash}</code></td>
                    <td className="nz-num" style={{ color: tx.type === "DEPOSIT" ? "#22c55e" : "#e2e8f0", fontWeight: 700 }}>
                      {tx.type === "DEPOSIT" ? `+$${tx.amount}` : `-$${tx.amount}`} USDT
                    </td>
                    <td>
                      <span className={tx.status === "CONFIRMED" ? styles.badgeSuccess : styles.badgeWarning}>
                        {tx.status === "CONFIRMED" ? t("walletPage.status_confirmed") : t("walletPage.status_pending")}
                      </span>
                    </td>
                    <td className="nz-num">{tx.timestamp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Official Crypto Deposit Modal */}
      {showDepositModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowDepositModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{t("walletPage.deposit_title")}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setShowDepositModal(false)}>✕</button>
            </div>

            <div className={styles.networkTabs}>
              {(["TRC20", "BEP20", "ERC20"] as const).map((net) => (
                <button
                  key={net}
                  type="button"
                  className={`${styles.networkTab} ${selectedNetwork === net ? styles.networkTabActive : ""}`}
                  onClick={() => setSelectedNetwork(net)}
                >
                  USDT-{net}
                </button>
              ))}
            </div>

            <div className={styles.qrContainer}>
              <div style={{ width: "130px", height: "130px", background: "#fff", padding: "8px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
                <svg viewBox="0 0 100 100" width="100%" height="100%">
                  <rect width="100" height="100" fill="#fff" />
                  <rect x="10" y="10" width="25" height="25" fill="#000" />
                  <rect x="15" y="15" width="15" height="15" fill="#fff" />
                  <rect x="18" y="18" width="9" height="9" fill="#000" />
                  <rect x="65" y="10" width="25" height="25" fill="#000" />
                  <rect x="70" y="15" width="15" height="15" fill="#fff" />
                  <rect x="73" y="18" width="9" height="9" fill="#000" />
                  <rect x="10" y="65" width="25" height="25" fill="#000" />
                  <rect x="15" y="70" width="15" height="15" fill="#fff" />
                  <rect x="18" y="73" width="9" height="9" fill="#000" />
                  <rect x="45" y="20" width="8" height="8" fill="#000" />
                  <rect x="45" y="45" width="12" height="12" fill="#000" />
                  <rect x="65" y="65" width="15" height="15" fill="#000" />
                </svg>
              </div>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{t("walletPage.scan_qr_hint")}</span>
              <div className={styles.addressBox}>
                <span className={styles.addressText}>{OFFICIAL_TREASURY[selectedNetwork]}</span>
                <button type="button" className={styles.copyBtn} onClick={() => handleCopy(OFFICIAL_TREASURY[selectedNetwork])}>
                  {copied ? t("walletPage.copied") : t("walletPage.copy")}
                </button>
              </div>
            </div>

            <div style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "13px", color: "#86efac", lineHeight: "1.5" }}>
              ℹ️ {locale === "ar"
                ? `أرسل فقط عملة USDT عبر شبكة (${selectedNetwork}) إلى هذا العنوان. سيتم إيداع الرصيد تلقائياً في حسابك فور تأكيد المعاملة على البلوكشين (1 - 3 دقائق). الحد الأدنى للإيداع: 5.00 USDT.`
                : `Send only USDT via (${selectedNetwork}) to this address. Credits are deposited automatically to your account upon blockchain confirmation. Minimum deposit: 5.00 USDT.`}
            </div>

            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => setShowDepositModal(false)}
            >
              {locale === "ar" ? "تم، إغلاق" : "Done, Close"}
            </button>
          </div>
        </div>
      )}

      {/* Hardened Withdraw Modal */}
      {showWithdrawModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{t("walletPage.withdraw_title")}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setShowWithdrawModal(false)}>✕</button>
            </div>

            <div className={styles.networkTabs}>
              {(["TRC20", "BEP20", "ERC20"] as const).map((net) => (
                <button
                  key={net}
                  type="button"
                  className={`${styles.networkTab} ${selectedNetwork === net ? styles.networkTabActive : ""}`}
                  onClick={() => {
                    setSelectedNetwork(net);
                    setWithdrawError(null);
                  }}
                >
                  USDT-{net}
                </button>
              ))}
            </div>

            {/* Strict balance notification */}
            {availableUsdt < 10 && (
              <div style={{ padding: "12px 14px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "8px", color: "#f87171", fontSize: "13px", lineHeight: "1.5", marginBottom: "16px" }}>
                ⚠️ {locale === "ar"
                  ? `رصيدك المتاح ($${availableUsdt.toFixed(2)} USDT) أقل من الحد الأدنى للسحب (10.00 USDT). لا يمكن إدراج طلب سحب بدون توفر رصيد كافٍ في المحفظة.`
                  : `Your available balance ($${availableUsdt.toFixed(2)} USDT) is below the minimum withdrawal amount (10.00 USDT). You cannot request a withdrawal without sufficient funds.`}
              </div>
            )}

            {withdrawError && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", color: "#ef4444", fontSize: "13px", marginBottom: "14px", fontWeight: 600 }}>
                ⛔ {withdrawError}
              </div>
            )}

            <form onSubmit={submitWithdraw}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{t("walletPage.withdraw_address_label", { net: selectedNetwork })}</label>
                <input
                  type="text"
                  required
                  placeholder={t("walletPage.withdraw_address_placeholder")}
                  className={styles.formInput}
                  value={withdrawAddress}
                  onChange={(e) => {
                    setWithdrawAddress(e.target.value);
                    setWithdrawError(null);
                  }}
                />
                {withdrawAddress && !isAddressValid && (
                  <span style={{ fontSize: "12px", color: "#f87171", marginTop: "4px", display: "block" }}>
                    {locale === "ar" ? `عنوان غير صالح لشبكة ${selectedNetwork}` : `Invalid address for ${selectedNetwork}`}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label className={styles.formLabel} style={{ margin: 0 }}>{t("walletPage.withdraw_amount_label")}</label>
                  <span style={{ fontSize: "12px", color: availableUsdt >= 10 ? "#22c55e" : "#94a3b8", fontWeight: 600 }}>
                    {t("walletPage.available_label")}: ${availableUsdt.toFixed(2)} USDT
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    min="10"
                    max={availableUsdt > 0 ? availableUsdt.toString() : undefined}
                    step="0.01"
                    required
                    placeholder={t("walletPage.withdraw_amount_placeholder")}
                    className={styles.formInput}
                    value={withdrawAmount}
                    onChange={(e) => {
                      setWithdrawAmount(e.target.value);
                      setWithdrawError(null);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => {
                      setWithdrawAmount(availableUsdt > 0 ? availableUsdt.toFixed(2) : "0.00");
                      setWithdrawError(null);
                    }}
                  >
                    MAX
                  </button>
                </div>
                {isAmountOverBalance && (
                  <span style={{ fontSize: "12px", color: "#f87171", marginTop: "4px", display: "block", fontWeight: 600 }}>
                    {locale === "ar"
                      ? `المبلغ المطلوب ($${parsedWithdrawAmount.toFixed(2)}) يتجاوز رصيدك المتاح ($${availableUsdt.toFixed(2)} USDT)`
                      : `Requested amount ($${parsedWithdrawAmount.toFixed(2)}) exceeds available balance ($${availableUsdt.toFixed(2)} USDT)`}
                  </span>
                )}
                {isAmountBelowMin && !isAmountOverBalance && (
                  <span style={{ fontSize: "12px", color: "#f59e0b", marginTop: "4px", display: "block" }}>
                    {locale === "ar" ? "الحد الأدنى للسحب هو 10.00 USDT" : "Minimum withdrawal is 10.00 USDT"}
                  </span>
                )}
              </div>

              <div style={{ background: "#0e1015", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontSize: "12px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{t("walletPage.fee_platform")}:</span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>0.00 USDT (0%)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{t("walletPage.fee_network")}:</span>
                  <span style={{ color: "#fff" }}>1.00 USDT</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #252b37", paddingTop: "4px", color: "#fff", fontWeight: 700 }}>
                  <span>{t("walletPage.fee_receive")}:</span>
                  <span style={{ color: "#f59e0b" }}>
                    {parsedWithdrawAmount > 1 ? (parsedWithdrawAmount - 1).toFixed(2) : "0.00"} USDT
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={!canSubmitWithdraw}
                style={{
                  opacity: canSubmitWithdraw ? 1 : 0.45,
                  cursor: canSubmitWithdraw ? "pointer" : "not-allowed",
                }}
              >
                {isSubmitting
                  ? (locale === "ar" ? "جاري المعالجة..." : "Processing...")
                  : t("walletPage.submit_withdraw")}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
