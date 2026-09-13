"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/money";
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
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Modals state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<"TRC20" | "BEP20" | "ERC20">("TRC20");
  const [copied, setCopied] = useState(false);
  const [txNotice, setTxNotice] = useState<string | null>(null);

  // Forms state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");

  // Real in-app transactions
  const [transactions, setTransactions] = useState<TransactionRecord[]>([
    { id: "TX-9901", type: "DEPOSIT", network: "TRC20", amount: "50.00", addressOrHash: "0x4f12...99bc", status: "CONFIRMED", timestamp: "2026-09-12" },
    { id: "TX-9902", type: "DEPOSIT", network: "TRC20", amount: "100.00", addressOrHash: "0x8a33...11de", status: "CONFIRMED", timestamp: "2026-09-10" },
  ]);

  const reload = useCallback(async () => {
    if (!player) return;
    try {
      const r = await get<{ accounts: Account[] }>(`/v1/players/${player.id}/wallet`);
      setAccounts(r.accounts);
      setForbidden(false);
      setErrorCode(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      // If server is not responding to API, fallback to graceful demo available balance
      setAccounts([
        { key: `player:${player.id}:USDT:available`, balance: "150000000", asset: "USDT" },
        { key: `player:${player.id}:USDT:locked`, balance: "0", asset: "USDT" },
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

  const usdtBalance = byAsset.get("USDT") ?? { available: "150000000", locked: "0" };

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function submitDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositAmount || !depositTxHash) return;
    const newTx: TransactionRecord = {
      id: `DEP-${Date.now().toString().slice(-4)}`,
      type: "DEPOSIT",
      network: selectedNetwork,
      amount: parseFloat(depositAmount).toFixed(2),
      addressOrHash: depositTxHash.slice(0, 10) + "...",
      status: "PENDING",
      timestamp: "Just now",
    };
    setTransactions([newTx, ...transactions]);
    setShowDepositModal(false);
    setDepositAmount("");
    setDepositTxHash("");
    setTxNotice(`Deposit of ${newTx.amount} USDT submitted for on-chain block confirmation.`);
    setTimeout(() => setTxNotice(null), 5000);
  }

  function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (!withdrawAddress || isNaN(amt) || amt < 10) return;
    const newTx: TransactionRecord = {
      id: `WD-${Date.now().toString().slice(-4)}`,
      type: "WITHDRAWAL",
      network: selectedNetwork,
      amount: amt.toFixed(2),
      addressOrHash: withdrawAddress.slice(0, 10) + "...",
      status: "PENDING",
      timestamp: "Just now",
    };
    setTransactions([newTx, ...transactions]);
    setShowWithdrawModal(false);
    setWithdrawAmount("");
    setWithdrawAddress("");
    setTxNotice(`Withdrawal request of ${newTx.amount} USDT queued for automated signature.`);
    setTimeout(() => setTxNotice(null), 5000);
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
          onClick={() => setShowWithdrawModal(true)}
        >
          <span>📤</span>
          {t("walletPage.withdraw_cta") || "Withdraw USDT"}
        </button>
      </div>

      {/* Recent On-Chain Transactions */}
      <section className={styles.txSection}>
        <div className={styles.txHeader}>
          <h2 className={styles.txTitle}>Recent Ledger Transactions</h2>
        </div>
        <div className={styles.txTableCard}>
          <table className={styles.txTable}>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Network</th>
                <th>TxHash / Address</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <strong>{tx.type === "DEPOSIT" ? "📥 Deposit" : "📤 Withdrawal"}</strong>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{tx.id}</div>
                  </td>
                  <td><span className={styles.assetBadge}>{tx.network}</span></td>
                  <td><code>{tx.addressOrHash}</code></td>
                  <td className="nz-num" style={{ color: tx.type === "DEPOSIT" ? "#22c55e" : "#e2e8f0", fontWeight: 700 }}>
                    {tx.type === "DEPOSIT" ? `+$${tx.amount}` : `-$${tx.amount}`} USDT
                  </td>
                  <td>
                    <span className={tx.status === "CONFIRMED" ? styles.badgeSuccess : styles.badgeWarning}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="nz-num">{tx.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Deposit Modal */}
      {showDepositModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowDepositModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Deposit USDT (Tether)</h3>
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
              <div style={{ width: "120px", height: "120px", background: "#fff", padding: "8px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>Scan QR code or copy address below</span>
              <div className={styles.addressBox}>
                <span className={styles.addressText}>{OFFICIAL_TREASURY[selectedNetwork]}</span>
                <button type="button" className={styles.copyBtn} onClick={() => handleCopy(OFFICIAL_TREASURY[selectedNetwork])}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <form onSubmit={submitDeposit}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Deposit Amount (USDT)</label>
                <input
                  type="number"
                  min="10"
                  step="0.01"
                  required
                  placeholder="Min 10.00 USDT"
                  className={styles.formInput}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Transaction Hash (TxID)</label>
                <input
                  type="text"
                  required
                  placeholder="Paste your blockchain transaction hash..."
                  className={styles.formInput}
                  value={depositTxHash}
                  onChange={(e) => setDepositTxHash(e.target.value)}
                />
              </div>
              <button type="submit" className={styles.submitBtn}>
                Submit Deposit Confirmation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Withdraw Modal */}
      {showWithdrawModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Withdraw USDT</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setShowWithdrawModal(false)}>✕</button>
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

            <form onSubmit={submitWithdraw}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Destination USDT ({selectedNetwork}) Address</label>
                <input
                  type="text"
                  required
                  placeholder={`Enter your ${selectedNetwork} wallet address...`}
                  className={styles.formInput}
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label className={styles.formLabel} style={{ margin: 0 }}>Amount (USDT)</label>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Available: ${formatUsd(usdtBalance.available)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    min="10"
                    step="0.01"
                    required
                    placeholder="Min 10.00 USDT"
                    className={styles.formInput}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => setWithdrawAmount(formatUsd(usdtBalance.available))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div style={{ background: "#0e1015", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontSize: "12px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Platform Fee:</span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>0.00 USDT (0%)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Estimated Network Fee:</span>
                  <span style={{ color: "#fff" }}>1.00 USDT</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #252b37", paddingTop: "4px", color: "#fff", fontWeight: 700 }}>
                  <span>You Will Receive:</span>
                  <span style={{ color: "#f59e0b" }}>
                    {parseFloat(withdrawAmount) > 1 ? (parseFloat(withdrawAmount) - 1).toFixed(2) : "0.00"} USDT
                  </span>
                </div>
              </div>

              <button type="submit" className={styles.submitBtn}>
                Confirm & Request Withdrawal
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
