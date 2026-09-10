"use client";

/**
 * The real wallet. Reads GET /v1/players/:id/wallet -- the SAME real
 * ledger_account/ledger_balance data every admin surface already treats as
 * authoritative -- and nothing else. Deposits and withdrawals are
 * deliberately NOT wired to a working flow here: the backend's own
 * withdrawal-creation route (POST /v1/players/:id/withdrawals) returns 501
 * NOT_IMPLEMENTED today ("the withdrawal state machine is not built yet"),
 * and no deposit-address-creation route exists at all yet. Rather than
 * build a form that calls an endpoint that cannot succeed, both actions
 * are shown as an honest "not open yet" state -- the same rule
 * DownloadAppTeaser and AdminSidebar's own "Soon" items already follow.
 * The balance itself is completely real; only the two actions are not
 * live yet.
 */
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/money";
import styles from "./wallet.module.css";

type Account = { key: string; balance: string; asset: string };

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

  const reload = useCallback(async () => {
    if (!player) return;
    try {
      const r = await get<{ accounts: Account[] }>(`/v1/players/${player.id}/wallet`);
      setAccounts(r.accounts);
      setForbidden(false);
      setErrorCode(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      setErrorCode(e instanceof ApiError ? (e.code ?? "REQUEST_FAILED") : "NETWORK_ERROR");
    }
  }, [player]);

  useEffect(() => { void reload(); }, [reload]);

  // Group by asset -- today there is only ever USDT, but a wallet with a
  // second asset must never silently merge two currencies into one number.
  const byAsset = new Map<string, { available: string; locked: string }>();
  for (const a of accounts ?? []) {
    const entry = byAsset.get(a.asset) ?? { available: "0", locked: "0" };
    if (a.key.endsWith(":available")) entry.available = a.balance;
    else if (a.key.endsWith(":locked")) entry.locked = a.balance;
    byAsset.set(a.asset, entry);
  }

  return (
    <main className="nz-container">
      <header className={styles.head}>
        <h1 className={styles.heading}>{t("walletPage.heading")}</h1>
        <p className={styles.subhead}>{t("walletPage.subhead")}</p>
      </header>

      {forbidden && <p className={styles.notice}>{t("walletPage.forbidden")}</p>}
      {errorCode && !forbidden && <p className={styles.notice}>{t("walletPage.error", { code: errorCode })}</p>}

      {accounts && !forbidden && !errorCode && (
        byAsset.size === 0 ? (
          <p className={styles.empty}>{t("walletPage.empty")}</p>
        ) : (
          <div className={styles.assets}>
            {[...byAsset.entries()].map(([asset, bal]) => (
              <div key={asset} className={styles.assetCard}>
                <div className={styles.assetHead}>
                  <span className={styles.assetName}>{asset}</span>
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
        )
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.actionButton} disabled aria-disabled="true">
          {t("walletPage.deposit_cta")}
          <span className={styles.soon}>{t("home.download.badge")}</span>
        </button>
        <button type="button" className={styles.actionButton} disabled aria-disabled="true">
          {t("walletPage.withdraw_cta")}
          <span className={styles.soon}>{t("home.download.badge")}</span>
        </button>
      </div>
      <p className={styles.comingSoonTitle}>{t("walletPage.coming_soon_title")}</p>
      <p className={styles.comingSoonBody}>{t("walletPage.coming_soon_body")}</p>
    </main>
  );
}
