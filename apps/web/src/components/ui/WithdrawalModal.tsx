"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./Toast";
import styles from "./WithdrawalModal.module.css";

export interface WithdrawalModalProps {
  open: boolean;
  availableUsdt: number;
  networkFeeUsdt?: number;
  minWithdrawalUsdt?: number;
  onSubmitWithdrawal?: (address: string, amount: number) => Promise<boolean> | boolean;
  onClose: () => void;
}

export function WithdrawalModal({
  open,
  availableUsdt,
  networkFeeUsdt = 1.0,
  minWithdrawalUsdt = 5.0,
  onSubmitWithdrawal,
  onClose,
}: WithdrawalModalProps) {
  const [address, setAddress] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const amount = parseFloat(amountStr) || 0;
  const netPayout = Math.max(0, amount - networkFeeUsdt);

  const isValid =
    address.trim().length >= 26 &&
    amount >= minWithdrawalUsdt &&
    amount <= availableUsdt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || busy) return;

    setBusy(true);
    try {
      if (onSubmitWithdrawal) {
        const ok = await onSubmitWithdrawal(address.trim(), amount);
        if (ok) {
          toast.success("Withdrawal Queued", `Request for $${amount} USDT submitted.`);
          onClose();
        }
      } else {
        toast.success("Withdrawal Requested", `Request for $${amount} USDT logged.`);
        onClose();
      }
    } catch {
      toast.error("Withdrawal Failed", "Could not submit withdrawal request.");
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const content = (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdraw-modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="withdraw-modal-title" className={styles.title}>
            Withdraw USDT
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close withdrawal modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Recipient TRC-20 Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. T..."
              className={styles.input}
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className={styles.fieldLabel}>Withdrawal Amount</label>
              <span style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>
                Max: ${availableUsdt.toFixed(2)} USDT
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              min={minWithdrawalUsdt}
              max={availableUsdt}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={`Min ${minWithdrawalUsdt}.00`}
              className={[styles.input, styles.numInput].join(" ")}
              required
            />
          </div>

          <div className={styles.feeBox}>
            <div className={styles.feeRow}>
              <span>Network Gas Fee:</span>
              <span>${networkFeeUsdt.toFixed(2)} USDT</span>
            </div>
            <div className={[styles.feeRow, styles.netRow].join(" ")}>
              <span>Net Payout to Wallet:</span>
              <span>${netPayout.toFixed(2)} USDT</span>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!isValid || busy}
          >
            {busy ? "Processing..." : `Confirm Withdrawal ($${netPayout.toFixed(2)} Net)`}
          </button>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
