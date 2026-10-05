"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./Toast";
import styles from "./DepositModal.module.css";

export interface DepositModalProps {
  open: boolean;
  depositAddress?: string;
  network?: string;
  minDepositUsdt?: number;
  onClose: () => void;
}

export function DepositModal({
  open,
  depositAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  network = "USDT (TRC-20)",
  minDepositUsdt = 1,
  onClose,
}: DepositModalProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      toast.success("Address Copied", "Deposit address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
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
      aria-labelledby="deposit-modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="deposit-modal-title" className={styles.title}>
            Deposit USDT
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close deposit modal"
          >
            ×
          </button>
        </div>

        <div className={styles.networkPill}>
          <span>🌐 Network:</span>
          <strong>{network}</strong>
        </div>

        <div className={styles.qrContainer}>
          {/* Fallback QR representation */}
          <div style={{ textAlign: "center", color: "#000", fontSize: "12px", fontFamily: "monospace" }}>
            <span style={{ fontSize: "64px" }}>📱</span>
            <div>Scan to Deposit</div>
          </div>
        </div>

        <div className={styles.addressBox}>
          <span className={styles.addressText} title={depositAddress}>
            {depositAddress}
          </span>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className={styles.disclaimer}>
          Send only {network} to this address. Minimum deposit is ${minDepositUsdt} USDT. Deposits are credited after 1 network confirmation.
        </p>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
